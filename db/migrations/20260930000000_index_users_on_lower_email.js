// Makes emails unique regardless of case, as the Rails app's uniqueness
// validation meant them to be; checking before inserting, as User.create does,
// can't stop two sign-ups that arrive at once. Run against the Rails app's
// database, this fails if two users there already share an email.
export async function up(knex) {
  await knex.raw('CREATE UNIQUE INDEX index_users_on_lower_email ON users (lower(email))');
}

export async function down(knex) {
  await knex.raw('DROP INDEX index_users_on_lower_email');
}
