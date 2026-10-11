// Casts request values to column types the way the Rails app's ActiveModel
// types did, so a form's "45" is stored as 45 and "" as NULL.

export function string(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 't' : 'f';
  return String(value);
}

export function integer(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  // Ruby's String#to_i: the leading digits, or 0 if there are none.
  return Number.parseInt(value, 10) || 0;
}

// YYYY-MM-DD, optionally followed by a time that's ignored (so an ISO
// timestamp keeps the date written in it). Anything else, including
// impossible dates like 2019-02-30, is NULL.
export function date(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (year < 1 || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return parsed.toISOString().slice(0, 10);
}

// Casts each of the given attributes with its column's type.
export function castAttributes(attributes, columnTypes) {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [name, columnTypes[name](value)]),
  );
}

// An id from a URL or request body, or undefined when it can't match a row.
export function recordId(value) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
