require('dotenv').config({ path: process.env.DOTENV_PATH || '.env/.env' });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initDb() {
  const {
    DB_HOST = 'localhost',
    DB_PORT = 3306,
    DB_USER,
    DB_PASSWORD,
    DB_PASS,
    DB_NAME = 'logis_db',
  } = process.env;

  const password = DB_PASSWORD ?? DB_PASS ?? '';

  if (!DB_NAME) {
    throw new Error('DB_NAME is required to initialize the database');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
    throw new Error('DB_NAME should contain only letters, numbers, or underscores');
  }

  console.log(`Connecting to ${DB_HOST}:${DB_PORT} as ${DB_USER}...`);

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password,
    multipleStatements: true,
  });

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`Ensuring database "${DB_NAME}" exists...`);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${DB_NAME}\``);

    console.log('Running schema.sql (CREATE IF NOT EXISTS)...');
    await connection.query(schemaSql);
    console.log('Database is ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    await connection.end();
  }
}

// Run directly: `node src/config/initDb.js`
if (require.main === module) {
  initDb()
    .then(() => {
      console.log('Init finished.');
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = initDb;
