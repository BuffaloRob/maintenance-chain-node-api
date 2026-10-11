import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import { api, reset, signUp } from './helpers.js';

beforeEach(reset);
after(() => db.destroy());

test('unknown paths are JSON 404s', async () => {
  const { auth } = await signUp();

  for (const path of ['/api/v1/nope', '/api/v1/items/1/edit', '/elsewhere']) {
    const res = await api.get(path).set(auth);
    assert.equal(res.status, 404, path);
    assert.deepEqual(res.body, { status: 404, error: 'Not Found' });
  }
});

test('malformed JSON is a 400', async () => {
  const res = await api
    .post('/api/v1/login')
    .set('Content-Type', 'application/json')
    .send('{"user":');

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { status: 400, error: 'Bad Request' });
});

test("CORS lets in the client's origins", async () => {
  const preflight = await api
    .options('/api/v1/items')
    .set('Origin', 'http://localhost:3005')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:3005');
  assert.equal(preflight.headers['access-control-allow-headers'], 'authorization,content-type');
  assert.equal(preflight.headers['access-control-max-age'], '7200');

  const res = await api
    .post('/api/v1/login')
    .set('Origin', 'https://maintenancechain.surge.sh')
    .send({ user: { email: 'rob@example.com', password: 'secret' } });
  assert.equal(res.headers['access-control-allow-origin'], 'https://maintenancechain.surge.sh');
  assert.equal(res.headers['access-control-expose-headers'], 'Authorization,Content-Type');
});

test('CORS turns other origins away', async () => {
  const res = await api
    .options('/api/v1/items')
    .set('Origin', 'https://elsewhere.example')
    .set('Access-Control-Request-Method', 'GET');

  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('the server refuses to start with a short JWT_SECRET', () => {
  const server = spawnSync(process.execPath, [join(import.meta.dirname, '../src/server.js')], {
    env: { ...process.env, JWT_SECRET: 'does this work', PORT: '0' },
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(server.status, 1);
  assert.match(server.stderr, /JWT_SECRET must be at least 32 characters/);
});

test('in production, the server refuses to start without the settings for sending email', () => {
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), PORT: '0' };
  for (const name of ['SMTP_URL', 'MAIL_FROM', 'CLIENT_URL']) delete env[name];
  const server = spawnSync(process.execPath, [join(import.meta.dirname, '../src/server.js')], {
    env,
    // Somewhere without a .env file to fill them in.
    cwd: import.meta.dirname,
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(server.status, 1);
  assert.match(server.stderr, /Set SMTP_URL, MAIL_FROM, CLIENT_URL to send verification emails/);
});
