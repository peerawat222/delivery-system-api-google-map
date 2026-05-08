require('dotenv').config({ path: process.env.DOTENV_PATH || '.env/.env' });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function resetDb() {
  const {
    DB_HOST = 'localhost',
    DB_PORT = 3306,
    DB_USER,
    DB_PASSWORD,
    DB_PASS,
    DB_NAME = 'logis_db',
  } = process.env;

  const password = DB_PASSWORD ?? DB_PASS ?? '';

  if (!DB_NAME || !/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
    throw new Error('DB_NAME is invalid');
  }

  console.log(`⚠️  Resetting database "${DB_NAME}" — ALL DATA WILL BE DELETED`);

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

    await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await connection.query(
      `CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${DB_NAME}\``);
    await connection.query(schemaSql);
    console.log('Database reset complete.');
  } catch (err) {
    console.error('Reset failed:', err);
    throw err;
  } finally {
    await connection.end();
  }
}

resetDb()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
