import { insertIndex } from './select.js?v=21'
import { applyLocal, applyRemote, emptyState, failImport, finishImport, flush, settle } from './state.js?v=21'
import { viewModel } from './view.js?v=21'

const app = document.querySelector('#app')
let state = emptyState()
let settings = { base: '', token: '' }
let ui = {
  projectId: '',
  filter: { priority: '', tagId: '', done: '' },
  openCardId: '',
  settingsOpen: false,
  menu: '',
  menuAnchor: null,
  now: new Date(),
  commentDraft: '',
  composer: null,
}

function id() {
  return crypto.randomUUID()
}

function persist() {
  window.__bridge?.save?.({ state, settings, projectId: ui.projectId })
}

function closeHost() {
  const z = window.ztools
  if (!z) return
  let type = 'main'
  try { type = z.getWindowType() || 'main' } catch (e) {}
  if (type === 'detach') {
    void z.outPlugin(true)
    return
  }
  void z.hideMainWindow()
}

function act(op) {
  state = applyLocal(state, op)
  paint()
  persist()
  void sync()
}

let syncing = false
async function sync() {
  if (syncing || !settings.base || !settings.token) return
  syncing = true
  try {
    const headers = { authorization: 'Bearer ' + settings.token, 'content-type': 'application/json' }
    const result = await flush(state, async (ops) => {
      const res = await fetch(settings.base.replace(/\/$/, '') + '/api/ops', {
        method: 'POST', headers, body: JSON.stringify({ ops }),
      })
      if (!res.ok) throw new Error('sync')
    })
    state = settle(state, result)
    if (result.ok && state.queue.length === 0) {
      const res = await fetch(settings.base.replace(/\/$/, '') + '/api/snapshot', { headers })
      if (res.status === 401) state = { ...state, syncError: '同步失败，改动还在本地' }
      else if (res.ok) state = applyRemote(state, await res.json())
      else state = { ...state, syncError: '同步失败，改动还在本地' }
    }
    if (result.ok && state.queue.length) void syncSoon()
  } finally {
    syncing = false
  }
  paintIfIdle()
  persist()
}

