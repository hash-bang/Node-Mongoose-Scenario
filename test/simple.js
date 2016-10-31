var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

describe('scenario - simple', function() {

	before(function(done) {
		scenario.import({
			users: [
				{
					name: 'Wendy User',
					role: 'user',
					favourite: 'widget-quz',
					items: ['widget-quz'],
					testSet: 'simple',
				},
			],
			widgets: [
				{
					_ref: 'widget-quz',
					name: 'Widget quz',
					content: 'This is the quz widget',
					testSet: 'simple',
				},
				{
					_ref: 'widget-qux',
					name: 'Widget qux',
					content: 'This is the qux widget',
					testSet: 'simple',
				}
			]
		}, {
			connection: db.connection,
			nuke: true,
		}, function(err, data) {
			expect(err).to.be.not.ok;
			done();
		});
	});

	it('create the users collection', function(done) {
		db.user
			.find({testSet: 'simple'})
			.populate('items')
			.populate('favourite')
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(1);

				var user = data[0].toObject();
				expect(user).to.have.property('name', 'Wendy User');
				expect(user).to.have.property('role', 'user');
				expect(user).to.have.property('favourite');
				expect(user).to.have.property('items');


				expect(user.favourite).to.have.property('name', 'Widget quz');
				expect(user.favourite).to.have.property('content', 'This is the quz widget');

				expect(user.items).to.have.length(1);
				expect(user.items[0]).to.have.property('name', 'Widget quz');
				expect(user.items[0]).to.have.property('content', 'This is the quz widget');
				done();
			});
	});


	it('create the widgets collection', function(done) {
		db.widget
			.find({testSet: 'simple'})
			.sort('name')
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(2);

				expect(data[0]).to.have.property('name', 'Widget qux');
				expect(data[0]).to.have.property('content', 'This is the qux widget');

				expect(data[1]).to.have.property('name', 'Widget quz');
				expect(data[1]).to.have.property('content', 'This is the quz widget');
				done();
			});
	});

});
