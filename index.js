var _ = require('lodash');
var async = require('async');

// Constants {{{
	var FK_OBJECTID = 1; // 1:1 objectID mapping
	var FK_OBJECTID_ARRAY = 2; // Array of objectIDs
// }}}

var settings = {
	connection: null,
	nuke: [], // Either a list of collections to nuke or 'true' to use the incomming scenario to calculate the collections

	defer: null, // Outer 'Q' wrapper of a Scenario session
	called: 0, // How many times scenario has been called (if zero `nuke` gets fired)

	progress: { // Output data array (passed to callback on finish)
		created: {}, // Number of records created for each collection
		nuked: [], // Tables nuked during call
	},

	refs: {}, // Lookup list of known references

	knownFK: {}, // Cache of known foreign keys for a collection

	idVal: 0, // Incrementing ID value for fields that do not have a '_ref'
	exitTaskId: 0,

	omitFields: ['_model', '_sid', '_ref'] // Fields to omit from creation process
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

	// Rest all progress
	settings.progress.created = {};

	// Handle collection nuking {{{
	if (settings.called++ == 0 && settings.nuke) {
		var nukes = [];
		_.forEach(_.isArray(settings.nuke) ? settings.nuke : _.keys(model), function(model) {
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
		return; // Stop processing here until nukes are done (then scenario() is reinvoked)
	}
	// }}}

	if (_.isObject(model)) { // scenario(modelsObject) - Hash of models
		var tasks = {};
		_.forEach(model, function(rows, collection) {
			if (!settings.knownFK[collection]) // Not computed the FKs for thios collection before
				computeFKs(collection);

			_.forEach(rows, function(row) {
				var dependents = getDependents(collection, row);
				var createFunc = function(next, a, b, c) {
					createRow(collection, row, next);
				};

				dependents.push(createFunc);

				tasks[row._ref ? 'ref-' + row._ref : 'anon-' + settings.idVal++] = dependents;
			});
		});
		async.auto(tasks, function(err) {
			if (err) return callback(err);
			return callback(null, settings.progress);
		});
	} else {
		throw 'Invalid scenario invoke style - scenario(' + typeof model + ')';
	}

};

/**
* Examine a single creation row and return an array of all its dependencies
* @param object row The row to examine
* @return array Array of all references required to create the record
*/
function getDependents(collection, row) {
	var dependents = [];

	_.forEach(settings.knownFK[collection], function(refType, ref) {
		switch (refType) {
			case FK_OBJECTID: // 1:1 relationship
				dependents.push('ref-' + row[ref]);
				break;
			case FK_OBJECTID_ARRAY: // 1:M array based relationship
				var mappedArray = [];
				var missing = '';
				_.forEach(row[ref], function(rowValue) {
					dependents.push('ref-' + rowValue);
				});
				break;
		}
	});

	return dependents;
};

/**
* Create a single row in a collection
* @param string collection The collection where to create the row
* @param object row The row contents to create
* @param function callback(err) Callback to chainable async function
*/
function createRow(collection, row, callback) {
	var createRow = row;

	_.forEach(settings.knownFK[collection], function(refType, ref) {
		switch (refType) {
			case FK_OBJECTID: // 1:1 relationship
				if (!settings.refs[row[ref]])
					return callback('Attempting to use reference ' + ref + ' before its been created!');
				createRow[ref] = settings.refs[row[ref]];
				break;
			case FK_OBJECTID_ARRAY: // 1:M array based relationship
				createRow[ref] = _.map(row[ref], function(rowValue) {
					if (!settings.refs[rowValue])
						return callback('Attempting to use reference ' + rowValue + ' in 1:M field ' + ref + ' before its been created!');
					return settings.refs[rowValue];
				});
				break;
		}
	});

	_.omit(createRow, settings.omitFields);

	settings.connection.base.models[collection].create(createRow, function(err, newItem) {
		if (err)
			console.log("ERR", err, 'DURING', createRow);
		if (err) return callback(err);

		if (row._ref) { // This unit has its own reference - add it to the stack
			settings.refs[row._ref] = newItem._id;
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
