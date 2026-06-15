/**
 * seed.js
 *
 * Seeds the database with:
 *  - All PSA definitions from psaList.js
 *  - A default GM user (username: gm, password: changeme)
 *
 * Run with: node server/db/seed.js
 * Safe to run multiple times — uses INSERT OR IGNORE.
 */

require('dotenv').config();
const db      = require('./db');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { PSA_LIST } = require('../lib/psaList');

function seed() {
  console.log('Seeding PSA definitions...');
  const insertPsa = db.prepare(`
    INSERT OR IGNORE INTO psa_definitions (id, name, description, min_rank)
    VALUES (@id, @name, @description, @min_rank)
  `);
  const seedPsas = db.transaction(() => {
    for (const psa of PSA_LIST) {
      insertPsa.run(psa);
    }
  });
  seedPsas();
  console.log(`  ${PSA_LIST.length} PSAs inserted/verified.`);

  console.log('Seeding default GM user...');
  const existingGm = db.prepare('SELECT id FROM users WHERE username = ?').get('gm');
  if (!existingGm) {
    const hash = bcrypt.hashSync('changeme', 10);
    const gmId = uuid();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role)
      VALUES (?, ?, ?, 'gm')
    `).run(gmId, 'gm', hash);
    console.log('  Default GM created. Username: gm / Password: changeme');
    console.log('  !! Change this password immediately after first login !!');
  } else {
    console.log('  GM user already exists, skipping.');
  }

  console.log('Seed complete.');
}

seed();
