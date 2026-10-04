import { MemoryStore, rateLimit } from 'express-rate-limit';
import { HttpError } from './errors.js';

// Requests are counted in memory, so per process and only until it restarts.
export const authAttempts = new MemoryStore();
export const verificationEmails = new MemoryStore();

const options = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => next(new HttpError(429)),
};

// Signing up and logging in, with a password or Google: 10 attempts per
// client IP every 15 minutes, to slow password guessing and cap the bcrypt
// work (about 200ms of CPU on the event loop) each attempt costs.
export const limitAuthAttempts = rateLimit({
  ...options,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  store: authAttempts,
});

// Asking for another verification email: 5 per user an hour, so nobody can
// flood an inbox with them.
export const limitVerificationEmails = rateLimit({
  ...options,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  store: verificationEmails,
  keyGenerator: (req) => String(req.currentUser.id),
});
