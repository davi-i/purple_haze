/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('games', function(table) {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.string('password');
    table.boolean('can_enter_during_game').notNullable();
    table.enum('status', ['created', 'started', 'finished']).notNullable().defaultTo('created');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('games');
};
