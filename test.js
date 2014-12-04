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
		assert2.plan(4);
		Widget
			.find()
			.exec(function(err, data) {
				if (err) return assert.fail(err);
				assert2.pass('Got widget data');
				assert2.equal(data.length, 1, 'Widget row count');
				assert2.equal(data[0].name, 'Widget quz');
				assert2.equal(data[0].content, 'This is the quz widget');
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
			},
		]
	}, function(err, data) {
		if (err) return assert.fail(err);
		assert.pass('Scenario setup');
	});
});

tape('Scenario with 1:1 + 1:M deeply nested relationships - verify', function(assert) {
	assert.plan(3);

	Group
		.find()
		.populate('preferences.defaults.items')
		.exec(function(err, data) {
			if (err) return assert.fail(err);
			assert.pass('Got group data');
			assert.equal(data.length, 1, 'Group row count');
			assert.equal(data[0].name, 'Group Foobar', 'Group name');
		});
});
// }}}
