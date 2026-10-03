import { MemoryStore, rateLimit } from 'express-rate-limit';
import { HttpError } from './errors.js';

// Attempts are counted in memory, so per process and only until it restarts.
export const authAttempts = new MemoryStore();

// Signing up and logging in: 10 attempts per client IP every 15 minutes, to
// slow password guessing and cap the bcrypt work (about 200ms of CPU on the
// event loop) each attempt costs.
export const limitAuthAttempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  store: authAttempts,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => next(new HttpError(429)),
});
