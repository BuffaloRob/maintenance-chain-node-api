import jwt from 'jsonwebtoken';
import config from './config.js';
import * as User from './models/user.js';

// How long a login lasts before the client has to log in again.
const TOKEN_LIFETIME = '30d';

// HS256 and a { user_id } payload, like the Rails app's tokens, but these
// expire, and carry the user's token_version (`ver`), which goes up to revoke
// them.
export function encodeToken(user) {
  return jwt.sign({ user_id: user.id, ver: user.token_version }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_LIFETIME,
  });
}

function decodeToken(token) {
  try {
    // maxAge also turns away tokens without an issue time (like the Rails
    // app's), so no token lasts forever.
    const options = { algorithms: ['HS256'], maxAge: TOKEN_LIFETIME };
    return jwt.verify(token, config.jwtSecret, options);
  } catch {
    return undefined;
  }
}

// The token's user, unless the token was revoked. (Tokens from before
// token_version existed have no `ver`, and count as version 0.)
async function tokenUser(token) {
  const payload = decodeToken(token);
  const user = payload && (await User.find(payload.user_id));
  if (user && (payload.ver ?? 0) === user.token_version) return user;
}

// ApplicationController's before_action :authorized: requires an
// "Authorization: Bearer <token>" header and sets req.currentUser.
export async function authorized(req, res, next) {
  const token = req.get('Authorization')?.trim().split(/\s+/)[1];
  req.currentUser = token && (await tokenUser(token));
  // No body on purpose: the Rails app dropped its { message } here because
  // the client showed it as a blank item.
  if (!req.currentUser) return res.status(401).end();
  next();
}

// After `authorized`: turns away users who haven't verified their email
// address yet.
export function verified(req, res, next) {
  if (!req.currentUser.email_verified_at) {
    return res.status(403).json({ message: 'Please verify your email address' });
  }
  next();
}
