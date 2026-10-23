/**
 * CSV 关联 - preload
 * 只负责宿主侧读写文件。注意：preload 里 electron.app / electron.shell 拿不到，
 * 系统路径、保存对话框、剪贴板这些一律走 ipcRenderer 的 ZTools 通道（和宿主自家实现一致）。
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

/** 系统目录：优先问主进程，退化为 ~/Downloads */
function downloadsDir() {
  var d = ipc('get-path', 'downloads');
  if (typeof d === 'string' && d) return d;
  return safe(function () { return path.join(process.env.HOME || '', 'Downloads'); }, '');
}

/** 同名文件已存在时加时间戳，避免静默覆盖 */
function uniquePath(dir, filename) {
  if (!dir || !fs) return '';
  var base = filename || 'csv-join.csv';
  var full = path.join(dir, base);
  if (!fs.existsSync(full)) return full;
  return path.join(dir, base.replace(/\.csv$/i, '') + '-' + Date.now() + '.csv');
}

window.__bridge = {
  /** 写剪贴板（走主进程，等同 ztools.copyText） */
  writeClipboard: function (text) {
    return ipc('copy-text', String(text)) === true;
  },

  /** 写指定绝对路径，返回 true / false */
  writeTextFile: function (file, content) {
    return safe(function () {
      if (!file || !fs) return false;
      var body = String(content);
      if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
      fs.writeFileSync(file, '\ufeff' + body, 'utf8'); // 带 BOM，Excel 打开中文不乱码
      return true;
    }, false);
  },

  /** 保存到下载目录，返回完整路径；失败返回空串 */
  saveFile: function (filename, content) {
    return safe(function () {
      var file = uniquePath(downloadsDir(), filename);
      if (!file) return '';
      return window.__bridge.writeTextFile(file, content) ? file : '';
    }, '');
  },

  /**
   * 读本地文本文件（供从 ZTools 选中文件直接带入时使用）
   * @param {string} file 绝对路径
   * @returns {string} 内容；失败返回空串
   */
  readTextFile: function (file) {
    return safe(function () {
      if (!file || !fs || !fs.existsSync(file)) return '';
      var buf = fs.readFileSync(file);
      var text = buf.toString('utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      // 出现替换符多半是 GBK，兜底转一次
      if (text.indexOf('\ufffd') >= 0) {
        try {
          var iconv = require('iconv-lite');
          var g = iconv.decode(buf, 'gbk');
          if (g.indexOf('\ufffd') < 0) text = g;
        } catch (e) {}
      }
      return text;
    }, '');
  },

  /** 在访达 / 资源管理器里高亮该文件 */
  reveal: function (file) {
    if (!file) return false;
    return ipc('shell-show-item-in-folder', file) !== false;
  }
}
