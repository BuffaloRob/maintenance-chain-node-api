import { encodeToken } from '../auth.js';
import config from '../config.js';
import { HttpError } from '../errors.js';
import * as Google from '../google.js';
import * as User from '../models/user.js';
import { permit } from '../params.js';
import { serializeUser } from '../serializers.js';

// POST /login
export async function create(req, res) {
  const { email, password } = permit(req, 'user', ['email', 'password']);
  const user = await User.findByEmail(email);
  if (user && (await User.authenticate(user, password))) {
    return res.json({ user: await serializeUser(user), jwt: encodeToken(user) });
  }
  res.status(401).json({ message: 'Invalid email or password' });
}

// POST /auth/google, with the ID token Google's sign-in button gave the
// client (its `credential`). Signs up those who don't have an account yet.
export async function google(req, res) {
  if (!config.googleClientId) throw new HttpError(404);
  const { credential } = req.body ?? {};
  if (typeof credential !== 'string') throw new HttpError(400);

  const account = await Google.verifyIdToken(credential);
  if (!account) return res.status(401).json({ message: "Couldn't sign in with Google" });
  const { user, created } = await User.signInWith({ provider: 'google', ...account });
  res.status(created ? 201 : 200).json({ user: await serializeUser(user), jwt: encodeToken(user) });
}
