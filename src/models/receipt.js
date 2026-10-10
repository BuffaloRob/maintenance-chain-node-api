import db from '../db.js';
import { insertRecord } from './record.js';
import * as types from './types.js';

// So photos can't fill the database. Receipts for one job rarely take more
// than a couple.
export const MAX_PER_LOG = 10;

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The type of image `data` is, judging by the bytes it starts with, or
// undefined if it isn't a JPEG, PNG or WebP image. Receipts are served with
// this type rather than the one they were uploaded with, so they're always
// images a browser shows as such.
export function imageType(data) {
  if (data.subarray(0, JPEG.length).equals(JPEG)) return 'image/jpeg';
  if (data.subarray(0, PNG.length).equals(PNG)) return 'image/png';
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
}

// log.receipts, without their images.
export const forLog = (log) =>
  db('receipts').select('id', 'log_id', 'content_type').where({ log_id: log.id }).orderBy('id');

export const countForLog = async (log) =>
  (await db('receipts').where({ log_id: log.id }).count({ count: '*' }))[0].count;

// log.receipts.find_by(id:), with its image.
export async function findInLog(log, id) {
  id = types.recordId(id);
  if (id === undefined) return;
  return db('receipts').where({ id, log_id: log.id }).first();
}

export const create = (log, attributes) =>
  insertRecord('receipts', { ...attributes, log_id: log.id });

export const destroy = (receipt) => db('receipts').where({ id: receipt.id }).del();
