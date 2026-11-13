import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { createApp } from './src/app.js'
import { openDb } from './src/db.js'
import { copySmtpFrom, readSmtp, sendBackup, shouldSendWeekly } from './src/backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 3002)
const token = process.env.KANBAN_TOKEN || ''
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'board.db')

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const box = { db: openDb(dbPath) }
  copySmtpFrom(box.db, process.env.BOOKKEEPING_DB || '/root/projects/bookkeeping/data/zhangben.db')
  const app = createApp(box.db, { token, dbPath, box })
  app.listen(port, () => {
    console.log(`看板服务已启动：http://127.0.0.1:${port}`)
  })
  setInterval(() => {
    const row = box.db.prepare(`SELECT value FROM meta WHERE key = 'last_backup_date'`).get()
    const now = new Date()
    if (!shouldSendWeekly(now, row?.value || '')) return
    const smtp = readSmtp(box.db)
    const mailer = smtp
      ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port || 465,
        secure: smtp.port ? Number(smtp.port) === 465 : true,
        auth: { user: smtp.user, pass: smtp.pass },
      })
      : null
    sendBackup({ db: box.db, dbPath, smtp, mailer, now })
      .then((result) => console.log('[backup]', result))
      .catch((err) => console.error('[backup] 失败:', err.message))
  }, 60 * 1000)
}
