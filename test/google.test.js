import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import jwt from 'jsonwebtoken';
import config from '../src/config.js';
import db from '../src/db.js';
import { setKeysForTests } from '../src/google.js';
import { outbox } from '../src/mailer.js';
import { api, countRows, reset, signUp } from './helpers.js';

beforeEach(reset);
after(() => db.destroy());

// Stand-ins for the keys Google signs ID tokens with.
const googleKey = await generateKeyPair('RS256');
const otherKey = await generateKeyPair('RS256');
setKeysForTests({
  keys: [{ ...(await exportJWK(googleKey.publicKey)), kid: 'google', alg: 'RS256' }],
});

// An ID token like the ones Google's sign-in button gives the client.
function idToken({
  sub = '1234567890',
  email = 'rob@gmail.com',
  email_verified = true,
  iss = 'https://accounts.google.com',
  aud = config.googleClientId,
  exp = '1h',
  key = googleKey.privateKey,
} = {}) {
  return new SignJWT({ email, email_verified })
    .setProtectedHeader({ alg: 'RS256', kid: 'google' })
    .setSubject(sub)
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

const signIn = async (claims) =>
  api.post('/api/v1/auth/google').send({ credential: await idToken(claims) });

const userWithEmail = (email) => db('users').where({ email }).first();

const logIn = (email, password) => api.post('/api/v1/login').send({ user: { email, password } });

describe('POST /auth/google', () => {
  test('signs up a new user with a verified address and no password', async () => {
    const res = await signIn({ email: 'rob@gmail.com' });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.user, {
      id: 1,
      email: 'rob@gmail.com',
      email_verified: true,
      items: [],
    });
    assert.equal(jwt.verify(res.body.jwt, config.jwtSecret).user_id, 1);
    assert.equal((await userWithEmail('rob@gmail.com')).password_digest, null);
    assert.deepEqual(outbox, []);
  });

  test('signs the same Google account in to the same user, even with a new address', async () => {
    await signIn({ sub: '42', email: 'rob@gmail.com' });

    const res = await signIn({ sub: '42', email: 'robert@gmail.com' });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, 1);
    assert.equal(res.body.user.email, 'rob@gmail.com');
    assert.equal(await countRows('users'), 1);
  });

  test("links a verified user's account by address, ignoring case, keeping their password", async () => {
    const { user } = await signUp('Rob@Gmail.com', 'secret');

    const res = await signIn({ email: 'rob@gmail.com' });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal((await logIn('Rob@Gmail.com', 'secret')).status, 200);
    assert.deepEqual(await db('user_identities').select('user_id', 'provider', 'uid'), [
      { user_id: user.id, provider: 'google', uid: '1234567890' },
    ]);
  });

  test("an unverified user's password and tokens stop working once their account is linked", async () => {
    // Whoever signed up with the address may not be its owner.
    const { user, auth } = await signUp('rob@gmail.com', 'secret', { verified: false });

    const res = await signIn({ email: 'rob@gmail.com' });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal(res.body.user.email_verified, true);
    assert.equal((await logIn('rob@gmail.com', 'secret')).status, 401);
    assert.equal((await api.get('/api/v1/user').set(auth)).status, 401);
    const fresh = await api.get('/api/v1/user').set('Authorization', `Bearer ${res.body.jwt}`);
    assert.equal(fresh.status, 200);
  });

  test('simultaneous sign-ins with a new account create one user', async () => {
    const credential = await idToken();
    const signIns = Array.from({ length: 5 }, () =>
      api.post('/api/v1/auth/google').send({ credential }),
    );

    const statuses = (await Promise.all(signIns)).map((res) => res.status);

    assert.deepEqual(statuses.toSorted(), [200, 200, 200, 200, 201]);
    assert.equal(await countRows('users'), 1);
    assert.equal(await countRows('user_identities'), 1);
  });

  test('turns away tokens that Google did not issue for this app, or that expired', async () => {
    const tokens = {
      'another app': { aud: 'another.apps.googleusercontent.com' },
      'another issuer': { iss: 'https://evil.example' },
      'another key': { key: otherKey.privateKey },
      expired: { exp: Math.floor(Date.now() / 1000) - 60 },
      'an unverified address': { email_verified: false },
    };
    for (const [description, claims] of Object.entries(tokens)) {
      const res = await signIn(claims);
      assert.equal(res.status, 401, description);
      assert.deepEqual(res.body, { message: "Couldn't sign in with Google" });
    }

    const garbage = await api.post('/api/v1/auth/google').send({ credential: 'not-a-token' });
    assert.equal(garbage.status, 401);
    assert.equal(await countRows('users'), 0);
  });

  test('a body without a credential is a 400', async () => {
    const res = await api.post('/api/v1/auth/google').send({});

    assert.equal(res.status, 400);
  });

  test('is a 404 without GOOGLE_CLIENT_ID', async (t) => {
    const credential = await idToken();
    const { googleClientId } = config;
    config.googleClientId = undefined;
    t.after(() => (config.googleClientId = googleClientId));

    const res = await api.post('/api/v1/auth/google').send({ credential });

    assert.equal(res.status, 404);
  });

  test('counts toward the limit on sign-ups and logins', async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      await logIn('rob@example.com', 'guess');
    }

    const res = await signIn();

    assert.equal(res.status, 429);
  });
});
