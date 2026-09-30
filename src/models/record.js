import db from '../db.js';

// Inserts a row with its timestamps, like ActiveRecord's create.
export async function insertRecord(table, attributes) {
  const [record] = await db(table)
    .insert({ ...attributes, created_at: db.fn.now(), updated_at: db.fn.now() })
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
