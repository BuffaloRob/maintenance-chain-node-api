import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import db from '../src/db.js';
import * as Category from '../src/models/category.js';
import * as Item from '../src/models/item.js';
import * as Log from '../src/models/log.js';
import { api, daysFromToday, reset, signUp } from './helpers.js';

let rob;
let car;

beforeEach(async () => {
  await reset();
  rob = await signUp('rob@example.com');
  car = await Item.create(rob.user, { name: 'Car' });
});
after(() => db.destroy());

// A category with a log due each of the given numbers of days from today.
async function categoryWithLogs(item, name, ...dueInDays) {
  const category = await Category.findOrCreate(item, { name });
  for (const days of dueInDays) await Log.create(category, { date_due: daysFromToday(days) });
  return category;
}

test('GET /past_due and /upcoming go by the latest log in each category', async () => {
  await categoryWithLogs(car, 'Oil change', -40, -5);
  await categoryWithLogs(car, 'Tires', -10, 10);
  await categoryWithLogs(car, 'Brakes', 0);
  await categoryWithLogs(car, 'Wipers', 30);
  await categoryWithLogs(car, 'Battery', 31);
  await categoryWithLogs(car, 'Coolant');
  const truck = await Item.create(rob.user, { name: 'Truck' });
  await categoryWithLogs(truck, 'Oil change', -1);
  const other = await signUp('other@example.com');
  await categoryWithLogs(await Item.create(other.user, { name: 'Not mine' }), 'Theirs', -3, 3);

  const pastDue = await api.get('/api/v1/past_due').set(rob.auth);
  assert.equal(pastDue.status, 200);
  assert.deepEqual(
    pastDue.body.map((log) => [log.category.name, log.category.item_id, log.date_due]),
    [
      ['Oil change', car.id, daysFromToday(-5)],
      ['Brakes', car.id, daysFromToday(0)],
      ['Oil change', truck.id, daysFromToday(-1)],
    ],
  );

  const upcoming = await api.get('/api/v1/upcoming').set(rob.auth);
  assert.equal(upcoming.status, 200);
  assert.deepEqual(
    upcoming.body.map((log) => [log.category.name, log.date_due]),
    [
      ['Tires', daysFromToday(10)],
      ['Wipers', daysFromToday(30)],
    ],
  );
});

test('each entry is a log with its category', async () => {
  const oil = await categoryWithLogs(car, 'Oil change', -5);

  const res = await api.get('/api/v1/past_due').set(rob.auth);

  assert.deepEqual(res.body, [
    {
      id: 1,
      notes: null,
      tools: null,
      cost: null,
      date_performed: null,
      date_due: daysFromToday(-5),
      category_id: oil.id,
      category: { id: oil.id, name: 'Oil change', item_id: car.id },
    },
  ]);
});

test('logs without a due date are skipped', async () => {
  const oil = await categoryWithLogs(car, 'Oil change', -5);
  await Log.create(oil, { notes: 'No due date' });

  const res = await api.get('/api/v1/past_due').set(rob.auth);

  assert.deepEqual(
    res.body.map((log) => log.date_due),
    [daysFromToday(-5)],
  );
});
