import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import config from '../src/config.js';
import db from '../src/db.js';
import { sendVerificationEmail } from '../src/email-verification.js';
import { outbox } from '../src/mailer.js';
import { up as verifyExistingUsers } from '../db/migrations/20261003000001_verify_existing_users.js';
import { api, reset, signUp } from './helpers.js';

beforeEach(reset);
after(() => db.destroy());

// The token in the link of the last email sent.
function linkToken() {
  const link = outbox.at(-1).text.match(/https?:\/\/\S+/)[0];
  return new URL(link).searchParams.get('token');
}

const verify = (token) => api.post('/api/v1/verify_email').send({ token });

const isVerified = async (email) =>
  (await db('users').where({ email }).first()).email_verified_at !== null;

describe('signing up', () => {
  test("emails a link to the client's /verify-email page", async () => {
    await api
      .post('/api/v1/signup')
      .send({ user: { email: 'new@example.com', password: 'secret' } });

    assert.equal(outbox.length, 1);
    const [email] = outbox;
    assert.equal(email.to, 'new@example.com');
    assert.equal(email.subject, 'Verify your email address');
    assert.ok(email.text.includes(`${config.clientUrl}/verify-email?token=${linkToken()}`));
    assert.equal(await isVerified('new@example.com'), false);
  });

  test("doesn't email anyone when it fails", async () => {
    await api.post('/api/v1/signup').send({ user: { email: 'new@example.com' } });

    assert.deepEqual(outbox, []);
  });

  test("still succeeds when the email can't be sent", async (t) => {
    const consoleError = t.mock.method(console, 'error', () => {});
    outbox.push = () => {
      throw new Error('SMTP server is down');
    };
    t.after(() => delete outbox.push);

    const res = await api
      .post('/api/v1/signup')
      .send({ user: { email: 'new@example.com', password: 'secret' } });

    assert.equal(res.status, 201);
    assert.equal(consoleError.mock.callCount(), 1);
  });
});

describe('POST /verify_email', () => {
  test("verifies the address in the link's token", async () => {
    const { user, auth } = await signUp('rob@example.com', 'secret', { verified: false });
    await sendVerificationEmail(user);

    const res = await verify(linkToken());

    assert.equal(res.status, 204);
    assert.equal(await isVerified('rob@example.com'), true);
    const profile = await api.get('/api/v1/user').set(auth);
    assert.equal(profile.body.user.email_verified, true);
  });

  test('works again with the same link', async () => {
    const { user } = await signUp('rob@example.com', 'secret', { verified: false });
    await sendVerificationEmail(user);
    await verify(linkToken());

    const res = await verify(linkToken());

    assert.equal(res.status, 204);
  });

  test('turns away bad tokens with a 422', async (t) => {
    const { user } = await signUp('rob@example.com', 'secret', { verified: false });
    const tokens = {
      'not a token': 'not-a-token',
      'a login token': jwt.sign({ user_id: user.id, email: user.email }, config.jwtSecret),
    };
    // A link from 25 hours ago.
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() - 25 * 60 * 60 * 1000 });
    await sendVerificationEmail(user);
    t.mock.timers.reset();
    tokens.expired = linkToken();
    // A link for the address the user had before.
    await sendVerificationEmail(user);
    tokens['an old address'] = linkToken();
    await db('users').where({ id: user.id }).update({ email: 'new@example.com' });

    for (const [description, token] of Object.entries(tokens)) {
      const res = await verify(token);
      assert.equal(res.status, 422, description);
      assert.deepEqual(res.body, { message: 'This link is invalid or has expired' });
    }
    assert.equal(await isVerified('new@example.com'), false);
  });

  test("a link's token isn't a login token", async () => {
    const { user } = await signUp('rob@example.com', 'secret', { verified: false });
    await sendVerificationEmail(user);

    const res = await api.get('/api/v1/user').set('Authorization', `Bearer ${linkToken()}`);

    assert.equal(res.status, 401);
  });

  test('a body without a token is a 400', async () => {
    const res = await api.post('/api/v1/verify_email').send({});

    assert.equal(res.status, 400);
  });
});

describe('POST /resend_verification_email', () => {
  test('emails the current user another link', async () => {
    const { auth } = await signUp('rob@example.com', 'secret', { verified: false });

    const res = await api.post('/api/v1/resend_verification_email').set(auth);

    assert.equal(res.status, 204);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'rob@example.com');
    assert.equal((await verify(linkToken())).status, 204);
  });

  test("doesn't email users who are already verified", async () => {
    const { auth } = await signUp();

    const res = await api.post('/api/v1/resend_verification_email').set(auth);

    assert.equal(res.status, 204);
    assert.deepEqual(outbox, []);
  });

  test('needs a token', async () => {
    const res = await api.post('/api/v1/resend_verification_email');

    assert.equal(res.status, 401);
  });

  test('is limited to 5 per user an hour', async () => {
    const { auth } = await signUp('rob@example.com', 'secret', { verified: false });
    const other = await signUp('other@example.com', 'secret', { verified: false });
    const resend = (headers) => api.post('/api/v1/resend_verification_email').set(headers);

    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.equal((await resend(auth)).status, 204, `attempt ${attempt}`);
    }
    const res = await resend(auth);

    assert.equal(res.status, 429);
    assert.equal(outbox.length, 5);
    assert.equal((await resend(other.auth)).status, 204);
  });
});

describe('until users verify their address', () => {
  test('everything but their profile, logging out and resending the email is a 403', async () => {
    const { auth } = await signUp('rob@example.com', 'secret', { verified: false });
    const requests = [
      ['get', '/items'],
      ['post', '/items'],
      ['get', '/items/1'],
      ['get', '/items/1/categories'],
      ['get', '/items/1/categories/1/logs'],
      ['get', '/past_due'],
      ['get', '/upcoming'],
    ];

    for (const [method, path] of requests) {
      const res = await api[method](`/api/v1${path}`).set(auth).send({ name: 'Car' });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.deepEqual(res.body, { message: 'Please verify your email address' });
    }
    assert.equal((await api.get('/api/v1/user').set(auth)).status, 200);
    assert.equal((await api.post('/api/v1/resend_verification_email').set(auth)).status, 204);
    assert.equal((await api.post('/api/v1/logout').set(auth)).status, 204);
  });

  test('they can use the rest once they verify it, with the same token', async () => {
    const { user, auth } = await signUp('rob@example.com', 'secret', { verified: false });
    await sendVerificationEmail(user);

    await verify(linkToken());
    const res = await api.post('/api/v1/items').set(auth).send({ name: 'Car' });

    assert.equal(res.status, 201);
  });

  test('users signed up with a password can still log in, to get the email again', async () => {
    await signUp('rob@example.com', 'secret', { verified: false });

    const res = await api
      .post('/api/v1/login')
      .send({ user: { email: 'rob@example.com', password: 'secret' } });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email_verified, false);
  });
});

test('the migration that let off users from before verification marks them all verified', async () => {
  await signUp('old@example.com', 'secret', { verified: false });
  const { user: verified } = await signUp('verified@example.com');

  await verifyExistingUsers(db);

  assert.equal(await isVerified('old@example.com'), true);
  // Those who'd verified theirs keep when they did.
  const after = await db('users').where({ id: verified.id }).first();
  assert.deepEqual(after.email_verified_at, verified.email_verified_at);
});
