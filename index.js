var _ = require('lodash');

// Constants {{{
	var FK_OBJECTID = 1; // 1:1 objectID mapping
	var FK_OBJECTID_ARRAY = 2; // Array of objectIDs
// }}}

var settings = {
	connection: null,
	nuke: [],
	success: function(models) {},
	fail: function(models) {},
	failCreate: function(model, err) {
		console.warn("Error creating item in model", model, err);
	},
	finally: function(models) {},
	debug: function(txt) {},

	called: 0, // How many times scenario has been called (if zero `nuke` gets fired)
	created: {}, // Tracker for record creation
	createdTotal: 0,

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
		throw 'Invalid scenario invoke style - scenario(array) is not supported. Did you mean scenario(modelName, array)?';

	throw 'Invalid scenario invoke style - scenario(' + typeof model + ',' + typeof obj + ')';
};

/**
* Process an array of objects into a model
* @param string model The model to process into
* @param array arr The array of data to digest
*/
var scenarioArray = function(model, arr) {
	settings.debug('Load', model, '/#', arr.length);
	scenarioFKs(model); // Setup settings.knownFK[model]

	_.forEach(arr, function(item) {
		item._sid = 'ID-' + settings.nextId++;
		item._model = model;
		scenarioCreator(item);
	});
};

/**
* Pre-cache all foreign key items in a model
* @param string model The model to process
*/
var scenarioFKs = function(model) {
	if (!settings.knownFK[model]) {
		settings.knownFK[model] = {};

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
};

var scenarioCreator = function(item) {
	settings.debug('Attempt create', item);
	var canCreate = true;

	for (var fk in settings.knownFK[item._model]) {
		var refType = settings.knownFK[item._model][fk];
		var ref = item[fk];
		if (ref === undefined) // Its undefined anyway - skip (occurs when a FK is unset on create)
			continue;

		switch (refType) {
			case FK_OBJECTID:
				if (settings.refs[ref]) { // We know of this ref and its a simple 1:1
					settings.debug(' * Ref', ref, 'is known as', settings.refs[ref]);
					item[fk] = settings.refs[ref];
				} else {
					settings.debug(' * Defer due to', ref, 'missing');
					scenarioDefer(ref, item);
					canCreate = false;
				}
				break;
			case FK_OBJECTID_ARRAY:
				var mappedArray = [];
				var missing = '';
				for (var i in item[fk]) {
					if (settings.refs[item[fk][i]]) { // We have this array item
						mappedArray.push(settings.refs[item[fk][i]]);
					} else { // Missing item
						missing = item[fk][i];
						break;
					}
				}
				if (!missing) { // We have all items
					item[fk] = mappedArray;
					settings.debug(' * FK array', fk, 'has all members mappable', item);
				} else {
					settings.debug(' * Defer due to member of ObjectID array', missing, 'missing');
					scenarioDefer(missing, item);
					canCreate = false;
				}
				break;
		}
	}

	if (canCreate) {
		settings.connection.base.models[item._model].create(_.omit(item, settings.omitFields), function(err, newItem) {
			if (err) {
				return settings.failCreate(item._model, err);
			} else if (item._ref) { // This unit has a reference
				settings.debug(' * Has reference', item._ref);
				settings.refs[item._ref] = newItem._id;
				scenarioRelink(item._ref, newItem._id);
			}

			settings.debug(' * Created as', newItem._id, 'with ref', ref);
			settings.createdTotal++;
			if (!settings.created[item._model]) {
				settings.created[item._model] = 1;
			} else
				settings.created[item._model]++;
			
			for (var deferOn in settings.defer) {
				if (settings.defer[deferOn][item._sid]) {
					delete settings.defer[deferOn][item._sid];
					settings.debug(' * Deleted branch', deferOn,'/', item._sid, 'from defer queue');
					if (_.isEmpty(settings.defer[deferOn])) {
						settings.debug(' * Deleted last item from defer queue for', deferOn);
						delete settings.defer[deferOn];
					}
				}
			}
			scenarioFinalize();
		});
	}
};

var scenarioHasAllMembers = function(arr) {
	var out = [];
	arr = out;
	return true;
};

var scenarioRelink = function(ref, realId) {
	settings.debug('Relink', ref, 'as', realId);
	if (settings.defer[ref]) {
		settings.debug(' * Found ID', ref, 'as', realId);
		_.forEach(settings.defer[ref], function(childItem) {
			scenarioCreator(childItem);
		});
	}
};

var scenarioDefer = function(ref, item) {
	if (!settings.defer[ref])
		settings.defer[ref] = {};
	settings.defer[ref][item._sid] = item;
};

var scenarioFinalize = function() {
	if (_.isEmpty(settings.defer)) {
		settings.success(settings.created);
	} else {
		settings.fail(settings.created, settings.defer);
	}
	settings.finally(settings.created, settings.defer);

	settings.created = {};
	settings.createdTotal = 0;
};

module.exports = function(options) {
	settings = _.defaults(options, settings);
	return scenario;
};
