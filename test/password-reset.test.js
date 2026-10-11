import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import config from '../src/config.js';
import db from '../src/db.js';
import { sendVerificationEmail } from '../src/email-verification.js';
import { outbox } from '../src/mailer.js';
import { sendPasswordResetEmail } from '../src/password-reset.js';
import { api, reset, signUp } from './helpers.js';

beforeEach(reset);
after(() => db.destroy());

// The link in the last email sent, and the token in it.
const lastLink = () => new URL(outbox.at(-1).text.match(/https?:\/\/\S+/)[0]);
const linkToken = () => lastLink().searchParams.get('token');

const forgot = (email) => api.post('/api/v1/forgot_password').send({ email });

const resetPassword = (token, password = 'new secret', password_confirmation = password) =>
  api.post('/api/v1/reset_password').send({ token, password, password_confirmation });

const logIn = (email, password) => api.post('/api/v1/login').send({ user: { email, password } });

describe('POST /forgot_password', () => {
  test("emails a link to the client's /reset-password page", async () => {
    await signUp('rob@example.com');

    const res = await forgot('Rob@Example.com');

    assert.equal(res.status, 204);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'rob@example.com');
    assert.equal(outbox[0].subject, 'Reset your password');
    assert.equal(lastLink().origin + lastLink().pathname, `${config.clientUrl}/reset-password`);
  });

  test('answers the same for an address without an account, but emails nobody', async () => {
    const res = await forgot('nobody@example.com');

    assert.equal(res.status, 204);
    assert.deepEqual(outbox, []);
  });

  test('a body without an email is a 400', async () => {
    const res = await api.post('/api/v1/forgot_password').send({});

    assert.equal(res.status, 400);
  });

  test('is limited to 5 per address an hour, ignoring case', async () => {
    await signUp('rob@example.com');
    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.equal((await forgot('rob@example.com')).status, 204, `attempt ${attempt}`);
    }

    const res = await forgot('ROB@example.com');

    assert.equal(res.status, 429);
    assert.equal(outbox.length, 5);
    assert.equal((await forgot('other@example.com')).status, 204);
  });
});

describe('POST /reset_password', () => {
  test('sets the new password and logs the user in', async () => {
    const { user } = await signUp('rob@example.com', 'old secret');
    await forgot('rob@example.com');

    const res = await resetPassword(linkToken(), 'new secret');

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal(jwt.verify(res.body.jwt, config.jwtSecret).user_id, user.id);
    assert.equal((await logIn('rob@example.com', 'new secret')).status, 200);
    assert.equal((await logIn('rob@example.com', 'old secret')).status, 401);
  });

  test("revokes the user's other tokens", async () => {
    const { auth } = await signUp('rob@example.com');
    await forgot('rob@example.com');

    const res = await resetPassword(linkToken());

    assert.equal((await api.get('/api/v1/user').set(auth)).status, 401);
    const fresh = await api.get('/api/v1/user').set('Authorization', `Bearer ${res.body.jwt}`);
    assert.equal(fresh.status, 200);
  });

  test('verifies the address, since the link went to it', async () => {
    await signUp('rob@example.com', 'secret', { verified: false });
    await forgot('rob@example.com');

    const res = await resetPassword(linkToken());

    assert.equal(res.body.user.email_verified, true);
    const items = await api.get('/api/v1/items').set('Authorization', `Bearer ${res.body.jwt}`);
    assert.equal(items.status, 200);
  });

  test('gives a user who signed up with Google a password', async () => {
    await db('users').insert({
      email: 'rob@gmail.com',
      email_verified_at: db.fn.now(),
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
    await forgot('rob@gmail.com');

    await resetPassword(linkToken(), 'new secret');

    assert.equal((await logIn('rob@gmail.com', 'new secret')).status, 200);
  });

  test('each link works once', async () => {
    await signUp('rob@example.com');
    await forgot('rob@example.com');
    const token = linkToken();

    const first = await resetPassword(token, 'first');
    const second = await resetPassword(token, 'second');

    assert.equal(first.status, 200);
    assert.equal(second.status, 422);
    assert.equal((await logIn('rob@example.com', 'first')).status, 200);
  });

  test('a link used twice at once still works only once', async () => {
    await signUp('rob@example.com');
    await forgot('rob@example.com');
    const token = linkToken();

    const statuses = (
      await Promise.all(['one', 'two', 'three'].map((password) => resetPassword(token, password)))
    ).map((res) => res.status);

    assert.deepEqual(statuses.toSorted(), [200, 422, 422]);
  });

  test('turns away bad tokens with a 422', async (t) => {
    const { user } = await signUp('rob@example.com', 'secret');
    // A link from 61 minutes ago.
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() - 61 * 60 * 1000 });
    await sendPasswordResetEmail(user);
    t.mock.timers.reset();
    const expired = linkToken();
    await sendVerificationEmail(user);
    const tokens = {
      'not a token': 'not-a-token',
      'a login token': jwt.sign({ user_id: user.id }, config.jwtSecret),
      'a verification link': linkToken(),
      expired,
    };

    for (const [description, token] of Object.entries(tokens)) {
      const res = await resetPassword(token);
      assert.equal(res.status, 422, description);
      assert.deepEqual(res.body, { message: 'This link is invalid or has expired' });
    }
    assert.equal((await logIn('rob@example.com', 'secret')).status, 200);
  });

  test('turns away invalid passwords, and the link still works after', async () => {
    await signUp('rob@example.com');
    await forgot('rob@example.com');
    const invalid = [
      ['', '', "Password can't be blank"],
      ['x'.repeat(73), 'x'.repeat(73), 'Password is too long (maximum is 72 characters)'],
      ['new secret', 'other', "Password confirmation doesn't match Password"],
    ];

    for (const [password, confirmation, message] of invalid) {
      const res = await resetPassword(linkToken(), password, confirmation);
      assert.equal(res.status, 422, message);
      assert.deepEqual(res.body, { message });
    }
    assert.equal((await resetPassword(linkToken())).status, 200);
  });

  test('a body without a token is a 400', async () => {
    const res = await api.post('/api/v1/reset_password').send({ password: 'secret' });

    assert.equal(res.status, 400);
  });
});

test('signing up, logging in and resetting passwords share their limit', async () => {
  for (let attempt = 1; attempt <= 10; attempt++) {
    await logIn('rob@example.com', 'guess');
  }

  assert.equal((await resetPassword('not-a-token')).status, 429);
  assert.equal((await forgot('rob@example.com')).status, 429);
});
