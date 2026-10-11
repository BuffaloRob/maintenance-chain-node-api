import { orNotFound } from '../errors.js';
import * as Category from '../models/category.js';
import * as Item from '../models/item.js';
import { permit } from '../params.js';
import { serializeCategories, serializeCategory } from '../serializers.js';

// category_params. A new category always goes in the item in the URL, so only
// updates take item_id.
const categoryParams = (req, names) =>
  Category.cast(permit(req, 'category', names, { wrap: Category.COLUMNS }));

const findItem = async (req) => orNotFound(await Item.find(req.currentUser.id, req.params.item_id));

export async function index(req, res) {
  const item = await findItem(req);
  res.json(await serializeCategories(await Category.forItems([item.id])));
}

// find_or_create_by: posting a name the item already has returns that category,
// with a 200 rather than a 201.
export async function create(req, res) {
  const item = await findItem(req);
  const attributes = categoryParams(req, ['name']);
  const existing = await Category.findBy(item, attributes);
  const category = existing ?? (await Category.create(item, attributes));
  res.status(existing ? 200 : 201).json(await serializeCategory(category));
}

export async function show(req, res) {
  const item = await findItem(req);
  res.json(await serializeCategory(orNotFound(await Category.findInItem(item, req.params.id))));
}

export async function update(req, res) {
  const item = await findItem(req);
  const category = orNotFound(await Category.findInItem(item, req.params.id));
  const attributes = categoryParams(req, ['name', 'item_id']);
  // belongs_to :item, which here has to be one of the user's items
  if ('item_id' in attributes && !(await Item.find(req.currentUser.id, attributes.item_id))) {
    return res.status(422).json({ item: ['must exist'] });
  }
  res.json(await serializeCategory(await Category.update(category, attributes)));
}

// Like the Rails app, this finds the category by its id alone.
export async function destroy(req, res) {
  await Category.destroy(orNotFound(await Category.find(req.currentUser.id, req.params.id)));
  res.status(204).end();
}
