var _ = require('lodash');
var async = require('async');

// Constants {{{
	var FK_OBJECTID = 1; // 1:1 objectID mapping
	var FK_OBJECTID_ARRAY = 2; // Array of objectIDs
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
* Create a scenario
* A scenario must be complete - i.e. have no danling references for it to suceed
* @param object model The scenario to create - expected format is a hash of collection names each containing a collection of records (e.g. `{users: [{name: 'user1'}, {name: 'user2'}] }`)
* @param object settings Optional Settings array to import
* @param callback function(err, data) Callback fired when scenario finishes creating records
*/
var scenario = function(model, options, callback) {
	if (_.isFunction(options)) { // Form: (model, callback)
		callback = options;
	} else if (options) { // Form: model(model, options)
		_.merge(settings, options);
	}
	if (!callback)
		callback = function() {};

	// Sanity checks
	if (!settings.connection)
		throw new Error('Invalid connection to Mongoose');

	// Rest all progress
	settings.progress.created = {};
	if (settings.reset)
		settings.refs = {};

	// Handle collection nuking {{{
	if (settings.called++ == 0 && settings.nuke) {
		var nukes = [];

		_.forEach(_.isArray(settings.nuke) ? settings.nuke : _.keys(settings.connection.base.models), function(model) {
			nukes.push(function(next) {
				if (!settings.connection.base.models[model])
					return callback(new Error('Model "' + model + '" is present in the Scenario schema but no model can be found matching that name, did you forget to load it?'));
				settings.connection.base.models[model].find({}).remove(function(err) {
					if (err) next(err);
					settings.progress.nuked.push(model);
					next();
				});
			});
		});
		async.parallel(nukes, function(err) {
			if (err) return err;
			scenario(model, options, callback);
		});
		return scenario; // Stop processing here until nukes are done (then scenario() is reinvoked)
	}
	// }}}

	if (_.isObject(model)) { // scenario(modelsObject) - Hash of models
		var tasks = {};
		_.forEach(model, function(rows, collection) {
			if (!settings.knownFK[collection]) // Not computed the FKs for thios collection before
				computeFKs(collection);

			_.forEach(rows, function(row) {
				row = flatten(row);
				var dependents = getDependents(collection, row);
				var createFunc = function(next, a, b, c) {
					createRow(collection, row, next);
				};

				dependents.push(createFunc);

				tasks[row[settings.keys.ref] ? 'ref-' + row[settings.keys.ref] : 'anon-' + settings.idVal++] = dependents;
			});
		});

		if (!settings.reset) // If we're carrying over previously created items make sure these get removed from the task list
			_.forEach(settings.refs, function(value, refID) {
				tasks['ref-' + refID] = function(next) {next()}; // Dummy function to resolve this reference immediately so it satisfies async.auto()
			});

		// Check whether all dependencies of async.auto can be resolved.
		// For performance reasons can be disabled by setting .checkDependencies
		// fields of setting to false.
		if (settings.checkDependencies) {
			var unresolved = [];
			_.forIn(tasks, function(val, key) {
				if (_.isArray(val)) {
					_.forEach(val,function (dep) {
						if (_.isString(dep) && !tasks[dep])
							unresolved.push(dep);
					});
				}
			});
			if (unresolved.length) {
				callback({
					error : 'Missing Keys',
					keys : unresolved
				});
				return scenario;
			}
		}

		async.auto(tasks, function(err) {
			if (err)
				return callback(err);
			callback(null, settings.progress);
			return scenario;
		});
	} else {
		throw 'Invalid scenario invoke style - scenario(' + typeof model + ')';
	}

	return scenario;
};

/**
* Examine a single creation row and return an array of all its dependencies
* @param object row The row to examine
* @return array Array of all references required to create the record
*/
function getDependents(collection, row) {
	var dependents = [];

	_.forEach(row, function(fieldValue, fieldID) {
		if (row[fieldID] === undefined) return; // Found a FK but incomming row def has it as omitted - skip
		switch (settings.knownFK[collection][fieldID]) {
			case FK_OBJECTID: // 1:1 relationship
				dependents.push('ref-' + fieldValue);
				break;
			case FK_OBJECTID_ARRAY: // 1:M array based relationship
				_.forEach(fieldValue, function(fieldValueArr) {
					dependents.push('ref-' + fieldValueArr);
				});
				break;
			default: // Probably not a reference
				break;
		}
	});

	var after = row[settings.keys.after];
	if (after) { // Define custom dependencies (via '_after')
		if (_.isString(after)) {
			after = after.split(/\s*,\s*/);
		} else if (_.isObject(after)) { // Not really supported behaviour but throw it in anyway
			after = _.keys(after);
		}

		after.forEach(function(dep) {
			dependents.push('ref-' + dep);
		});
	}

	return dependents;
};

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
* @param object row The row contents to create
* @param function callback(err) Callback to chainable async function
*/
function createRow(collection, row, callback) {
	var createRow = {};

	_.forEach(row, function(fieldValue, fieldID) {
		if (row[fieldID] === undefined) return; // Skip omitted FK refs
		switch (settings.knownFK[collection][fieldID]) {
			case FK_OBJECTID: // 1:1 relationship
				if (!settings.refs[fieldValue])
					return callback('Attempting to use reference "' + fieldValue + '" in field ' + collection + '.' + fieldID + ' before its been created!');
				createRow[fieldID] = settings.refs[fieldValue];
				break;
			case FK_OBJECTID_ARRAY: // 1:M array based relationship
				createRow[fieldID] = _.map(fieldValue, function(fieldValueArr) { // Resolve each item in the array
					if (!settings.refs[fieldValueArr])
						return callback('Attempting to use reference "' + fieldValueArr + '" in 1:M field ' + fieldID + ' before its been created!');
					return settings.refs[fieldValueArr];
				});
				break;
			default: // Probably not a reference
				createRow[fieldID] = fieldValue;
		}
	});

	createRow = _.omit(createRow, settings.omitFields);

	settings.connection.base.models[collection].create(createRow, function(err, newItem) {
		if (err)
			console.log("ERR", err, 'DURING', createRow);
		if (err) return callback(err);

		if (row[settings.keys.ref]) { // This unit has its own reference - add it to the stack
			settings.refs[row[settings.keys.ref]] = newItem._id;
		}

		if (!settings.progress.created[collection])
			settings.progress.created[collection] = 0;
		settings.progress.created[collection]++;
		callback(null, newItem._id);
	});
};


/**
* Pre-cache all foreign key items in a model
* @param string model The model to process
*/
var computeFKs = function(model) {
	if (!settings.knownFK[model]) {
		settings.knownFK[model] = {};

		if (!settings.connection.base.models[model]) {
			throw 'Model "' + model + '" not found in Mongoose schema. Did you forget to load it?';
		} else {
			_.forEach(settings.connection.base.models[model].schema.paths, function(path, id) {
				if (id == 'id' || id == '_id') {
					// Pass
				} else if (path.instance && path.instance == 'ObjectID') {
					settings.knownFK[model][id] = FK_OBJECTID;
				} else if (path.caster && path.caster.instance && path.caster.instance == 'ObjectID') { // Array of ObjectIDs
					settings.knownFK[model][id] = FK_OBJECTID_ARRAY;
				}
			});
		}
	}
};

module.exports = scenario;
