// Creates the database for the current NODE_ENV, like `rails db:create`.
import pg from 'pg';
import config from '../src/config.js';

const url = new URL(config.databaseUrl);
const name = decodeURIComponent(url.pathname.slice(1));
url.pathname = '/postgres';

const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
  console.log(`Created database ${name}`);
} catch (error) {
  if (error.code !== '42P04') throw error; // duplicate_database
  console.log(`Database ${name} already exists`);
} finally {
  await client.end();
}
