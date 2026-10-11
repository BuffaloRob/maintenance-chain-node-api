import * as Category from './models/category.js';
import * as Item from './models/item.js';
import * as Log from './models/log.js';

// The JSON the Rails app's serializers (app/serializers, ActiveModel
// Serializers 0.10) produced: a record's attributes, then its associations
// with only their own attributes.
const userAttributes = ({ id, email }) => ({ id, email });
const itemAttributes = ({ id, name }) => ({ id, name });
const categoryAttributes = ({ id, name, item_id }) => ({ id, name, item_id });
const logAttributes = ({ id, notes, tools, cost, date_performed, date_due, category_id }) => ({
  id,
  notes,
  tools,
  cost,
  date_performed,
  date_due,
  category_id,
});

const indexById = (records) => new Map(records.map((record) => [record.id, record]));

// UserSerializer: has_many :items. Plus whether the user's email address is
// verified, which the Rails app didn't have.
export async function serializeUser(user) {
  const items = await Item.forUser(user.id);
  return {
    ...userAttributes(user),
    email_verified: user.email_verified_at != null,
    items: items.map(itemAttributes),
  };
}

// ItemSerializer: belongs_to :user, has_many :categories, has_many :logs.
// The items all belong to `user`.
export async function serializeItems(items, user) {
  const ids = items.map((item) => item.id);
  const [categories, logs] = await Promise.all([Category.forItems(ids), Log.forItems(ids)]);
  const categoriesByItem = Map.groupBy(categories, (category) => category.item_id);
  const logsByItem = Map.groupBy(logs, (log) => log.item_id);
  return items.map((item) => ({
    ...itemAttributes(item),
    user: userAttributes(user),
    categories: (categoriesByItem.get(item.id) ?? []).map(categoryAttributes),
    logs: (logsByItem.get(item.id) ?? []).map(logAttributes),
  }));
}

// CategorySerializer: has_many :logs, belongs_to :item
export async function serializeCategories(categories) {
  const [logs, items] = await Promise.all([
    Log.forCategories(categories.map((category) => category.id)),
    Item.findAll(categories.map((category) => category.item_id)),
  ]);
  const logsByCategory = Map.groupBy(logs, (log) => log.category_id);
  const itemsById = indexById(items);
  return categories.map((category) => {
    const item = itemsById.get(category.item_id);
    return {
      ...categoryAttributes(category),
      logs: (logsByCategory.get(category.id) ?? []).map(logAttributes),
      item: item ? itemAttributes(item) : null,
    };
  });
}

// LogSerializer: belongs_to :category
export async function serializeLogs(logs) {
  const categoriesById = indexById(await Category.findAll(logs.map((log) => log.category_id)));
  return logs.map((log) => {
    const category = categoriesById.get(log.category_id);
    return { ...logAttributes(log), category: category ? categoryAttributes(category) : null };
  });
}

// Receipts are new: the Rails app had none. Their images are left out; GET
// .../receipts/:id sends one.
export const serializeReceipt = ({ id, log_id, content_type }) => ({ id, log_id, content_type });

export const serializeItem = async (item, user) => (await serializeItems([item], user))[0];
export const serializeCategory = async (category) => (await serializeCategories([category]))[0];
export const serializeLog = async (log) => (await serializeLogs([log]))[0];
