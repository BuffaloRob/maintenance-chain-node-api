// For verifying email addresses and signing in with Google:
// - users.email_verified_at: when the user showed the address was theirs
// - users.token_version: raising it revokes every token issued before
// - user_identities: the Google accounts users sign in with, by Google's id
//   for the account (its `sub`), which unlike its email address never changes
export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('email_verified_at', { useTz: false });
    table.integer('token_version').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('user_identities', (table) => {
    table.bigIncrements('id');
    table.bigInteger('user_id').notNullable().references('users.id');
    table.specificType('provider', 'character varying').notNullable();
    table.specificType('uid', 'character varying').notNullable();
    table.timestamp('created_at', { useTz: false }).notNullable();
    table.timestamp('updated_at', { useTz: false }).notNullable();
    table.unique(['provider', 'uid'], { indexName: 'index_user_identities_on_provider_and_uid' });
    table.index('user_id', 'index_user_identities_on_user_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTable('user_identities');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('email_verified_at');
    table.dropColumn('token_version');
  });
}
