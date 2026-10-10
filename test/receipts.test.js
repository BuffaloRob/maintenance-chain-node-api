import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import * as Category from '../src/models/category.js';
import * as Item from '../src/models/item.js';
import * as Log from '../src/models/log.js';
import * as Receipt from '../src/models/receipt.js';
import { api, countRows, reset, signUp } from './helpers.js';

let rob;
let other;
let car;
let oil;
let log;

// The receipts are only checked for the bytes their format starts with.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('a receipt')]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('a receipt'),
]);
const webp = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 a receipt', 'latin1');

beforeEach(async () => {
  await reset();
  rob = await signUp('rob@example.com');
  other = await signUp('other@example.com');
  car = await Item.create(rob.user, { name: 'Car' });
  oil = await Category.create(car, { name: 'Oil change' });
  log = await Log.create(oil, { date_performed: '2020-01-01', date_due: '2020-04-01' });
});
after(() => db.destroy());

const receiptsPath = (forLog = log, category = oil) =>
  `/api/v1/items/${category.item_id}/categories/${category.id}/logs/${forLog.id}/receipts`;

const upload = (image, contentType = 'image/jpeg', path = receiptsPath()) =>
  api.post(path).set(rob.auth).set('Content-Type', contentType).send(image);

test('POST stores a photo of a receipt', async () => {
  const res = await upload(jpeg);

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { id: 1, log_id: log.id, content_type: 'image/jpeg' });
  const [stored] = await db('receipts').select('data');
  assert.deepEqual(stored.data, jpeg);
});

test("GET lists the log's receipts, without their images", async () => {
  const otherLog = await Log.create(oil, { date_performed: '2020-04-01' });
  await Receipt.create(log, { content_type: 'image/jpeg', data: jpeg });
  await Receipt.create(otherLog, { content_type: 'image/jpeg', data: jpeg });
  await Receipt.create(log, { content_type: 'image/png', data: png });

  const res = await api.get(receiptsPath()).set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    { id: 1, log_id: log.id, content_type: 'image/jpeg' },
    { id: 3, log_id: log.id, content_type: 'image/png' },
  ]);
});

test('GET /:id sends the image', async () => {
  const receipt = await Receipt.create(log, { content_type: 'image/jpeg', data: jpeg });

  const res = await api.get(`${receiptsPath()}/${receipt.id}`).set(rob.auth);

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(res.body, jpeg);
});

test("a receipt's type is the image's, not the Content-Type it was sent with", async () => {
  for (const [image, type] of [
    [jpeg, 'image/jpeg'],
    [png, 'image/png'],
    [webp, 'image/webp'],
  ]) {
    const res = await upload(image, 'image/heic');
    assert.equal(res.status, 201);
    assert.equal(res.body.content_type, type);
  }
});

test('anything but a JPEG, PNG or WebP image is a 415', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  const requests = [
    () => upload(svg, 'image/svg+xml'),
    () => upload(svg, 'image/jpeg'),
    () => upload(Buffer.alloc(0)),
    () =>
      api
        .post(receiptsPath())
        .set(rob.auth)
        .send({ data: jpeg.toString('base64') }),
    () => api.post(receiptsPath()).set(rob.auth),
  ];

  for (const request of requests) {
    const res = await request();
    assert.equal(res.status, 415);
    assert.deepEqual(res.body, { message: 'Receipts have to be JPEG, PNG or WebP images' });
  }
  assert.equal(await countRows('receipts'), 0);
});

test('a photo over 5 MB is a 413', async () => {
  const res = await upload(Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024)]));

  assert.equal(res.status, 413);
  assert.deepEqual(res.body, { status: 413, error: 'Payload Too Large' });
  assert.equal(await countRows('receipts'), 0);
});

test(`a log can have up to ${Receipt.MAX_PER_LOG} receipts`, async () => {
  for (let i = 0; i < Receipt.MAX_PER_LOG; i++) {
    await Receipt.create(log, { content_type: 'image/jpeg', data: jpeg });
  }

  const res = await upload(jpeg);

  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { message: `A log can have up to ${Receipt.MAX_PER_LOG} receipts` });
  assert.equal(await countRows('receipts'), Receipt.MAX_PER_LOG);
});

test('DELETE /:id deletes a receipt', async () => {
  const receipt = await Receipt.create(log, { content_type: 'image/jpeg', data: jpeg });

  const res = await api.delete(`${receiptsPath()}/${receipt.id}`).set(rob.auth);

  assert.equal(res.status, 204);
  assert.equal(await countRows('receipts'), 0);
});

test('deleting a log, or its category or item, deletes its receipts', async () => {
  const categoriesPath = `/api/v1/items/${car.id}/categories`;
  const deletions = [
    [() => api.delete(`${categoriesPath}/${oil.id}/logs/${log.id}`), 'log'],
    [() => api.delete(`${categoriesPath}/${oil.id}`), 'category'],
    [() => api.delete(`/api/v1/items/${car.id}`), 'item'],
  ];

  for (const [request, deleted] of deletions) {
    await reset();
    rob = await signUp('rob@example.com');
    car = await Item.create(rob.user, { name: 'Car' });
    oil = await Category.create(car, { name: 'Oil change' });
    log = await Log.create(oil, {});
    await Receipt.create(log, { content_type: 'image/jpeg', data: jpeg });

    const res = await request().set(rob.auth);

    assert.equal(res.status, 204, deleted);
    assert.equal(await countRows('receipts'), 0, deleted);
  }
});

test("another user's logs and receipts are 404s", async () => {
  const theirItem = await Item.create(other.user, { name: 'Not mine' });
  const theirCategory = await Category.create(theirItem, { name: 'Theirs' });
  const theirLog = await Log.create(theirCategory, {});
  const theirs = await Receipt.create(theirLog, { content_type: 'image/jpeg', data: jpeg });
  const tires = await Category.create(car, { name: 'Tires' });
  const requests = [
    () => api.get(receiptsPath(theirLog, theirCategory)),
    () =>
      api.post(receiptsPath(theirLog, theirCategory)).set('Content-Type', 'image/jpeg').send(jpeg),
    () => api.get(`${receiptsPath(theirLog, theirCategory)}/${theirs.id}`),
    () => api.get(`${receiptsPath()}/${theirs.id}`),
    () => api.delete(`${receiptsPath(theirLog, theirCategory)}/${theirs.id}`),
    () => api.delete(`${receiptsPath()}/${theirs.id}`),
    // A log of the user's, under another of their categories
    () => api.get(receiptsPath(log, tires)),
  ];

  for (const request of requests) {
    const res = await request().set(rob.auth);
    assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);
  }
  assert.deepEqual(await db('receipts').select('id'), [{ id: theirs.id }]);
});
