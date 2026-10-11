import express from 'express';
import { orNotFound } from '../errors.js';
import * as Category from '../models/category.js';
import * as Log from '../models/log.js';
import * as Receipt from '../models/receipt.js';
import { serializeReceipt } from '../serializers.js';

// Reads an uploaded photo, sent as the request body with its image type as
// the Content-Type, into a Buffer. The client shrinks photos to well under
// this first.
export const readImage = express.raw({ type: 'image/*', limit: '5mb' });

// Like the logs actions, finds the category by :category_id alone and
// ignores :item_id.
async function findLog(req) {
  const category = orNotFound(await Category.find(req.currentUser.id, req.params.category_id));
  return orNotFound(await Log.findInCategory(category, req.params.log_id));
}

const findReceipt = async (req) =>
  orNotFound(await Receipt.findInLog(await findLog(req), req.params.id));

export async function index(req, res) {
  res.json((await Receipt.forLog(await findLog(req))).map(serializeReceipt));
}

export async function create(req, res) {
  const log = await findLog(req);
  const contentType = Buffer.isBuffer(req.body) ? Receipt.imageType(req.body) : undefined;
  if (!contentType) {
    return res.status(415).json({ message: 'Receipts have to be JPEG, PNG or WebP images' });
  }
  if ((await Receipt.countForLog(log)) >= Receipt.MAX_PER_LOG) {
    return res
      .status(422)
      .json({ message: `A log can have up to ${Receipt.MAX_PER_LOG} receipts` });
  }
  const receipt = await Receipt.create(log, { content_type: contentType, data: req.body });
  res.status(201).json(serializeReceipt(receipt));
}

// The image itself. Not cached by the browser, which would keep it after
// the user logs out.
export async function show(req, res) {
  const receipt = await findReceipt(req);
  res
    .set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    .type(receipt.content_type)
    .send(receipt.data);
}

export async function destroy(req, res) {
  await Receipt.destroy(await findReceipt(req));
  res.status(204).end();
}
