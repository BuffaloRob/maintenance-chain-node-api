import { createHash } from 'node:crypto';
import config from './config.js';
import { signLinkToken, verifyLinkToken } from './link-tokens.js';
import { sendMail } from './mailer.js';
import * as User from './models/user.js';

const PURPOSE = 'password reset';

// How long the link in a password reset email works.
const LINK_LIFETIME = '1h';

// Stands for the user's current password (or their not having one) without
// giving it away. Links carry it, so a link stops working once the password
// changes, which makes each one work once.
const passwordFingerprint = (user) =>
  createHash('sha256')
    .update(user.password_digest ?? '')
    .digest('base64url')
    .slice(0, 16);

// Emails the user a link to the client's /reset-password page, which sends
// its token to POST /reset_password with the new password.
export function sendPasswordResetEmail(user) {
  const payload = { user_id: user.id, password: passwordFingerprint(user) };
  const token = signLinkToken(PURPOSE, payload, LINK_LIFETIME);
  const link = `${config.clientUrl}/reset-password?token=${token}`;
  return sendMail({
    to: user.email,
    subject: 'Reset your password',
    text:
      'Someone asked to reset the password of your Maintenance Chain account. To choose a ' +
      `new one, open this link in the next hour:\n\n${link}\n\n` +
      "If it wasn't you, you can ignore this email, and your password stays as it is.",
  });
}

// The user a link's token is for, or undefined if it's invalid or expired, or
// their password has changed since.
export async function userForResetToken(token) {
  const payload = verifyLinkToken(PURPOSE, token);
  const user = payload && (await User.find(payload.user_id));
  if (user && payload.password === passwordFingerprint(user)) return user;
}
