import { HttpError } from './errors.js';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// The values strong parameters lets through: no nested objects or arrays.
const isScalar = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

const pick = (object, keys) =>
  Object.fromEntries(keys.filter((key) => Object.hasOwn(object, key)).map((key) => [key, object[key]]));

// params.require(key).permit(*names): a 400 unless the body has a non-empty
// object under `key`, then just the named attributes.
//
// With `wrap` (the model's columns) this also does what Rails' ParamsWrapper
// did: a JSON body without `key` is read as if its fields that are columns
// were nested under it, so { name: 'Car' } works like { item: { name: 'Car' } }.
// The client sends items, categories and logs that way.
export function permit(req, key, names, { wrap } = {}) {
  const body = req.body ?? {};
  let params = body[key];
  if (wrap && !Object.hasOwn(body, key) && isObject(body) && req.is('application/json')) {
    params = pick(body, wrap);
  }
  if (!isObject(params) || Object.keys(params).length === 0) throw new HttpError(400);
  return pick(params, names.filter((name) => isScalar(params[name])));
}
