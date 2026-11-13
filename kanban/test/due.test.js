import test from 'node:test'
import assert from 'node:assert/strict'
import { duePresentation } from '../src/due.js'

test('同一天里过了截止时刻用过期，没用今天', () => {
  const due = '2026-11-12T10:00:00.000Z'
  const before = new Date('2026-11-12T09:00:00.000Z')
  const after = new Date('2026-11-12T11:00:00.000Z')
  assert.equal(duePresentation(due, before, false).kind, 'today')
  assert.equal(duePresentation(due, before, false).text, '今天 18:00 截止')
  assert.equal(duePresentation(due, after, false).kind, 'overdue')
  assert.equal(duePresentation(due, after, true).kind, 'done')
})

test('昨天截止写成昨天', () => {
  const due = '2026-11-11T10:00:00.000Z'
  const now = new Date('2026-11-12T01:00:00.000Z')
  const view = duePresentation(due, now, false)
  assert.equal(view.kind, 'overdue')
  assert.equal(view.text, '昨天 18:00 截止')
})

test('还没到的日子是灰色文案', () => {
  const due = '2026-11-16T10:00:00.000Z'
  const now = new Date('2026-11-12T01:00:00.000Z')
  assert.deepEqual(duePresentation(due, now, false), { text: '11月16日 截止', kind: 'future' })
})
