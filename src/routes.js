import { Router } from 'express';
import { authorized, verified } from './auth.js';
import * as auth from './controllers/auth.js';
import * as categories from './controllers/categories.js';
import * as items from './controllers/items.js';
import * as logs from './controllers/logs.js';
import * as passwords from './controllers/passwords.js';
import * as users from './controllers/users.js';
import * as verification from './controllers/verification.js';
import {
  limitAuthAttempts,
  limitPasswordResetEmails,
  limitVerificationEmails,
} from './rate-limit.js';

// The Rails app's config/routes.rb, mounted at /api/v1.
const router = Router();

router.post('/signup', limitAuthAttempts, users.create);
router.post('/users', limitAuthAttempts, users.create);
router.post('/login', limitAuthAttempts, auth.create);
router.post('/auth/google', limitAuthAttempts, auth.google);
router.post('/verify_email', verification.verify);
router.post('/forgot_password', limitAuthAttempts, limitPasswordResetEmails, passwords.forgot);
router.post('/reset_password', limitAuthAttempts, passwords.reset);

// Everything else needs a token.
router.use(authorized);

router.get('/user', users.profile);
router.post('/logout', users.logout);
router.post('/resend_verification_email', limitVerificationEmails, verification.resend);

// And everything else a verified email address.
router.use(verified);

router.route('/items').get(items.index).post(items.create);
router
  .route('/items/:id')
  .get(items.show)
  .patch(items.update)
  .put(items.update)
  .delete(items.destroy);

router.route('/items/:item_id/categories').get(categories.index).post(categories.create);
router
  .route('/items/:item_id/categories/:id')
  .get(categories.show)
  .patch(categories.update)
  .put(categories.update)
  .delete(categories.destroy);

router.route('/items/:item_id/categories/:category_id/logs').get(logs.index).post(logs.create);
router
  .route('/items/:item_id/categories/:category_id/logs/:id')
  .get(logs.show)
  .patch(logs.update)
  .put(logs.update)
  .delete(logs.destroy);

router.get('/past_due', logs.pastDue);
router.get('/upcoming', logs.upcoming);

export default router;
