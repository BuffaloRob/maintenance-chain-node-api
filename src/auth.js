import jwt from 'jsonwebtoken';
import config from './config.js';
import * as User from './models/user.js';

// How long a login lasts before the client has to log in again.
const TOKEN_LIFETIME = '30d';

// HS256 and a { user_id } payload, like the Rails app's tokens, but these expire.
export function encodeToken(user) {
  return jwt.sign({ user_id: user.id }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_LIFETIME,
  });
}

function decodeUserId(token) {
  try {
    // maxAge also turns away tokens without an issue time (like the Rails
    // app's), so no token lasts forever.
    const options = { algorithms: ['HS256'], maxAge: TOKEN_LIFETIME };
    return jwt.verify(token, config.jwtSecret, options).user_id;
  } catch {
    return undefined;
  }
}

// ApplicationController's before_action :authorized: requires an
// "Authorization: Bearer <token>" header and sets req.currentUser.
export async function authorized(req, res, next) {
  const token = req.get('Authorization')?.trim().split(/\s+/)[1];
  req.currentUser = token && (await User.find(decodeUserId(token)));
  // No body on purpose: the Rails app dropped its { message } here because
  // the client showed it as a blank item.
  if (!req.currentUser) return res.status(401).end();
  next();
}
