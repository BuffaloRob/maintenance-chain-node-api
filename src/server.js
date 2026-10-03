import app from './app.js';
import config from './config.js';
import db from './db.js';

// A short secret can be brute-forced from any token it signed, letting anyone
// sign tokens for any user. (This also rules out the Rails app's secret, which
// is public.)
const MIN_SECRET_LENGTH = 32;

if (!config.jwtSecret || config.jwtSecret.length < MIN_SECRET_LENGTH) {
  console.error(
    `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters, e.g. the output of ` +
      '`openssl rand -hex 32`. Set it in .env (see .env.example) or the environment.',
  );
  process.exit(1);
}

const server = app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(`Maintenance Chain API listening on http://localhost:${config.port}/api/v1`);
});

// Let in-flight requests finish, then close the database pool.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => db.destroy()));
}
