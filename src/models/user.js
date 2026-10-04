import bcrypt from 'bcryptjs';
import config from '../config.js';
import db from '../db.js';
import { insertRecord } from './record.js';
import * as types from './types.js';

export const COLUMNS = [
  'id',
  'email',
  'password_digest',
  'created_at',
  'updated_at',
  'email_verified_at',
  'token_version',
];

// bcrypt only reads a password's first 72 bytes; has_secure_password caps it
// at 72 characters.
const MAX_PASSWORD_LENGTH = 72;

// PostgreSQL's SQLSTATE for a duplicate key.
const UNIQUE_VIOLATION = '23505';

export async function find(id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('users').where({ id }).first();
}

// find_by(email:) is an exact match, so logging in is case-sensitive even
// though signing up rejects an email that differs only in case.
export function findByEmail(email) {
  return db('users')
    .where({ email: types.string(email) })
    .first();
}

// has_secure_password's authenticate. Users who signed in with Google may
// have no password, and then no password matches.
export async function authenticate(user, password) {
  if (!user.password_digest) return false;
  return bcrypt.compare(password == null ? '' : String(password), user.password_digest);
}

export async function markEmailVerified(user) {
  await db('users')
    .where({ id: user.id })
    .whereNull('email_verified_at')
    .update({ email_verified_at: db.fn.now(), updated_at: db.fn.now() });
}

// User.create, with has_secure_password's validations and
// `validates :email, uniqueness: { case_sensitive: false }`.
// Returns undefined when a validation fails.
export async function create({ email, password, password_confirmation }) {
  email = types.string(email);
  if (typeof password !== 'string' || password === '') return;
  if ([...password].length > MAX_PASSWORD_LENGTH) return;
  // validates_confirmation_of :password, allow_blank: true
  const confirmed =
    password.trim() === '' || password_confirmation == null || password_confirmation === password;
  if (!confirmed) return;
  if (await emailTaken(email)) return;

  const password_digest = await bcrypt.hash(password, config.bcryptCost);
  try {
    return await insertRecord('users', { email, password_digest });
  } catch (error) {
    // A sign-up with the same email got in after the check above, and the
    // unique index on lower(email) turned this one away.
    if (error.code === UNIQUE_VIOLATION) return;
    throw error;
  }
}

// Signing in with a Google account (`provider` 'google' and Google's `uid`
// for it): the user it was linked to, or else the user with its email
// address, now linked to it, or else a new user. Returns { user, created }.
export async function signInWith(identity) {
  const findOrCreate = () => db.transaction((trx) => findOrCreateWithIdentity(trx, identity));
  try {
    return await findOrCreate();
  } catch (error) {
    // A sign-in with the same account or address created what this one
    // tried to, so now there's a user to find.
    if (error.code !== UNIQUE_VIOLATION) throw error;
    return findOrCreate();
  }
}

async function findOrCreateWithIdentity(trx, { provider, uid, email }) {
  const linked = await trx('users')
    .join('user_identities', 'users.id', 'user_identities.user_id')
    .where({ provider, uid })
    .first('users.*');
  if (linked) return { user: linked, created: false };

  let user = await trx('users').whereRaw('lower(email) = lower(?)', [email]).forUpdate().first();
  const created = !user;
  if (created) {
    user = await insertRecord('users', { email, email_verified_at: trx.fn.now() }, trx);
  } else if (!user.email_verified_at) {
    // Nobody had shown the address was theirs, so whoever set the password
    // may not own it (they could have signed up with someone else's address
    // to get into the account once its owner used it). Google vouches for
    // the address, so its password goes, and any tokens it got.
    [user] = await trx('users')
      .where({ id: user.id })
      .update({
        email_verified_at: trx.fn.now(),
        password_digest: null,
        token_version: user.token_version + 1,
        updated_at: trx.fn.now(),
      })
      .returning('*');
  }
  await insertRecord('user_identities', { user_id: user.id, provider, uid }, trx);
  return { user, created };
}

function emailTaken(email) {
  const users = db('users').first('id');
  return email === null
    ? users.whereNull('email')
    : users.whereRaw('lower(email) = lower(?)', [email]);
}
