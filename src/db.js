import knex from 'knex';
import pg from 'pg';
import knexConfig from '../knexfile.js';

// Read bigint ids as numbers and dates as 'YYYY-MM-DD' strings, the way the
// Rails app rendered them. (By default pg returns bigints as strings and dates
// as JavaScript Dates at local midnight.)
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export default knex(knexConfig);
