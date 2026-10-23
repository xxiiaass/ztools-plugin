/**
 * JSON 预处理 → 转发给 json-editor
 *
 * 用法：在 ZTools 输入一段文本，列表里会出现「JSON预处理 → json-editor」，
 *       回车后用本文件的 JS 把文本洗干净，再跳转 json-editor 打开结果。
 *
 * 无界面插件：不打开任何窗口，preload 里跑完就跳转。
 */

'use strict'

/* ══════════════ 可调参数 ══════════════ */

// 目标插件：[插件显示名, 指令名]。本机的 json-editor 指令叫 "Json"，且它声明了
// regex 类型入口 —— 只有 regex / over 类型的指令才能接收 redirect 带过去的文本。
var TARGET = ['json-editor', 'Json']
var TARGET_CMD = 'Json' // 上面的二元组匹配不到时的降级写法

// 是否顺手把「值本身就是 JSON 字符串」的嵌套层也展开（多层套娃场景）
// 默认 false：只做解转义 + 容错解析 + 标准序列化，不改变数据结构
var UNWRAP_NESTED = false

// 输出格式：'compact' 紧凑 | 'pretty' 缩进 2 空格
var OUTPUT = 'compact'

/* ══════════════ 文本预处理（纯函数，可单测） ══════════════ */

/** 反复转义解包："\"{\\\"a\\\":1}\"" → {"a":1} */
function unwrapEscapes(raw) {
  var t = String(raw == null ? '' : raw).replace(/^﻿/, '').trim()
  var levels = 0
  while (levels < 12) {
    var v
    try { v = JSON.parse(t); } catch (e) { break; }
    if (typeof v !== 'string') break;
    var next = String(v).trim()
    if (next === t) break;
    t = next
    levels++
  }
  return { text: t, levels: levels }
}

/** 容错清洗：注释、单引号、无引号 key、尾逗号、裸换行、NaN/Infinity */
function sanitize(s) {
  var out = '', inStr = false, quote = '', esc = false
  var inLine = false, inBlock = false
  for (var i = 0; i < s.length; i++) {
    var c = s[i], n = s[i + 1]
    if (inLine) { if (c === '\n') { inLine = false; out += ' '; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\') { out += c; esc = true; continue; }
      if (c === quote) { out += '"'; inStr = false; continue; }
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
      if (quote === "'" && c === '"') { out += '\\"'; continue; }
      out += c; continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = true; quote = c; out += '"'; continue; }
    if (c === '\n' || c === '\r' || c === '\t') { out += ' '; continue; }
    out += c
  }
  out = out.replace(/,(\s*[}\]])/g, '$1')
  out = out.replace(/([{,]\s*)([A-Za-z_$][\w$\-]*)\s*:/g, '$1"$2":')
  out = out.replace(/:\s*(NaN|Infinity|-Infinity|undefined)\s*([,}\]])/g, ':null$2')
  return out
}

/** 三级解析：严格 → 容错 → JS 求值 */
function looseParse(text) {
  var firstErr = ''
  try { return { ok: true, value: JSON.parse(text), mode: 'strict' }; } catch (e1) { firstErr = e1.message; }
  var fixed = sanitize(text)
  try { return { ok: true, value: JSON.parse(fixed), mode: 'repaired' }; } catch (e2) {}
  try {
    // eslint-disable-next-line no-new-func
    var fn = new Function('return (' + fixed + ')')
    return { ok: true, value: fn(), mode: 'js' }
  } catch (e3) {}
  return { ok: false, error: firstErr || 'unknown' }
}

/** 可选：递归展开「值是 JSON 字符串」的嵌套层 */
function deepUnwrap(value, depth) {
  if (depth > 20) return value
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) value[i] = deepUnwrap(value[i], depth + 1)
    return value
  }
  if (value && typeof value === 'object') {
    for (var k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) value[k] = deepUnwrap(value[k], depth + 1)
    }
    return value
  }
  if (typeof value === 'string') {
    var t = value.trim()
    if ((t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']')) {
      var r = looseParse(t)
      if (r.ok && r.value && typeof r.value === 'object') return deepUnwrap(r.value, depth + 1)
    }
  }
  return value
}

