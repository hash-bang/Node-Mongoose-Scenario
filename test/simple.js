var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

describe('scenario - simple', function(){
	before(function(done) {
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
				},
				{
					_ref: 'widget-qux',
					name: 'Widget qux',
					content: 'This is the qux widget'
				}
			]
		}, {
			connection: db.connection,
			nuke: true,
		}, function(err, data) {
			expect(err).to.be.null;
			done();
		});
	});

	it('create the users collection', function() {
		db.user
			.find()
			.populate('items')
			.populate('favourite')
			.exec(function(err, data) {
				expect(err).to.be.null;

				expect(data).to.have.length(1);

				var user = data[0].toObject();
				expect(user).to.include.keys('name', 'role', 'favourite', 'items');
				expect(user.name).to.equal('Wendy User');
				expect(user.role).to.equal('user');

				expect(user.favourite).to.include.keys('name', 'content');
				expect(user.favourite.name).to.equal('Widget quz');
				expect(user.favourite.content).to.equal('This is the quz widget');

				expect(user.items).to.have.length(1);
				expect(user.items[0]).to.include.keys('name', 'content');
				expect(user.items[0].name).to.equal('Widget quz');
				expect(user.items[0].content).to.equal('This is the quz widget');
			});
	});


	it('create the widgets collection', function() {
		db.widget
			.find()
			.sort('name')
			.exec(function(err, data) {
				expect(err).to.be.null;

				expect(data).to.have.length(2);

				expect(data[0]).to.include.keys('name', 'content');
				expect(data[0].name).to.equal('Widget qux');
				expect(data[0].content).to.equal('This is the qux widget');

				expect(data[1]).to.include.keys('name', 'content');
				expect(data[1].name).to.equal('Widget quz');
				expect(data[1].content).to.equal('This is the quz widget');
			});
	});
});
