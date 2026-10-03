// copies this computer's database into one .sql file, ready to load into a cloud database
// run from the server folder: npm run db:export
// host uses MariaDB (many cPanel / Plesk plans)? npm run db:export -- --mariadb
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// project folder
const ROOT = path.resolve(__dirname, '..');
// read the database login from server/.env
require(require.resolve('dotenv', { paths: [path.join(ROOT, 'server')] })).config({ path: path.join(ROOT, 'server', '.env') });

// find mysqldump - MYSQLDUMP_PATH, the usual MySQL folders, or the system path
const MYSQLDUMP = [
  process.env.MYSQLDUMP_PATH,
  'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe',
  'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe',
  'mysqldump',
].find((candidate) => candidate && (candidate === 'mysqldump' || fs.existsSync(candidate)));

// the export goes to database-export/<database>-<date>.sql
const outDir = path.join(ROOT, 'database-export');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${process.env.DB_NAME}-${new Date().toISOString().slice(0, 10)}.sql`);

// no CREATE DATABASE line, so the file loads into whatever database the cloud gives you
const args = [
  `--host=${process.env.DB_HOST}`,
  `--port=${process.env.DB_PORT || 3306}`,
  `--user=${process.env.DB_USER}`,
  '--single-transaction',
  '--no-tablespaces',
  '--set-gtid-purged=OFF',
  '--hex-blob',
  '--default-character-set=utf8mb4',
  `--result-file=${outFile}`,
  process.env.DB_NAME,
];

// run mysqldump - the password is passed privately, not on the command line
const result = spawnSync(MYSQLDUMP, args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8' });
if (result.status !== 0) {
  console.error('Export failed:', (result.stderr || result.error?.message || '').trim());
  process.exit(1);
}
// MariaDB does not know MySQL 8's default text sorting rule - swap in one both understand
if (process.argv.includes('--mariadb')) {
  const sql = fs.readFileSync(outFile, 'utf8');
  fs.writeFileSync(outFile, sql.split('utf8mb4_0900_ai_ci').join('utf8mb4_unicode_ci'));
  console.log('Made MariaDB-friendly (utf8mb4_unicode_ci).');
}
// tell the user where the file is
const size = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`Database copied to ${path.relative(ROOT, outFile)} (${size} KB).`);
console.log('It holds real accounts and payment records - never commit or share this file.');