function typing() {
  const el = document.activeElement
  if (!el || el === document.body) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

let paintAfterType = false
let paintedData = ''
let paintedError = ''
function paintIfIdle() {
  if (typing()) {
    paintAfterType = true
    return
  }
  const data = JSON.stringify(state.snapshot)
  if (data === paintedData && state.syncError === paintedError) return
  if (data === paintedData) {
    paintedError = state.syncError
    const existing = app.querySelector('.banner')
    if (state.syncError) {
      if (existing) existing.textContent = state.syncError
      else {
        const bar = document.createElement('div')
        bar.className = 'banner'
        bar.textContent = state.syncError
        app.querySelector('.top')?.after(bar)
      }
    } else if (existing) existing.remove()
    return
  }
  paintAfterType = false
  paint()
}

function syncSoon() {
  setTimeout(() => { void sync() }, 0)
}

function captureScroll() {
  return {
    board: app.querySelector('.board')?.scrollLeft || 0,
    detail: app.querySelector('.detail')?.scrollTop || 0,
  }
}

function applyScroll(saved) {
  const board = app.querySelector('.board')
  if (board) board.scrollLeft = saved.board
  const detail = app.querySelector('.detail')
  if (detail) detail.scrollTop = saved.detail
}

function paint() {
  const saved = captureScroll()
  ui.now = new Date()
  const vm = viewModel(state, ui)
  const previousProject = ui.projectId
  ui.projectId = vm.projectId
  if (ui.projectId !== previousProject) persist()
  const snap = state.snapshot
  const open = snap.cards.find((card) => card.id === ui.openCardId)
  app.innerHTML = `
    <header class="top">
      <button type="button" data-menu="project">${escape(nameOf(snap.projects, vm.projectId) || '选择项目')} ▾</button>
      <button type="button" data-act="add-project">+ 项目</button>
      <span class="grow"></span>
      <button type="button" data-menu="filter">筛选${filterCount() ? ' ' + filterCount() : ''} ▾</button>
      <button type="button" data-menu="hidden">已隐藏 ${vm.hiddenLists.length}</button>
      <button type="button" data-act="settings">设置</button>
      <button type="button" class="host-close" data-act="close-host" aria-label="关闭">×</button>
    </header>
    ${vm.banner ? `<div class="banner">${escape(vm.banner)}</div>` : ''}
    ${composerBar()}
    <div class="board">
      ${vm.lists.map((list) => column(list, vm)).join('')}
      ${addListSlot()}
    </div>
    ${ui.menu === 'project' ? projectMenu(vm) : ''}
    ${ui.menu === 'filter' ? filterMenu() : ''}
    ${ui.menu === 'hidden' ? hiddenMenu(vm) : ''}
    ${ui.menu.startsWith('pri:') ? priMenu(ui.menu.slice(4)) : ''}
    ${ui.menu.startsWith('col:') ? colMenu(ui.menu.slice(4)) : ''}
    ${ui.settingsOpen ? settingsPanel() : ''}
    ${open ? detail(open, snap) : ''}
  `
  placeMenu()
  applyScroll(saved)
  requestAnimationFrame(() => {
    applyScroll(saved)
    requestAnimationFrame(() => applyScroll(saved))
  })
  paintedData = JSON.stringify(state.snapshot)
  paintedError = state.syncError
}

function column(list, vm) {
  const cards = vm.cards.filter((card) => card.listId === list.id)
  const composing = ui.composer && ui.composer.kind === 'card' && ui.composer.listId === list.id
  const renaming = ui.composer?.kind === 'rename' && ui.composer.listId === list.id
  return `<section class="col" data-list="${list.id}">
    ${renaming ? `<div class="col-rename">${composerFields()}</div>` : `<header class="col-head" draggable="true">
      <span class="col-name">${escape(list.name)}</span>
      <span class="col-count">${cards.length}</span>
      <button type="button" class="col-more" data-menu="col:${list.id}">···</button>
    </header>`}
    ${composing ? composerFields() : `<button type="button" class="add-card" data-act="add-card" data-list="${list.id}">+</button>`}
    <div class="col-cards">${cards.map(cardView).join('')}</div>
  </section>`
}

function addListSlot() {
  if (ui.composer?.kind === 'list') return `<div class="add-list">${composerFields()}</div>`
  return `<div class="add-list"><button type="button" data-act="add-list">+ 新建任务列表</button></div>`
}

function cardView(card) {
  const due = card.due.kind === 'today' || card.due.kind === 'overdue'
    ? `<div class="chip ${card.due.kind}">${escape(card.due.text)}</div>`
    : (card.due.text ? `<div class="due">${escape(card.due.text)}</div>` : '')
  const subs = card.subtaskLines.map((line) => `<div class="sub">· ${escape(line)}</div>`).join('')
  const more = card.subtaskMore ? `<div class="sub">还有 ${card.subtaskMore} 个</div>` : ''
  return `<article class="card" draggable="true" data-card="${card.id}" data-list="${card.listId}">
    <button type="button" class="edge" data-menu="pri:${card.id}"><i style="background:${card.edgeColor || 'transparent'}"></i></button>
    <div class="main">
      <div class="line">
        <button type="button" class="box ${card.done ? 'on' : ''}" data-act="toggle" data-card="${card.id}"></button>
        <button type="button" class="title ${card.done ? 'done' : ''}" data-act="open" data-card="${card.id}" style="border:0;background:none;padding:0;text-align:left">${escape(card.title)}</button>
      </div>
      ${due}${subs}${more}
    </div>
  </article>`
}

function projectMenu(vm) {
  return `<div class="menu">${vm.projects.map((project) =>
    `<button type="button" data-act="pick-project" data-id="${project.id}">${escape(project.name)}</button>`).join('')}
    <button type="button" class="danger" data-act="delete-project" data-id="${vm.projectId}">删除「${escape(nameOf(state.snapshot.projects, vm.projectId))}」</button></div>`
}

function filterMenu() {
  const pri = ['', 'low', 'normal', 'high', 'urgent']
  const labels = { '': '全部', low: '低', normal: '普通', high: '优先', urgent: '紧急' }
  return `<div class="menu">
    <div class="chips">${pri.map((value) => `<button type="button" data-act="filter-pri" data-value="${value}">${labels[value]}</button>`).join('')}</div>
    <div class="chips">
      <button type="button" data-act="filter-done" data-value="">全部</button>
      <button type="button" data-act="filter-done" data-value="yes">完成</button>
      <button type="button" data-act="filter-done" data-value="no">未完成</button>
    </div>
    ${state.snapshot.tags.map((tag) => `<button type="button" data-act="filter-tag" data-id="${tag.id}">${escape(tag.name)}</button>`).join('')}
    <button type="button" data-act="filter-reset">重置</button>
  </div>`
}

function hiddenMenu(vm) {
  const rows = vm.hiddenLists.map((list) =>
    `<button type="button" data-act="show-list" data-id="${list.id}">${escape(list.name)} 显示</button>`).join('')
  return `<div class="menu">${rows || '<button type="button">没有藏起的列表</button>'}</div>`
}

function priMenu(cardId) {
  return `<div class="menu">
    ${[['low', '低'], ['normal', '普通'], ['high', '优先'], ['urgent', '紧急']].map(([value, label]) =>
      `<button type="button" data-act="set-pri" data-card="${cardId}" data-value="${value}">${label}</button>`).join('')}
  </div>`
}

function colMenu(listId) {
  return `<div class="menu">
    <button type="button" data-act="hide-list" data-id="${listId}">隐藏此列表</button>
    <button type="button" data-act="rename-list" data-id="${listId}">重命名</button>
    <button type="button" data-act="delete-list" data-id="${listId}">删除</button>
  </div>`
}

function closeMenu() {
  ui.menu = ''
  ui.menuAnchor = null
}

function placeMenu() {
  const menu = app.querySelector('.menu')
  const anchor = ui.menuAnchor
  if (!menu || !anchor || !ui.menu) return
  const gap = 6
  const margin = 8
  const width = menu.getBoundingClientRect().width
  let left = anchor.right - width
  if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
  if (left < margin) left = margin
  menu.style.position = 'fixed'
  menu.style.top = `${anchor.bottom + gap}px`
  menu.style.left = `${left}px`
  menu.style.right = 'auto'
}

function settingsPanel() {
  return `<aside class="detail settings">
    <div class="detail-top"><button type="button" class="detail-close" data-act="close-settings">关闭</button></div>
    <div class="section-label">连接</div>
    <label for="set-base">服务器地址</label>
    <input id="set-base" value="${escape(settings.base)}" autocomplete="off" spellcheck="false">
    <label for="set-token">连接 token</label>
    <input id="set-token" value="${escape(settings.token)}" autocomplete="off" spellcheck="false">
    <button type="button" class="btn-ok ready settings-save" data-act="save-settings">保存连接</button>
    <div class="section-label">导入备份</div>
    <input id="import-file" type="file">
    <p class="tag-empty">会换掉服务器上的全部看板，还没同步的本地改动也会丢掉。</p>
  </aside>`
}

function detail(card, snap) {
  const subs = snap.subtasks.filter((item) => item.cardId === card.id).sort((a, b) => a.position - b.position)
  const comments = snap.comments.filter((item) => item.cardId === card.id)
  const tagIds = new Set(snap.cardTags.filter((item) => item.cardId === card.id).map((item) => item.tagId))
  const assigned = snap.tags.filter((tag) => tagIds.has(tag.id))
  const showTags = ui.tagPicker && ui.openCardId === card.id
  const creatingTag = ui.composer?.kind === 'tag' && ui.composer.cardId === card.id
  const editingSub = ui.composer?.kind === 'sub' && ui.composer.cardId === card.id
  const ready = (ui.composer?.text || '').trim() ? ' ready' : ''
  return `<aside class="detail">
    <div class="detail-top"><button type="button" class="detail-close" data-act="close">关闭</button></div>
    <input id="card-title" class="detail-title" value="${escape(card.title)}">
    <div class="field-row"><span>完成</span><button type="button" class="box ${card.done ? 'on' : ''}" data-act="toggle" data-card="${card.id}"></button></div>
    <div class="field-row"><span>优先级</span><button type="button" class="pri-chip pri-${card.priority || 'normal'}" data-menu="pri:${card.id}">${PRI_LABEL[card.priority] || '普通'}</button></div>
    <div class="field-row"><span>到期</span><input id="card-due" type="datetime-local" value="${toLocal(card.dueAt)}"></div>
    <div class="field-row"><span>项目</span><select id="card-project">${snap.projects.map((project) =>
      `<option value="${project.id}" ${listProject(snap, card.listId) === project.id ? 'selected' : ''}>${escape(project.name)}</option>`).join('')}</select></div>
    <div class="field-row"><span>列表</span><select id="card-list">${snap.lists.filter((list) => list.projectId === listProject(snap, card.listId)).map((list) =>
      `<option value="${list.id}" ${list.id === card.listId ? 'selected' : ''}>${escape(list.name)}</option>`).join('')}</select></div>
    <div class="field-row tag-row"><span>标签</span>
      <div class="tag-cell">
        ${assigned.map((tag) => `<span class="tag-chip">${escape(tag.name)}</span>`).join('')}
        <button type="button" class="tag-add" data-act="toggle-tag-pop">+</button>
        ${showTags ? `<div class="tag-pop">
          ${snap.tags.map((tag) => `<div class="tag-option"><button type="button" class="tag-name" data-act="toggle-tag" data-id="${tag.id}"><span>${escape(tag.name)}</span>${tagIds.has(tag.id) ? '<span class="tag-check">✓</span>' : ''}</button><button type="button" class="tag-del" data-act="delete-tag" data-id="${tag.id}">删除</button></div>`).join('') || '<div class="tag-empty">还没有标签，先新建一个</div>'}
          ${creatingTag
            ? `<input id="composer-input" value="${escape(ui.composer.text || '')}" placeholder="标签名称" autocomplete="off">
               <div class="composer-actions"><button type="button" class="btn-cancel" data-act="cancel-composer">取消</button><button type="button" class="btn-ok${ready}" data-act="submit-composer">确定</button></div>`
            : `<button type="button" class="sub-add" data-act="add-tag">+ 新建标签</button>`}
        </div>` : ''}
      </div>
    </div>
    <div class="section-label">子任务</div>
    ${subs.map((sub) => `<div class="sub-row"><button type="button" class="box ${sub.done ? 'on' : ''}" data-act="toggle-sub" data-id="${sub.id}"></button><span class="${sub.done ? 'done-text' : ''}">${escape(sub.title)}</span></div>`).join('')}
    ${editingSub
      ? `<div class="sub-editor"><input id="composer-input" value="${escape(ui.composer.text || '')}" placeholder="输入任务内容..." autocomplete="off"><div class="composer-actions"><button type="button" class="btn-cancel" data-act="cancel-composer">取消</button><button type="button" class="btn-ok${ready}" data-act="submit-composer">保存</button></div></div>`
      : `<button type="button" class="sub-add" data-act="add-sub" data-card="${card.id}">+ 添加子任务</button>`}
    <div class="section-label">评论</div>
    ${comments.map((comment) => `<div class="comment">
      <div class="comment-meta"><time>${escape(commentTime(comment.createdAt))}</time><button type="button" class="tag-del" data-act="delete-comment" data-id="${comment.id}">删除</button></div>
      ${comment.body ? `<div class="comment-body">${escape(comment.body)}</div>` : ''}
      ${snap.images.filter((image) => image.commentId === comment.id).map((image) =>
        `<img alt="" src="data:${escape(image.mime)};base64,${image.dataBase64}">`).join('')}
    </div>`).join('') || '<div class="tag-empty">还没有评论</div>'}
    <textarea id="comment-body" placeholder="写评论">${escape(ui.commentDraft)}</textarea>
    <div class="comment-bar">
      <input id="comment-images" type="file" accept="image/*" multiple>
      <button type="button" class="btn-ok ready" data-act="add-comment" data-card="${card.id}">发送</button>
    </div>
    <button type="button" class="danger" data-act="delete-card" data-card="${card.id}">删除卡片</button>
  </aside>`
}

function commentTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = (value) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const when = parts(date)
  const today = parts(new Date())
  const hm = `${when.hour}:${when.minute}`
  if (when.year === today.year && when.month === today.month && when.day === today.day) return `今天 ${hm}`
  return `${Number(when.month)}月${Number(when.day)}日 ${hm}`
}

