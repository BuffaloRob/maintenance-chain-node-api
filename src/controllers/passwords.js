import { encodeToken } from '../auth.js';
import { HttpError } from '../errors.js';
import * as User from '../models/user.js';
import { sendPasswordResetEmail, userForResetToken } from '../password-reset.js';
import { serializeUser } from '../serializers.js';

const INVALID_LINK = 'This link is invalid or has expired';

// POST /forgot_password, with the address of the account. The answer is the
// same whether or not there's one, and comes without waiting for the email to
// go, so it doesn't tell anyone asking which addresses have accounts.
export async function forgot(req, res) {
  const { email } = req.body ?? {};
  if (typeof email !== 'string') throw new HttpError(400);
  const user = await User.findByEmailIgnoringCase(email);
  if (user) sendPasswordResetEmail(user).catch((error) => console.error(error));
  res.status(204).end();
}

// POST /reset_password, with the token from a reset email's link and the new
// password. Logs the user in, like POST /login.
export async function reset(req, res) {
  const { token, password, password_confirmation } = req.body ?? {};
  if (typeof token !== 'string') throw new HttpError(400);
  const user = await userForResetToken(token);
  if (!user) return res.status(422).json({ message: INVALID_LINK });
  const error = User.passwordError(password, password_confirmation);
  if (error) return res.status(422).json({ message: error });

  const updated = await User.resetPassword(user, password);
  if (!updated) return res.status(422).json({ message: INVALID_LINK });
  res.json({ user: await serializeUser(updated), jwt: encodeToken(updated) });
}
