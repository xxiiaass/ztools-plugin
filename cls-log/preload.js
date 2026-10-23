/**
 * CLS 日志查询：UUID → 选环境 → Firefox 打开腾讯云 CLS 检索页
 *
 * 列表模式（mode: 'list'）：选中一个 UUID 后弹出三个环境选项，回车/点击即用 Firefox 打开。
 */

'use strict'

/* ══════════════ 环境配置（改这里就能增删入口） ══════════════ */

var COMMON = {
  timeZone: 'browser',
  analysis: 'eyJ0eXBlIjoidGFibGUifQ',
  topicType: 'log',
  multiple: 'false',
  disabledRanges: 'W10'
}

// params 里的顺序就是最终 URL 的参数顺序，和你手工拼的保持一致
var TARGETS = [
  {
    key: 'eo-prod',
    title: 'eo 生产日志',
    description: 'ap-nanjing · 最近 1 小时 · lucene',
    params: {
      region: 'ap-nanjing',
      topic_id: 'ae27df3c-8630-4c2b-a315-d5148a6e1733',
      queryBase64: '@QUERY@',
      grammarVersion: 'lucene',
      time: 'now-h,now'
    }
  },
  {
    key: 'eo-test',
    title: 'eo 测试日志',
    description: 'ap-shanghai · 最近 3 天 · lucene',
    params: {
      grammarVersion: 'lucene',
      region: 'ap-shanghai',
      topic_id: '841abb75-c333-49c7-a632-4037810622d1',
      queryBase64: '@QUERY@',
      time: 'now-3d,now'
    }
  },
  {
    key: 'compliance-prod',
    title: '合规生产日志',
    description: 'ap-nanjing · 最近 1 小时',
    params: {
      region: 'ap-nanjing',
      topic_id: '61fa31d6-9a21-4a63-b932-af5babf9b292',
      queryBase64: '@QUERY@',
      time: 'now-h,now'
    }
  }
]

/* ══════════════ 纯函数 ══════════════ */

/** 从任意文本里抠出第一个 UUID */
function extractUuid(text) {
  var s = String(text == null ? '' : text)
  var m = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  return m ? m[0] : ''
}