const PRI_LABEL = { low: '低', normal: '普通', high: '优先', urgent: '紧急' }

function composerBar() {
  if (!ui.composer || ['card', 'list', 'tag', 'sub', 'rename'].includes(ui.composer.kind)) return ''
  return composerFields()
}

function composerFields() {
  const c = ui.composer
  const value = escape(c.text || '')
  const ready = (c.text || '').trim() ? ' ready' : ''
  if (c.kind === 'list') {
    return `<form class="list-pop">
      <div class="list-pop-h">添加任务列表<button type="button" class="x" data-act="cancel-composer">×</button></div>
      <input id="composer-input" value="${value}" placeholder="任务列表名称" autocomplete="off">
      <button type="button" class="btn-ok block${ready}" data-act="submit-composer">确定</button>
    </form>`
  }
  const placeholders = { project: '项目名称', card: '输入标题以新建任务', sub: '子任务', tag: '标签', rename: '列表名称' }
  return `<form class="composer-card">
    <input id="composer-input" value="${value}" placeholder="${placeholders[c.kind] || ''}" autocomplete="off">
    <div class="composer-actions">
      <button type="button" class="btn-cancel" data-act="cancel-composer">取消</button>
      <button type="button" class="btn-ok${ready}" data-act="submit-composer">确定</button>
    </div>
  </form>`
}

