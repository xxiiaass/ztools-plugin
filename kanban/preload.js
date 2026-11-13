'use strict'

var fs = null
try { fs = require('fs') } catch (e) {}
var path = null
try { path = require('path') } catch (e) {}
var electron = null
try { electron = require('electron') } catch (e) {}

function safe(fn, fallback) {
  try { return fn() } catch (e) { return fallback }
}

function ipc(channel, payload) {
  return safe(function () {
    if (!electron || !electron.ipcRenderer) return undefined
    return electron.ipcRenderer.sendSync(channel, payload)
  }, undefined)
}

function dataDir() {
  var dir = ipc('get-path', 'pluginData')
  if (typeof dir !== 'string' || !dir) {
    dir = safe(function () { return path.join(process.env.HOME || '', '.ztools', 'plugins-data', 'kanban') }, '')
  }
  if (!dir) return ''
  safe(function () { if (fs && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) })
  return dir
}

function file() {
  var dir = dataDir()
  return dir ? path.join(dir, 'state.json') : ''
}

window.__bridge = {
  load: function () {
    var target = file()
    if (!target || !fs || !fs.existsSync(target)) return null
    return safe(function () { return JSON.parse(fs.readFileSync(target, 'utf8')) }, null)
  },
  save: function (data) {
    var target = file()
    if (!target || !fs) return
    safe(function () { fs.writeFileSync(target, JSON.stringify(data)) })
  },
}
