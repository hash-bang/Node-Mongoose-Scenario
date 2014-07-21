var _ = require('lodash');

var util = require('util'); // FIXME: DEBUG

var settings = {
	connection: null,
	nuke: [],
	autoLink: true,
	success: function(models) {},
	fail: function(models) {},
	failCreate: function(model, err) {
		console.warn("Error creating item in model", model, err);
	},
	finally: function(models) {},
	linkInline: true, // Link as we go where possible rather than linking everything at the end FIXME: Unsupported

	called: 0, // How many times scenario has been called (if zero `nuke` gets fired)
	knownFK: {},
	dangling: {}, // #model => #wants => @ids
	refs: {}, // #id => $id
};

var scenario = function(model, obj) {
	if (settings.called++ == 0 && settings.nuke)
		_.forEach(settings.nuke, function(model) {
			settings.connection.base.models[model].find({}).remove().exec();
		});

	if (!model)
		return scenarioLink();

	if (_.isString(model) && _.isArray(obj)) // scenario(modelString, dataArray) - Populate model from array of objects
		return scenarioArray(model, obj);

	if (_.isObject(model)) { // scenario(modelsObject) - Hash of models
		for (var key in model) {
			scenarioArray(key, model[key]);
		}
		return;
	}

	if (_.isString(model) && _.isObject(obj)) // scenario(modelString, dataObject) - Populate a single item
		return scenarioArray(model, [obj]);

	if (_.isArray(model)) // scenario(dataArray) - Not allowed
		return console.error('Invalid scenario invoke style - scenario(array) is not supported. Did you mean scenario(modelName, array)?');

	console.error('Invalid scenario invoke style - scenario(', typeof model, ',', typeof obj, ')');
};

/**
* Process an array of objects into a model
* @param string model The model to process into
* @param array arr The array of data to digest
*/
var scenarioArray = function(model, arr) {
	console.log('Load', model, '/#', arr.length);
	// Setup settings.knownFK[model] {{{
	if (!settings.knownFK[model]) {
		settings.knownFK[model] = [];
		_.forEach(settings.connection.base.models[model].schema.paths, function(path, id) {
			if (path.instance && path.instance == 'ObjectID')
				settings.knownFK[model].push(id);
			// Array of ObjectIDs
			/*
			if (path.caster && path.caster.instance && path.caster.instance == 'ObjectID')
				settings.knownFK[model].push(id);
			*/
		});
	}
	// }}}
	_.forEach(arr, function(item) {
		var ref = null;
		var dangling = {};
		if (item._ref) { // Has its own ref
			ref = item._ref;
			delete item._ref;
		}
		_.forEach(settings.knownFK[model], function(fk) {
			if (item[fk]) {
				dangling[fk] = item[fk];
				delete item[fk];
			}
		});
		settings.connection.base.models[model].create(item, function(err, newItem) {
			if (err) {
				settings.failCreate(model, err);
			} else {
				for (var d in dangling) {
					if (!settings.dangling[model])
						settings.dangling[model] = {};
					if (!settings.dangling[model][dangling[d]])
						settings.dangling[model][dangling[d]] = [];
					settings.dangling[model][dangling[d]].push(newItem._id);
				}

				if (ref) // Store the ref in the lookup table
					settings.refs[ref] = newItem._id.toString();
			}
			settings.finally(settings);
			scenarioLink();
		});
	});
};

/**
* Process all dangling pointers
*/
var scenarioLink = function() {
	for (var model in settings.dangling) {
		for (var d in settings.dangling[model]) {
			if (settings.refs[d]) { // Can we fix this danling reference yet?
				console.log('Can fix dangling:', d);
				_.forEach(settings.dangling[model][d], function(ref) {
					console.log('FIX REF', d, 'AS', ref);
				});
			}
		}
	}
};

module.exports = function(options) {
	settings = _.defaults(options, settings);
	return scenario;
};
