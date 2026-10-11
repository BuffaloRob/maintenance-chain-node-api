// Using the API takes a verified email address, but the users who signed up
// before there was any way to verify one are let off: they're all marked
// verified, once. Users who sign up from now on have to verify theirs.
export async function up(knex) {
  await knex('users')
    .whereNull('email_verified_at')
    .update({ email_verified_at: knex.fn.now(), updated_at: knex.fn.now() });
}

// Nothing to undo: the users who were let off can't be told apart from those
// who verified their address.
export async function down() {}
