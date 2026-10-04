import { once } from 'node:events';
import { after } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { encodeToken } from '../src/auth.js';
import db from '../src/db.js';
import { outbox } from '../src/mailer.js';
import * as User from '../src/models/user.js';
import { authAttempts, passwordResetEmails, verificationEmails } from '../src/rate-limit.js';

// One server per test file, listening on 127.0.0.1 itself. supertest's own
// servers listen on every address but are sent requests at 127.0.0.1, where
// on macOS another process (an editor, say) can hold the same port and answer
// instead, failing tests at random.
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
after(() => server.close());

export const api = request(server);

// Empties the database, the rate limiters' counts and the emails sent.
export async function reset() {
  await authAttempts.resetAll();
  await verificationEmails.resetAll();
  await passwordResetEmails.resetAll();
  outbox.length = 0;
  await db.raw('TRUNCATE users, user_identities, items, categories, logs RESTART IDENTITY CASCADE');
}

// Creates a user, returned with an Authorization header for them. Their
// email address is verified unless `verified` is false.
export async function signUp(
  email = 'rob@example.com',
  password = 'secret',
  { verified = true } = {},
) {
  let user = await User.create({ email, password });
  if (verified) {
    [user] = await db('users')
      .where({ id: user.id })
      .update({ email_verified_at: db.fn.now() })
      .returning('*');
  }
  return { user, auth: { Authorization: `Bearer ${encodeToken(user)}` } };
}

export const countRows = async (table) => (await db(table).count({ count: '*' }))[0].count;

// A date `days` from today (UTC), formatted as the API formats dates.
export function daysFromToday(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
