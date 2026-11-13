import { duePresentation } from './due.js?v=16'
import { matchCard, subtaskPreview } from './select.js?v=16'

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
    const inList = snap.cards
      .filter((card) => card.listId === list.id)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    for (const card of inList) {
      const tagIds = snap.cardTags.filter((item) => item.cardId === card.id).map((item) => item.tagId)
      if (!matchCard(card, ui.filter, tagIds)) continue
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
