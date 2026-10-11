import config from './config.js';
import { signLinkToken, verifyLinkToken } from './link-tokens.js';
import { sendMail } from './mailer.js';
import * as User from './models/user.js';

const PURPOSE = 'email verification';

// How long the link in a verification email works.
const LINK_LIFETIME = '24h';

// Emails the user a link to the client's /verify-email page, which sends its
// token to POST /verify_email. The token names the address too, so it stops
// working if that changes.
export function sendVerificationEmail(user) {
  const token = signLinkToken(PURPOSE, { user_id: user.id, email: user.email }, LINK_LIFETIME);
  const link = `${config.clientUrl}/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: 'Verify your email address',
    text:
      'Please confirm that this is your email address for Maintenance Chain by opening this ' +
      `link in the next 24 hours:\n\n${link}\n\n` +
      "If you didn't sign up for Maintenance Chain, you can ignore this email.",
  });
}

// Marks the address in a link's token as verified. False if the token is
// invalid or expired, or names an address the user no longer has.
export async function verifyEmail(token) {
  const payload = verifyLinkToken(PURPOSE, token);
  const user = payload && (await User.find(payload.user_id));
  if (!user || user.email !== payload.email) return false;
  await User.markEmailVerified(user);
  return true;
}
