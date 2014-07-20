Mongoose-Scenario
=================
Write scenario files which quickly allow you to populate Mongo / Mongoose model contents.

**WARNING: This specification is experimental**


Basic usage
-----------
Scenario can be used a variety of ways:

In the below scenarios `{...}` is used to denote a hash object of data - see the [examples](#Examples) section for more detail.

```javascript
var mongoose = require('mongoose');
var scenario = require('mongoose-scenario')({
	connection: db
});


// Populate the 'widgets' model with the single provided object
scenario('widgets', {...});

// Populate the widgets model with an array of objects
scenario('widgets', [ {...}, {...} ]);

// Populate multiple models with a hash of models (in this case 'widgets' and 'users' models)
scenario({
	widgets: [ {...} ],
	users: [ {...} ]
});
```


Examples
========

Single model population
-----------------------
Simply populate a widgets model with data:

```javascript
var mongoose = require('mongoose');
var scenario = require('mongoose-scenario')({
	connection: db
});

scenario('users', [
	{
		name: 'John User',
		role: 'user'
	},
	{
		name: 'Joe Admin',
		role: 'admin'
	}
]);
```

Or populate the same thing from a JSON file:

```javascript
// Usual require stuff (see above). Omitted for brevity.
var fs = require('fs');

scenario(fs.readFileSync('./data/scenarioFoo.json'));
```


Populate multiple models
------------------------
Similar to the single model example above, you can also populate multiple models. Either by calling the single model invocation (see above) multiple times or by passing a hash structure to scenario:


```javascript
var mongoose = require('mongoose');
var scenario = require('mongoose-scenario')({
	connection: db
});

scenario({
	users: [
		{
			name: 'John User',
			role: 'user'
		},
		{
			name: 'Joe Admin',
			role: 'admin'
		},
	],
	widgets: [
		{
			name: 'Widget foo',
			content: 'This is the foo widget'
		},
		{
			name: 'Widget bar',
			content: 'This is the bar widget'
		},
		{
			name: 'Widget foo',
			content: 'This is the baz widget'
		},
	]
]);
```

You can cross-link objects in the next section.



Cross-model linkages
--------------------
Due to the nature of model linkages Scenario provides a simple way to refer to records via the `_ref` property.
This property is not actually saved to the Mongo schema. It is used for records to refer to one another during setup.

In the below example a users and widgets model are created where a user can have multiple widgets allocated in `users.items`.

```javascript
var mongoose = require('mongoose');
var scenario = require('mongoose-scenario')({
	connection: db
});

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
```
