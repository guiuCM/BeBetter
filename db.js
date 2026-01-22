const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbFile = path.resolve(__dirname, 'data.sqlite');
const migrationsDir = path.resolve(__dirname, 'migrations');

function runMigrations() {
  const db = new Database(dbFile);
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  files.sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      db.exec(sql);
      console.log('Applied', file);
    } catch (e) {
      console.warn('Skipping migration', file, e.message);
    }
  }
  db.close();
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations, dbFile };
