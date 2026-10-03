import { existsSync } from 'node:fs';

// Settings come from the environment. In development a .env file (see
// .env.example) fills in whatever the shell hasn't set.
if (existsSync('.env')) process.loadEnvFile();

const env = process.env.NODE_ENV || 'development';

// The Rails app's allowed origins (config/initializers/cors.rb).
const defaultCorsOrigins = [
  'http://localhost:3005',
  'https://maintenancechain.surge.sh',
  'https://maintenance-chain.surge.sh',
  'http://maintenancecha.in',
];

// Express's "trust proxy" setting: how many proxies sit in front of the app,
// or their addresses, so that req.ip, which rate limiting counts by, is the
// client's address rather than the proxy's.
function parseTrustProxy(value) {
  if (!value) return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export default {
  env,
  port: Number(process.env.PORT || 3001),
  // Tests never read DATABASE_URL, so running them can't wipe the dev database.
  databaseUrl:
    env === 'test'
      ? process.env.TEST_DATABASE_URL || 'postgres://localhost/maintenance_chain_node_api_test'
      : process.env.DATABASE_URL || 'postgres://localhost/maintenance_chain_node_api_development',
  jwtSecret: process.env.JWT_SECRET || (env === 'test' ? 'test-secret' : undefined),
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : defaultCorsOrigins,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Like has_secure_password, which uses bcrypt's minimum cost in tests.
  bcryptCost: env === 'test' ? 4 : 12,
};
