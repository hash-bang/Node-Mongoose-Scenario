var async = require('async-chainable');
var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

// Global variables to store the output from the first round
var imported;
var exported;

describe('scenario - export setup', function() {
	it('setup scenario module', function() {
		scenario.set({
			connection: db.connection,
			nuke: true,
		})
	});
});

describe('scenario - export', function() {
	before(function(done) {
		async()
			.then('imported', function(next) {
				scenario.import({
					users: [
						{
							name: 'Joe Random User',
							role: 'user',
							favourite: 'widget-crash',
							items: ['widget-bang'],
							testSet: 'export',
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
								},
							],
						},
						{
							name: 'Wendy User',
							role: 'user',
							favourite: 'widget-quz',
							items: ['widget-quz'],
							testSet: 'export',
						},
					],
					widgets: [
						{
							_ref: 'widget-foo',
							name: 'Widget foo',
							content: 'This is the foo widget',
							testSet: 'export',
						},
						{
							_ref: 'widget-bar',
							name: 'Widget bar',
							content: 'This is the bar widget',
							testSet: 'export',
						},
						{
							_ref: 'widget-quz',
							name: 'Widget quz',
							content: 'This is the quz widget',
							testSet: 'export',
						},
						{
							_ref: 'widget-qux',
							name: 'Widget qux',
							content: 'This is the qux widget',
							testSet: 'export',
						},
						{
							_ref: 'widget-crash',
							name: 'Widget crash',
							content: 'This is the crash widget',
							testSet: 'export',
						},
						{
							_ref: 'widget-bang',
							name: 'Widget bang',
							content: 'This is the bang widget',
							testSet: 'export',
						},
						{
							_ref: 'widget-whollop',
							name: 'Widget whollop',
							content: 'This is the whollop widget',
							testSet: 'export',
						},
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
							testSet: 'export',
						},
					],
				}, next);
			})
			.then('exported', function(next) {
				scenario.export(next);
			})
			.end(function(err) {
				expect(err).to.be.not.ok;
				expect(this.imported).to.be.an.object;
				expect(this.exported).to.be.an.object;
				imported = this.imported;
				exported = this.exported;
				done();
			});
	});

	it('export the users table', function() {
		expect(exported).to.have.property('users');
		expect(exported.users).to.have.length(2);
	});

	it('export the widgets table', function() {
		expect(exported).to.have.property('widgets');
		expect(exported.widgets).to.have.length(7);
	});

	it('export the groups table', function() {
		expect(exported).to.have.property('groups');
		expect(exported.groups).to.have.length(1);
	});
});

describe('scenario - reimport', function() {
});
