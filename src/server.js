import app from './app.js';
import config from './config.js';
import db from './db.js';

if (!config.jwtSecret) {
  console.error('JWT_SECRET is not set. Add it to .env (see .env.example) or the environment.');
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
