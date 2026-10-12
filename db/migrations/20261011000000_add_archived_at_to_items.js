// When an item was archived, or NULL while it's in use. Archived items keep
// their categories and logs, but are left out of /past_due and /upcoming.
export async function up(knex) {
  await knex.schema.alterTable('items', (table) => {
    table.timestamp('archived_at', { useTz: false });
  });
}

export async function down(knex) {
  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('archived_at');
  });
}
