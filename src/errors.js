import { STATUS_CODES } from 'node:http';

export class HttpError extends Error {
  constructor(status) {
    super(STATUS_CODES[status]);
    this.status = status;
  }
}

// ActiveRecord's find: a missing record is a 404.
export function orNotFound(record) {
  if (!record) throw new HttpError(404);
  return record;
}

export function notFound(req, res, next) {
  next(new HttpError(404));
}

// Like Rails in production, failures render as { status, error } JSON.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  // HttpErrors, and body-parser's for malformed or oversized request bodies.
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ status, error: STATUS_CODES[status] });
}
