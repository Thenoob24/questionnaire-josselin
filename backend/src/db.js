const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'answers.sqlite');

// S'assurer que le dossier cible existe bien
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Activation du mode WAL pour de meilleures performances en lecture/écriture
db.pragma('journal_mode = WAL');

// Initialisation de la table des réponses avec colonnes likes et dislikes
db.exec(`
  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0
  );
`);

// Migration automatique au cas où la table existait déjà sans likes ou dislikes
const tableInfo = db.pragma('table_info(answers)');
const columnNames = tableInfo.map((col) => col.name);
if (!columnNames.includes('likes')) {
  db.exec('ALTER TABLE answers ADD COLUMN likes INTEGER DEFAULT 0');
}
if (!columnNames.includes('dislikes')) {
  db.exec('ALTER TABLE answers ADD COLUMN dislikes INTEGER DEFAULT 0');
}

const stmtCount = db.prepare('SELECT COUNT(*) AS count FROM answers');
const stmtList = db.prepare(`
  SELECT id, author, body, created_at AS createdAt, COALESCE(likes, 0) AS likes, COALESCE(dislikes, 0) AS dislikes
  FROM answers
  ORDER BY id DESC
`);
const stmtInsert = db.prepare(`
  INSERT INTO answers (author, body, created_at, likes, dislikes)
  VALUES (?, ?, ?, 0, 0)
`);
const stmtGetById = db.prepare(`
  SELECT id, author, body, created_at AS createdAt, COALESCE(likes, 0) AS likes, COALESCE(dislikes, 0) AS dislikes
  FROM answers
  WHERE id = ?
`);

function getAnswersCount() {
  const row = stmtCount.get();
  return row ? row.count : 0;
}

function getAnswers() {
  return stmtList.all();
}

function addAnswer(author, body) {
  const createdAt = new Date().toISOString();
  const info = stmtInsert.run(author, body, createdAt);
  return stmtGetById.get(info.lastInsertRowid);
}

function voteAnswer(id, type, previous) {
  let deltaLikes = 0;
  let deltaDislikes = 0;

  // Si l'utilisateur retire ou change son précédent vote
  if (previous === 'like') deltaLikes -= 1;
  if (previous === 'dislike') deltaDislikes -= 1;

  // Si l'utilisateur applique un nouveau vote
  if (type === 'like') deltaLikes += 1;
  if (type === 'dislike') deltaDislikes += 1;

  const stmtVote = db.prepare(`
    UPDATE answers
    SET likes = MAX(0, COALESCE(likes, 0) + ?),
        dislikes = MAX(0, COALESCE(dislikes, 0) + ?)
    WHERE id = ?
  `);

  stmtVote.run(deltaLikes, deltaDislikes, id);
  return stmtGetById.get(id);
}

module.exports = {
  db,
  getAnswersCount,
  getAnswers,
  addAnswer,
  voteAnswer,
};