function openComposer(kind, extra) {
  ui.composer = { kind, text: '', ...extra }
  closeMenu()
  paint()
  const input = document.querySelector('#composer-input')
  if (input) input.focus({ preventScroll: true })
}

function submitComposer() {
  const c = ui.composer
  if (!c) return
  const name = (document.querySelector('#composer-input')?.value || c.text || '').trim()
  if (!name) return
  ui.composer = null
  if (c.kind === 'project') {
    const projectId = id()
    ui.projectId = projectId
    act({ id: id(), type: 'project.create', payload: { id: projectId, name } })
    return
  }
  if (c.kind === 'list') {
    if (!ui.projectId) { paint(); return }
    act({ id: id(), type: 'list.create', payload: { id: id(), projectId: ui.projectId, name } })
    return
  }
  if (c.kind === 'card') {
    act({ id: id(), type: 'card.create', payload: { id: id(), listId: c.listId, title: name } })
    return
  }
  if (c.kind === 'rename') {
    act({ id: id(), type: 'list.rename', payload: { id: c.listId, name } })
    return
  }
  if (c.kind === 'sub') {
    act({ id: id(), type: 'subtask.create', payload: { id: id(), cardId: c.cardId, title: name } })
    return
  }
  if (c.kind === 'tag') {
    const tagId = id()
    act({ id: id(), type: 'tag.create', payload: { id: tagId, name } })
    const current = state.snapshot.cardTags.filter((item) => item.cardId === c.cardId).map((item) => item.tagId)
    act({ id: id(), type: 'card.setTags', payload: { cardId: c.cardId, tagIds: current.concat(tagId) } })
  }
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function nameOf(rows, id) {
  return rows.find((row) => row.id === id)?.name || ''
}

function listProject(snap, listId) {
  return snap.lists.find((list) => list.id === listId)?.projectId || ''
}

function filterCount() {
  return ['priority', 'tagId', 'done'].filter((key) => ui.filter[key]).length
}

function toLocal(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

app.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  const insideTagPop = event.target.closest('.tag-pop, .tag-add')
  let closedTagPop = false
  if (ui.tagPicker && !insideTagPop) {
    ui.tagPicker = false
    if (ui.composer?.kind === 'tag') ui.composer = null
    closedTagPop = true
  }
  if (ui.openCardId && !event.target.closest('.detail, .menu, article.card')) {
    ui.openCardId = ''
    ui.tagPicker = false
    if (ui.composer && (ui.composer.kind === 'tag' || ui.composer.kind === 'sub')) ui.composer = null
    if (!button) { paint(); return }
  }
  if (!button) {
    const card = event.target.closest('article.card')
    if (card) { ui.openCardId = card.dataset.card; paint(); return }
    if (event.target.closest('.composer-card, .list-pop, .menu, .detail, .sub-editor')) {
      if (closedTagPop) paint()
      return
    }
    if (ui.menu) { closeMenu(); paint() }
    else if (closedTagPop) paint()
    return
  }
  const actName = button.dataset.act
  const menu = button.dataset.menu
  if (menu) {
    if (ui.menu === menu) closeMenu()
    else {
      const rect = button.getBoundingClientRect()
      ui.menu = menu
      ui.menuAnchor = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }
    }
    paint()
    return
  }
  if (actName === 'pick-project') { ui.projectId = button.dataset.id; closeMenu(); paint(); persist(); return }
  if (actName === 'add-project') { openComposer('project'); return }
  if (actName === 'add-list') { openComposer('list'); return }
  if (actName === 'add-card') { openComposer('card', { listId: button.dataset.list }); return }
  if (actName === 'cancel-composer') { ui.composer = null; paint(); return }
  if (actName === 'submit-composer') { submitComposer(); return }
  if (actName === 'toggle') {
    const card = state.snapshot.cards.find((item) => item.id === button.dataset.card)
    act({ id: id(), type: 'card.patch', payload: { id: card.id, done: !card.done } })
    return
  }
  if (actName === 'open') { ui.openCardId = button.dataset.card; paint(); return }
  if (actName === 'close') { ui.openCardId = ''; paint(); return }
  if (actName === 'settings') { ui.settingsOpen = true; closeMenu(); paint(); return }
  if (actName === 'close-host') { closeHost(); return }
  if (actName === 'close-settings') { ui.settingsOpen = false; paint(); return }
  if (actName === 'save-settings') {
    settings = { base: document.querySelector('#set-base').value.trim(), token: document.querySelector('#set-token').value.trim() }
    persist()
    void sync()
    return
  }
  if (actName === 'hide-list') { closeMenu(); act({ id: id(), type: 'list.hide', payload: { id: button.dataset.id, hidden: true } }); return }
  if (actName === 'show-list') { closeMenu(); act({ id: id(), type: 'list.hide', payload: { id: button.dataset.id, hidden: false } }); return }
  if (actName === 'set-pri') { closeMenu(); act({ id: id(), type: 'card.patch', payload: { id: button.dataset.card, priority: button.dataset.value } }); return }
  if (actName === 'filter-pri') {
    ui.filter.priority = ui.filter.priority === button.dataset.value ? '' : button.dataset.value
    paint(); return
  }
  if (actName === 'filter-done') {
    ui.filter.done = ui.filter.done === button.dataset.value ? '' : button.dataset.value
    paint(); return
  }
  if (actName === 'filter-tag') {
    ui.filter.tagId = ui.filter.tagId === button.dataset.id ? '' : button.dataset.id
    paint(); return
  }
  if (actName === 'filter-reset') { ui.filter = { priority: '', tagId: '', done: '' }; paint(); return }
  if (actName === 'delete-list') {
    if (confirm('删除这个列表和里面的卡片？')) act({ id: id(), type: 'list.delete', payload: { id: button.dataset.id } })
    return
  }
  if (actName === 'rename-list') {
    const list = state.snapshot.lists.find((item) => item.id === button.dataset.id)
    openComposer('rename', { listId: button.dataset.id, text: list?.name || '' })
    return
  }
  if (actName === 'delete-card') {
    if (confirm('删除这张卡片？')) { ui.openCardId = ''; act({ id: id(), type: 'card.delete', payload: { id: button.dataset.card } }) }
    return
  }
  if (actName === 'add-sub') { ui.tagPicker = false; openComposer('sub', { cardId: button.dataset.card }); return }
  if (actName === 'toggle-sub') {
    const sub = state.snapshot.subtasks.find((item) => item.id === button.dataset.id)
    act({ id: id(), type: 'subtask.patch', payload: { id: sub.id, done: !sub.done } })
    return
  }
  if (actName === 'toggle-tag-pop') { ui.tagPicker = !ui.tagPicker; paint(); return }
  if (actName === 'toggle-tag') {
    const current = state.snapshot.cardTags.filter((item) => item.cardId === ui.openCardId).map((item) => item.tagId)
    const tagId = button.dataset.id
    const tagIds = current.includes(tagId) ? current.filter((item) => item !== tagId) : current.concat(tagId)
    ui.tagPicker = true
    act({ id: id(), type: 'card.setTags', payload: { cardId: ui.openCardId, tagIds } })
    return
  }
  if (actName === 'add-tag') { ui.tagPicker = true; openComposer('tag', { cardId: ui.openCardId }); return }
  if (actName === 'delete-tag') {
    ui.tagPicker = true
    if (confirm('删除这个标签？所有卡片上的这个标签都会去掉。')) {
      act({ id: id(), type: 'tag.delete', payload: { id: button.dataset.id } })
    }
    return
  }
  if (actName === 'delete-comment') {
    act({ id: id(), type: 'comment.delete', payload: { id: button.dataset.id } })
    return
  }
  if (actName === 'add-comment') {
    const body = document.querySelector('#comment-body').value
    const files = [...document.querySelector('#comment-images').files]
    Promise.all(files.map((file) => file.arrayBuffer().then((buf) => ({
      id: id(), mime: file.type || 'application/octet-stream', dataBase64: bytesToBase64(new Uint8Array(buf)),
    })))).then((images) => {
      ui.commentDraft = ''
      act({ id: id(), type: 'comment.create', payload: { id: id(), cardId: button.dataset.card, body, images } })
    }).catch(() => {
      state = { ...state, syncError: '同步失败，改动还在本地' }
      paint()
    })
  }
  if (actName === 'delete-project') {
    const projectName = nameOf(state.snapshot.projects, button.dataset.id) || '这个项目'
    if (confirm(`删除项目「${projectName}」？里面的列表和卡片会一起删掉。`)) {
      const projectId = button.dataset.id
      if (ui.projectId === projectId) ui.projectId = ''
      closeMenu()
      act({ id: id(), type: 'project.delete', payload: { id: projectId } })
    }
  }
})

