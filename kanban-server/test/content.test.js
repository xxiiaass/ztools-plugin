import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { openDb, readSnapshot } from '../src/db.js'
import { applyOp } from '../src/ops.js'

function seedCard() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-content-'))
  const db = openDb(path.join(dir, 'board.db'))
  applyOp(db, { id: 'p', type: 'project.create', payload: { id: 'p', name: '需求管理' } })
  applyOp(db, { id: 'l', type: 'list.create', payload: { id: 'l', projectId: 'p', name: '日常事务' } })
  applyOp(db, { id: 'k', type: 'card.create', payload: { id: 'k', listId: 'l', title: '需求自测' } })
  return db
}

test('评论图片能原样从快照读回，删评论时图片一起消失', () => {
  const db = seedCard()
  applyOp(db, { id: 'cm', type: 'comment.create', payload: {
    id: 'c', cardId: 'k', body: '日志', images: [{ id: 'i', mime: 'image/png', dataBase64: 'aGVsbG8=' }],
  } })
  assert.equal(readSnapshot(db).images[0].dataBase64, 'aGVsbG8=')
  applyOp(db, { id: 'd', type: 'comment.delete', payload: { id: 'c' } })
  assert.equal(readSnapshot(db).images.length, 0)
  assert.equal(readSnapshot(db).comments.length, 0)
})

test('标签是替换，新子任务默认未完成', () => {
  const db = seedCard()
  applyOp(db, { id: 't1', type: 'tag.create', payload: { id: 't1', name: '部署' } })
  applyOp(db, { id: 't2', type: 'tag.create', payload: { id: 't2', name: '边缘函数' } })
  applyOp(db, { id: 's1', type: 'card.setTags', payload: { cardId: 'k', tagIds: ['t1', 't2'] } })
  applyOp(db, { id: 's2', type: 'card.setTags', payload: { cardId: 'k', tagIds: ['t2'] } })
  assert.deepEqual(readSnapshot(db).cardTags, [{ cardId: 'k', tagId: 't2' }])
  applyOp(db, { id: 'st', type: 'subtask.create', payload: { id: 'st', cardId: 'k', title: '列步骤' } })
  assert.equal(readSnapshot(db).subtasks[0].done, false)
  applyOp(db, { id: 'td', type: 'tag.delete', payload: { id: 't2' } })
  assert.deepEqual(readSnapshot(db).cardTags, [])
  assert.equal(readSnapshot(db).tags.some((tag) => tag.id === 't2'), false)
})
