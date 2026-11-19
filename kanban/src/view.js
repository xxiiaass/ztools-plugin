import { duePresentation } from './due.js?v=26'
import { matchCard, sortCards, subtaskPreview } from './select.js?v=26'

const EDGES = { low: '#8a8a8a', normal: '', high: '#d46b08', urgent: '#cf1322' }

export function viewModel(state, ui) {
  const snap = state.snapshot
  const projectId = ui.projectId || snap.projects.slice().sort((a, b) => a.position - b.position)[0]?.id || ''
  const lists = snap.lists
    .filter((list) => list.projectId === projectId && !list.hidden)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const hiddenLists = snap.lists
    .filter((list) => list.projectId === projectId && list.hidden)
    .sort((a, b) => a.position - b.position)
  const cards = []
  for (const list of lists) {
    const inList = sortCards(
      snap.cards
        .filter((card) => card.listId === list.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      ui.sort,
    )
    for (const card of inList) {
      const tagIds = snap.cardTags.filter((item) => item.cardId === card.id).map((item) => item.tagId)
      if (!matchCard(card, ui.filter, tagIds)) continue
      const tags = snap.tags.filter((tag) => tagIds.includes(tag.id)).map((tag) => ({
        name: tag.name,
        style: tag.style || 'blue',
        font: tag.font || 'sans',
      }))
      const preview = subtaskPreview(snap.subtasks.filter((item) => item.cardId === card.id).sort((a, b) => a.position - b.position))
      cards.push({
        id: card.id,
        listId: card.listId,
        title: card.title,
        done: card.done,
        priority: card.priority,
        position: card.position,
        edgeColor: EDGES[card.priority] || '',
        due: duePresentation(card.dueAt, ui.now || new Date(), card.done),
        tags,
        subtaskLines: preview.lines,
        subtaskMore: preview.more,
        completed: card.done,
      })
    }
  }
  return {
    banner: state.syncError || '',
    projectId,
    projects: snap.projects.slice().sort((a, b) => a.position - b.position),
    lists,
    hiddenLists,
    cards,
  }
}
