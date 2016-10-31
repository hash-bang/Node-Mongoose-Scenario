var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

describe('scenario - sub-documents', function() {

	before(function(done) {
		scenario.import({
			users: [
				{
					name: 'Joe Random User',
					role: 'user',
					favourite: 'widget-crash',
					items: ['widget-bang'],
					testSet: 'sub-documents',
					mostPurchased: [
						{
							number: 5,
							item: 'widget-crash',
						},
						{
							number: 10,
							item: 'widget-bang',
						},
						{
							number: 15,
							item: 'widget-whollop',
						}
					],
					projects: ['potato_gun', 'mini_volcano'],
				},
			],
			projects: [
				{
					_ref: 'potato_gun',
					name: 'Potato Gun',
					description: 'Shoots potatos using pneumatic magic',
				},
				{
					_ref: 'mini_volcano',
					name: 'Mini Volcano',
					description: 'Spews lava using baking soda and vinegar',
				},
			],
			widgets: [
				{
					_ref: 'widget-crash',
					name: 'Widget crash',
					content: 'This is the crash widget',
					testSet: 'sub-documents',
				},
				{
					_ref: 'widget-bang',
					name: 'Widget bang',
					content: 'This is the bang widget',
					testSet: 'sub-documents',
				},
				{
					_ref: 'widget-whollop',
					name: 'Widget whollop',
					content: 'This is the whollop widget',
					testSet: 'sub-documents',
				}
			],
			groups: [
				{
					name: 'Students',
					testSet: 'sub-documents',
					projectAwards: [
						{
							name: 'Best in Show',
							ribbonColor: 'orange',
							project: 'potato_gun',
						},
						{
							name: 'First Place',
							ribbonColor: 'blue',
							project: 'mini_volcano',
						}
					]
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
			.find({testSet: 'sub-documents'})
			.populate('items')
			.populate('favourite')
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(1);

				var user = data[0].toObject();
				expect(user).to.have.property('name', 'Joe Random User');
				expect(user).to.have.property('role', 'user');
				expect(user).to.have.property('favourite');
				expect(user).to.have.property('items');

				expect(user.favourite).to.have.property('name', 'Widget crash');
				expect(user.favourite).to.have.property('content', 'This is the crash widget');

				expect(user.items).to.have.length(1);
				expect(user.items[0]).to.have.property('name', 'Widget bang');
				expect(user.items[0]).to.have.property('content', 'This is the bang widget');
				done();
			});
	});

	it('create the widgets collection', function(done) {
		db.widget
			.find({testSet: 'sub-documents'})
			.sort('name')
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(3);

				expect(data[0]).to.have.property('name', 'Widget bang');
				expect(data[0]).to.have.property('content', 'This is the bang widget');

				expect(data[1]).to.have.property('name', 'Widget crash');
				expect(data[1]).to.have.property('content', 'This is the crash widget');

				expect(data[2]).to.have.property('name', 'Widget whollop');
				expect(data[2]).to.have.property('content', 'This is the whollop widget');
				done();
			});
	});

	it('populates a sub-document', function(done) {
		db.user
			.find({testSet: 'sub-documents'})
			.exec(function(err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(1);

				var user = data[0].toObject();
				expect(user.mostPurchased).to.have.length(3);

				expect(user.mostPurchased[0]).to.have.property('number', 5);
				expect(user.mostPurchased[0]).to.have.property('item');

				expect(user.mostPurchased[1]).to.have.property('number', 10);
				expect(user.mostPurchased[1]).to.have.property('item');

				expect(user.mostPurchased[2]).to.have.property('number', 15);
				expect(user.mostPurchased[2]).to.have.property('item');
				done();
			});
	});

	it('populates sub document inside array referencing sub document in external array', function(done) {
		db.group
			.find({testSet: 'sub-documents'})
			.populate('projectAwards projectAwards.project')
			.exec(function (err, data) {
				expect(err).to.be.not.ok;

				expect(data).to.have.length(1);

				var group = data[0].toObject();
				expect(group.name).to.equal('Students');

				expect(group.projectAwards[0]).to.have.property('project');
				expect(group.projectAwards[0]).to.have.deep.property('project.name', 'Potato Gun');
				expect(group.projectAwards[1]).to.have.deep.property('project.name', 'Mini Volcano');
				done();
			});
	});

});
