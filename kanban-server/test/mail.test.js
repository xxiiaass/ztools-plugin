import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import Database from 'better-sqlite3'
import { openDb } from '../src/db.js'
import { sendBackup, shouldSendWeekly } from '../src/backup.js'

function shanghai(iso) {
  return new Date(iso)
}

test('周一 08:59 不发，09:00 发一次，同一天再检查不发', () => {
  assert.equal(shouldSendWeekly(shanghai('2026-11-16T00:59:00Z'), ''), false)
  assert.equal(shouldSendWeekly(shanghai('2026-11-16T01:00:00Z'), ''), true)
  assert.equal(shouldSendWeekly(shanghai('2026-11-16T02:00:00Z'), '2026-11-16'), false)
})

test('没有 smtp 不调用 mailer', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-mail-'))
  const db = openDb(path.join(dir, 'board.db'))
  let called = 0
  const result = await sendBackup({
    db,
    dbPath: path.join(dir, 'board.db'),
    smtp: null,
    mailer: { sendMail() { called += 1 } },
    now: new Date('2026-11-16T01:00:00Z'),
  })
  assert.deepEqual(result, { skipped: true })
  assert.equal(called, 0)
  db.close()
})

test('发信只附一个 board.db，并记下当天', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-mail-'))
  const dbPath = path.join(dir, 'board.db')
  const db = openDb(dbPath)
  let message
  const result = await sendBackup({
    db,
    dbPath,
    smtp: { host: 'smtp.example', port: 465, user: 'a', pass: 'b', from: 'a', to: 'me@example.com' },
    mailer: { async sendMail(msg) { message = msg } },
    now: new Date('2026-11-16T01:00:00Z'),
  })
  assert.equal(result.ok, true)
  assert.equal(message.attachments.length, 1)
  assert.equal(message.attachments[0].filename, 'board.db')
  assert.equal(db.prepare(`SELECT value FROM meta WHERE key = 'last_backup_date'`).get().value, '2026-11-16')
  db.close()
})

test('本库没有 smtp 时从记账库复制', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-smtp-'))
  const sourcePath = path.join(dir, 'zhangben.db')
  const source = new Database(sourcePath)
  source.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`)
  source.prepare(`INSERT INTO settings(key, value) VALUES ('smtp', ?)`).run(JSON.stringify({ host: 'h', user: 'u', pass: 'p', to: 't' }))
  source.close()
  const db = openDb(path.join(dir, 'board.db'))
  const { copySmtpFrom } = await import('../src/backup.js')
  const copied = copySmtpFrom(db, sourcePath)
  assert.equal(copied.copied, true)
  assert.equal(JSON.parse(db.prepare(`SELECT value FROM meta WHERE key = 'smtp'`).get().value).host, 'h')
  db.close()
})
