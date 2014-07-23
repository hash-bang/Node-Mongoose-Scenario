var assert = require("assert");
var mongoose = require('mongoose');

mongoose.connect('mongodb://localhost/node-mongoose-scenario');
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

var scenario = require("./index.js")({
	connection: mongoose.connection,
	nuke: ['widgets', 'users'],
	finally: function(out) {
		console.log('DONE', out);
	}
});


scenario('users', {
	name: 'Wendy User',
	role: 'user',
	favourite: 'widget-quz'
});

scenario('widgets', {
	_ref: 'widget-quz',
	name: 'Widget quz',
	content: 'This is the quz widget'
});

/*

scenario({
	users: [
		{
			name: 'John User',
			role: 'user',
			items: ['widget-foo']
		},
		{
			name: 'Joe Admin',
			role: 'admin',
			items: ['widget-foo', 'widget-baz']
		},
	],
	widgets: [
		{
			_ref: 'widget-foo',
			name: 'Widget foo',
			content: 'This is the foo widget'
		},
		{
			_ref: 'widget-bar',
			name: 'Widget bar',
			content: 'This is the bar widget'
		},
		{
			_ref: 'widget-baz',
			name: 'Widget foo',
			content: 'This is the baz widget'
		},
	]
]);
*/
