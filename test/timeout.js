var expect = require('chai').expect;
var scenario = require('../index');
var db = require('./db');

describe('scenario - timeouts', function() {

	it('should timeout with an error if the scenario is unsolvable', function(done) {
		this.timeout(5 * 1000);

		scenario.import({
			users: [
				{
					name: 'Wendy User',
					role: 'user',
					favourite: 'widget-quz',
					items: ['widget-qux', 'widget-flarp'], // NOTE: `widget-flarp` does not actually exist
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
			expect(err).to.be.ok;
			expect(err).to.be.a.string;
			expect(err).to.match(/^Unresolvable circular reference/);
			expect(err).to.match(/Remaining refs/);
			expect(err).to.match(/widget-quz/);
			expect(err).to.match(/widget-qux/);
			expect(data).to.be.an.object;
			expect(data).to.have.property('unresolved');
			expect(data.unresolved).to.be.deep.equal(['widget-quz', 'widget-qux']);
			done();
		});
	});
});
