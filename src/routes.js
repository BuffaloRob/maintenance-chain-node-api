import { Router } from 'express';
import { authorized } from './auth.js';
import * as auth from './controllers/auth.js';
import * as categories from './controllers/categories.js';
import * as items from './controllers/items.js';
import * as logs from './controllers/logs.js';
import * as users from './controllers/users.js';
import { limitAuthAttempts } from './rate-limit.js';

// The Rails app's config/routes.rb, mounted at /api/v1.
const router = Router();

router.post('/signup', limitAuthAttempts, users.create);
router.post('/users', limitAuthAttempts, users.create);
router.post('/login', limitAuthAttempts, auth.create);

// Everything else needs a token.
router.use(authorized);

router.get('/users', users.index);
router.get('/user', users.profile);
router.get('/logout', users.logout);

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
