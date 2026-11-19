import { readSnapshot } from './db.js'

function revision(db) {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'revision'`).get()
  return row ? Number(row.value) : 0
}

function setRevision(db, value) {
  db.prepare(`
    INSERT INTO meta(key, value) VALUES ('revision', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(value))
}

const TAG_STYLES = new Set(['blue', 'stone', 'moss', 'amber', 'rose', 'ink', 'focus', 'hot'])
const TAG_FONTS = new Set(['sans', 'song', 'kai', 'yuan', 'mono'])

function tagStyle(value) {
  return TAG_STYLES.has(value) ? value : 'blue'
}

function tagFont(value) {
  return TAG_FONTS.has(value) ? value : 'sans'
}

function nextPosition(db, sql, ...params) {
  const row = db.prepare(sql).get(...params)
  return row && row.max != null ? row.max + 1 : 0
}

function deleteCardTree(db, cardId) {
  db.prepare(`DELETE FROM images WHERE comment_id IN (SELECT id FROM comments WHERE card_id = ?)`).run(cardId)
  db.prepare(`DELETE FROM comments WHERE card_id = ?`).run(cardId)
  db.prepare(`DELETE FROM card_tags WHERE card_id = ?`).run(cardId)
  db.prepare(`DELETE FROM subtasks WHERE card_id = ?`).run(cardId)
  db.prepare(`DELETE FROM cards WHERE id = ?`).run(cardId)
}

function deleteListTree(db, listId) {
  const cards = db.prepare(`SELECT id FROM cards WHERE list_id = ?`).all(listId)
  for (const card of cards) deleteCardTree(db, card.id)
  db.prepare(`DELETE FROM lists WHERE id = ?`).run(listId)
}

