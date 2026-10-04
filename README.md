# Maintenance Chain API (Node)

A Node.js/Express version of [maintenance_chain_api](https://github.com/BuffaloRob/maintenance_chain_api), the Rails API behind [maintenance-chain-client](https://github.com/BuffaloRob/maintenance-chain-client). It serves the same endpoints under `/api/v1`, accepts the same request bodies and returns the same JSON, but with standard HTTP status codes and tokens that expire; [Differences from the Rails API](#differences-from-the-rails-api) lists what a client of the Rails API has to change. It also uses the same PostgreSQL schema, so it can run against the Rails app's database.

## Running it locally

You need Node 22 or later (`.nvmrc` pins 24, the current LTS) and PostgreSQL.

```sh
npm install
cp .env.example .env    # then set JWT_SECRET to the output of `openssl rand -hex 32`
npm run db:create
npm run db:migrate
npm run dev             # serves http://localhost:3001/api/v1
```

To point the client at it, set `REACT_APP_API_URL=http://localhost:3001/api/v1` in the client's `.env`.

Without `SMTP_URL`, emails such as the verification email sent on signing up, or a password reset email, are printed to the console instead, link included. Signing in with Google needs `GOOGLE_CLIENT_ID` (see [Signing in with Google](#signing-in-with-google)).

`npm test` runs the tests against a separate `maintenance_chain_node_api_test` database, which it creates and migrates first. `npm run lint` checks the code with ESLint, and `npm run format` formats it with Prettier (`npm run format:check` only checks). On every pull request and push to `master`, CI runs both checks and the tests, on Node 22 and 24.

In production, run `npm start` with `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `SMTP_URL`, `MAIL_FROM` and `CLIENT_URL` set, and `GOOGLE_CLIENT_ID` to allow signing in with Google. The server won't start without the email settings.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3001` | |
| `DATABASE_URL` | `postgres://localhost/maintenance_chain_node_api_development` | |
| `TEST_DATABASE_URL` | `postgres://localhost/maintenance_chain_node_api_test` | Used by `npm test` |
| `JWT_SECRET` | | Required, at least 32 characters. Signs login tokens and the links in emails. |
| `SMTP_URL` | | Required in production. The SMTP server emails go through, e.g. `smtps://user:password@smtp.example.com`. Without it, emails are printed to the console |
| `MAIL_FROM` | `Maintenance Chain <no-reply@localhost>` | Required in production. The emails' sender |
| `CLIENT_URL` | `http://localhost:3005` | Required in production. The client's address, which links in emails point to |
| `GOOGLE_CLIENT_ID` | | The OAuth client ID of the app's Google Cloud project. Without it, `POST /auth/google` is a 404 |
| `CORS_ORIGINS` | The Rails app's list | Comma-separated browser origins allowed to call the API |
| `TRUST_PROXY` | | Behind a proxy or load balancer, how many there are (e.g. `1`) or their addresses, so rate limiting sees each client's IP |

## Endpoints

All paths are under `/api/v1`. Apart from signing up, logging in, verifying an email address and resetting a password, requests need an `Authorization: Bearer <jwt>` header; without a valid one the response is a 401 with no body. Users who haven't verified their email address get a 403 `{ message: "Please verify your email address" }` from everything but `GET /user`, `POST /logout` and `POST /resend_verification_email` (see [Verifying email addresses](#verifying-email-addresses)). Tokens expire 30 days after they're issued, and then the client has to log in again. They're also revoked when the user resets their password, or a Google account is linked to a user whose email address wasn't verified (see [Signing in with Google](#signing-in-with-google)).

Signing up, logging in (with a password or Google), asking for a password reset and resetting a password share a limit of 10 attempts per IP address every 15 minutes. Asking for another verification email is limited to 5 times per user an hour, and for a password reset email to 5 times per address an hour. Past these limits requests are 429s, with a `Retry-After` header giving the seconds to wait.

| Method | Path | |
| --- | --- | --- |
| `POST` | `/signup`, `/users` | Body `{ user: { email, password, password_confirmation } }` (confirmation optional). 201 `{ user, jwt }`, or 422 `{ error: "Sign Up has Failed" }`. Emails the user a link to verify their address |
| `POST` | `/login` | Body `{ user: { email, password } }`. 200 `{ user, jwt }`, or 401 `{ message: "Invalid email or password" }` |
| `POST` | `/auth/google` | Body `{ credential }`: the ID token from Google's sign-in button. 200 `{ user, jwt }`, or 201 for a new user, or 401 `{ message: "Couldn't sign in with Google" }` |
| `POST` | `/verify_email` | Body `{ token }`, from the link in a verification email. 204, or 422 `{ message: "This link is invalid or has expired" }` |
| `POST` | `/resend_verification_email` | 204. Emails the user another link, unless their address is already verified |
| `POST` | `/forgot_password` | Body `{ email }`. 204, and emails the account with that address, if there is one, a link to reset its password |
| `POST` | `/reset_password` | Body `{ token, password, password_confirmation }` (confirmation optional), with the token from the link. 200 `{ user, jwt }`, or 422 `{ message }`: `"This link is invalid or has expired"`, or what's wrong with the password |
| `GET` | `/user` | `{ user }` |
| `POST` | `/logout` | 204. The server keeps no sessions; the client discards its token |
| `GET`, `POST` | `/items` | Items take `name` |
| `GET`, `PATCH`, `PUT`, `DELETE` | `/items/:id` | |
| `GET`, `POST` | `/items/:item_id/categories` | Categories take `name` (and `item_id` on update). Posting a name the item already has returns that category, with a 200 |
| `GET`, `PATCH`, `PUT`, `DELETE` | `/items/:item_id/categories/:id` | |
| `GET`, `POST` | `/items/:item_id/categories/:category_id/logs` | Logs take `notes`, `tools`, `cost`, `date_performed` and `date_due` (`YYYY-MM-DD`), and `category_id` on update |
| `GET`, `PATCH`, `PUT`, `DELETE` | `/items/:item_id/categories/:category_id/logs/:id` | |
| `GET` | `/past_due` | The latest log of each category, if it was due today or earlier |
| `GET` | `/upcoming` | The latest log of each category, if it's due in the next 30 days |

Request bodies can nest attributes under the resource name (`{ item: { name } }`) or send them bare (`{ name }`), as Rails' parameter wrapping allowed. Records come back the way the Rails serializers rendered them:

- user: `id`, `email`, `email_verified`, `items` (each `id`, `name`)
- item: `id`, `name`, `user`, `categories`, `logs`
- category: `id`, `name`, `item_id`, `logs`, `item`
- log: `id`, `notes`, `tools`, `cost`, `date_performed`, `date_due`, `category_id`, `category`

Creating a record returns it with a 201, and updating one returns it with a 200. A failed update returns its errors with a 422, e.g. `{ "category": ["must exist"] }`. Deleting returns a 204, and also deletes an item's categories and logs, or a category's logs. Unknown records are 404s, rendered as `{ "status": 404, "error": "Not Found" }`; malformed bodies and values too big for their column are 400s, rendered the same way.

## Verifying email addresses

Signing up emails the user a link to the client's `/verify-email?token=…` page, which sends the token to `POST /verify_email`. Links work for 24 hours and can be used more than once; `POST /resend_verification_email` sends a new one. A user's `email_verified` says whether they've used one.

Until they verify it, users can log in, see their profile, log out and ask for another email, but every other request is a 403 `{ message: "Please verify your email address" }`. Once they've verified it, the token they have works for the rest of the API too.

Users who signed up before verification existed were let off: a migration marked them all verified. Users who sign up with Google are verified from the start.

## Resetting passwords

`POST /forgot_password` emails the account with the given address, whichever way it's capitalized, a link to the client's `/reset-password?token=…` page, which sends the token and the new password to `POST /reset_password`. It answers the same whether or not there's an account, and without waiting for the email to go, so it doesn't tell anyone which addresses have one.

Links work for an hour, and once: the token names the password it was sent for, so it stops working when that changes. Resetting the password logs the user in, revokes their other tokens and verifies their email address, since the link went to it. Users who signed up with Google can use it to give themselves a password.

## Signing in with Google

The client shows Google's sign-in button, which gives it an ID token for the user's Google account, and sends that to `POST /auth/google`. The API checks that Google signed the token for this app's client ID, and that Google has verified the account's email address. Then it logs in:

- the user that Google account was linked to before, even if its address has changed since;
- otherwise the user with that address, linking the Google account to them;
- otherwise a new user with that address, already verified and with no password. Logging in with a password never works for them.

When the user with that address hadn't verified it, linking also deletes their password and revokes their tokens. Anyone could have signed up with that address, so the password may not be its owner's, and Google has just shown that this person is the owner. The user keeps their data, and logs in with Google, or can give themselves a new password with a [password reset](#resetting-passwords).

To set it up, in the [Google Cloud console](https://console.cloud.google.com/auth/clients):

1. Create a project, and fill in the app's name and support email under Google Auth Platform → Branding.
2. Under Clients, create an OAuth client of type Web application. Add the client's origins under Authorized JavaScript origins: `https://maintenancechain.surge.sh` (Google requires HTTPS outside localhost), and `http://localhost` plus `http://localhost:3005` to develop. No redirect URIs are needed.
3. Under Audience, publish the app. It only asks for the user's email address and profile, so Google doesn't need to review it.
4. Set `GOOGLE_CLIENT_ID` here and `VITE_GOOGLE_CLIENT_ID` in the client to the client ID (it isn't secret).

## Using the Rails app's database

Set `DATABASE_URL` to it and run `npm run db:migrate`. The first migration sees the existing tables and leaves them alone (and `npm run db:rollback` won't drop them). The second adds a unique index on lowercased emails, so it fails if two users there share an email, ignoring case, until one of them is changed. The third adds the columns and table for verifying emails and signing in with Google, and the fourth marks every user already there as verified, so they can carry on without verifying their address.

Existing passwords keep working, since both apps use bcrypt, but everyone has to log in again. Don't set `JWT_SECRET` to the Rails app's secret to keep its tokens working: that secret is in the Rails app's public repository, so anyone could use it to sign a token for any user. (The Rails app's tokens never expired, so they're turned away regardless.)

## Differences from the Rails API

A client of the Rails API has to allow for these:

- Status codes are the standard ones. Creating a record is a 201 (except posting a category name the item already has, a 200), a failed update is a 422 rather than a 200, a failed sign-up is a 422 rather than a 406, and logging in and `GET /user` are 200s rather than 202s.
- Logging out is `POST /logout` rather than `GET`. `GET /users`, which only answered `{ message: "successful", status: 200 }`, is gone.
- Tokens expire after 30 days, and the Rails app's tokens aren't accepted.
- Signing up and logging in are rate limited.
- Users who sign up have to verify their email address before they can use anything but `GET /user`, `POST /logout` and `POST /resend_verification_email`; until then the rest are 403s. Users' `email_verified` says whether they have, and signing up emails them a link.

Signing in with Google and resetting passwords are new, and a client of the Rails API can ignore them.

The rest are fixes:

- Records are private to their user. The Rails app let any logged-in user read, change or delete anyone's items, categories and logs by id; here those are 404s. Likewise an item can't be handed to another user (`user_id` is ignored), and moving a category or log to an item or category that isn't yours returns a `must exist` error.
- Missing records are 404s in the places where the Rails app raised 500s, such as listing the categories of an item that doesn't exist.
- Values too big for their column, such as a `cost` over 2147483647, are 400s; the Rails app raised 500s.
- Emails are unique even when two sign-ups with the same one arrive at once; the Rails app could create both.
- `GET /items/:item_id/categories/:id` returns the category; the Rails app returned `null`.
- `/past_due` and `/upcoming` skip logs without a due date; the Rails app failed on them.
- Dates are read as `YYYY-MM-DD`, ignoring any time after them (as in an ISO timestamp); other formats are stored as empty. Rails guessed at more formats.
- Items and categories are listed in the order they were created; the Rails app left their order up to the database.
- The token secret comes from `JWT_SECRET` instead of being written into the code.
