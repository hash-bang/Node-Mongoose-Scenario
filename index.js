var _ = require('lodash');
var async = require('async-chainable');

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
* @param callback function(err, data) Optional callback fired when scenario finishes creating records
*/
var scenario = function(model, options, callback) {
	var asyncCreator = async(); // Task runner that actually creates all the Mongo records

	async()
		.then(function(next) { // Coherce args into scenario(<model>, [options], [callback]) {{{
			if (!model) throw new Error('No arguments passed to scenario()');
			if (_.isFunction(options)) { // Form: (model, callback)
				callback = options;
			} else if (options) { // Form: model(model, options)
				_.merge(settings, options);
			}
			if (!callback) callback = function() {};
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
						return callback('Model "' + model + '" is present in the Scenario schema but no model can be found matching that name, did you forget to load it?');
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

			if (!settings.connection.base.models[collection]) throw new Error('Collection "' + collection + '" not found in Mongoose schema. Did you forget to load it?');

			_.forEach(settings.connection.base.models[collection].schema.paths, function(path, id) {
				if (id == 'id' || id == '_id') {
					// Pass
				} else if (path.instance && path.instance == 'ObjectID') {
					settings.knownFK[collection][id] = FK_OBJECTID;
				} else if (path.caster && path.caster.instance && path.caster.instance == 'ObjectID') { // Array of ObjectIDs
					settings.knownFK[collection][id] = FK_OBJECTID_ARRAY;
				}
			});

			next();
		}) // }}}
		.forEach(model, function(next, rows, collection) { // Process the Scenario profile {{{
			async()
				.forEach(rows, function(next, row) { // Split all incomming items into defered tasks {{{
					var rowFlattened = flatten(row);
					var id = row[settings.keys.ref] ? 'ref-' + row[settings.keys.ref] : 'anon-' + settings.idVal++;
					var dependents = getDependents(collection, rowFlattened);

					asyncCreator.defer(dependents, id, function(next) {
						createRow(collection, rowFlattened, next);
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
			if (err) return callback(err);
			callback(null, settings.progress);
		});

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
};

module.exports = scenario;
