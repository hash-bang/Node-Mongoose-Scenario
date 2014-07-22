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
	refs: {},
	defer: {}, // #wants => @functions
	nextId: 0,
	omitFields: ['_model', '_sid', '_ref'] // Fields to omit from creation process
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
			if (id == 'id' || id == '_id') {
				// Pass
			} else if (path.instance && path.instance == 'ObjectID')
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
		item._sid = 'ID-' + settings.nextId++;
		item._model = model;
		scenarioCreator(item);
	});
};

var scenarioCreator = function(item) {
	console.log('Attempt create', item);
	var canCreate = true;

	for (var fkIndex in settings.knownFK[item._model]) {
		var fk = settings.knownFK[item._model][fkIndex];
		var ref = item[fk];
		if (settings.refs[ref]) { // We know of this ref
			console.log(' * Ref', ref, 'is known as', settings.refs[ref]);
			item[fk] = settings.refs[ref];
		} else { // Dont know this ref yet
			console.log(' * Defer due to', ref, 'missing');
			if (!settings.defer[ref])
				settings.defer[ref] = {};
			settings.defer[ref][item._sid] = item;
			canCreate = false;
		}
	}

	if (canCreate) {
		settings.connection.base.models[item._model].create(_.omit(item, settings.omitFields), function(err, newItem) {
			console.log(' * Created as', newItem._id, 'with ref', ref);
			if (err) {
				settings.failCreate(item._model, err);
			} else if (item._ref) { // This unit has a reference
				console.log(' * Has reference', item._ref);
				settings.refs[item._ref] = newItem._id;
				scenarioRelink(item._ref, newItem._id);
			}
			
			for (var deferOn in settings.defer) {
				if (settings.defer[deferOn][item._sid]) {
					delete settings.defer[deferOn][item._sid];
					console.log(' * Deleted branch', deferOn,'/', item._sid, 'from defer queue');
					if (_.isEmpty(settings.defer[deferOn])) {
						console.log(' * Deleted last item from defer queue for', deferOn);
						delete settings.defer[deferOn];
					}
				}
			}
			scenarioFinalize();
		});
	}
};

var scenarioRelink = function(ref, realId) {
	console.log('Relink', ref, 'as', realId);
	if (settings.defer[ref]) {
		console.log(' * Found ID', ref, 'as', realId);
		_.forEach(settings.defer[ref], function(childItem) {
			scenarioCreator(childItem);
		});
	}
};

var scenarioFinalize = function() {
	if (_.isEmpty(settings.defer)) {
		settings.success();
	} else {
		settings.fail(settings.defer);
	}
	settings.finally(settings.defer);
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
