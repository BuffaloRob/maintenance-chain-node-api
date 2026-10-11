import { sendVerificationEmail, verifyEmail } from '../email-verification.js';
import { HttpError } from '../errors.js';

// POST /verify_email, with the token from a verification email's link.
export async function verify(req, res) {
  const { token } = req.body ?? {};
  if (typeof token !== 'string') throw new HttpError(400);
  if (!(await verifyEmail(token))) {
    return res.status(422).json({ message: 'This link is invalid or has expired' });
  }
  res.status(204).end();
}

// POST /resend_verification_email. Nothing to send once the address is verified.
export async function resend(req, res) {
  if (!req.currentUser.email_verified_at) await sendVerificationEmail(req.currentUser);
  res.status(204).end();
}
