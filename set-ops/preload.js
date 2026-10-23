/**
 * 文本集合运算 - preload
 * 宿主侧的小事：读/写剪贴板、插件数据目录、另存文件。
 * 注意：preload 里 electron.app / electron.shell 是拿不到的，系统路径一律走 ipcRenderer 的 ZTools 通道。
 */

'use strict'

var electron = null
try { electron = require('electron'); } catch (e) {}
var fs = null
try { fs = require('fs'); } catch (e) {}
var path = null
try { path = require('path'); } catch (e) {}

function safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

function ipc(channel, payload) {
  return safe(function () {
    if (!electron || !electron.ipcRenderer) return undefined;
    return electron.ipcRenderer.sendSync(channel, payload);
  }, undefined);
}

/** 插件数据目录：优先问主进程要 pluginData，退化到 ~/.ztools/plugins-data/set-ops */
function dataDir() {
  var d = ipc('get-path', 'pluginData');
  if (typeof d !== 'string' || !d) {
    d = safe(function () { return path.join(process.env.HOME || '', '.ztools', 'plugins-data', 'set-ops'); }, '');
  }
  if (!d) return '';
  safe(function () { if (fs && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  return d;
}

window.__bridge = {
  /** 读剪贴板纯文本（ZTools 只提供写，读要用 electron 的 clipboard） */
  readClipboard: function () {
    return safe(function () { return electron.clipboard.readText() || ''; }, '');
  },

  /** 写剪贴板：优先走主进程的 copy-text 通道 */
  writeClipboard: function (text) {
    if (ipc('copy-text', String(text)) === true) return true;
    return safe(function () { electron.clipboard.writeText(String(text)); return true; }, false);
  },

  pluginDataDir: dataDir,

  /** 写指定绝对路径，返回 true / false */
  writeTextFile: function (file, content) {
    return safe(function () {
      if (!file || !fs) return false;
      var body = String(content);
      if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
      fs.writeFileSync(file, '\ufeff' + body, 'utf8');
      return true;
    }, false);
  },

  /** 存到插件数据目录，返回完整路径；失败返回空串 */
  saveFile: function (filename, content) {
    return safe(function () {
      var dir = dataDir();
      if (!dir) return '';
      var file = path.join(dir, filename || 'set-' + Date.now() + '.txt');
      return window.__bridge.writeTextFile(file, content) ? file : '';
    }, '');
  }
}
