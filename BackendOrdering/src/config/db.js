require("dotenv").config({ path: process.env.DOTENV_PATH || ".env/.env" });
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  port:     process.env.DB_PORT     ? Number(process.env.DB_PORT) : 3306,
  user:     process.env.DB_USER     || "appuser",
  password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
  database: process.env.DB_NAME     || "logis_db",
  charset:  "utf8mb4",
  timezone: "+00:00",
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

pool.getConnection()
  .then((conn) => {
    conn.release();
    console.log("MySQL pool connected successfully.");
  })
  .catch((err) => {
    console.error("MySQL connection failed:", err.message);
  });

module.exports = pool;
