import test from 'node:test'
import assert from 'node:assert/strict'
import { viewModel } from '../src/view.js'

function snapWith(card) {
  return {
    revision: 1,
    projects: [{ id: 'p', name: '需求管理', position: 0 }],
    lists: [{ id: 'l', projectId: 'p', name: '日常事务', position: 0, hidden: false }],
    cards: [{ id: 'k', listId: 'l', title: '需求自测', done: false, priority: 'normal', dueAt: null, position: 0, ...card }],
    subtasks: [],
    tags: [],
    cardTags: [],
    comments: [],
    images: [],
  }
}

test('同步失败时视图仍给出横幅，完成卡片不带过期种类', () => {
  const state = {
    syncError: '同步失败，改动还在本地',
    queue: [{}],
    snapshot: snapWith({ dueAt: '2026-11-11T10:00:00.000Z', done: true, priority: 'urgent' }),
  }
  const vm = viewModel(state, {
    projectId: 'p',
    filter: { priority: '', tagId: '', done: '' },
    now: new Date('2026-11-12T01:00:00.000Z'),
  })
  assert.equal(vm.banner, '同步失败，改动还在本地')
  assert.equal(vm.cards[0].due.kind, 'done')
  assert.equal(vm.cards[0].edgeColor, '#cf1322')
  assert.deepEqual(vm.cards[0].tags, [])
})
