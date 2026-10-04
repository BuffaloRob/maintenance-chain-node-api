import db from '../db.js';

// Inserts a row with its timestamps, like ActiveRecord's create. Pass a
// transaction to insert it in that.
export async function insertRecord(table, attributes, trx = db) {
  const [record] = await trx(table)
    .insert({ ...attributes, created_at: trx.fn.now(), updated_at: trx.fn.now() })
    .returning('*');
  return record;
}

// Like ActiveRecord's update: writes only the attributes that changed, and
// bumps updated_at only if something did.
export async function updateRecord(table, record, attributes) {
  const changes = Object.fromEntries(
    Object.entries(attributes).filter(([name, value]) => record[name] !== value),
  );
  if (Object.keys(changes).length === 0) return record;
  const [updated] = await db(table)
    .where({ id: record.id })
    .update({ ...changes, updated_at: db.fn.now() })
    .returning('*');
  return updated;
}
