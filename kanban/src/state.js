export function emptyState() {
  return {
    snapshot: {
      revision: 0,
      projects: [],
      lists: [],
      cards: [],
      subtasks: [],
      tags: [],
      cardTags: [],
      comments: [],
      images: [],
    },
    queue: [],
    syncError: '',
  }
}

function nextPosition(rows) {
  return rows.reduce((max, row) => Math.max(max, row.position), -1) + 1
}

function applyOne(snapshot, op) {
  const p = op.payload || {}
  const next = typeof structuredClone === 'function' ? structuredClone(snapshot) : JSON.parse(JSON.stringify(snapshot))
  switch (op.type) {
    case 'project.create':
      next.projects.push({ id: p.id, name: p.name, position: nextPosition(next.projects) })
      break
    case 'project.rename': {
      const project = next.projects.find((item) => item.id === p.id)
      if (project) project.name = p.name
      break
    }
    case 'project.delete': {
      const listIds = new Set(next.lists.filter((list) => list.projectId === p.id).map((list) => list.id))
      const cardIds = new Set(next.cards.filter((card) => listIds.has(card.listId)).map((card) => card.id))
      next.projects = next.projects.filter((item) => item.id !== p.id)
      next.lists = next.lists.filter((list) => !listIds.has(list.id))
      dropCards(next, cardIds)
      break
    }
    case 'list.create':
      next.lists.push({
        id: p.id,
        projectId: p.projectId,
        name: p.name,
        position: nextPosition(next.lists.filter((list) => list.projectId === p.projectId)),
        hidden: false,
      })
      break
    case 'list.rename': {
      const list = next.lists.find((item) => item.id === p.id)
      if (list) list.name = p.name
      break
    }
    case 'list.hide': {
      const list = next.lists.find((item) => item.id === p.id)
      if (list) list.hidden = Boolean(p.hidden)
      break
    }
    case 'list.delete': {
      const cardIds = new Set(next.cards.filter((card) => card.listId === p.id).map((card) => card.id))
      next.lists = next.lists.filter((list) => list.id !== p.id)
      dropCards(next, cardIds)
      break
    }
    case 'list.reorder':
      p.ids.forEach((id, index) => {
        const list = next.lists.find((item) => item.id === id && item.projectId === p.projectId)
        if (list) list.position = index
      })
      break
    case 'card.create': {
      if (next.cards.some((card) => card.id === p.id)) break
      const now = p.createdAt || new Date().toISOString()
      for (const card of next.cards) {
        if (card.listId === p.listId) card.position += 1
      }
      next.cards.push({
        id: p.id,
        listId: p.listId,
        title: p.title,
        done: false,
        priority: 'normal',
        dueAt: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      break
    }
    case 'card.patch': {
      const card = next.cards.find((item) => item.id === p.id)
      if (!card) break
      if (p.title !== undefined) card.title = p.title
      if (p.done !== undefined) card.done = Boolean(p.done)
      if (p.priority !== undefined) card.priority = p.priority
      if (p.dueAt !== undefined) card.dueAt = p.dueAt
      card.updatedAt = new Date().toISOString()
      break
    }
    case 'card.move': {
      const card = next.cards.find((item) => item.id === p.id)
      if (!card) break
      const from = card.listId
      const others = next.cards
        .filter((item) => item.listId === p.listId && item.id !== p.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      const index = Math.max(0, Math.min(p.index, others.length))
      others.splice(index, 0, card)
      card.listId = p.listId
      others.forEach((item, i) => { item.position = i })
      card.updatedAt = new Date().toISOString()
      if (from !== p.listId) {
        next.cards
          .filter((item) => item.listId === from)
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .forEach((item, i) => { item.position = i })
      }
      break
    }
    case 'card.delete':
      dropCards(next, new Set([p.id]))
      break
    case 'subtask.create':
      next.subtasks.push({
        id: p.id,
        cardId: p.cardId,
        title: p.title,
        done: false,
        position: nextPosition(next.subtasks.filter((item) => item.cardId === p.cardId)),
      })
      break
    case 'subtask.patch': {
      const sub = next.subtasks.find((item) => item.id === p.id)
      if (!sub) break
      if (p.title !== undefined) sub.title = p.title
      if (p.done !== undefined) sub.done = Boolean(p.done)
      break
    }
    case 'subtask.delete':
      next.subtasks = next.subtasks.filter((item) => item.id !== p.id)
      break
    case 'tag.create':
      if (!next.tags.some((tag) => tag.id === p.id)) {
        next.tags.push({
          id: p.id,
          name: p.name,
          style: p.style || 'blue',
          font: p.font || 'sans',
        })
      }
      break
    case 'tag.patch': {
      const tag = next.tags.find((item) => item.id === p.id)
      if (!tag) break
      if (p.style !== undefined) tag.style = p.style
      if (p.font !== undefined) tag.font = p.font
      break
    }
    case 'tag.delete':
      next.tags = next.tags.filter((tag) => tag.id !== p.id)
      next.cardTags = next.cardTags.filter((item) => item.tagId !== p.id)
      break
    case 'card.setTags':
      next.cardTags = next.cardTags.filter((item) => item.cardId !== p.cardId)
      for (const tagId of p.tagIds) next.cardTags.push({ cardId: p.cardId, tagId })
      break
    case 'comment.create':
      next.comments.push({ id: p.id, cardId: p.cardId, body: p.body, createdAt: p.createdAt || new Date().toISOString() })
      for (const image of p.images || []) {
        next.images.push({ id: image.id, commentId: p.id, mime: image.mime, dataBase64: image.dataBase64 })
      }
      break
    case 'comment.delete':
      next.comments = next.comments.filter((item) => item.id !== p.id)
      next.images = next.images.filter((item) => item.commentId !== p.id)
      break
    default:
      throw new Error('unknown op ' + op.type)
  }
  return next
}

function dropCards(snapshot, cardIds) {
  const commentIds = new Set(snapshot.comments.filter((item) => cardIds.has(item.cardId)).map((item) => item.id))
  snapshot.cards = snapshot.cards.filter((card) => !cardIds.has(card.id))
  snapshot.subtasks = snapshot.subtasks.filter((item) => !cardIds.has(item.cardId))
  snapshot.cardTags = snapshot.cardTags.filter((item) => !cardIds.has(item.cardId))
  snapshot.comments = snapshot.comments.filter((item) => !cardIds.has(item.cardId))
  snapshot.images = snapshot.images.filter((item) => !commentIds.has(item.commentId))
}

export function applyLocal(state, op) {
  return {
    snapshot: applyOne(state.snapshot, op),
    queue: state.queue.concat(op),
    syncError: state.syncError,
  }
}

export async function flush(state, post) {
  if (state.queue.length === 0) return { ok: true, accepted: [] }
  const accepted = state.queue.slice()
  try {
    await post(accepted)
    return { ok: true, accepted }
  } catch {
    return { ok: false, accepted: [] }
  }
}

export function settle(state, result) {
  if (!result.ok) return { ...state, syncError: '同步失败，改动还在本地' }
  const sent = new Set(result.accepted.map((op) => op.id))
  return { ...state, queue: state.queue.filter((op) => !sent.has(op.id)), syncError: '' }
}

export function applyRemote(state, snapshot) {
  if (state.queue.length > 0) return state
  return { ...state, snapshot, syncError: '' }
}

export function beginImport(state) {
  return state
}

export function finishImport(state, snapshot) {
  return { snapshot, queue: [], syncError: '' }
}

export function failImport(state) {
  return state
}
