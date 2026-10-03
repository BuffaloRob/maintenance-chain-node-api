import bcrypt from 'bcryptjs';
import config from '../config.js';
import db from '../db.js';
import { insertRecord } from './record.js';
import * as types from './types.js';

export const COLUMNS = ['id', 'email', 'password_digest', 'created_at', 'updated_at'];

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

// has_secure_password's authenticate.
export function authenticate(user, password) {
  return bcrypt.compare(password == null ? '' : String(password), user.password_digest);
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

function emailTaken(email) {
  const users = db('users').first('id');
  return email === null
    ? users.whereNull('email')
    : users.whereRaw('lower(email) = lower(?)', [email]);
}
