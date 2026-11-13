import Database from 'better-sqlite3'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TEXT,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS card_tags (
  card_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (card_id, tag_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL
);
`

export function openDb(filePath) {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  db.prepare(`INSERT INTO meta(key, value) VALUES ('kanban', '1') ON CONFLICT(key) DO NOTHING`).run()
  return db
}

export function fileIsKanbanBackup(filePath) {
  let db
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true })
    const row = db.prepare(`SELECT value FROM meta WHERE key = 'kanban'`).get()
    return row?.value === '1'
  } catch {
    return false
  } finally {
    db?.close()
  }
}

export function readSnapshot(db) {
  const revisionRow = db.prepare(`SELECT value FROM meta WHERE key = 'revision'`).get()
  const images = db.prepare(`SELECT id, comment_id, mime, bytes FROM images ORDER BY id`).all()
  return {
    revision: revisionRow ? Number(revisionRow.value) : 0,
    projects: db.prepare(`SELECT id, name, position FROM projects ORDER BY position, id`).all(),
    lists: db.prepare(`SELECT id, project_id AS projectId, name, position, hidden FROM lists ORDER BY position, id`).all()
      .map((row) => ({ ...row, hidden: Boolean(row.hidden) })),
    cards: db.prepare(`SELECT id, list_id AS listId, title, done, priority, due_at AS dueAt, position FROM cards ORDER BY position, id`).all()
      .map((row) => ({ ...row, done: Boolean(row.done) })),
    subtasks: db.prepare(`SELECT id, card_id AS cardId, title, done, position FROM subtasks ORDER BY position, id`).all()
      .map((row) => ({ ...row, done: Boolean(row.done) })),
    tags: db.prepare(`SELECT id, name FROM tags ORDER BY name, id`).all(),
    cardTags: db.prepare(`SELECT card_id AS cardId, tag_id AS tagId FROM card_tags ORDER BY card_id, tag_id`).all(),
    comments: db.prepare(`SELECT id, card_id AS cardId, body, created_at AS createdAt FROM comments ORDER BY created_at, id`).all(),
    images: images.map((row) => ({
      id: row.id,
      commentId: row.comment_id,
      mime: row.mime,
      dataBase64: Buffer.from(row.bytes).toString('base64'),
    })),
  }
}
