Mongoose-Scenario
=================
Write scenario files which quickly allow you to populate Mongo / Mongoose model contents.

**WARNING: This specification is experimental**


Installation
------------
Use [NPM](https://www.npmjs.org) to install:

	npm install --save-dev mongoose-scenario


Comparison with Mongo insert()
------------------------------
The normal method to insert records into Mongo is to force the `_id` value of documents to a referencable value:

```javascript
// Setup a user record that has three items which are widgets

db.widgets.insert({_id: "widget-foo", name: "Widget Foo"});
db.widgets.insert({_id: "widget-bar", name: "Widget Bar"});
db.widgets.insert({_id: "widget-baz", name: "Widget Baz"});

db.users.insert({
	name: "John User",
	items: ['widget-foo', 'widget-bar']
});
```

However this method has the following downsides:

1. Its entirely code based - all the inserts must be done in JavaScript rather than a more data friendly format such as JSON
2. The `_id` fields cannot be auto-generated - this means you can't use the hash format Mongo would normally generate. Instead your fake record IDs would stand out compared to the hash values of 'real' documents.


Basic usage
-----------
Scenario can be used a variety of ways:

In the below examples `{...}` is used to denote a hash object of data - see the [examples](#examples) section for more detail.

```javascript
var mongoose = require('mongoose');
var scenario = require('mongoose-scenario')({
	connection: db
});


// Populate the 'widgets' model with a single object (you can call this multiple times to populate multiple objects)
scenario('widgets', {...});

// Populate the widgets model with an array of objects
scenario('widgets', [ {...}, {...} ]);

// Populate multiple models with a hash of models (in this case 'widgets' and 'users' models)
scenario({
	widgets: [ {...} ],
	users: [ {...} ]
});
```


Options
-------
Options are specified when including the module via `require()`:

```javascript
var scenario = require('mongoose-scenario')({
	/* Options */
});
```


| Option                              | Type           | Default        | Description                                                            |
|-------------------------------------|----------------|----------------|------------------------------------------------------------------------|
| connection                          | _object_       | _none_         | The Mongoose connection object to use                                  |
| nuke                                | _array_        | _none_         | Array of models to clear out (i.e. remove all records) before starting |
| debug                               | _function(txt)_ | _none_        | Function used by Scenario to output diagnostic information. Map to `console.log` for debug information |
| success                             | _function(created)_     | _none_         | Callback to trigger on completion. The callback has one argument which is a hash of all models with an int value indicating the number of documents inserted |
| fail                                | _function(created, dangling)_ | _internalFunc_ | Callback to trigger on complettion when dangling references are still present. Callback is passed the same arguments as `success` but with the number of dangling references as the count of each hash value |
| failCreate                          | _function_(model, err) | _none_         | Callback when Mongo returns an error during the `create()` call |
| finally                             | _function(created, dangling)_ | _none_         | Callback to trigger on completion if `success` OR `fail` were called first. See combination of `success` and `fail` for callback details |


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

Model specifications and documents can be in any order (i.e. forward or backward-refs are allowed). Scenario will process all records it has and keep pointers to refered records it has not seen yet.

Scenario will process any dangling references at the end of each call to its main function so you can call `scenario()` as many times as needed from as many internal stacks as needed and it should do-the-right-thing(tm).


TODO
====
* Nested structures (e.g. `foo: { bar: { baz: [ ids... ] } }`) can only be addressed by their dotted path during creation (e.g. `foo.bar.baz`).
* Feature to use `_id` as `_ref`
