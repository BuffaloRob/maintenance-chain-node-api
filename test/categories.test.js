import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import * as Category from '../src/models/category.js';
import * as Item from '../src/models/item.js';
import * as Log from '../src/models/log.js';
import { api, countRows, resetDatabase, signUp } from './helpers.js';

let rob;
let other;
let car;

beforeEach(async () => {
  await resetDatabase();
  rob = await signUp('rob@example.com');
  other = await signUp('other@example.com');
  car = await Item.create(rob.user, { name: 'Car' });
});
after(() => db.destroy());

const categoriesPath = (item) => `/api/v1/items/${item.id}/categories`;

test("GET lists the item's categories with their logs and item", async () => {
  const oil = await Category.findOrCreate(car, { name: 'Oil change' });
  await Category.findOrCreate(car, { name: 'Tires' });
  await Log.create(oil, { cost: 40, date_performed: '2020-01-01', date_due: '2020-04-01' });

  const res = await api.get(categoriesPath(car)).set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    {
      id: 1,
      name: 'Oil change',
      item_id: 1,
      logs: [
        {
          id: 1,
          notes: null,
          tools: null,
          cost: 40,
          date_performed: '2020-01-01',
          date_due: '2020-04-01',
          category_id: 1,
        },
      ],
      item: { id: 1, name: 'Car' },
    },
    { id: 2, name: 'Tires', item_id: 1, logs: [], item: { id: 1, name: 'Car' } },
  ]);
  assert.deepEqual(Object.keys(res.body[0]), ['id', 'name', 'item_id', 'logs', 'item']);
});

test('POST creates a category, or returns the one the item already has by that name', async () => {
  const created = await api.post(categoriesPath(car)).set(rob.auth).send({ name: 'Oil change' });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, {
    id: 1,
    name: 'Oil change',
    item_id: 1,
    logs: [],
    item: { id: 1, name: 'Car' },
  });

  const again = await api
    .post(categoriesPath(car))
    .set(rob.auth)
    .send({ category: { name: 'Oil change' } });
  assert.equal(again.body.id, 1);
  assert.equal(await countRows('categories'), 1);
});

test('GET /:id shows a category', async () => {
  const oil = await Category.findOrCreate(car, { name: 'Oil change' });

  const res = await api.get(`${categoriesPath(car)}/${oil.id}`).set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    id: 1,
    name: 'Oil change',
    item_id: 1,
    logs: [],
    item: { id: 1, name: 'Car' },
  });
});

test('PUT /:id renames a category', async () => {
  const oil = await Category.findOrCreate(car, { name: 'Oil change' });

  const res = await api
    .put(`${categoriesPath(car)}/${oil.id}`)
    .set(rob.auth)
    .send({ name: 'Oil' });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Oil');
});

test("PUT /:id moves a category only to another of the user's items", async () => {
  const oil = await Category.findOrCreate(car, { name: 'Oil change' });
  const truck = await Item.create(rob.user, { name: 'Truck' });
  const theirs = await Item.create(other.user, { name: 'Not mine' });

  const refused = await api
    .put(`${categoriesPath(car)}/${oil.id}`)
    .set(rob.auth)
    .send({ item_id: theirs.id });
  assert.equal(refused.status, 200);
  assert.deepEqual(refused.body, { item: ['must exist'] });

  const moved = await api
    .put(`${categoriesPath(car)}/${oil.id}`)
    .set(rob.auth)
    .send({ item_id: truck.id });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.body.item, { id: truck.id, name: 'Truck' });
});

test('DELETE /:id deletes a category and its logs', async () => {
  const oil = await Category.findOrCreate(car, { name: 'Oil change' });
  await Log.create(oil, { date_due: '2020-04-01' });

  const res = await api.delete(`${categoriesPath(car)}/${oil.id}`).set(rob.auth);

  assert.equal(res.status, 204);
  assert.equal(await countRows('categories'), 0);
  assert.equal(await countRows('logs'), 0);
});

test("another user's items and categories are 404s", async () => {
  const theirItem = await Item.create(other.user, { name: 'Not mine' });
  const theirs = await Category.findOrCreate(theirItem, { name: 'Theirs' });
  const requests = [
    () => api.get(categoriesPath(theirItem)),
    () => api.post(categoriesPath(theirItem)).send({ name: 'Mine now' }),
    () => api.get(`${categoriesPath(theirItem)}/${theirs.id}`),
    () => api.put(`${categoriesPath(theirItem)}/${theirs.id}`).send({ name: 'Mine now' }),
    () => api.put(`${categoriesPath(car)}/${theirs.id}`).send({ name: 'Mine now' }),
    () => api.delete(`${categoriesPath(car)}/${theirs.id}`),
  ];

  for (const request of requests) {
    const res = await request().set(rob.auth);
    assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);
  }
  assert.deepEqual(await db('categories').select('name'), [{ name: 'Theirs' }]);
});
