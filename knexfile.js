import config from './src/config.js';

export default {
  client: 'pg',
  connection: config.databaseUrl,
  pool: {
    // Knex's docs recommend 0: idle connections are only closed above the
    // minimum, so the default of 2 can keep stale ones open.
    min: 0,
    // Store timestamps in UTC, as Rails does.
    afterCreate(connection, done) {
      connection.query("SET TIME ZONE 'UTC'", (error) => done(error, connection));
    },
  },
  migrations: { directory: './db/migrations' },
};
