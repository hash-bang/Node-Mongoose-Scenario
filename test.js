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
	favourite: {type: mongoose.Schema.ObjectId},
	items: [{type: mongoose.Schema.ObjectId}]
});
var user = mongoose.model('users', userSchema);

var widgetSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	content: String,
	status: {type: String, enum: ['active', 'deleted'], default: 'active'}
});
var widget = mongoose.model('widgets', widgetSchema);
// }}}

// Scenario setup {{{
var scenario = require("./index.js")({}, {
	connection: mongoose.connection,
	nuke: true
});
// }}}

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

tape('Scenario with 1:1 + 1:M relationships - setup', function(assert) {
	assert.plan(2);

	assert.test('Check DB users', function(assert2) {
		assert2.plan(6);
		user.find().exec(function(err, data) {
			if (err) return assert.fail(err);
			assert2.pass('Got user data');
			assert2.equal(data.length, 1, 'User row count');
			assert2.equal(data[0].name, 'Wendy User');
			assert2.equal(data[0].role, 'user');
			assert2.equal(data[0].items, 1);
			assert2.notEqual(data[0].favourite, null);
		});
	});

	assert.test('Check DB widgets', function(assert2) {
		assert2.plan(4);
		widget.find().exec(function(err, data) {
			if (err) return assert.fail(err);
			assert2.pass('Got widget data');
			assert2.equal(data.length, 1, 'Widget row count');
			assert2.equal(data[0].name, 'Widget quz');
			assert2.equal(data[0].content, 'This is the quz widget');
		});
	});
});
