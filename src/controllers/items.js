import { orNotFound } from '../errors.js';
import * as Item from '../models/item.js';
import { permit } from '../params.js';
import { serializeItem, serializeItems } from '../serializers.js';

// item_params. Rails also permitted user_id, which let an item be handed to
// another user; items here always belong to whoever created them.
const itemParams = (req) => Item.cast(permit(req, 'item', ['name'], { wrap: Item.COLUMNS }));

// before_action :set_item
const findItem = async (req) => orNotFound(await Item.find(req.currentUser.id, req.params.id));

export async function index(req, res) {
  const items = await Item.forUser(req.currentUser.id);
  res.json(await serializeItems(items, req.currentUser));
}

export async function create(req, res) {
  const item = await Item.create(req.currentUser, itemParams(req));
  res.json(await serializeItem(item, req.currentUser));
}

export async function show(req, res) {
  res.json(await serializeItem(await findItem(req), req.currentUser));
}

export async function update(req, res) {
  const item = await findItem(req);
  res.json(await serializeItem(await Item.update(item, itemParams(req)), req.currentUser));
}

export async function destroy(req, res) {
  await Item.destroy(await findItem(req));
  res.status(204).end();
}
