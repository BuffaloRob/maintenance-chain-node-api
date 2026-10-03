import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import * as Category from '../src/models/category.js';
import * as Item from '../src/models/item.js';
import * as Log from '../src/models/log.js';
import { api, countRows, reset, signUp } from './helpers.js';

let rob;
let other;
let car;
let oil;

beforeEach(async () => {
  await reset();
  rob = await signUp('rob@example.com');
  other = await signUp('other@example.com');
  car = await Item.create(rob.user, { name: 'Car' });
  oil = await Category.findOrCreate(car, { name: 'Oil change' });
});
after(() => db.destroy());

const logsPath = (category = oil) =>
  `/api/v1/items/${category.item_id}/categories/${category.id}/logs`;

test('POST creates a log from the form values LogCreate sends', async () => {
  const res = await api.post(logsPath()).set(rob.auth).send({
    date_performed: '2020-01-01',
    date_due: '2020-04-01',
    cost: '45',
    notes: 'Synthetic',
    tools: 'Wrench',
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    id: 1,
    notes: 'Synthetic',
    tools: 'Wrench',
    cost: 45,
    date_performed: '2020-01-01',
    date_due: '2020-04-01',
    category_id: 1,
    category: { id: 1, name: 'Oil change', item_id: 1 },
  });
  assert.deepEqual(Object.keys(res.body), [
    'id',
    'notes',
    'tools',
    'cost',
    'date_performed',
    'date_due',
    'category_id',
    'category',
  ]);
});

test('casts values the way Rails did', async () => {
  const cases = [
    ['cost', '', null],
    ['cost', '12.7', 12],
    ['cost', 'abc', 0],
    ['date_due', '2020-03-01T23:30:00.000Z', '2020-03-01'],
    ['date_due', '2020-3-1', '2020-03-01'],
    ['date_due', '2019-02-30', null],
    ['date_due', 'soon', null],
    ['notes', 42, '42'],
  ];
  for (const [attribute, sent, stored] of cases) {
    const res = await api
      .post(logsPath())
      .set(rob.auth)
      .send({ log: { [attribute]: sent } });
    assert.equal(res.status, 200);
    assert.equal(res.body[attribute], stored, `${attribute}: ${JSON.stringify(sent)}`);
  }
});

test('a value too big for its column is a 400', async () => {
  const res = await api.post(logsPath()).set(rob.auth).send({ cost: '3000000000' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { status: 400, error: 'Bad Request' });
  assert.equal(await countRows('logs'), 0);
});

test("GET lists the category's logs, latest due date first", async () => {
  await Log.create(oil, { date_due: '2020-04-01' });
  await Log.create(oil, { date_due: '2020-10-01' });
  await Log.create(oil, { date_due: '2020-07-01' });
  await Log.create(await Category.findOrCreate(car, { name: 'Tires' }), { date_due: '2021-01-01' });

  const res = await api.get(logsPath()).set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.map((log) => log.date_due),
    ['2020-10-01', '2020-07-01', '2020-04-01'],
  );
  assert.deepEqual(res.body[0].category, { id: 1, name: 'Oil change', item_id: 1 });
});

test('GET /:id shows a log with its category', async () => {
  const log = await Log.create(oil, { notes: 'Synthetic', date_due: '2020-04-01' });

  const res = await api.get(`${logsPath()}/${log.id}`).set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    id: 1,
    notes: 'Synthetic',
    tools: null,
    cost: null,
    date_performed: null,
    date_due: '2020-04-01',
    category_id: 1,
    category: { id: 1, name: 'Oil change', item_id: 1 },
  });
});

test('PUT /:id updates a log from the form values LogEdit sends', async () => {
  const log = await Log.create(oil, {
    cost: 40,
    date_performed: '2020-01-01',
    date_due: '2020-04-01',
  });

  // LogEdit submits the log it loaded from GET /items, as edited.
  const res = await api.put(`${logsPath()}/${log.id}`).set(rob.auth).send({
    notes: 'Changed the filter too',
    tools: null,
    cost: '55',
    date_performed: '2020-01-01',
    date_due: '2020-05-01',
    category_id: oil.id,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    id: 1,
    notes: 'Changed the filter too',
    tools: null,
    cost: 55,
    date_performed: '2020-01-01',
    date_due: '2020-05-01',
    category_id: 1,
    category: { id: 1, name: 'Oil change', item_id: 1 },
  });
});

test("PUT /:id moves a log only to another of the user's categories", async () => {
  const log = await Log.create(oil, { date_due: '2020-04-01' });
  const tires = await Category.findOrCreate(car, { name: 'Tires' });
  const theirItem = await Item.create(other.user, { name: 'Not mine' });
  const theirs = await Category.findOrCreate(theirItem, { name: 'Theirs' });

  const refused = await api
    .put(`${logsPath()}/${log.id}`)
    .set(rob.auth)
    .send({ category_id: theirs.id });
  assert.equal(refused.status, 200);
  assert.deepEqual(refused.body, { category: ['must exist'] });

  const moved = await api
    .put(`${logsPath()}/${log.id}`)
    .set(rob.auth)
    .send({ category_id: tires.id });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.body.category, { id: tires.id, name: 'Tires', item_id: car.id });
});

test('DELETE /:id deletes a log', async () => {
  const log = await Log.create(oil, { date_due: '2020-04-01' });

  const res = await api.delete(`${logsPath()}/${log.id}`).set(rob.auth);

  assert.equal(res.status, 204);
  assert.equal(await countRows('logs'), 0);
});

test("another user's categories and logs are 404s", async () => {
  const theirItem = await Item.create(other.user, { name: 'Not mine' });
  const theirCategory = await Category.findOrCreate(theirItem, { name: 'Theirs' });
  const theirs = await Log.create(theirCategory, { notes: 'Theirs' });
  const requests = [
    () => api.get(logsPath(theirCategory)),
    () => api.post(logsPath(theirCategory)).send({ notes: 'Mine now' }),
    () => api.get(`${logsPath()}/${theirs.id}`),
    () => api.put(`${logsPath(theirCategory)}/${theirs.id}`).send({ notes: 'Mine now' }),
    () => api.put(`${logsPath()}/${theirs.id}`).send({ notes: 'Mine now' }),
    () => api.delete(`${logsPath()}/${theirs.id}`),
  ];

  for (const request of requests) {
    const res = await request().set(rob.auth);
    assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);
  }
  assert.deepEqual(await db('logs').select('notes'), [{ notes: 'Theirs' }]);
});
