import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { openDb } from '../src/db.js'
import { applyOp } from '../src/ops.js'

function fresh() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-ops-'))
  return openDb(path.join(dir, 'board.db'))
}

function seedThreeLists() {
  const db = fresh()
  applyOp(db, { id: 'p', type: 'project.create', payload: { id: 'p', name: '需求管理' } })
  for (const id of ['a', 'b', 'c']) {
    applyOp(db, { id: 'l-' + id, type: 'list.create', payload: { id, projectId: 'p', name: id } })
  }
  return db
}

function seedOneList() {
  const db = fresh()
  applyOp(db, { id: 'p', type: 'project.create', payload: { id: 'p', name: '需求管理' } })
  applyOp(db, { id: 'l1', type: 'list.create', payload: { id: 'l', projectId: 'p', name: '日常事务' } })
  return db
}

function visibleIds(db) {
  return db.prepare(`SELECT id FROM lists WHERE hidden = 0 ORDER BY position, id`).all().map((row) => row.id)
}

function getCard(db, id) {
  return db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id)
}

function cardIds(db, listId) {
  return db.prepare(`SELECT id FROM cards WHERE list_id = ? ORDER BY position, id`).all(listId).map((row) => row.id)
}

test('藏起中间列表再显示，它仍在原来的两列之间', () => {
  const db = seedThreeLists()
  applyOp(db, { id: 'h', type: 'list.hide', payload: { id: 'b', hidden: true } })
  assert.deepEqual(visibleIds(db), ['a', 'c'])
  applyOp(db, { id: 's', type: 'list.hide', payload: { id: 'b', hidden: false } })
  assert.deepEqual(visibleIds(db), ['a', 'b', 'c'])
})

test('同一张卡片创建两次不会把整批操作打回去', () => {
  const db = seedOneList()
  const op = { id: 'c1', type: 'card.create', payload: { id: 'k', listId: 'l', title: '需求自测' } }
  applyOp(db, op)
  applyOp(db, op)
  assert.equal(getCard(db, 'k').title, '需求自测')
})

test('新卡片默认普通且未完成，移动后停在指定序号', () => {
  const db = seedOneList()
  applyOp(db, { id: 'c1', type: 'card.create', payload: { id: 'k', listId: 'l', title: '需求自测' } })
  const card = getCard(db, 'k')
  assert.equal(card.priority, 'normal')
  assert.equal(card.done, 0)
  applyOp(db, { id: 'c2', type: 'card.create', payload: { id: 'k2', listId: 'l', title: '另一张' } })
  applyOp(db, { id: 'm', type: 'card.move', payload: { id: 'k2', listId: 'l', index: 0 } })
  assert.deepEqual(cardIds(db, 'l'), ['k2', 'k'])
})
