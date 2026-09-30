import { encodeToken } from '../auth.js';
import * as User from '../models/user.js';
import { permit } from '../params.js';
import { serializeUser } from '../serializers.js';

// POST /login
export async function create(req, res) {
  const { email, password } = permit(req, 'user', ['email', 'password']);
  const user = await User.findByEmail(email);
  if (user && (await User.authenticate(user, password))) {
    return res.status(202).json({ user: await serializeUser(user), jwt: encodeToken(user) });
  }
  res.status(401).json({ message: 'Invalid email or password' });
}
