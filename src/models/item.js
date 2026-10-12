import db from '../db.js';
import { insertRecord, updateRecord } from './record.js';
import * as types from './types.js';

export const COLUMNS = ['id', 'name', 'user_id', 'created_at', 'updated_at', 'archived_at'];

export const cast = (attributes) => types.castAttributes(attributes, { name: types.string });

export const forUser = (userId) => db('items').where({ user_id: userId }).orderBy('id');

export const findAll = (ids) => db('items').whereIn('id', ids);

// One of the user's items.
export async function find(userId, id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('items').where({ id, user_id: userId }).first();
}

export const create = (user, attributes) =>
  insertRecord('items', { ...attributes, user_id: user.id });

export const update = (item, attributes) => updateRecord('items', item, attributes);

// Archiving an item that's already archived keeps the time it was archived.
export const archive = (item) =>
  item.archived_at ? item : updateRecord('items', item, { archived_at: db.fn.now() });

export const unarchive = (item) => updateRecord('items', item, { archived_at: null });

// dependent: :destroy, down through the item's categories to their logs.
export function destroy(item) {
  return db.transaction(async (trx) => {
    const categoryIds = trx('categories').select('id').where({ item_id: item.id });
    await trx('logs').whereIn('category_id', categoryIds).del();
    await trx('categories').where({ item_id: item.id }).del();
    await trx('items').where({ id: item.id }).del();
  });
}
