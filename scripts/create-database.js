const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

loadEnv(path.join(__dirname, '..', '.env'));

const target = readTarget(process.env.DATABASE_URL);
if (!/^[A-Za-z0-9_]+$/.test(target.database)) {
  console.error('Database name can only contain letters, numbers and underscore');
  process.exit(1);
}

mysql
  .createConnection({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
  })
  .then(async (conn) => {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.end();
    console.log(`database ready: ${target.database} on ${target.host}:${target.port}`);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

function readTarget(raw) {
  if (!raw) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    console.error('DATABASE_URL has no database name');
    process.exit(1);
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
