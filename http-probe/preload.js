/**
 * HTTP 循环探测 - preload
 *
 * 请求放在这里发，不用页面的 fetch：
 *   1. 绕开 CORS（页面是 file:// 或 plugin://，直连几乎必被拦）
 *   2. 能拿到真实连接 IP（res.socket.remoteAddress）和完整响应头
 *   3. 能精细控制超时、重定向、自签证书
 *
 * 注意：preload 里 electron.app / electron.shell 拿不到，这里只用到 node 内置模块。
 */

'use strict'

var http = null
var https = null
var dns = null
try {
  http = require('http')
  https = require('https')
  dns = require('dns')
} catch (e) {}

// 响应体只留前 4KB 用于预览，长度仍然按真实字节数统计
var PREVIEW_LIMIT = 4096
var MAX_REDIRECTS = 5

function safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

function ipOf(res) {
  return safe(function () {
    var ip = res.socket && (res.socket.remoteAddress || res.socket._host)
    if (!ip) return ''
    return String(ip).replace(/^::ffff:/, '')
  }, '')
}

function headerValue(headers, name) {
  var lower = String(name).toLowerCase()
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === lower) {
      var v = headers[k]
      return Array.isArray(v) ? v.join(', ') : String(v)
    }
  }
  return ''
}

/**
 * 发一次请求
 * @param {{url:string, method?:string, headers?:Object, body?:string,
 *          timeoutMs?:number, insecure?:boolean, followRedirect?:boolean}} o
 * @returns {Promise<Object>}
 */
function requestOnce(o) {
  return new Promise(function (resolve) {
    if (!http || !https) return resolve({ ok: false, error: '当前环境拿不到 node http 模块' })

    var u
    try {
      u = new URL(String(o.url || ''))
    } catch (e) {
      return resolve({ ok: false, error: 'URL 解析失败：' + String(o.url || '') })
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return resolve({ ok: false, error: '只支持 http / https' })
    }

    var isHttps = u.protocol === 'https:'
    var lib = isHttps ? https : http
    var method = String(o.method || 'GET').toUpperCase()
    var body = o.body == null ? '' : String(o.body)
    var headers = {}
    var src = o.headers || {}
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k) && src[k] != null) headers[k] = String(src[k])
    }
    var withBody = body !== '' && method !== 'GET' && method !== 'HEAD'
    if (withBody && !headerValue(headers, 'content-length')) {
      headers['Content-Length'] = Buffer.byteLength(body)
    }

    var timeoutMs = Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : 15000
    var t0 = Date.now()
    var settled = false
    function done(r) { if (!settled) { settled = true; resolve(r) } }

    var req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: (u.pathname || '/') + (u.search || ''),
      method: method,
      headers: headers,
      rejectUnauthorized: !o.insecure,
      timeout: timeoutMs
    }, function (res) {
      // socket 在响应结束后可能已经 detach，IP 要在响应头阶段就抓下来
      var ip = ipOf(res)
      var total = 0
      var kept = []
      var remaining = PREVIEW_LIMIT
      res.on('data', function (chunk) {
        total += chunk.length
        if (remaining > 0) {
          var take = chunk.length <= remaining ? chunk : chunk.slice(0, remaining)
          kept.push(take)
          remaining -= take.length
        }
      })
      res.on('end', function () {
        done({
          ok: true,
          status: res.statusCode,
          statusText: res.statusMessage || '',
          ms: Date.now() - t0,
          bytes: total,
          ip: ip,
          headers: res.headers,
          body: Buffer.concat(kept).toString('utf8'),
          truncated: total > PREVIEW_LIMIT,
          location: headerValue(res.headers, 'location')
        })
      })
      res.on('error', function (e) { done({ ok: false, error: '读响应出错：' + e.message, ms: Date.now() - t0 }) })
    })

    req.on('timeout', function () {
      done({ ok: false, error: '超时（' + timeoutMs + 'ms）', ms: Date.now() - t0, timeout: true })
      req.destroy()
    })
    req.on('error', function (e) {
      var code = e && e.code ? e.code + ' ' : ''
      done({ ok: false, error: code + (e && e.message ? e.message : String(e)), ms: Date.now() - t0 })
    })

    if (withBody) req.write(body)
    req.end()
  })
}

/** 带上重定向跟随 */
function request(o, depth) {
  var d = depth == null ? 0 : depth
  return requestOnce(o).then(function (r) {
    var code = r.status || 0
    var wantFollow = o.followRedirect !== false
    if (wantFollow && r.ok && code >= 300 && code < 400 && r.location && d < MAX_REDIRECTS) {
      var next = r.location
      if (!/^https?:\/\//i.test(next)) {
        try { next = new URL(next, o.url).toString() } catch (e) { return r }
      }
      var o2 = {}
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) o2[k] = o[k]
      o2.url = next
      return request(o2, d + 1).then(function (r2) {
        r2.redirects = (r2.redirects || 0) + 1
        r2.finalUrl = r2.finalUrl || next
        return r2
      })
    }
    if (d > 0) { r.redirects = d; r.finalUrl = o.url }
    return r
  })
}

window.__probe = {
  request: request,
  /** 解析域名（有些环境 remoteAddress 拿不到时的补充） */
  lookup: function (host) {
    return new Promise(function (resolve) {
      if (!dns) return resolve('')
      dns.lookup(String(host), function (err, addr) { resolve(err ? '' : addr) })
    })
  }
}
