import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, readFileSync } from 'node:fs'
import request from './helpers.js'

const auth = { authorization: 'Bearer secret' }

function cardCreate(id, title) {
  return { id, type: 'card.create', payload: { id, listId: 'l', title } }
}

async function postOp(ctx, op) {
  const res = await fetch(ctx.base + '/api/ops', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ ops: [op] }),
  })
  assert.equal(res.status, 200)
  return res.json()
}

async function getSnapshot(ctx) {
  const res = await fetch(ctx.base + '/api/snapshot', { headers: auth })
  assert.equal(res.status, 200)
  return res.json()
}

test('导入替换全部卡片，坏文件不改原库', async () => {
  const ctx = await request({ token: 'secret' })
  try {
  await postOp(ctx, cardCreate('k', '旧卡片'))
  const bad = await fetch(ctx.base + '/api/import', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/octet-stream' },
    body: Buffer.from('not a database'),
  })
  assert.equal(bad.status, 400)
  assert.equal((await getSnapshot(ctx)).cards[0].title, '旧卡片')
  const file = await (await fetch(ctx.base + '/api/backup', { headers: auth })).arrayBuffer()
  await postOp(ctx, cardCreate('k2', '后来的'))
  const imported = await fetch(ctx.base + '/api/import', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/octet-stream' },
    body: Buffer.from(file),
  })
  assert.equal(imported.status, 200)
  const titles = (await imported.json()).cards.map((card) => card.title)
  assert.deepEqual(titles, ['旧卡片'])
  } finally {
    await ctx.close()
  }
})

test('不是看板库的 sqlite 文件不会换掉现有数据', async () => {
  const ctx = await request({ token: 'secret' })
  try {
    await postOp(ctx, cardCreate('k', '旧卡片'))
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-foreign-'))
    const foreign = path.join(dir, 'other.db')
    const db = new Database(foreign)
    db.exec('CREATE TABLE notes (id INTEGER)')
    db.close()
    const body = readFileSync(foreign)
    const res = await fetch(ctx.base + '/api/import', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/octet-stream' },
      body,
    })
    assert.equal(res.status, 400)
    assert.equal((await getSnapshot(ctx)).cards[0].title, '旧卡片')
  } finally {
    await ctx.close()
  }
})
