import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { createApp } from '../src/app.js'
import { openDb } from '../src/db.js'

export default async function request({ token }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-'))
  const dbPath = path.join(dir, 'board.db')
  const box = { db: openDb(dbPath) }
  const app = createApp(box.db, { token, dbPath, box })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
      try { box.db.close() } catch { /* already closed */ }
    }),
  }
}
