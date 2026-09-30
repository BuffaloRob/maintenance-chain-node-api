import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import config from '../src/config.js';
import db from '../src/db.js';
import * as Item from '../src/models/item.js';
import { api, resetDatabase, signUp } from './helpers.js';

beforeEach(resetDatabase);
after(() => db.destroy());

describe('signing up', () => {
  test('POST /signup creates a user and returns it with a token', async () => {
    const res = await api.post('/api/v1/signup').send({
      user: { email: 'new@example.com', password: 'secret', password_confirmation: 'secret' },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.user, { id: 1, email: 'new@example.com', items: [] });
    assert.deepEqual(jwt.verify(res.body.jwt, config.jwtSecret), { user_id: 1 });
  });

  test('POST /users does the same', async () => {
    const res = await api
      .post('/api/v1/users')
      .send({ user: { email: 'new@example.com', password: 'secret' } });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'new@example.com');
  });

  test('invalid sign-ups are 406s', async () => {
    await signUp('taken@example.com');
    const invalid = [
      { email: 'TAKEN@example.com', password: 'secret' },
      { email: 'new@example.com' },
      { email: 'new@example.com', password: '' },
      { email: 'new@example.com', password: 'secret', password_confirmation: 'other' },
      { email: 'new@example.com', password: 'x'.repeat(73) },
    ];
    for (const user of invalid) {
      const res = await api.post('/api/v1/signup').send({ user });
      assert.equal(res.status, 406, JSON.stringify(user));
      assert.deepEqual(res.body, { error: 'Sign Up has Failed' });
    }
  });

  test('a body without user params is a 400', async () => {
    const res = await api.post('/api/v1/signup').send({});

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { status: 400, error: 'Bad Request' });
  });
});

describe('POST /login', () => {
  test('returns the user, with their items, and a token', async () => {
    const { user } = await signUp('rob@example.com', 'secret');
    await Item.create(user, { name: 'Car' });

    const res = await api
      .post('/api/v1/login')
      .send({ user: { email: 'rob@example.com', password: 'secret' } });

    assert.equal(res.status, 202);
    assert.deepEqual(res.body.user, {
      id: 1,
      email: 'rob@example.com',
      items: [{ id: 1, name: 'Car' }],
    });
    assert.deepEqual(jwt.verify(res.body.jwt, config.jwtSecret), { user_id: 1 });
  });

  test('rejects a wrong password, an unknown email, or differently capitalized email', async () => {
    await signUp('rob@example.com', 'secret');
    const attempts = [
      { email: 'rob@example.com', password: 'wrong' },
      { email: 'rob@example.com' },
      { email: 'nobody@example.com', password: 'secret' },
      { email: 'Rob@example.com', password: 'secret' },
    ];
    for (const user of attempts) {
      const res = await api.post('/api/v1/login').send({ user });
      assert.equal(res.status, 401, JSON.stringify(user));
      assert.deepEqual(res.body, { message: 'Invalid email or password' });
    }
  });

  test('accepts passwords hashed by the Rails app', async () => {
    // crypt_blowfish's test vector for "U*U": a $2a$ hash like the ones Rails' bcrypt gem stored.
    await db('users').insert({
      email: 'old@example.com',
      password_digest: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW',
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    const res = await api
      .post('/api/v1/login')
      .send({ user: { email: 'old@example.com', password: 'U*U' } });

    assert.equal(res.status, 202);
  });

  test('accepts form-encoded params', async () => {
    await signUp('rob@example.com', 'secret');

    const res = await api
      .post('/api/v1/login')
      .type('form')
      .send('user[email]=rob@example.com&user[password]=secret');

    assert.equal(res.status, 202);
  });
});

describe('authorization', () => {
  test('GET /user returns the current user', async () => {
    const { auth } = await signUp('rob@example.com');

    const res = await api.get('/api/v1/user').set(auth);

    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { user: { id: 1, email: 'rob@example.com', items: [] } });
  });

  test('requests without a valid token get a 401 with no body', async () => {
    const { user } = await signUp();
    const headers = [
      {},
      { Authorization: 'Bearer' },
      { Authorization: 'Bearer not-a-token' },
      { Authorization: `Bearer ${jwt.sign({ user_id: user.id }, 'another secret')}` },
      { Authorization: `Bearer ${jwt.sign({ user_id: 999 }, config.jwtSecret)}` },
    ];
    for (const header of headers) {
      const res = await api.get('/api/v1/user').set(header);
      assert.equal(res.status, 401, JSON.stringify(header));
      assert.equal(res.text, '');
    }
  });

  test('GET /logout is a 204', async () => {
    const { auth } = await signUp();

    const res = await api.get('/api/v1/logout').set(auth);

    assert.equal(res.status, 204);
  });

  test('GET /users answers like ApplicationController#index', async () => {
    const { auth } = await signUp();

    const res = await api.get('/api/v1/users').set(auth);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: 'successful', status: 200 });
  });
});
