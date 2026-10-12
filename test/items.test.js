import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import * as Category from '../src/models/category.js';
import * as Item from '../src/models/item.js';
import * as Log from '../src/models/log.js';
import { api, countRows, reset, signUp } from './helpers.js';

let rob;
let other;

beforeEach(async () => {
  await reset();
  rob = await signUp('rob@example.com');
  other = await signUp('other@example.com');
});
after(() => db.destroy());

test("GET /items lists the user's items with their user, categories and logs", async () => {
  const car = await Item.create(rob.user, { name: 'Car' });
  const oil = await Category.create(car, { name: 'Oil change' });
  await Log.create(oil, {
    notes: 'Synthetic',
    tools: 'Wrench',
    cost: 40,
    date_performed: '2020-01-01',
    date_due: '2020-04-01',
  });
  await Log.create(oil, { date_performed: '2020-04-02', date_due: '2020-07-01' });
  await Item.create(rob.user, { name: 'Mower' });
  await Item.create(other.user, { name: 'Not mine' });

  const res = await api.get('/api/v1/items').set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    {
      id: 1,
      name: 'Car',
      archived_at: null,
      user: { id: 1, email: 'rob@example.com' },
      categories: [{ id: 1, name: 'Oil change', item_id: 1 }],
      logs: [
        {
          id: 2,
          notes: null,
          tools: null,
          cost: null,
          date_performed: '2020-04-02',
          date_due: '2020-07-01',
          category_id: 1,
        },
        {
          id: 1,
          notes: 'Synthetic',
          tools: 'Wrench',
          cost: 40,
          date_performed: '2020-01-01',
          date_due: '2020-04-01',
          category_id: 1,
        },
      ],
    },
    {
      id: 2,
      name: 'Mower',
      archived_at: null,
      user: { id: 1, email: 'rob@example.com' },
      categories: [],
      logs: [],
    },
  ]);
  assert.deepEqual(Object.keys(res.body[0]), [
    'id',
    'name',
    'archived_at',
    'user',
    'categories',
    'logs',
  ]);
});

test('POST /items creates an item from the bare { name } the client sends', async () => {
  const res = await api.post('/api/v1/items').set(rob.auth).send({ name: 'Car' });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, {
    id: 1,
    name: 'Car',
    archived_at: null,
    user: { id: 1, email: 'rob@example.com' },
    categories: [],
    logs: [],
  });
});

test('POST /items takes { item: { ... } } too, and ignores user_id', async () => {
  const res = await api
    .post('/api/v1/items')
    .set(rob.auth)
    .send({ item: { name: 'Car', user_id: other.user.id } });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.id, rob.user.id);
  assert.equal((await db('items').first()).user_id, rob.user.id);
});

test('POST /items without attributes is a 400', async () => {
  const res = await api.post('/api/v1/items').set(rob.auth).send({});

  assert.equal(res.status, 400);
});

test('GET /items/:id shows an item', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });

  const res = await api.get(`/api/v1/items/${car.id}`).set(rob.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    id: 1,
    name: 'Car',
    archived_at: null,
    user: { id: 1, email: 'rob@example.com' },
    categories: [],
    logs: [],
  });
});

test('PUT and PATCH /items/:id rename an item from the form values ItemEdit sends', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });

  // ItemEdit submits the whole item it loaded from GET /items.
  const put = await api
    .put(`/api/v1/items/${car.id}`)
    .set(rob.auth)
    .send({ name: 'Truck', user: { id: 1, email: 'rob@example.com' }, categories: [], logs: [] });
  assert.equal(put.status, 200);
  assert.equal(put.body.name, 'Truck');

  const patch = await api.patch(`/api/v1/items/${car.id}`).set(rob.auth).send({ name: 'Van' });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.name, 'Van');
});

test('DELETE /items/:id deletes the item with its categories and logs', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });
  const oil = await Category.create(car, { name: 'Oil change' });
  await Log.create(oil, { date_due: '2020-04-01' });

  const res = await api.delete(`/api/v1/items/${car.id}`).set(rob.auth);

  assert.equal(res.status, 204);
  for (const table of ['items', 'categories', 'logs']) {
    assert.equal(await countRows(table), 0, table);
  }
});

test('POST /items/:id/archive archives an item, which GET /items still lists', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });
  const oil = await Category.create(car, { name: 'Oil change' });
  await Log.create(oil, { date_due: '2020-04-01' });
  await Item.create(rob.user, { name: 'Mower' });

  const before = Date.now();
  const res = await api.post(`/api/v1/items/${car.id}/archive`).set(rob.auth);

  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Car');
  assert.equal(res.body.logs.length, 1);
  // An ISO time in UTC, whatever the server's time zone
  assert.match(res.body.archived_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const archivedAt = Date.parse(res.body.archived_at);
  assert.ok(Math.abs(archivedAt - before) < 60 * 1000, res.body.archived_at);

  const items = await api.get('/api/v1/items').set(rob.auth);
  assert.deepEqual(
    items.body.map((item) => [item.name, item.archived_at]),
    [
      ['Car', res.body.archived_at],
      ['Mower', null],
    ],
  );
});

test('archiving an archived item keeps the time it was archived', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });
  const first = await api.post(`/api/v1/items/${car.id}/archive`).set(rob.auth);

  const again = await api.post(`/api/v1/items/${car.id}/archive`).set(rob.auth);

  assert.equal(again.status, 200);
  assert.equal(again.body.archived_at, first.body.archived_at);
});

test('DELETE /items/:id/archive restores an item', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });
  await api.post(`/api/v1/items/${car.id}/archive`).set(rob.auth);

  const res = await api.delete(`/api/v1/items/${car.id}/archive`).set(rob.auth);

  assert.equal(res.status, 200);
  assert.equal(res.body.archived_at, null);
  assert.equal((await db('items').where({ id: car.id }).first()).archived_at, null);
});

test('renaming an item leaves it archived, even when the body says otherwise', async () => {
  const car = await Item.create(rob.user, { name: 'Car' });
  const archived = await api.post(`/api/v1/items/${car.id}/archive`).set(rob.auth);

  const res = await api
    .put(`/api/v1/items/${car.id}`)
    .set(rob.auth)
    .send({ name: 'Truck', archived_at: null });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Truck');
  assert.equal(res.body.archived_at, archived.body.archived_at);
});

test("another user's items, missing items and non-numeric ids are 404s", async () => {
  const theirs = await Item.create(other.user, { name: 'Not mine' });

  for (const id of [theirs.id, 999, 'abc']) {
    for (const method of ['get', 'put', 'delete']) {
      const res = await api[method](`/api/v1/items/${id}`).set(rob.auth).send({ name: 'Mine now' });
      assert.equal(res.status, 404, `${method} ${id}`);
      assert.deepEqual(res.body, { status: 404, error: 'Not Found' });
    }
  }
  assert.equal((await db('items').where({ id: theirs.id }).first()).name, 'Not mine');
});

test("another user's items can't be archived or restored", async () => {
  const theirs = await Item.create(other.user, { name: 'Not mine' });

  for (const id of [theirs.id, 999, 'abc']) {
    for (const method of ['post', 'delete']) {
      const res = await api[method](`/api/v1/items/${id}/archive`).set(rob.auth);
      assert.equal(res.status, 404, `${method} ${id}`);
    }
  }
  assert.equal((await db('items').where({ id: theirs.id }).first()).archived_at, null);
});

test('items need a token', async () => {
  const res = await api.get('/api/v1/items');

  assert.equal(res.status, 401);
});
