// Mongoose setup {{{
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/mongoose-scenario');
mongoose.connection.on('error', console.error.bind(console, 'DB connection error:'));
// }}}

// User {{{
var userSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	role: {type: String, enum: ['user', 'admin'], default: 'user'},
	favourite: {type: mongoose.Schema.ObjectId, ref: 'widgets'},
	items: [{type: mongoose.Schema.ObjectId, ref: 'widgets'}],
	testSet: {type: String},
});
var User = mongoose.model('users', userSchema);
// }}}

// Widget {{{
var widgetSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	content: String,
	status: {type: String, enum: ['active', 'deleted'], default: 'active'},
	testSet: {type: String},
});
var Widget = mongoose.model('widgets', widgetSchema);
// }}}

// Group {{{
var groupSchema = new mongoose.Schema({
	id: mongoose.Schema.ObjectId,
	name: String,
	preferences: {
		defaults: {
			items: [{type: mongoose.Schema.ObjectId, ref: 'widgets'}]
		}
	},
	testSet: {type: String},
});
var Group = mongoose.model('groups', groupSchema);
// }}}

module.exports = {
	connection: mongoose.connection,
	user: User,
	widget: Widget,
	group: Group,
};
