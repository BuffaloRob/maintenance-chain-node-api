import db from '../db.js';
import { insertRecord, updateRecord } from './record.js';
import * as types from './types.js';

export const COLUMNS = ['id', 'name', 'item_id', 'created_at', 'updated_at'];

export const cast = (attributes) =>
  types.castAttributes(attributes, { name: types.string, item_id: types.integer });

export const forItems = (itemIds) => db('categories').whereIn('item_id', itemIds).orderBy('id');

export const findAll = (ids) => db('categories').whereIn('id', ids);

// A category of one of the user's items.
export async function find(userId, id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('categories')
    .select('categories.*')
    .join('items', 'items.id', 'categories.item_id')
    .where({ 'categories.id': id, 'items.user_id': userId })
    .first();
}

// item.categories.find_by(id:)
export async function findInItem(item, id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('categories').where({ id, item_id: item.id }).first();
}

// item.categories.find_by(attributes)
export const findBy = (item, attributes) =>
  db('categories').where({ item_id: item.id }).where(attributes).orderBy('id').first();

export const create = (item, attributes) =>
  insertRecord('categories', { ...attributes, item_id: item.id });

export const update = (category, attributes) => updateRecord('categories', category, attributes);

// dependent: :destroy on the category's logs.
export function destroy(category) {
  return db.transaction(async (trx) => {
    await trx('logs').where({ category_id: category.id }).del();
    await trx('categories').where({ id: category.id }).del();
  });
}
