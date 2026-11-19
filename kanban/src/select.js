export function insertIndex(mids, pointer) {
  for (let i = 0; i < mids.length; i++) {
    if (pointer < mids[i]) return i
  }
  return mids.length
}

export function dropIndex(order, draggingId, beforeId) {
  const ids = order.filter((id) => id !== draggingId)
  if (!beforeId) return ids.length
  const at = ids.indexOf(beforeId)
  return at < 0 ? ids.length : at
}

export function subtaskPreview(subtasks) {
  const open = (subtasks || []).filter((item) => !item.done)
  return { lines: open.slice(0, 3).map((item) => item.title), more: Math.max(0, open.length - 3) }
}

const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 }

export function sortCards(cards, sort) {
  const key = sort?.key || 'manual'
  if (key === 'manual') return cards
  const dir = sort.dir === 'asc' ? 1 : -1
  const value = (card) => {
    if (key === 'priority') return PRIORITY_RANK[card.priority] ?? 1
    if (key === 'created') return card.createdAt || ''
    if (key === 'updated') return card.updatedAt || card.createdAt || ''
    return card.position
  }
  return cards.slice().sort((a, b) => {
    const left = value(a)
    const right = value(b)
    if (left < right) return -1 * dir
    if (left > right) return 1 * dir
    return a.position - b.position
  })
}

export function matchCard(card, filter, tagIds) {
  if (filter.priority && card.priority !== filter.priority) return false
  if (filter.tagId && !(tagIds || []).includes(filter.tagId)) return false
  if (filter.done === 'yes' && !card.done) return false
  if (filter.done === 'no' && card.done) return false
  return true
}