app.addEventListener('mousedown', (event) => {
  const submit = event.target.closest('[data-act="submit-composer"]')
  if (!submit || !submit.classList.contains('ready')) return
  event.preventDefault()
  submitComposer()
})

app.addEventListener('focusout', (event) => {
  const next = event.relatedTarget
  if (next && next.closest && next.closest('[data-act="submit-composer"], [data-act="cancel-composer"]')) return
  setTimeout(() => {
    if (!paintAfterType || typing()) return
    paintAfterType = false
    paint()
  }, 0)
})

app.addEventListener('input', (event) => {
  if (event.target.id === 'comment-body') ui.commentDraft = event.target.value
  if (event.target.id === 'composer-input' && ui.composer) {
    ui.composer.text = event.target.value
    const ok = event.target.closest('.sub-editor, .tag-pop, form')?.querySelector('.btn-ok')
    if (ok) ok.classList.toggle('ready', event.target.value.trim().length > 0)
  }
})

let skipComposerEnter = false
app.addEventListener('compositionstart', (event) => {
  if (event.target.id === 'composer-input') skipComposerEnter = false
})
app.addEventListener('compositionend', (event) => {
  if (event.target.id !== 'composer-input') return
  skipComposerEnter = true
  setTimeout(() => { skipComposerEnter = false }, 80)
})
app.addEventListener('keydown', (event) => {
  if (event.target.id !== 'composer-input') return
  if (event.key === 'Enter') {
    if (event.isComposing || event.keyCode === 229 || skipComposerEnter) return
    event.preventDefault()
    submitComposer()
  }
  if (event.key === 'Escape') { ui.composer = null; paint() }
})

