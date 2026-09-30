import config from './src/config.js';

export default {
  client: 'pg',
  connection: config.databaseUrl,
  pool: {
    // Store timestamps in UTC, as Rails does.
    afterCreate(connection, done) {
      connection.query("SET TIME ZONE 'UTC'", (error) => done(error, connection));
    },
  },
  migrations: { directory: './db/migrations' },
};
