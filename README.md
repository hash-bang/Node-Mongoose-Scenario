Mongoose-Scenario
=================
Write scenario files which quickly allow you to populate Mongo / Mongoose model contents.


Installation
------------
Use [NPM](https://www.npmjs.org) to install:

	npm install --save-dev mongoose-scenario


Basic usage
-----------
Scenario can be used a variety of ways but the below is the most typical example.

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
			widgets: ['widget.foo', 'widget.baz'] // These are looked up via the `_ref` property in the widgets collection
		},
		{
			name: 'Joe Admin',
			role: 'admin',
			widgets: ['widget.bar']
		},
	],
	widgets: [
		{
			_ref: 'widget.foo',
			name: 'Widget foo',
			content: 'This is the foo widget'
		},
		{
			_ref: 'widget.bar',
			name: 'Widget bar',
			content: 'This is the bar widget'
		},
		{
			_ref: 'widget.baz',
			name: 'Widget baz',
			content: 'This is the baz widget'
		},
	]
]);
```

In the above a number of users documents are created each refering to an array of widgets. Scenario will create all these records - in the correct order - substituting the 'real' document references as they are created.


Comparison with Mongo insert()
------------------------------
The 'usual' method to insert records into Mongo is to set the `_id` value of documents to a referencable value in code:

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

However this method has the following disadvantages:

1. Its entirely code based - all the inserts must be done in JavaScript rather than a more data friendly format such as JSON
2. The `_id` fields cannot be auto-generated - this means you can't use the hash format Mongo would normally generate. Instead your fake record IDs would stand out compared to the hash values of 'real' documents.



Options
-------
Options are specified when including the module via `require()`:

```javascript
var scenario = require('mongoose-scenario')({}, { // NOTE: pass a blank scenario THEN the options
	/* Options */
});

scenario({
	collectionFoo: [],
	collectionBar: []
}, function(err, data) {
	if (err) {
		console.log('Failed to create scenario');
	} else {
		console.log('Scenario created', data);
	}
});
```


| Option                              | Type           | Default        | Description                                                            |
|-------------------------------------|----------------|----------------|------------------------------------------------------------------------|
| connection                          | _object_       | _none_         | The Mongoose connection object to use                                  |
| keys                                | _object_       | See code       | The names of the fields Mongoose with reference (see Meta fields section) |
| nuke                                | _array_        | _none_         | Array of models to clear out (i.e. remove all records) before starting |
| omitFields                          | _array_        | See code       | Array of fields which should be purged from the row data before its passed to Mongoose |
| reset                               | _boolean_      | true           | Whether Scenario should disguard references between runs. Set to false to keep previously created row references |


Examples
========

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
			name: 'Widget baz',
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


Use within tests
----------------
Scenario can also be used to quickly setup database layouts for tests.

Heres an example using the [Tape](https://github.com/substack/tape) test harness:

```javascript

// Setup our inital options
var scenario = require("./index.js")({}, {
	connection: mongoose.connection,
	nuke: true
});

tape('User setup', function(assert) {
	assert.plan(1);

	scenario({
		users: [
			{
				name: 'Wendy User',
				role: 'user',
				favourite: 'widget-quz',
				items: ['widget-quz']
			},
		]
	}, function(err, data) {
		if (err) return assert.fail(err);
		assert.pass('Scenario setup');
	});
});

tape('User setup - verify', function(assert) {
	assert.plan(4);

	User
		.find()
		.exec(function(err, data) {
			if (err) return assert.fail(err);
			assert.pass('Got user data');
			assert.equal(data.length, 1, 'User row count');
			assert.equal(data[0].name, 'Wendy User');
			assert.equal(data[0].role, 'user');
		});

});
```

Look at the [test.js](test.js) file for more detailed examples.


Meta field refernce
===================
The following table describes the fields Scenario will example when processing data:

| Field             | Type               | Description                                                            |
|-------------------|--------------------|------------------------------------------------------------------------|
| `_ref`            | _string_           | The reference used by other schema definitions (see examples)          |
| `_after`          | _string_ / _array_ | Indicates that this item should only be created _after_ the referenced items. This is useful if you need rows created in a specific order |



TODO
====
* Setting to use selectors e.g. `widget-foo-*` as multiple glob refs
* Setting to use `_id` as `_ref`
* Auto populate data using increment functionality e.g. '{{firstname}} {{lastname}}' fetches some fake first and last names from somewhere
* Cope with missing dependents (e.g. if record a has missing _ref but record B has it as a dependency)
