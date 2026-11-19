import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLocal, emptyState, failImport, finishImport, flush, settle } from '../src/state.js'

function cardCreate(id, title) {
  return { id: 'c-' + id, type: 'card.create', payload: { id, listId: 'l', title } }
}

test('服务器失败后本地勾选还在，下一次操作继续排进队列', async () => {
  let state = applyLocal(emptyState(), cardCreate('k', '需求自测'))
  state = settle(state, await flush(state, async () => { throw new Error('down') }))
  assert.equal(state.snapshot.cards[0].title, '需求自测')
  assert.equal(state.syncError, '同步失败，改动还在本地')
  state = applyLocal(state, { id: 'p', type: 'card.patch', payload: { id: 'k', done: true } })
  assert.equal(state.snapshot.cards[0].done, true)
  assert.deepEqual(state.queue.map((op) => op.type), ['card.create', 'card.patch'])
})

test('新标签默认蓝色黑体，可以改成指定样式', () => {
  let state = applyLocal(emptyState(), { id: 't', type: 'tag.create', payload: { id: 't', name: '部署' } })
  assert.equal(state.snapshot.tags[0].style, 'blue')
  assert.equal(state.snapshot.tags[0].font, 'sans')
  state = applyLocal(state, { id: 'p', type: 'tag.patch', payload: { id: 't', style: 'rose', font: 'kai' } })
  assert.equal(state.snapshot.tags[0].style, 'rose')
  assert.equal(state.snapshot.tags[0].font, 'kai')
})

test('新卡片插到列表最上面', () => {
  let state = applyLocal(emptyState(), cardCreate('old', '旧'))
  state = applyLocal(state, cardCreate('new', '新'))
  const order = state.snapshot.cards
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((card) => card.id)
  assert.deepEqual(order, ['new', 'old'])
  assert.equal(state.snapshot.cards.find((card) => card.id === 'new').position, 0)
})

test('藏起列表不改它的 position', () => {
  let state = applyLocal(emptyState(), { id: 'p', type: 'project.create', payload: { id: 'p', name: '需求管理' } })
  for (const id of ['a', 'b', 'c']) {
    state = applyLocal(state, { id: 'l' + id, type: 'list.create', payload: { id, projectId: 'p', name: id } })
  }
  state = applyLocal(state, { id: 'h', type: 'list.hide', payload: { id: 'b', hidden: true } })
  const hidden = state.snapshot.lists.find((list) => list.id === 'b')
  assert.equal(hidden.hidden, true)
  assert.equal(hidden.position, 1)
})

test('先创建再移动，第一次发送失败则两次都留在队列', async () => {
  let state = applyLocal(emptyState(), cardCreate('k', '甲'))
  state = applyLocal(state, { id: 'm', type: 'card.move', payload: { id: 'k', listId: 'l', index: 0 } })
  let seen = []
  state = settle(state, await flush(state, async (ops) => { seen = ops.map((op) => op.type); throw new Error('down') }))
  assert.deepEqual(seen, ['card.create', 'card.move'])
  assert.equal(state.queue.length, 2)
})

test('flush 进行中又写入的操作不会被成功结果清掉', async () => {
  let state = applyLocal(emptyState(), cardCreate('k', '甲'))
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const pending = flush(state, async () => { await gate })
  state = applyLocal(state, { id: 'p', type: 'card.patch', payload: { id: 'k', done: true } })
  release()
  state = settle(state, await pending)
  assert.equal(state.snapshot.cards[0].done, true)
  assert.deepEqual(state.queue.map((op) => op.type), ['card.patch'])
})

test('导入完成之后，早先发出的同步不能把旧队列写回来', async () => {
  let state = applyLocal(emptyState(), cardCreate('k', '本地'))
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const pending = flush(state, async () => { await gate })
  state = finishImport(state, { ...emptyState().snapshot, revision: 9, cards: [] })
  release()
  state = settle(state, await pending)
  assert.equal(state.queue.length, 0)
  assert.equal(state.snapshot.revision, 9)
})

test('导入失败不改本地，导入成功清空队列', () => {
  let state = applyLocal(emptyState(), cardCreate('k', '本地'))
  assert.equal(failImport(state), state)
  const next = finishImport(state, { ...emptyState().snapshot, revision: 3, cards: [] })
  assert.equal(next.queue.length, 0)
  assert.equal(next.snapshot.cards.length, 0)
  assert.equal(next.snapshot.revision, 3)
})
