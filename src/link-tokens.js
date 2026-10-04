import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from './config.js';

// Tokens for the links in emails. Each kind of link is signed with its own key,
// derived from JWT_SECRET, so no token works as another kind or as a login
// token, nor a login token as a link.
const key = (purpose) => createHmac('sha256', config.jwtSecret).update(purpose).digest();

export function signLinkToken(purpose, payload, lifetime) {
  return jwt.sign(payload, key(purpose), { algorithm: 'HS256', expiresIn: lifetime });
}

// The token's payload, or undefined if it's invalid or expired.
export function verifyLinkToken(purpose, token) {
  try {
    return jwt.verify(token, key(purpose), { algorithms: ['HS256'] });
  } catch {
    return undefined;
  }
}
