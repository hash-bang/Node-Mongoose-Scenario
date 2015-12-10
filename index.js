var _ = require('lodash');
var async = require('async-chainable');

// Constants {{{
var FK_OBJECTID = 1; // 1:1 objectID mapping
var FK_OBJECTID_ARRAY = 2; // Array of objectIDs
var FK_SUBDOC = 3; // Sub-document embed
// }}}

var settings = {
	reset: true, // Reset all known refs on each call - if this is false the previously created refs will be remembered and can be used again
	connection: null,
	nuke: [], // Either a list of collections to nuke or 'true' to use the incomming scenario to calculate the collections

	called: 0, // How many times scenario has been called (if zero `nuke` gets fired)

	progress: { // Output data array (passed to callback on finish)
		created: {}, // Number of records created for each collection
		nuked: [], // Tables nuked during call
	},

	refs: {}, // Lookup list of known references

	knownFK: {}, // Cache of known foreign keys for a collection

	idVal: 0, // Incrementing ID value for fields that do not have a '_ref' (or whatever keys.ref is)
	exitTaskId: 0,

	// Define the keys mongoose-scenario uses to look up meta-data
	// NOTE: Changing these will not also alter omitFields - which will need to be updated seperately if you wish to override these keys
	keys: {
		ref: '_ref', // What key to use when looking up the reference
		after: '_after', // Define dependents
	},
	// Check whether all dependencies are met
	checkDependencies : true,

	omitFields: ['_ref', '_after'] // Fields to omit from creation process
};

/**
* Import a scenario file into a Mongo database
* A scenario must be complete - i.e. have no dangling references for it to suceed
* @param object model The scenario to create - expected format is a hash of collection names each containing a collection of records (e.g. `{users: [{name: 'user1'}, {name: 'user2'}] }`)
* @param object settings Optional Settings array to import
* @param finish function(err, data) Optional callback fired when scenario finishes creating records
*/
var scenarioImport = function(model, options, finish) {
	var asyncCreator = async(); // Task runner that actually creates all the Mongo records

	async()
		.then(function(next) { // Coherce args into scenario(<model>, [options], [callback]) {{{
			if (!model) throw new Error('No arguments passed to scenario()');
			if (_.isFunction(options)) { // Form: (model, callback)
				finish = options;
			} else if (options) { // Form: model(model, options)
				_.merge(settings, options);
			}
			if (!finish) finish = function() {};
			next();
		}) // }}}
		.then(function(next) { // Sanity checks {{{
			if (!settings.connection) throw new Error('Invalid connection to Mongoose');
			if (!_.isObject(model)) throw new Error('Invalid scenario invoke style - scenario(' + typeof model + ')');
			next();
		}) // }}}
		.then(function(next) { // Reset all state variables {{{
			settings.progress.created = {};
			if (settings.reset) settings.refs = {};
			next();
		}) /// }}}
		.then(function(next) { // Optionally Nuke existing models {{{
			if (!settings.nuke) return next();
			async()
				.set('models', _.isArray(settings.nuke) ? settings.nuke : _.keys(settings.connection.base.models))
				.forEach('models', function(next, model) {
					if (!settings.connection.base.models[model])
						return next('Model "' + model + '" is present in the Scenario schema but no model can be found matching that name, did you forget to load it?');
					settings.connection.base.models[model].find({}).remove(function(err) {
						if (err) next(err);
						settings.progress.nuked.push(model);
						next();
					});
				})
				.end(next);
		}) // }}}
		.forEach(model, function(next, rows, collection) { // Compute FKs for each model {{{
			if (settings.knownFK[collection]) return next(); // Already computed the FKs for this collection

			settings.knownFK[collection] = {};

			if (!settings.connection.base.models[collection]) throw new Error('Collection "' + collection + '" not found in Mongoose schema. Did you forget to load its model?');

			// Merge extracted keys into knownFKs storage
			settings.knownFK[collection] = extractFKs(settings.connection.base.models[collection].schema);

			next();
		}) // }}}
		.forEach(model, function(next, rows, collection) { // Process the Scenario profile {{{
			async()
				.forEach(rows, function(next, row) { // Split all incomming items into defered tasks {{{
					var rowFlattened = flatten(row);
					var id = row[settings.keys.ref] ? row[settings.keys.ref] : 'anon-' + settings.idVal++;
					var dependents = determineFKs(rowFlattened, settings.knownFK[collection]);

					asyncCreator.defer(dependents, id, function(next) {
						createRow(collection, id, rowFlattened, next);
					});

					next();
				}) // }}}
				.end(next);
		}) // }}}
		.then(function(next) { // Run all tasks {{{
			asyncCreator
				.await()
				.end(next);
		}) // }}}
		.end(function(err) {
			if (err) return finish(err);
			finish(null, settings.progress);
		});

	return scenarioImport;
};