/** base64（URL 安全：+ / 编码，去掉尾部 =） */
function toQueryBase64(str) {
  var b64 = typeof btoa === 'function'
    ? btoa(str)
    : Buffer.from(str, 'utf8').toString('base64')
  return b64
    .replace(/\+/g, '%2B')
    .replace(/\//g, '%2F')
    .replace(/=+$/, '')
}

/** 拼出最终的 CLS 检索地址 */
function buildUrl(target, uuid) {
  var parts = []
  var keys = Object.keys(target.params)
  for (var i = 0; i < keys.length; i++) {
    var v = target.params[keys[i]]
    if (v === '@QUERY@') v = toQueryBase64(uuid)
    parts.push(keys[i] + '=' + v)
  }
  var rest = Object.keys(COMMON)
  for (var j = 0; j < rest.length; j++) {
    parts.push(rest[j] + '=' + COMMON[rest[j]])
  }
  return 'https://console.cloud.tencent.com/cls/search?' + parts.join('&')
}

function listItems(uuid) {
  var items = []
  for (var i = 0; i < TARGETS.length; i++) {
    items.push({
      key: TARGETS[i].key,
      title: TARGETS[i].title,
      description: TARGETS[i].description + '　→　' + uuid,
      uuid: uuid
    })
  }
  return items
}

/* ══════════════ 打开浏览器 ══════════════ */

var execFile = null
try { execFile = require('child_process').execFile; } catch (e) {}
var os = null
try { os = require('os'); } catch (e) {}
var fs = null
try { fs = require('fs'); } catch (e) {}

function hasFirefox() {
  if (!fs || !os) return false
  var p = os.platform()
  if (p === 'darwin') return fs.existsSync('/Applications/Firefox.app')
  if (p === 'win32') {
    var bases = ['C:\\Program Files\\Mozilla Firefox', 'C:\\Program Files (x86)\\Mozilla Firefox']
    for (var i = 0; i < bases.length; i++) if (fs.existsSync(bases[i])) return true
    return false
  }
  return true
}

/**
 * 用 Firefox 打开；没装 Firefox 就退回系统默认浏览器
 * @returns {Promise<string>} 实际用的方式
 */
function openInFirefox(url) {
  return new Promise(function (resolve) {
    if (!execFile) { resolve('failed'); return; }
    var platform = os ? os.platform() : 'darwin'
    var useFF = hasFirefox()
    var cmd, args
    if (platform === 'darwin') {
      cmd = 'open'
      args = useFF ? ['-a', 'Firefox', url] : [url]
    } else if (platform === 'win32') {
      cmd = 'cmd'
      args = ['/c', 'start', ''].concat(useFF ? ['firefox', url] : [url])
    } else {
      cmd = useFF ? 'firefox' : 'xdg-open'
      args = [url]
    }
    execFile(cmd, args, { timeout: 8000 }, function (err) {
      if (err && useFF) {
        // Firefox 起了但打不开，再退一次默认浏览器
        var fallback = platform === 'darwin' ? ['-a', 'Safari', url] : [url]
        execFile(cmd, platform === 'darwin' ? fallback : [url], { timeout: 8000 }, function (err2) {
          resolve(err2 ? 'failed' : 'fallback')
        })
        return
      }
      resolve(err ? 'failed' : (useFF ? 'firefox' : 'default'))
    })
  })
}

function notify(msg) {
  try { if (window.ztools && window.ztools.showNotification) { window.ztools.showNotification(msg); return; } } catch (e) {}
  try { if (window.ztools && window.ztools.showToast) window.ztools.showToast(msg); } catch (e) {}
}

function readClipboard() {
  try {
    var electron = require('electron')
    return electron.clipboard.readText() || ''
  } catch (e) { return ''; }
}
function writeClipboard(text) {
  try {
    var electron = require('electron')
    electron.clipboard.writeText(String(text))
    return true
  } catch (e) {}
  try { window.ztools.copyText(String(text)); return true; } catch (e) {}
  return false
}

/* ══════════════ 列表模式 ══════════════ */

function makeList() {
  return {
    mode: 'list',
    args: {
      placeholder: '选择环境（可输入过滤）',
      enter: function (action, setList) {
        var uuid = extractUuid(action && action.payload ? action.payload : '')
        if (!uuid) uuid = extractUuid(readClipboard())
        if (!uuid) { setList([{ title: '没找到 UUID', description: '请复制一个形如 f2d5cf0f-cf0d-4fec-b9d6-b1f46bb3be09 的 ID' }]); return; }
        setList(listItems(uuid))
      },
      search: function (action, text, setList) {
        var uuid = extractUuid(action && action.payload ? action.payload : '') || extractUuid(readClipboard())
        var all = listItems(uuid)
        var kw = String(text || '').trim().toLowerCase()
        if (!kw) { setList(all); return; }
        setList(all.filter(function (it) {
          return (it.title + it.description).toLowerCase().indexOf(kw) >= 0
        }))
      },
      select: function (action, item) {
        var uuid = item.uuid || extractUuid(action && action.payload ? action.payload : '')
        if (!uuid || !item.key) return
        var target = null
        for (var i = 0; i < TARGETS.length; i++) if (TARGETS[i].key === item.key) target = TARGETS[i]
        if (!target) return
        var url = buildUrl(target, uuid)
        openInFirefox(url).then(function (how) {
          if (how === 'failed') {
            writeClipboard(url)
            notify('打开失败，网址已复制到剪贴板')
          } else if (how === 'default' || how === 'fallback') {
            notify('没找到 Firefox，已用默认浏览器打开')
          }
        })
        try { window.ztools.outPlugin && window.ztools.outPlugin(); } catch (e) {}
      }
    }
  }
}

window.exports = {
  'open': makeList(),
  'open-any': makeList(),
  'open-clip': makeList()
}

// 便于单测
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractUuid: extractUuid, toQueryBase64: toQueryBase64, buildUrl: buildUrl, TARGETS: TARGETS }
}