app.addEventListener('change', (event) => {
  if (event.target.id === 'card-title') {
    act({ id: id(), type: 'card.patch', payload: { id: ui.openCardId, title: event.target.value } })
  }
  if (event.target.id === 'card-pri') {
    act({ id: id(), type: 'card.patch', payload: { id: ui.openCardId, priority: event.target.value } })
  }
  if (event.target.id === 'card-due') {
    const value = event.target.value ? new Date(event.target.value).toISOString() : null
    act({ id: id(), type: 'card.patch', payload: { id: ui.openCardId, dueAt: value } })
  }
  if (event.target.id === 'card-list') {
    act({ id: id(), type: 'card.move', payload: { id: ui.openCardId, listId: event.target.value, index: 0 } })
  }
  if (event.target.id === 'card-project') {
    const list = state.snapshot.lists.find((item) => item.projectId === event.target.value && !item.hidden)
      || state.snapshot.lists.find((item) => item.projectId === event.target.value)
    if (list) {
      ui.projectId = event.target.value
      act({ id: id(), type: 'card.move', payload: { id: ui.openCardId, listId: list.id, index: 0 } })
    }
  }
  if (event.target.id === 'comment-body') ui.commentDraft = event.target.value
  if (event.target.dataset.tag) {
    const tagIds = [...app.querySelectorAll('[data-tag]:checked')].map((node) => node.dataset.tag)
    act({ id: id(), type: 'card.setTags', payload: { cardId: ui.openCardId, tagIds } })
  }
  if (event.target.id === 'import-file' && event.target.files[0]) {
    if (!confirm('会换掉服务器上的全部看板，还没同步的本地改动也会丢掉。')) return
    event.target.files[0].arrayBuffer().then(async (buf) => {
      try {
        const res = await fetch(settings.base.replace(/\/$/, '') + '/api/import', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + settings.token, 'content-type': 'application/octet-stream' },
          body: buf,
        })
        if (!res.ok) throw new Error('import')
        state = finishImport(state, await res.json())
      } catch {
        state = failImport(state)
      }
      paint()
      persist()
    })
  }
})

