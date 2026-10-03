import { once } from 'node:events';
import { after } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { encodeToken } from '../src/auth.js';
import db from '../src/db.js';
import * as User from '../src/models/user.js';

// One server per test file, listening on 127.0.0.1 itself. supertest's own
// servers listen on every address but are sent requests at 127.0.0.1, where
// on macOS another process (an editor, say) can hold the same port and answer
// instead, failing tests at random.
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
after(() => server.close());

export const api = request(server);

export function resetDatabase() {
  return db.raw('TRUNCATE users, items, categories, logs RESTART IDENTITY CASCADE');
}

// Creates a user, returned with an Authorization header for them.
export async function signUp(email = 'rob@example.com', password = 'secret') {
  const user = await User.create({ email, password });
  return { user, auth: { Authorization: `Bearer ${encodeToken(user)}` } };
}

export const countRows = async (table) => (await db(table).count({ count: '*' }))[0].count;

// A date `days` from today (UTC), formatted as the API formats dates.
export function daysFromToday(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
