import { encodeToken } from '../auth.js';
import { sendVerificationEmail } from '../email-verification.js';
import * as User from '../models/user.js';
import { permit } from '../params.js';
import { serializeUser } from '../serializers.js';

// POST /signup and POST /users
export async function create(req, res) {
  const attributes = permit(req, 'user', ['email', 'password', 'password_confirmation'], {
    wrap: User.COLUMNS,
  });
  const user = await User.create(attributes);
  if (!user) return res.status(422).json({ error: 'Sign Up has Failed' });
  // The account exists either way, and the user can ask for another email.
  await sendVerificationEmail(user).catch((error) => console.error(error));
  res.status(201).json({ user: await serializeUser(user), jwt: encodeToken(user) });
}

// GET /user
export async function profile(req, res) {
  res.json({ user: await serializeUser(req.currentUser) });
}

// POST /logout. Nothing to do on the server; the client discards its token.
export function logout(req, res) {
  res.status(204).end();
}
