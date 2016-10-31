var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

describe('scenario - nested', function() {

	before(function(done) {
		scenario.import({
			widgets: [
				{
					_ref: 'widget-foo',
					name: 'Widget foo',
					content: 'This is the foo widget',
					testSet: 'nested',
				},
				{
					_ref: 'widget-bar',
					name: 'Widget bar',
					content: 'This is the bar widget',
					testSet: 'nested',
				}
			],
			groups: [
				{
					name: 'Group Foobar',
					preferences: {
						defaults: {
							items: [
								'widget-foo',
								'widget-bar',
							]
						}
					},
					testSet: 'nested',
				},
			]
		}, {
			connection: db.connection,
			nuke: true,
		}, function(err, data) {
			expect(err).to.be.not.ok;
			done();
		});
	});

	it('create the widgets collection', function(done) {
		db.widget
			.find({testSet: 'nested'})
			.sort('name')
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(2);

				expect(data[0]).to.have.property('name', 'Widget bar');
				expect(data[0]).to.have.property('content', 'This is the bar widget');

				expect(data[1]).to.have.property('name', 'Widget foo');
				expect(data[1]).to.have.property('content', 'This is the foo widget');
				done();
			});
	});

	it('create the group', function(done) {
		db.group
			.find({testSet: 'nested'})
			.populate('preferences.defaults.items')
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(1);

				var group = data[0].toObject();
				expect(group).to.have.property('name', 'Group Foobar');
				expect(group).to.have.property('preferences');

				expect(group.preferences.defaults.items).to.have.length(2);

				expect(data[0].preferences.defaults.items[0]).to.have.property('name', 'Widget foo');
				expect(data[0].preferences.defaults.items[0]).to.have.property('content', 'This is the foo widget');

				expect(data[0].preferences.defaults.items[1]).to.have.property('name', 'Widget bar');
				expect(data[0].preferences.defaults.items[1]).to.have.property('content', 'This is the bar widget');

				done();
			});
	});

});
