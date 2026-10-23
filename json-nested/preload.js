/**
 * JSON 嵌套解析 - preload
 *
 * 补足渲染层做不到的两件小事：
 *   1. 读剪贴板文本（ztools 只提供 copyText 写，没提供读）
 *   2. 另存为文件（用 node fs，不弹系统对话框）
 *
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

/** 插件数据目录：优先问主进程要 pluginData，退化到 ~/.ztools/plugins-data/json-nested */
function dataDir() {
  var d = ipc('get-path', 'pluginData');
  if (typeof d !== 'string' || !d) {
    d = safe(function () { return path.join(process.env.HOME || '', '.ztools', 'plugins-data', 'json-nested'); }, '');
  }
  if (!d) return '';
  safe(function () { if (fs && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  return d;
}

window.__jnBridge = {
  /** 读取系统剪贴板纯文本 */
  readClipboard: function () {
    return safe(function () { return electron.clipboard.readText() || ''; }, '');
  },

  /** 写入系统剪贴板（优先走主进程的 copy-text 通道） */
  writeClipboard: function (text) {
    if (ipc('copy-text', String(text)) === true) return true;
    return safe(function () { electron.clipboard.writeText(String(text)); return true; }, false);
  },

  /** 插件专属数据目录 */
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

  /** 把内容另存为文件，返回完整路径；失败返回空串 */
  saveFile: function (filename, content) {
    return safe(function () {
      var dir = dataDir();
      if (!dir) return '';
      var file = path.join(dir, filename || 'json-' + Date.now() + '.json');
      return window.__jnBridge.writeTextFile(file, content) ? file : '';
    }, '');
  }
}

// uTools 兼容 shim：本插件内部仍统一用 ztools 命名空间，
// 这里只是让从 uTools 拷来的代码片段（utools.xxx）能直接跑。
if (typeof window.ztools !== 'undefined' && typeof window.utools === 'undefined') {
  window.utools = window.ztools
}
