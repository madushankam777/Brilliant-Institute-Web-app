// MySQL connection pool
const fs = require('fs');
const mysql = require('mysql2/promise');
const config = require('./env');

// encrypted connection for cloud databases (DB_SSL=true)
function sslOptions() {
  if (!config.db.ssl) return undefined;
  const options = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  const ca = config.db.sslCa;
  // pasted PEM text may arrive with "\n" written out instead of real line breaks
  if (ca.includes('BEGIN CERTIFICATE')) options.ca = ca.split('\\n').join('\n');
  else if (ca) options.ca = fs.readFileSync(ca, 'utf8');
  return options;
}

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: sslOptions(),
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  // Returns DATE/DATETIME columns as strings instead of JS Date objects
  dateStrings: true,
});

async function verifyDatabaseConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = { pool, verifyDatabaseConnection };
