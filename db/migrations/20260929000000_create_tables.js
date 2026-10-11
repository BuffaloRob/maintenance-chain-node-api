// The schema the Rails app's migrations (db/migrate) built, down to the index
// and foreign key names, so this API can also run against the Rails app's
// database. (Its db/schema.rb also lists a logs.active column, but no
// migration creates it and nothing used it.)
export async function up(knex) {
  // Pointed at the Rails app's database, the tables already exist.
  if (await knex.schema.hasTable('users')) return;

  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id');
    table.specificType('email', 'character varying');
    table.specificType('password_digest', 'character varying');
    timestamps(table);
  });

  await knex.schema.createTable('items', (table) => {
    table.bigIncrements('id');
    table.specificType('name', 'character varying');
    table.bigInteger('user_id').references('users.id').withKeyName('fk_rails_d4b6334db2');
    timestamps(table);
    table.index('user_id', 'index_items_on_user_id');
  });

  await knex.schema.createTable('categories', (table) => {
    table.bigIncrements('id');
    table.specificType('name', 'character varying');
    table.bigInteger('item_id').references('items.id').withKeyName('fk_rails_603f574b6b');
    timestamps(table);
    table.index('item_id', 'index_categories_on_item_id');
  });

  await knex.schema.createTable('logs', (table) => {
    table.bigIncrements('id');
    table.specificType('notes', 'character varying');
    table.specificType('tools', 'character varying');
    table.integer('cost');
    table.date('date_performed');
    table.date('date_due');
    timestamps(table);
    table.bigInteger('category_id').references('categories.id').withKeyName('fk_rails_ea512a86c0');
    table.index('category_id', 'index_logs_on_category_id');
  });
}

export async function down(knex) {
  // Nor are the Rails app's tables dropped. (Rails records its migrations in
  // schema_migrations.)
  if (await knex.schema.hasTable('schema_migrations')) return;

  for (const table of ['logs', 'categories', 'items', 'users']) {
    await knex.schema.dropTable(table);
  }
}

function timestamps(table) {
  table.timestamp('created_at', { useTz: false }).notNullable();
  table.timestamp('updated_at', { useTz: false }).notNullable();
}