function applyOne(db, op) {
  const p = op.payload || {}
  switch (op.type) {
    case 'project.create': {
      if (db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(p.id)) return
      const position = nextPosition(db, `SELECT MAX(position) AS max FROM projects`)
      db.prepare(`INSERT INTO projects(id, name, position) VALUES (?, ?, ?)`).run(p.id, p.name, position)
      return
    }
    case 'project.rename':
      db.prepare(`UPDATE projects SET name = ? WHERE id = ?`).run(p.name, p.id)
      return
    case 'project.delete': {
      const lists = db.prepare(`SELECT id FROM lists WHERE project_id = ?`).all(p.id)
      for (const list of lists) deleteListTree(db, list.id)
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(p.id)
      return
    }
    case 'list.create': {
      if (db.prepare(`SELECT 1 FROM lists WHERE id = ?`).get(p.id)) return
      const position = nextPosition(db, `SELECT MAX(position) AS max FROM lists WHERE project_id = ?`, p.projectId)
      db.prepare(`INSERT INTO lists(id, project_id, name, position, hidden) VALUES (?, ?, ?, ?, 0)`).run(p.id, p.projectId, p.name, position)
      return
    }
    case 'list.rename':
      db.prepare(`UPDATE lists SET name = ? WHERE id = ?`).run(p.name, p.id)
      return
    case 'list.hide':
      db.prepare(`UPDATE lists SET hidden = ? WHERE id = ?`).run(p.hidden ? 1 : 0, p.id)
      return
    case 'list.delete':
      deleteListTree(db, p.id)
      return
    case 'list.reorder': {
      const update = db.prepare(`UPDATE lists SET position = ? WHERE id = ? AND project_id = ?`)
      p.ids.forEach((id, index) => update.run(index, id, p.projectId))
      return
    }
    case 'card.create': {
      if (db.prepare(`SELECT 1 FROM cards WHERE id = ?`).get(p.id)) return
      const now = p.createdAt || new Date().toISOString()
      db.prepare(`UPDATE cards SET position = position + 1 WHERE list_id = ?`).run(p.listId)
      db.prepare(`
        INSERT INTO cards(id, list_id, title, done, priority, due_at, position, created_at, updated_at)
        VALUES (?, ?, ?, 0, 'normal', NULL, 0, ?, ?)
      `).run(p.id, p.listId, p.title, now, now)
      return
    }
    case 'card.patch': {
      const card = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(p.id)
      if (!card) throw new Error('missing card ' + p.id)
      db.prepare(`
        UPDATE cards SET title = ?, done = ?, priority = ?, due_at = ?, updated_at = ? WHERE id = ?
      `).run(
        p.title !== undefined ? p.title : card.title,
        p.done !== undefined ? (p.done ? 1 : 0) : card.done,
        p.priority !== undefined ? p.priority : card.priority,
        p.dueAt !== undefined ? p.dueAt : card.due_at,
        new Date().toISOString(),
        p.id,
      )
      return
    }
    case 'card.move': {
      const card = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(p.id)
      if (!card) throw new Error('missing card ' + p.id)
      const rows = db.prepare(`SELECT id FROM cards WHERE list_id = ? AND id != ? ORDER BY position, id`).all(p.listId, p.id)
      const ids = rows.map((row) => row.id)
      const index = Math.max(0, Math.min(p.index, ids.length))
      ids.splice(index, 0, p.id)
      const update = db.prepare(`UPDATE cards SET list_id = ?, position = ? WHERE id = ?`)
      ids.forEach((id, i) => update.run(p.listId, i, id))
      db.prepare(`UPDATE cards SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), p.id)
      const old = db.prepare(`SELECT id FROM cards WHERE list_id = ? ORDER BY position, id`).all(card.list_id)
      const fix = db.prepare(`UPDATE cards SET position = ? WHERE id = ?`)
      old.forEach((row, i) => fix.run(i, row.id))
      return
    }
    case 'card.delete':
      deleteCardTree(db, p.id)
      return
    case 'subtask.create': {
      const position = nextPosition(db, `SELECT MAX(position) AS max FROM subtasks WHERE card_id = ?`, p.cardId)
      db.prepare(`INSERT INTO subtasks(id, card_id, title, done, position) VALUES (?, ?, ?, 0, ?)`).run(p.id, p.cardId, p.title, position)
      return
    }
    case 'subtask.patch': {
      const row = db.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(p.id)
      if (!row) throw new Error('missing subtask ' + p.id)
      db.prepare(`UPDATE subtasks SET title = ?, done = ? WHERE id = ?`).run(
        p.title !== undefined ? p.title : row.title,
        p.done !== undefined ? (p.done ? 1 : 0) : row.done,
        p.id,
      )
      return
    }
    case 'subtask.delete':
      db.prepare(`DELETE FROM subtasks WHERE id = ?`).run(p.id)
      return
    case 'tag.create':
      if (db.prepare(`SELECT 1 FROM tags WHERE id = ?`).get(p.id)) return
      db.prepare(`INSERT INTO tags(id, name, style, font) VALUES (?, ?, ?, ?)`).run(
        p.id, p.name, tagStyle(p.style), tagFont(p.font),
      )
      return
    case 'tag.patch': {
      const tag = db.prepare(`SELECT * FROM tags WHERE id = ?`).get(p.id)
      if (!tag) throw new Error('missing tag ' + p.id)
      db.prepare(`UPDATE tags SET style = ?, font = ? WHERE id = ?`).run(
        p.style !== undefined ? tagStyle(p.style) : tag.style,
        p.font !== undefined ? tagFont(p.font) : tag.font,
        p.id,
      )
      return
    }
    case 'tag.delete':
      db.prepare(`DELETE FROM card_tags WHERE tag_id = ?`).run(p.id)
      db.prepare(`DELETE FROM tags WHERE id = ?`).run(p.id)
      return
    case 'card.setTags': {
      db.prepare(`DELETE FROM card_tags WHERE card_id = ?`).run(p.cardId)
      const insert = db.prepare(`INSERT INTO card_tags(card_id, tag_id) VALUES (?, ?)`)
      for (const tagId of p.tagIds) insert.run(p.cardId, tagId)
      return
    }
    case 'comment.create': {
      const createdAt = p.createdAt || new Date().toISOString()
      db.prepare(`INSERT INTO comments(id, card_id, body, created_at) VALUES (?, ?, ?, ?)`).run(p.id, p.cardId, p.body, createdAt)
      const insert = db.prepare(`INSERT INTO images(id, comment_id, mime, bytes) VALUES (?, ?, ?, ?)`)
      for (const image of p.images || []) {
        insert.run(image.id, p.id, image.mime, Buffer.from(image.dataBase64, 'base64'))
      }
      return
    }
    case 'comment.delete':
      db.prepare(`DELETE FROM images WHERE comment_id = ?`).run(p.id)
      db.prepare(`DELETE FROM comments WHERE id = ?`).run(p.id)
      return
    default:
      throw new Error('unknown op ' + op.type)
  }
}

export function applyOp(db, op) {
  const run = db.transaction(() => {
    applyOne(db, op)
    const next = revision(db) + 1
    setRevision(db, next)
    return { revision: next }
  })
  return run()
}

export function applyOps(db, ops) {
  const run = db.transaction(() => {
    let next = revision(db)
    for (const op of ops) {
      applyOne(db, op)
      next += 1
      setRevision(db, next)
    }
    return next
  })
  const next = run()
  return { revision: next, snapshot: readSnapshot(db) }
}
