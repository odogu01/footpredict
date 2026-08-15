const mysql = require('mysql2/promise');
require('dotenv').config();

// Support full connection string (TiDB-style) or individual env vars.
function parseDatabaseUrl(url) {
  const m = /^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/.exec(url || '');
  if (!m) return null;
  return {
    host: m[3],
    port: parseInt(m[4], 10),
    user: m[1],
    password: m[2],
    database: m[5].split('?')[0],
  };
}

const fromUrl = parseDatabaseUrl(process.env.DATABASE_URL);

const host = process.env.DB_HOST || fromUrl?.host;
const port = process.env.DB_PORT || fromUrl?.port || 3306;
const user = process.env.DB_USER || fromUrl?.user;
const password = process.env.DB_PASSWORD || fromUrl?.password;
const database = process.env.DB_NAME || fromUrl?.database;

// TiDB Cloud requires TLS; also allow explicit opt-in via DB_SSL=true
const useSSL = process.env.DB_SSL === 'true' || (host || '').includes('tidbcloud.com');

const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.getConnection()
  .then(conn => {
    console.log('MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
  });

module.exports = pool;
