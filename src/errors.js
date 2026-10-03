import { STATUS_CODES } from 'node:http';
import pg from 'pg';

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

function statusFor(error) {
  // HttpErrors, and body-parser's for malformed or oversized request bodies.
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
    return error.status;
  }
  // A value PostgreSQL can't store, such as a cost too big for its integer
  // column (a data exception, SQLSTATE class 22), is the request's fault.
  if (error instanceof pg.DatabaseError && error.code?.startsWith('22')) return 400;
  return 500;
}

// Like Rails in production, failures render as { status, error } JSON.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = statusFor(error);
  if (status >= 500) console.error(error);
  res.status(status).json({ status, error: STATUS_CODES[status] });
}