/**
* Extract the FK relationship from a Mongo document
* @param object schema The schema object to examine (usually connection.base.models[model].schema
* @return object A dictionary of foreign keys for the schema
*/
function extractFKs(schema) {
	var FKs = {};

	_.forEach(schema.paths, function(path, id) {
		if (id == 'id' || id == '_id') {
			// Pass
		} else if (path.instance && path.instance == 'ObjectID') {
			FKs[id] = {type: FK_OBJECTID};
		} else if (path.caster && path.caster.instance == 'ObjectID') { // Array of ObjectIDs
			FKs[id] = {type: FK_OBJECTID_ARRAY};
		} else if (path.schema) {
			FKs[id] = {
				type: FK_SUBDOC,
				fks: extractFKs(path.schema),
			};
		}
	});

	return FKs;
}

/**
* Inject foreign keys into a row before it gets passed to Mongo for insert
* @param object row The row that will be inserted - values will be replaced inline
* @param object fks The foreign keys for the given row (extacted via extractFKs)
* @see extractFKs()
*/
function injectFKs(row, fks) {
	_.forEach(fks, function(fk, id) {
		if (row[id] === undefined) return; // Skip omitted FK refs

		switch (fk.type) {
			case FK_OBJECTID: // 1:1 relationship
				if (!settings.refs[row[id]])
					throw new Error('Attempting to use reference "' + row[id] + '" in field ' + id + ' before its been created!');
				row[id] = settings.refs[row[id]];
				break;
			case FK_OBJECTID_ARRAY: // 1:M array based relationship
				row[id] = _.map(row[id], function(fieldValueArr) { // Resolve each item in the array
					if (!settings.refs[fieldValueArr])
						throw new Error('Attempting to use reference "' + fieldValueArr + '" in 1:M field ' + id + ' before its been created!');
					return settings.refs[fieldValueArr];
				});
				break;
			case FK_SUBDOC: // Mongo subdocument
				_.forEach(row[id], function(subdocItem, subdocIndex) {
					row[id][subdocItem]
					injectFKs(subdocItem, fks[id].fks);
				});
				break;
		}
	});
}

/**
* Get an array of required foreign keys values so we can calculate the dependency tree
* @param object row The row that will be inserted
* @param object fks The foreign keys for the given row (extacted via extractFKs)
* @see extractFKs()
* @return array An array of required references
*/
function determineFKs(row, fks) {
	var refs = [];

	_.forEach(fks, function(fk, id) {
		if (row[id] === undefined) return; // Skip omitted FK refs

		switch (fk.type) {
			case FK_OBJECTID: // 1:1 relationship
				refs.push(row[id]);
				break;
			case FK_OBJECTID_ARRAY: // 1:M array based relationship
				_.forEach(row[id], function(v) {
					refs.push(v);
				});
				break;
			case FK_SUBDOC: // Mongo subdocument
				_.forEach(row[id], function(v) {
					determineFKs(v, fks[id].fks).forEach(function(dep) {
						refs.push(dep);
					});
				});
				break;
		}
	});

	return refs;
}

/**
* Take a nested object and return a flattened hash in Mongoose path notation
* e.g. {foo: {bar: 'baz'}} // Becomes {foo.bar: 'baz'}
* @param object obj The object to flatten
* @return object A flattened version of the object given
*/
function flatten(obj) {
	var flattenWorker = function(row, namespace, result) {
		return _.reduce(row, function(result, value, key) {
			var newKey;
			newKey = "" + namespace + (namespace ? '.' : '') + key;
			if (_.isPlainObject(value)) {
				if (_.size(value)) {
					flattenWorker(value, newKey, result);
				}
			} else {
				result[newKey] = value;
			}
			return result;
		}, result);
	};
	return flattenWorker(obj, '', {});
};

