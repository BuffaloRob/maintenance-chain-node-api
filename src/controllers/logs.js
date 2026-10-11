import { orNotFound } from '../errors.js';
import * as Category from '../models/category.js';
import * as Log from '../models/log.js';
import { permit } from '../params.js';
import { serializeLog, serializeLogs } from '../serializers.js';

const DAY = 24 * 60 * 60 * 1000;

// log_params. Rails also permitted item_id, which isn't a log column (sending
// it made the request fail). On create the category always comes from the URL.
const logParams = (req) =>
  Log.cast(
    permit(req, 'log', ['notes', 'tools', 'cost', 'date_performed', 'date_due', 'category_id'], {
      wrap: Log.COLUMNS,
    }),
  );

// Like the Rails app, the logs actions find the category by :category_id
// alone and ignore :item_id.
const findCategory = async (req) =>
  orNotFound(await Category.find(req.currentUser.id, req.params.category_id));

export async function index(req, res) {
  const category = await findCategory(req);
  res.json(await serializeLogs(await Log.forCategories([category.id])));
}

export async function create(req, res) {
  const category = await findCategory(req);
  res.status(201).json(await serializeLog(await Log.create(category, logParams(req))));
}

export async function show(req, res) {
  res.json(await serializeLog(orNotFound(await Log.find(req.currentUser.id, req.params.id))));
}

export async function update(req, res) {
  const category = await findCategory(req);
  const log = orNotFound(await Log.findInCategory(category, req.params.id));
  const attributes = logParams(req);
  // belongs_to :category, which here has to be one of the user's categories
  if (
    'category_id' in attributes &&
    !(await Category.find(req.currentUser.id, attributes.category_id))
  ) {
    return res.status(422).json({ category: ['must exist'] });
  }
  res.json(await serializeLog(await Log.update(log, attributes)));
}

export async function destroy(req, res) {
  await Log.destroy(orNotFound(await Log.find(req.currentUser.id, req.params.id)));
  res.status(204).end();
}

// The Rails app compared each due date, taken as midnight UTC, with the
// current time.
const dueTime = (log) => Date.parse(`${log.date_due}T00:00:00Z`);

// GET /past_due: categories whose latest log was due today or earlier.
export async function pastDue(req, res) {
  const now = Date.now();
  const logs = await Log.latestPerCategory(req.currentUser.id);
  res.json(await serializeLogs(logs.filter((log) => dueTime(log) <= now)));
}

// GET /upcoming: categories whose latest log is due within the next 30 days.
export async function upcoming(req, res) {
  const now = Date.now();
  const logs = await Log.latestPerCategory(req.currentUser.id);
  const due = logs.filter((log) => dueTime(log) >= now && dueTime(log) <= now + 30 * DAY);
  res.json(await serializeLogs(due));
}
