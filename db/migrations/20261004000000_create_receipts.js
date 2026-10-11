// Photos of receipts, attached to logs. The images are kept in the database
// with everything else, so there's no file storage to set up; the client
// shrinks photos to a few hundred KB before uploading them. Deleting a log
// deletes its receipts (ON DELETE CASCADE), and so does deleting the item or
// category the log belongs to, since that deletes the log.
export async function up(knex) {
  await knex.schema.createTable('receipts', (table) => {
    table.bigIncrements('id');
    table.bigInteger('log_id').notNullable().references('logs.id').onDelete('CASCADE');
    table.specificType('content_type', 'character varying').notNullable();
    table.binary('data').notNullable();
    table.timestamp('created_at', { useTz: false }).notNullable();
    table.timestamp('updated_at', { useTz: false }).notNullable();
    table.index('log_id', 'index_receipts_on_log_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTable('receipts');
}