/**
 * 主处理：输入任意文本，输出尽量标准的 JSON 文本
 * @returns {{ok:boolean, text:string, levels:number, mode:string, error:string}}
 */
function preprocess(raw) {
  var un = unwrapEscapes(raw)
  var r = looseParse(un.text)
  if (r.ok) {
    var v = UNWRAP_NESTED ? deepUnwrap(r.value, 0) : r.value
    var text = OUTPUT === 'pretty' ? JSON.stringify(v, null, 2) : JSON.stringify(v)
    return { ok: true, text: text, levels: un.levels, mode: r.mode, error: '' }
  }
  // 解析不动：做一次「肉眼级」清洗后原样交出去，让 json-editor 自己报错
  var cleaned = un.text
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
  return { ok: false, text: cleaned || String(raw), levels: un.levels, mode: 'raw', error: r.error }
}

/* ══════════════ ZTools 接入 ══════════════ */

var electron = (function () {
  try { return require('electron'); } catch (e) { return null; }
})()

function readClipboard() {
  try { return electron && electron.clipboard ? electron.clipboard.readText() || '' : ''; } catch (e) { return ''; }
}
function writeClipboard(text) {
  try { if (electron && electron.clipboard) { electron.clipboard.writeText(String(text)); return true; } } catch (e) {}
  try { if (window.ztools && window.ztools.copyText) { window.ztools.copyText(String(text)); return true; } } catch (e) {}
  return false
}
function notify(msg) {
  try { if (window.ztools && window.ztools.showNotification) { window.ztools.showNotification(msg); return; } } catch (e) {}
  try { if (window.ztools && window.ztools.showToast) window.ztools.showToast(msg); } catch (e) {}
}

function redirectTo(text) {
  var Z = window.ztools || {}
  var ok = false
  // 1) 二元组：[插件显示名, 指令名]
  try { ok = Z.redirect ? Z.redirect(TARGET, text) : false; } catch (e) { ok = false; }
  // 2) 单个指令名
  if (!ok) { try { ok = Z.redirect ? Z.redirect(TARGET_CMD, text) : false; } catch (e) { ok = false; } }
  // 3) 兜底：结果放进剪贴板，再把工具打开（进去后直接 ⌘V）
  if (!ok) {
    writeClipboard(text)
    try { ok = Z.redirect ? Z.redirect(TARGET[0], '') : false; } catch (e) { ok = false; }
    return ok ? 'clipboard+open' : 'failed'
  }
  return 'ok'
}

function run(action) {
  var raw = action && typeof action.payload === 'string' ? action.payload : ''
  if (!raw.trim()) raw = readClipboard()
  if (!raw.trim()) { notify('没有可处理的文本'); return { ok: false }; }

  var out = preprocess(raw)
  var how = redirectTo(out.text)

  if (!out.ok) {
    notify('预处理没能解析成 JSON，已把能解开的转义去掉后交给 json-editor')
  } else if (out.mode !== 'strict') {
    notify('已' + (out.levels ? '解包 ' + out.levels + ' 层转义、' : '') +
      (out.mode === 'repaired' ? '容错修复' : 'JS 求值') + '后交给 json-editor')
  }
  return { ok: out.ok, how: how, levels: out.levels, mode: out.mode }
}

window.exports = {
  'prep-json': { mode: 'none', args: { enter: run } },
  'prep-any': { mode: 'none', args: { enter: run } },
  'prep-clip': {
    mode: 'none',
    args: {
      enter: function () {
        var text = readClipboard()
        if (!text.trim()) { notify('剪贴板里没有文本'); return { ok: false }; }
        return run({ type: 'text', payload: text })
      }
    }
  }
}

// 便于单测（Electron 环境里 module 未定义时自动跳过）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { preprocess: preprocess, unwrapEscapes: unwrapEscapes, sanitize: sanitize, looseParse: looseParse, deepUnwrap: deepUnwrap }
}
