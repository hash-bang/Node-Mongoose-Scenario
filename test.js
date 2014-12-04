var _ = require('lodash');
var tape = require('tape');
var mongoose = require('mongoose');

// Mongoose setup {{{
mongoose.connect('mongodb://localhost/mongoose-scenario');
mongoose.connection.on('error', console.error.bind(console, 'DB connection error:'));

var userSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	role: {type: String, enum: ['user', 'admin'], default: 'user'},
	favourite: {type: mongoose.Schema.ObjectId, ref: 'widgets'},
	items: [{type: mongoose.Schema.ObjectId, ref: 'widgets'}]
});
var User = mongoose.model('users', userSchema);

var widgetSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	content: String,
	status: {type: String, enum: ['active', 'deleted'], default: 'active'}
});
var Widget = mongoose.model('widgets', widgetSchema);

var groupSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	preferences: {
		defaults: {
			items: [{type: mongoose.Schema.ObjectId, ref: 'widgets'}]
		}
	}
});
var Group = mongoose.model('groups', groupSchema);
// }}}

// Scenario setup {{{
var scenario = require("./index.js")({}, {
	connection: mongoose.connection,
	nuke: true
});
// }}}

// Scenario with 1:1 + 1:M relationships {{{
tape('Scenario with 1:1 + 1:M relationships - setup', function(assert) {
	assert.plan(1);

	scenario({
		users: [
			{
				name: 'Wendy User',
				role: 'user',
				favourite: 'widget-quz',
				items: ['widget-quz']
			},
		],
		widgets: [
			{
				_ref: 'widget-quz',
				name: 'Widget quz',
				content: 'This is the quz widget'
			},
			{
				_ref: 'widget-qux',
				name: 'Widget qux',
				content: 'This is the qux widget'
			}
		]
	}, function(err, data) {
		if (err) return assert.fail(err);
		assert.pass('Scenario setup');
	});
});

tape('Scenario with 1:1 + 1:M relationships - verify', function(assert) {
	assert.plan(2);

	assert.test('Check DB users', function(assert2) {
		assert2.plan(7);
		User
			.find()
			.populate('items')
			.exec(function(err, data) {
				if (err) return assert.fail(err);
				assert2.pass('Got user data');
				assert2.equal(data.length, 1, 'User row count');
				assert2.equal(data[0].name, 'Wendy User');
				assert2.equal(data[0].role, 'user');
				assert2.equal(data[0].items.length, 1);
				assert2.equal(data[0].items[0].name, 'Widget quz');
				assert2.notEqual(data[0].favourite, null);
			});
	});

	assert.test('Check DB widgets', function(assert2) {
		assert2.plan(6);
		Widget
			.find()
			.sort('name')
			.exec(function(err, data) {
				if (err) return assert.fail(err);
				assert2.pass('Got widget data');
				assert2.equal(data.length, 2, 'Widget row count');
				assert2.equal(data[0].name, 'Widget qux');
				assert2.equal(data[0].content, 'This is the qux widget');
				assert2.equal(data[1].name, 'Widget quz');
				assert2.equal(data[1].content, 'This is the quz widget');
			});
	});
});
// }}}

// Scenario with 1:1 + 1:M deeply nested relationships {{{
tape('Scenario with 1:1 + 1:M deeply nested relationships - setup', function(assert) {
	assert.plan(1);

	scenario({
		groups: [
			{
				name: 'Group Foobar',
				preferences: {
					defaults: {
						items: [
							'widget-quz',
							'widget-qux',
						]
					}
				}
			},
		]
	}, function(err, data) {
		if (err) return assert.fail(err);
		assert.pass('Scenario setup');
	});
});

tape('Scenario with 1:1 + 1:M deeply nested relationships - verify', function(assert) {
	assert.plan(6);

	Group
		.find()
		.populate('preferences.defaults.items')
		.exec(function(err, data) {
			if (err) return assert.fail(err);
			assert.pass('Got group data');
			assert.equal(data.length, 1, 'Group row count');
			assert.equal(data[0].name, 'Group Foobar', 'Group name');
			assert.equal(data[0].preferences.defaults.items.length, 2, 'Deeply nested item count');

			data[0].preferences.defaults.items = _.sortBy(data[0].preferences.defaults.items, 'name'); // Force sorting as Mongo can't do this AND populate at the same time
			assert.equal(data[0].preferences.defaults.items[0].name, 'Widget qux', 'Deeply nested item[0] name');
			assert.equal(data[0].preferences.defaults.items[1].name, 'Widget quz', 'Deeply nested item[1] name');
		});
});
// }}}
