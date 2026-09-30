import jwt from 'jsonwebtoken';
import config from './config.js';
import * as User from './models/user.js';

// Like the Rails app's tokens: HS256, a { user_id } payload and no expiry.
export function encodeToken(user) {
  return jwt.sign({ user_id: user.id }, config.jwtSecret, { algorithm: 'HS256', noTimestamp: true });
}

function decodeUserId(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }).user_id;
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
