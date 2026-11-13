import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

export function shanghaiParts(now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return Object.fromEntries(fmt.formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function localDate(now) {
  const parts = shanghaiParts(now)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function shouldSendWeekly(now, lastSentDate) {
  const parts = shanghaiParts(now)
  if (parts.weekday !== 'Mon') return false
  if (Number(parts.hour) < 9) return false
  return lastSentDate !== localDate(now)
}

export function readSmtp(db) {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'smtp'`).get()
  if (!row) return null
  try {
    const cfg = JSON.parse(row.value)
    if (!cfg.host || !cfg.user || !cfg.pass || !cfg.to) return null
    return cfg
  } catch {
    return null
  }
}

export function copySmtpFrom(db, sourcePath) {
  if (readSmtp(db)) return { copied: false }
  if (!sourcePath || !fs.existsSync(sourcePath)) return { copied: false }
  let source
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    const row = source.prepare(`SELECT value FROM settings WHERE key = 'smtp'`).get()
    if (!row?.value) return { copied: false }
    db.prepare(`INSERT INTO meta(key, value) VALUES ('smtp', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(row.value)
    return { copied: true }
  } catch {
    return { copied: false }
  } finally {
    source?.close()
  }
}

export async function sendBackup({ db, dbPath, smtp, mailer, now }) {
  const cfg = smtp || readSmtp(db)
  if (!cfg || !cfg.host || !cfg.user || !cfg.pass || !cfg.to) return { skipped: true }
  const snapshotPath = snapshotFile(db, dbPath)
  try {
    await mailer.sendMail({
      from: cfg.from || cfg.user,
      to: cfg.to,
      subject: `[看板备份] ${localDate(now)}`,
      text: `看板数据备份 ${localDate(now)}`,
      attachments: [{ filename: 'board.db', path: snapshotPath }],
    })
    db.prepare(`INSERT INTO meta(key, value) VALUES ('last_backup_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(localDate(now))
    return { ok: true, sentTo: cfg.to }
  } finally {
    fs.rmSync(snapshotPath, { force: true })
  }
}

export function snapshotFile(db, dbPath) {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch (err) {
    console.error('[backup] checkpoint 失败:', err.message)
  }
  const dest = path.join(os.tmpdir(), `board-snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}.db`)
  fs.copyFileSync(dbPath, dest)
  return dest
}
