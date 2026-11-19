import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { fileIsKanbanBackup, openDb, readSnapshot } from './db.js'
import { applyOps } from './ops.js'
import nodemailer from 'nodemailer'
import { readSmtp, sendBackup, snapshotFile } from './backup.js'

export function createApp(db, options) {
  const state = options.box || { db }
  state.db = db
  const app = express()
  const token = options.token

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.use((req, res, next) => {
    const header = req.headers.authorization || ''
    const match = header.match(/^Bearer\s+(.+)$/)
    if (!match || match[1] !== token) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  })

  app.use(express.json({ limit: '30mb' }))

  app.get('/api/snapshot', (req, res) => {
    res.json(readSnapshot(state.db))
  })

  app.post('/api/ops', (req, res) => {
    try {
      res.json(applyOps(state.db, req.body?.ops || []))
    } catch (err) {
      res.status(400).json({ error: 'bad_op', message: err.message })
    }
  })

  app.get('/api/backup', (req, res) => {
    const file = snapshotFile(state.db, options.dbPath)
    res.download(file, 'board.db', () => {
      fs.rmSync(file, { force: true })
    })
  })

  app.post('/api/backup', async (req, res) => {
    try {
      const smtp = readSmtp(state.db)
      const mailer = options.mailer || (smtp
        ? nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port || 465,
          secure: smtp.port ? Number(smtp.port) === 465 : true,
          auth: { user: smtp.user, pass: smtp.pass },
        })
        : null)
      const result = await sendBackup({
        db: state.db,
        dbPath: options.dbPath,
        smtp,
        mailer,
        now: new Date(),
      })
      if (result.skipped) {
        res.status(400).json({ error: 'no_smtp' })
        return
      }
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: 'backup_failed', message: err.message })
    }
  })

  app.post('/api/import', express.raw({ type: 'application/octet-stream', limit: '80mb' }), (req, res) => {
    const temp = path.join(os.tmpdir(), `kanban-import-${Date.now()}-${Math.random().toString(16).slice(2)}.db`)
    try {
      fs.writeFileSync(temp, req.body)
      if (!fileIsKanbanBackup(temp)) {
        res.status(400).json({ error: 'bad_backup' })
        return
      }
      state.db.close()
      for (const extra of ['-wal', '-shm']) fs.rmSync(options.dbPath + extra, { force: true })
      fs.copyFileSync(temp, options.dbPath)
      state.db = openDb(options.dbPath)
      res.json(readSnapshot(state.db))
    } finally {
      fs.rmSync(temp, { force: true })
    }
  })

  return app
}
