var _ = require('lodash');
var async = require('async-chainable');
var traverse = require('traverse');

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

	timeout: 2000, // How long between successful creation operations should Scenario wait until it assumes the problem is unsolvable (in milliseconds)

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

	omitFields: ['_ref', '_after'], // Fields to omit from creation process

	getModels: function() {
		return _.keys(settings.connection.base.models);
	},
	getCollection: function(collection) {
		return settings.connection.base.models[collection];
	},
	getCollectionSchema: function(collection) {
		return settings.connection.base.models[collection].schema;
	},
};

/**
* Import a scenario file into a Mongo database
* A scenario must be complete - i.e. have no dangling references for it to suceed
* @param {Object} model The scenario to create - expected format is a hash of collection names each containing a collection of records (e.g. `{users: [{name: 'user1'}, {name: 'user2'}] }`)
* @param {Object} settings Optional Settings array to import
* @param {function} finish(err, data) Optional callback fired when scenario finishes creating records
*/
var scenarioImport = function(model, options, finish) {
	var asyncCreator = async() // Task runner that actually creates all the Mongo records
		// Deal with timeout errors (usually unsolvable circular references) {{{
		.timeout(settings.timeout || 2000, function() {
			var taskIDs = {};
			var remaining = this._struct
				// Prepare a lookup table of tasks IDs that have already finished {{{
				.map(function(task) {
					if (task.completed) taskIDs[_(task.payload).keys().first()] = true;
					return task;
				})
				// }}}
				// Remove non defered objects + completed tasks {{{
				.filter(function(task) {
					return (task.type == 'deferObject' && !task.completed);
				})
				// }}}
				// Remove any task that has resolved prereqs {{{
				.filter(function(task) {
					if (!task.prereq.length) return true; // Has no prereqs anyway
					return ! task.prereq
						.every(function(prereq) {
							return (!! taskIDs[prereq]);
						});
				})
				// }}}
				// Remove any task that nothing else depends on {{{
				.filter(function(task) {
					return true;
				});
				// }}}

		finish(
			'Unresolvable circular reference\n' +
			'Remaining refs:\n' +
			remaining
				// Format the output {{{
				.map(function(task) {
					return (
						' * ' +
						(_(task.payload).keys().first() || '???') +
						(task.prereq.length > 0 ? ' (Requires: ' + task.prereq
							.filter(function(prereq) {
								return (! taskIDs[prereq]); // Pre-req resolved ok?
							})
							.join(', ')
						+ ')': '')
					);
				})
				.join('\n')
				// }}}
			, {
				unresolved: remaining.map(function(task) {
					return _(task.payload).keys().first();
				}),
				processed: this._struct
					.filter(function(task) {
						return (task.type == 'deferObject' && task.completed);
					})
					.length,
			});
		});
		// }}}

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
				.set('models', _.isArray(settings.nuke) ? settings.nuke : settings.getModels())
				.forEach('models', function(next, model) {
					var collection = settings.getCollection(model);
					if (!collection) return next('Model "' + model + '" is present in the Scenario schema but no model can be found matching that name, did you forget to load it?');
					collection.remove({}, function(err) {
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

			var collectionSchema = settings.getCollectionSchema(collection);
			if (!collectionSchema) throw new Error('Collection "' + collection + '" not found in Mongoose schema. Did you forget to load its model?');

			// Merge extracted keys into knownFKs storage
			settings.knownFK[collection] = extractFKs(collectionSchema);

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
		// End {{{
		.end(function(err) {
			if (err) return finish(err);
			finish(null, settings.progress);
		});
		// }}}

	return scenarioImport;
};


/**
* Extract the FK relationship from a Mongo document
* @param {Object} schema The schema object to examine (usually connection.base.models[model].schema)
* @return {Object} A dictionary of foreign keys for the schema
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
* @param {Object} row The row that will be inserted - values will be replaced inline
* @param {Object} fks The foreign keys for the given row (extacted via extractFKs)
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
* @param {Object} row The row that will be inserted
* @param {Object} fks The foreign keys for the given row (extacted via extractFKs)
* @see extractFKs()
* @return {array} An array of required references
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
* @param {Object} obj The object to flatten
* @return {Object} A flattened version of the object given
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
* Take a flattened object and return a nested object
* @param {Object} obj The flattened object
* @return {Object} The unflattened object
*/


/**
* Create a single row in a collection
* @param {string} collection The collection where to create the row
* @param {string} id The ID of the row (if any)
* @param {Object} row The (flattened) row contents to create
* @param {function} callback(err) Callback to chainable async function
*/
function createRow(collection, id, row, callback) {
	injectFKs(row, settings.knownFK[collection]);

	// build up list of all sub-document _ref's that we need to find in the newly saved document
	// this is to ensure we capture _id from inside nested array documents that do not exist at root level
	var refsMeta = [];
	traverse(row).forEach(function (value) {
		var path;
		if ('_ref' === this.key) {
			path = this.path.concat();
			path[path.length - 1] = '_id';
			refsMeta.push({
				ref: value,
				path: path
			});
		}
	});

	row = _.omit(row, settings.omitFields);

	settings.getCollection(collection).create(row, function(err, newItem) {
		if (err) return callback(err);

		var newItemAsObject = newItem.toObject();
		for(var i = 0; i < refsMeta.length; i++) {
			if (traverse(newItemAsObject).has(refsMeta[i].path)) {
				settings.refs[refsMeta[i].ref] = traverse(newItemAsObject).get(refsMeta[i].path).toString();
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
			next();
		}) // }}}
		.then(function(next) { // Sanity checks {{{
			if (!settings.connection) throw new Error('Invalid connection to Mongoose');
			next();
		}) // }}}
		.then('models', function(next) {
			next(null, settings.getModels());
		})
		.forEach('models', function(nextModel, model) {
			output[model] = [];
			async()
				.then('contents', function(next) {
					settings.getCollection(model).find(next);
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
			if (!finish) finish = function() {};

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
