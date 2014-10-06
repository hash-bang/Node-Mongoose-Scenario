var assert = require("assert");
var mongoose = require('mongoose');

// Mongoose setup {{{
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
// }}}

// Scenario setup {{{
var scenario = require("./index.js")({
	connection: mongoose.connection,
	nuke: ['widgets', 'users'],
	finally: function(out) {
		console.log('DONE', require('util').inspect(require('lodash').omit(out, ['connection']), {depth: 5}));
	}
});
// }}}

// Test: Simple scenario with 1:1 mapping {{{
scenario({
	users: [
		{
			name: 'Wendy User',
			role: 'user',
			favourite: 'widget-quz'
		},
	],
	widgets: [
		{
			_ref: 'widget-quz',
			name: 'Widget quz',
			content: 'This is the quz widget'
		}
	]
});
*/

// FIXME: Add assert tests here
// }}}

// Test: Simple scenario with 1:M mapping {{{
scenario({
	users: [
		{
			name: 'Phil User',
			role: 'user',
			items: ['widget-quz']
		}
	],
	widgets: [
		{
			_ref: 'widget-quuz',
			name: 'Widget quuz',
			content: 'This is the quuz widget'
		}
	]
});

// FIXME: Add assert tests here
// }}}

// Test: Complex scenario {{{
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
		}
	],
	widgets: [
		{
			_ref: 'widget-foo',
			name: 'Widget Foo',
			content: 'This is the foo widget'
		},
		{
			_ref: 'widget-bar',
			name: 'Widget Bar',
			content: 'This is the bar widget'
		},
		{
			_ref: 'widget-baz',
			name: 'Widget Baz',
			content: 'This is the baz widget'
		}
	]
});
// }}}
