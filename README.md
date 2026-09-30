# Maintenance Chain API (Node)

A Node.js/Express version of [maintenance_chain_api](https://github.com/BuffaloRob/maintenance_chain_api), the Rails API behind [maintenance-chain-client](https://github.com/BuffaloRob/maintenance-chain-client). It serves the same endpoints under `/api/v1`, accepts the same request bodies and returns the same JSON, so the client works with it unchanged. It also uses the same PostgreSQL schema, so it can run against the Rails app's database.

## Running it locally

You need Node 22 or later and PostgreSQL.

```sh
npm install
cp .env.example .env    # then set JWT_SECRET, e.g. to the output of `openssl rand -hex 32`
npm run db:create
npm run db:migrate
npm run dev             # serves http://localhost:3001/api/v1
```

To point the client at it, set `REACT_APP_API_URL=http://localhost:3001/api/v1` in the client's `.env`.

`npm test` runs the tests against a separate `maintenance_chain_node_api_test` database, which it creates and migrates first.

In production, run `npm start` with `NODE_ENV=production`, `DATABASE_URL` and `JWT_SECRET` set.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3001` | |
| `DATABASE_URL` | `postgres://localhost/maintenance_chain_node_api_development` | |
| `TEST_DATABASE_URL` | `postgres://localhost/maintenance_chain_node_api_test` | Used by `npm test` |
| `JWT_SECRET` | | Required. Signs login tokens. |
| `CORS_ORIGINS` | The Rails app's list | Comma-separated browser origins allowed to call the API |

## Endpoints

All paths are under `/api/v1`. Apart from signing up and logging in, requests need an `Authorization: Bearer <jwt>` header; without a valid one the response is a 401 with no body.

| Method | Path | |
| --- | --- | --- |
| `POST` | `/signup`, `/users` | Body `{ user: { email, password, password_confirmation } }` (confirmation optional). 201 `{ user, jwt }`, or 406 `{ error: "Sign Up has Failed" }` |
| `POST` | `/login` | Body `{ user: { email, password } }`. 202 `{ user, jwt }`, or 401 `{ message: "Invalid email or password" }` |
| `GET` | `/user` | 202 `{ user }` |
| `GET` | `/logout` | 204 |
| `GET` | `/users` | `{ message: "successful", status: 200 }` |
| `GET`, `POST` | `/items` | Items take `name` |
| `GET`, `PATCH`, `PUT`, `DELETE` | `/items/:id` | |
| `GET`, `POST` | `/items/:item_id/categories` | Categories take `name` (and `item_id` on update). Posting a name the item already has returns that category |
| `GET`, `PATCH`, `PUT`, `DELETE` | `/items/:item_id/categories/:id` | |
| `GET`, `POST` | `/items/:item_id/categories/:category_id/logs` | Logs take `notes`, `tools`, `cost`, `date_performed` and `date_due` (`YYYY-MM-DD`), and `category_id` on update |
| `GET`, `PATCH`, `PUT`, `DELETE` | `/items/:item_id/categories/:category_id/logs/:id` | |
| `GET` | `/past_due` | The latest log of each category, if it was due today or earlier |
| `GET` | `/upcoming` | The latest log of each category, if it's due in the next 30 days |

Request bodies can nest attributes under the resource name (`{ item: { name } }`) or send them bare (`{ name }`), as Rails' parameter wrapping allowed. Records come back the way the Rails serializers rendered them:

- user: `id`, `email`, `items` (each `id`, `name`)
- item: `id`, `name`, `user`, `categories`, `logs`
- category: `id`, `name`, `item_id`, `logs`, `item`
- log: `id`, `notes`, `tools`, `cost`, `date_performed`, `date_due`, `category_id`, `category`

Creating or updating a record returns it with a 200. A failed update returns its errors, also with a 200, e.g. `{ "category": ["must exist"] }`. Deleting returns a 204, and also deletes an item's categories and logs, or a category's logs. Unknown records are 404s, rendered as `{ "status": 404, "error": "Not Found" }`.

## Using the Rails app's database

Set `DATABASE_URL` to it and run `npm run db:migrate`, which sees the existing tables and leaves them alone. Existing passwords keep working, since both apps use bcrypt. Tokens the Rails app issued stay valid only if `JWT_SECRET` is the secret it signed them with (in `ApplicationController#encode_token`); otherwise people just log in again.

## Differences from the Rails API

- Records are private to their user. The Rails app let any logged-in user read, change or delete anyone's items, categories and logs by id; here those are 404s. Likewise an item can't be handed to another user (`user_id` is ignored), and moving a category or log to an item or category that isn't yours returns a `must exist` error.
- Missing records are 404s in the places where the Rails app raised 500s, such as listing the categories of an item that doesn't exist.
- `GET /items/:item_id/categories/:id` returns the category; the Rails app returned `null`.
- `/past_due` and `/upcoming` skip logs without a due date; the Rails app failed on them.
- Dates are read as `YYYY-MM-DD`, ignoring any time after them (as in an ISO timestamp); other formats are stored as empty. Rails guessed at more formats.
- Items and categories are listed in the order they were created; the Rails app left their order up to the database.
- The token secret comes from `JWT_SECRET` instead of being written into the code.
