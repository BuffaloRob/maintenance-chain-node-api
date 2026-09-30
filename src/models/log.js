import db from '../db.js';
import { insertRecord, updateRecord } from './record.js';
import * as types from './types.js';

export const COLUMNS = [
  'id',
  'notes',
  'tools',
  'cost',
  'date_performed',
  'date_due',
  'created_at',
  'updated_at',
  'category_id',
];

export const cast = (attributes) =>
  types.castAttributes(attributes, {
    notes: types.string,
    tools: types.string,
    cost: types.integer,
    date_performed: types.date,
    date_due: types.date,
    category_id: types.integer,
  });

// Log's default_scope: latest due date first (with PostgreSQL's NULLs ahead
// of every date), and among equal dates the first one created.
const ORDER = [
  { column: 'logs.date_due', order: 'desc' },
  { column: 'logs.id', order: 'asc' },
];

export const forCategories = (categoryIds) =>
  db('logs').whereIn('category_id', categoryIds).orderBy(ORDER);

// item.logs (through categories); each log also carries its item_id.
export const forItems = (itemIds) =>
  db('logs')
    .select('logs.*', 'categories.item_id')
    .join('categories', 'categories.id', 'logs.category_id')
    .whereIn('categories.item_id', itemIds)
    .orderBy(ORDER);

// A log in one of the user's categories.
export async function find(userId, id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('logs')
    .select('logs.*')
    .join('categories', 'categories.id', 'logs.category_id')
    .join('items', 'items.id', 'categories.item_id')
    .where({ 'logs.id': id, 'items.user_id': userId })
    .first();
}

// category.logs.find_by(id:)
export async function findInCategory(category, id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('logs').where({ id, category_id: category.id }).first();
}

export const create = (category, attributes) =>
  insertRecord('logs', { ...attributes, category_id: category.id });

export const update = (log, attributes) => updateRecord('logs', log, attributes);

export const destroy = (log) => db('logs').where({ id: log.id }).del();

// For past_due and upcoming: the latest log (first in default_scope order)
// of each of the user's categories, ordered by item and then category. Logs
// without a due date are skipped; the Rails app raised an error on them.
export function latestPerCategory(userId) {
  const latest = db('logs')
    .distinctOn('logs.category_id')
    .select('logs.*', 'categories.item_id')
    .join('categories', 'categories.id', 'logs.category_id')
    .join('items', 'items.id', 'categories.item_id')
    .where('items.user_id', userId)
    .whereNotNull('logs.date_due')
    .orderBy([{ column: 'logs.category_id' }, ...ORDER]);
  return db.select('*').from(latest.as('latest')).orderBy(['item_id', 'category_id']);
}
