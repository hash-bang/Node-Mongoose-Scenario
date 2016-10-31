var expect = require('chai').expect;
var scenario = require('../index');

describe('scenario - flattening', function() {

	it('should flatten a complex structure', function() {
		var input = {
			foo: {
				bar: {
					baz: [1, 2, 3],
					bazz: [4, 6, 7],
				},
				bar2: 'hello',
			},
			baz: false,
		};

		var output = scenario.flatten(input);

		expect(output).to.deep.equal({
			'foo.bar.baz': [1,2,3],
			'foo.bar.bazz': [4,6,7],
			'foo.bar2': 'hello',
			'baz': false,
		});
	});

	it('should unflatten a complex structure', function() {
		var input = {
			'foo.bar.baz': [1,2,3],
			'foo.bar.bazz': [4,6,7],
			'foo.bar2': 'hello',
			'baz': false,
		};

		var output = scenario.unflatten(input);

		expect(output).to.deep.equal({
			foo: {
				bar: {
					baz: [1, 2, 3],
					bazz: [4, 6, 7],
				},
				bar2: 'hello',
			},
			baz: false,
		});
	});

});