let dragging = null

function nearestColumn(x) {
  const cols = [...document.querySelectorAll('.col')]
  let best = null
  let bestDist = Infinity
  for (const col of cols) {
    const rect = col.getBoundingClientRect()
    if (x < rect.left - 28 || x > rect.right + 28) continue
    const dist = Math.abs(x - (rect.left + rect.right) / 2)
    if (dist < bestDist) { best = col; bestDist = dist }
  }
  return best
}

function markDrop(col) {
  document.querySelectorAll('.col.drop-on').forEach((node) => { if (node !== col) node.classList.remove('drop-on') })
  if (col) col.classList.add('drop-on')
}

app.addEventListener('dragstart', (event) => {
  if (event.target.closest('button, input, textarea')) { event.preventDefault(); return }
  const card = event.target.closest('article.card')
  const head = event.target.closest('.col-head')
  if (card) {
    dragging = { type: 'card', id: card.dataset.card }
    card.classList.add('dragging')
  } else if (head) {
    dragging = { type: 'list', id: head.parentElement.dataset.list }
  } else {
    event.preventDefault()
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', dragging.id)
})

app.addEventListener('dragover', (event) => {
  if (!dragging) return
  const col = nearestColumn(event.clientX) || event.target.closest('.col')
  if (!col) return
  event.preventDefault()
  markDrop(col)
})

app.addEventListener('drop', (event) => {
  const col = document.querySelector('.col.drop-on') || nearestColumn(event.clientX)
  markDrop(null)
  if (!dragging || !col) { dragging = null; return }
  event.preventDefault()
  if (dragging.type === 'card') {
    const cards = [...col.querySelectorAll('article.card')].filter((node) => node.dataset.card !== dragging.id)
    const index = insertIndex(cards.map((node) => {
      const rect = node.getBoundingClientRect()
      return rect.top + rect.height / 2
    }), event.clientY)
    act({ id: id(), type: 'card.move', payload: { id: dragging.id, listId: col.dataset.list, index } })
  } else {
    const cols = [...document.querySelectorAll('.col')].filter((node) => node.dataset.list !== dragging.id)
    const index = insertIndex(cols.map((node) => {
      const rect = node.getBoundingClientRect()
      return rect.left + rect.width / 2
    }), event.clientX)
    const visible = state.snapshot.lists
      .filter((list) => list.projectId === ui.projectId && !list.hidden)
      .sort((a, b) => a.position - b.position)
      .map((list) => list.id)
      .filter((listId) => listId !== dragging.id)
    visible.splice(index, 0, dragging.id)
    const all = state.snapshot.lists
      .filter((list) => list.projectId === ui.projectId)
      .sort((a, b) => a.position - b.position)
    let cursor = 0
    const ids = all.map((list) => (list.hidden ? list.id : visible[cursor++]))
    act({ id: id(), type: 'list.reorder', payload: { projectId: ui.projectId, ids } })
  }
  dragging = null
})

app.addEventListener('dragend', () => {
  dragging = null
  markDrop(null)
  document.querySelectorAll('.card.dragging').forEach((node) => node.classList.remove('dragging'))
})

const saved = window.__bridge?.load?.()
if (saved?.state?.snapshot && Array.isArray(saved.state.snapshot.projects)) {
  state = saved.state
  if (!Array.isArray(state.queue)) state.queue = []
  if (typeof state.syncError !== 'string') state.syncError = ''
}
if (saved?.settings) settings = saved.settings
if (typeof saved?.projectId === 'string') ui.projectId = saved.projectId
if (!state.snapshot.projects.length) {
  const projectId = id()
  const listId = id()
  state = applyLocal(state, { id: id(), type: 'project.create', payload: { id: projectId, name: '需求管理' } })
  state = applyLocal(state, { id: id(), type: 'list.create', payload: { id: listId, projectId, name: '日常事务' } })
  ui.projectId = projectId
}
paint()
void sync()
setInterval(() => { void sync() }, 60 * 1000)
