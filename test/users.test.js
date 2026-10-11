import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { encodeToken } from '../src/auth.js';
import config from '../src/config.js';
import db from '../src/db.js';
import * as Item from '../src/models/item.js';
import { api, countRows, reset, signUp } from './helpers.js';

beforeEach(reset);
after(() => db.destroy());

// A day in seconds, the unit of a token's iat and exp.
const DAY = 24 * 60 * 60;

describe('signing up', () => {
  test('POST /signup creates a user and returns it with a token for 30 days', async () => {
    const res = await api.post('/api/v1/signup').send({
      user: { email: 'new@example.com', password: 'secret', password_confirmation: 'secret' },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.user, {
      id: 1,
      email: 'new@example.com',
      email_verified: false,
      items: [],
    });
    const { user_id, iat, exp } = jwt.verify(res.body.jwt, config.jwtSecret);
    assert.equal(user_id, 1);
    assert.equal(exp - iat, 30 * DAY);
  });

  test('POST /users does the same', async () => {
    const res = await api
      .post('/api/v1/users')
      .send({ user: { email: 'new@example.com', password: 'secret' } });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'new@example.com');
  });

  test('invalid sign-ups are 422s', async () => {
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
      assert.equal(res.status, 422, JSON.stringify(user));
      assert.deepEqual(res.body, { error: 'Sign Up has Failed' });
    }
  });

  test('simultaneous sign-ups with one email create one user', async () => {
    const signUps = Array.from({ length: 5 }, () =>
      api.post('/api/v1/signup').send({ user: { email: 'new@example.com', password: 'secret' } }),
    );

    const statuses = (await Promise.all(signUps)).map((res) => res.status);

    assert.deepEqual(statuses.toSorted(), [201, 422, 422, 422, 422]);
    assert.equal(await countRows('users'), 1);
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

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, {
      id: 1,
      email: 'rob@example.com',
      email_verified: true,
      items: [{ id: 1, name: 'Car' }],
    });
    assert.equal(jwt.verify(res.body.jwt, config.jwtSecret).user_id, 1);
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

    assert.equal(res.status, 200);
  });

  test('rejects any password for a user without one', async () => {
    // Like a user who signed up with Google.
    await db('users').insert({
      email: 'google@example.com',
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    for (const password of ['', 'anything']) {
      const res = await api
        .post('/api/v1/login')
        .send({ user: { email: 'google@example.com', password } });
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { message: 'Invalid email or password' });
    }
  });

  test('accepts form-encoded params', async () => {
    await signUp('rob@example.com', 'secret');

    const res = await api
      .post('/api/v1/login')
      .type('form')
      .send('user[email]=rob@example.com&user[password]=secret');

    assert.equal(res.status, 200);
  });
});

test('sign-ups and logins together are limited to 10 per client every 15 minutes', async () => {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const res = await api
      .post('/api/v1/login')
      .send({ user: { email: 'rob@example.com', password: 'guess' } });
    assert.equal(res.status, 401, `attempt ${attempt}`);
  }

  const res = await api
    .post('/api/v1/signup')
    .send({ user: { email: 'new@example.com', password: 'secret' } });

  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { status: 429, error: 'Too Many Requests' });
  assert.ok(Number(res.headers['retry-after']) > 0);
});

describe('authorization', () => {
  test('GET /user returns the current user', async () => {
    const { auth } = await signUp('rob@example.com');

    const res = await api.get('/api/v1/user').set(auth);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      user: { id: 1, email: 'rob@example.com', email_verified: true, items: [] },
    });
  });

  test("raising a user's token_version revokes the tokens issued before", async () => {
    const { user, auth } = await signUp();
    await db('users').where({ id: user.id }).increment('token_version');

    const revoked = await api.get('/api/v1/user').set(auth);
    const [current] = await db('users').where({ id: user.id });
    const fresh = await api
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${encodeToken(current)}`);

    assert.equal(revoked.status, 401);
    assert.equal(fresh.status, 200);
  });

  test('tokens without a version still work until it goes up', async () => {
    const { user } = await signUp();
    const token = jwt.sign({ user_id: user.id }, config.jwtSecret, { expiresIn: '30d' });

    const res = await api.get('/api/v1/user').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
  });

  test('requests without a valid token get a 401 with no body', async () => {
    const { user } = await signUp();
    const now = Math.floor(Date.now() / 1000);
    const sign = (payload, options) => jwt.sign(payload, config.jwtSecret, options);
    const authorizations = {
      'no header': undefined,
      'no token': 'Bearer',
      'not a token': 'Bearer not-a-token',
      'another secret': `Bearer ${jwt.sign({ user_id: user.id }, 'another secret')}`,
      'a missing user': `Bearer ${sign({ user_id: 999 })}`,
      expired: `Bearer ${sign({ user_id: user.id, exp: now - 1 })}`,
      'issued over 30 days ago': `Bearer ${sign({ user_id: user.id, iat: now - 31 * DAY, exp: now + DAY })}`,
      "no expiry, like the Rails app's": `Bearer ${sign({ user_id: user.id }, { noTimestamp: true })}`,
    };
    for (const [description, authorization] of Object.entries(authorizations)) {
      const req = api.get('/api/v1/user');
      if (authorization) req.set('Authorization', authorization);
      const res = await req;
      assert.equal(res.status, 401, description);
      assert.equal(res.text, '');
    }
  });

  test('POST /logout is a 204', async () => {
    const { auth } = await signUp();

    const res = await api.post('/api/v1/logout').set(auth);

    assert.equal(res.status, 204);
  });
});
