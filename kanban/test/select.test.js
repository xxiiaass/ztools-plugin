import test from 'node:test'
import assert from 'node:assert/strict'
import { dropIndex, insertIndex, matchCard, sortCards, subtaskPreview } from '../src/select.js'

test('未完成子任务超过三行时收成还有 N 个', () => {
  const items = [1, 2, 3, 4].map((n) => ({ title: '子' + n, done: false }))
  items.push({ title: '已完成', done: true })
  assert.deepEqual(subtaskPreview(items), { lines: ['子1', '子2', '子3'], more: 1 })
})

test('松手在卡片中线以上就插到它前面', () => {
  assert.equal(insertIndex([20, 60, 100], 10), 0)
  assert.equal(insertIndex([20, 60, 100], 61), 2)
  assert.equal(insertIndex([20, 60, 100], 140), 3)
})

test('拖到某张卡片前面时插到它的位置', () => {
  assert.equal(dropIndex(['a', 'b', 'c'], 'c', 'a'), 0)
  assert.equal(dropIndex(['a', 'b', 'c'], 'a', 'c'), 1)
  assert.equal(dropIndex(['a', 'b'], 'a', null), 1)
})

test('排序按优先级和创建时间，手动顺序保持原样', () => {
  const cards = [
    { id: 'a', priority: 'low', createdAt: '2026-01-02T00:00:00.000Z', position: 0 },
    { id: 'b', priority: 'urgent', createdAt: '2026-01-01T00:00:00.000Z', position: 1 },
  ]
  assert.deepEqual(sortCards(cards, { key: 'manual' }).map((card) => card.id), ['a', 'b'])
  assert.deepEqual(sortCards(cards, { key: 'priority', dir: 'desc' }).map((card) => card.id), ['b', 'a'])
  assert.deepEqual(sortCards(cards, { key: 'created', dir: 'asc' }).map((card) => card.id), ['b', 'a'])
})

test('筛选不看到期', () => {
  const open = { id: 'a', done: false, priority: 'urgent', dueAt: '2020-01-01T00:00:00.000Z' }
  const done = { id: 'b', done: true, priority: 'normal', dueAt: null }
  assert.equal(matchCard(open, { priority: 'urgent', tagId: '', done: 'no' }, []), true)
  assert.equal(matchCard(done, { priority: '', tagId: '', done: 'no' }, []), false)
  assert.equal(matchCard(open, { priority: 'normal', tagId: '', done: '' }, []), false)
  assert.equal(matchCard(open, { priority: '', tagId: 't', done: '' }, ['t']), true)
  assert.equal(matchCard(open, { priority: '', tagId: 't', done: '' }, []), false)
})
