import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import { api, resetDatabase, signUp } from './helpers.js';

beforeEach(resetDatabase);
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
