var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

describe('scenario - nested', function(){
	before(function(done) {
		scenario({
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

	it('create the widgets collection', function() {
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
			});
	});

	it('create the group', function() {
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

				
				var items = data[0].preferences.defaults.items.sort(function(a, b) { if (a < b) { return -1 } else if (a > b) { return 1 } else { return } });
				expect(items[0]).to.have.property('name', 'Widget bar');
				expect(items[0]).to.have.property('content', 'This is the bar widget');

				expect(items[1]).to.have.property('name', 'Widget foo');
				expect(items[1]).to.have.property('content', 'This is the foo widget');
			});
	});
});