/**
* Create a single row in a collection
* @param string collection The collection where to create the row
* @param string id The ID of the row (if any)
* @param object row The (flattened) row contents to create
* @param function callback(err) Callback to chainable async function
*/
function createRow(collection, id, row, callback) {
	injectFKs(row, settings.knownFK[collection]);

	row = _.omit(row, settings.omitFields);

	if (row['speakerQueues.motion']) {
		row['speakerQueues'] = {
			motion: row['speakerQueues.motion'],
		};
		delete row['speakerQueues.motion'];
		delete row['speakerQueues.general'];
	}

	settings.connection.base.models[collection].create(row, function(err, newItem) {
		if (err) return callback(err);

		if (collection == 'committees') {
			console.log('BUILD', row);
			console.log('BUILT', newItem.speakerQueue);
			console.log('INJECT!');
			var amended = checkMerge(row, newItem);
			if (amended) {
				console.log('DID WORK');
				console.log('REWROTE TO', newItem);
				newItem.save();
			}
		}

		if (id) { // This unit has its own reference - add it to the stack
			settings.refs[id] = newItem._id.toString();
		}

		if (!settings.progress.created[collection])
			settings.progress.created[collection] = 0;
		settings.progress.created[collection]++;
		callback(null, newItem._id);
	});
};

function checkMerge(original, built) {
	var amended = false;

	_.forEach(original, function(v, k) {
		var pointer = built;
		k.split('.').forEach(function(pathBit, pathBitIndex) {
			if (!pointer[pathBit]) { // Mongo has dropped the field entirely
				console.log('PATH MISSING', pathBit, k.split('.').slice(0, pathBitIndex + 1).join('!'));
				if (_.isObject(v)) {
					pointer[pathBit] = v;
					console.log('CREATE', pathBit, v);
					if (pathBit == 'speakerQueues') {
						console.log('INJECT INTO SQ');
						pointer[pathBit] = {motion: [ {'title': 'POINTER TEST' } ] };
						console.log(pointer);
					}
				} else if (_.isArray(v)) {
					pointer[pathBit] = [];
					v.forEach(function(item) { pointer[pathBit].push(item) });
				} else {
					pointer[pathBit] = v;
				}
				amended = true;
			} else if (_.isArray(v) && pointer[pathBit].length != v.length) { // Its an array and Mongo has truncated it
				console.log('ARRAY LEN MISMATCH', k);
				pointer[pathBit] = v;
			} else { // Field is ok
				pointer = pointer[pathBit];
			}
		});
	});

	return amended;
};


var scenarioExport = function(options, finish) {
	var output = {};

	async()
		.then(function(next) { // Coherce args into scenario([options], [callback]) {{{
			if (!options) throw new Error('No arguments passed to scenario()');
			if (_.isFunction(options)) { // Form: (callback)
				finish = options;
			} else if (options) { // Form: model(model, options)
				_.merge(settings, options);
			}
			if (!finish) finish = function() {};
			next();
		}) // }}}
		.then(function(next) { // Sanity checks {{{
			if (!settings.connection) throw new Error('Invalid connection to Mongoose');
			next();
		}) // }}}
		.then('models', function(next) {
			next(null, _.keys(settings.connection.base.models));
		})
		.forEach('models', function(nextModel, model) {
			output[model] = [];
			async()
				.then('contents', function(next) {
					settings.connection.base.models[model].find(next);
				})
				.forEach('contents', function(next, row) {
					var rowOutput = {_id: row._id};

					if (row.__v != 0) rowOutput.__v = row.__v; // Only bother to export __v if its not zero

					_.forEach(row.toObject(), function(val, key) {
						if (key == '_id' || key == '__v') return; // Skip meta fields
						rowOutput[key] = row[key];
					});

					output[model].push(rowOutput);
					next();
				})
				.end(nextModel);
		})
		.end(function(err) {
			if (err) return finish(err);
			finish(null, output);
		});

	return scenarioExport;
};

var scenarioSet = function(options) {
	_.merge(settings, options);
};

module.exports = {
	import: scenarioImport,
	export: scenarioExport,
	set: scenarioSet,
};
