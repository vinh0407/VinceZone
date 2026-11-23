/**
 * In-process Next.js <-> Electron `vincezone://studio` protocol bridge.
 * Runs the compiled `.next/standalone` Next.js handler directly inside
 * Electron's main process memory:
 * - ZERO TCP ports opened (no localhost / 127.0.0.1 listener)
 * - ZERO child node.exe / cmd / terminal processes spawned
 * - Real-time streaming support for SSE endpoints (/api/chat, /api/orchestrate)
 */

const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')

const MIME_TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function tryServeStatic(standaloneDir, pathname) {
  const cleanPath = decodeURIComponent(pathname)
  let diskPath = null

  if (cleanPath.startsWith('/_next/static/')) {
    const rel = cleanPath.slice('/_next/static/'.length)
    diskPath = path.join(standaloneDir, '.next', 'static', rel)
  } else if (cleanPath !== '/' && !cleanPath.startsWith('/api/')) {
    const rel = cleanPath.replace(/^\/+/, '')
    const candidate = path.join(standaloneDir, 'public', rel)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      diskPath = candidate
    }
  }

  if (!diskPath) return null
  const normalizedRoot = path.resolve(standaloneDir)
  const resolved = path.resolve(diskPath)
  if (!resolved.startsWith(normalizedRoot)) return null
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null

  const buf = fs.readFileSync(resolved)
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': getMimeType(resolved),
      'Cache-Control': cleanPath.startsWith('/_next/static/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    },
  })
}

async function createInProcessNextHandler(appRoot, defaultWorkspaceRoot) {
  const standaloneDir = path.join(appRoot, '.next', 'standalone')
  const serverJsPath = path.join(standaloneDir, 'server.js')

  if (!fs.existsSync(serverJsPath)) {
    throw new Error('Standalone bundle not found. Run `pnpm build` first.')
  }

  // Extract Next.js standalone config embedded in server.js
  const serverSource = fs.readFileSync(serverJsPath, 'utf8')
  const cfgMatch = serverSource.match(/const nextConfig = (\{[\s\S]*?\})\r?\n/)
  const nextConfig = cfgMatch ? JSON.parse(cfgMatch[1]) : { output: 'standalone' }

  process.env.NODE_ENV = 'production'
  process.env.VINCEZONE_WORKSPACE_ROOT =
    defaultWorkspaceRoot || process.env.VINCEZONE_WORKSPACE_ROOT || appRoot
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)

  const prevCwd = process.cwd()
  process.chdir(standaloneDir)

  const nextModule = require(path.join(standaloneDir, 'node_modules', 'next'))
  const nextFactory = typeof nextModule === 'function' ? nextModule : nextModule.default
  const nextApp = nextFactory({
    dev: false,
    dir: standaloneDir,
    hostname: 'localhost',
    port: 0,
    conf: nextConfig,
  })
  await nextApp.prepare()
  const nextHandler = nextApp.getRequestHandler()

  // Restore workspace cwd for child tools (git, adb, craft-anything, etc.)
  process.chdir(prevCwd)

  return async function handleVinceZoneRequest(webRequest) {
    const parsedUrl = new URL(webRequest.url)

    // Fast path: serve static chunks & public assets directly from disk
    if (webRequest.method === 'GET' || webRequest.method === 'HEAD') {
      const staticRes = tryServeStatic(standaloneDir, parsedUrl.pathname)
      if (staticRes) return staticRes
    }

    // Build virtual Node IncomingMessage from Fetch Request
    let bodyBuf = null
    if (webRequest.method !== 'GET' && webRequest.method !== 'HEAD') {
      const arr = await webRequest.arrayBuffer()
      if (arr.byteLength > 0) bodyBuf = Buffer.from(arr)
    }

    const req = new Readable({
      read() {
        if (bodyBuf) {
          this.push(bodyBuf)
          bodyBuf = null
        }
        this.push(null)
      },
    })

    const headersObj = {}
    webRequest.headers.forEach((value, key) => {
      headersObj[key.toLowerCase()] = value
    })
    headersObj['host'] = 'localhost'
    if (bodyBuf && !headersObj['content-length']) {
      headersObj['content-length'] = String(bodyBuf.byteLength)
    }

    const fakeSocket = Object.assign(new EventEmitter(), {
      remoteAddress: '127.0.0.1',
      remoteFamily: 'IPv4',
      encrypted: false,
      writable: true,
      destroy() {},
      setTimeout() {},
      setNoDelay() {},
      setKeepAlive() {},
    })

    req.method = webRequest.method
    req.url = parsedUrl.pathname + parsedUrl.search
    req.headers = headersObj
    req.rawHeaders = Object.entries(headersObj).flat()
    req.httpVersion = '1.1'
    req.httpVersionMajor = 1
    req.httpVersionMinor = 1
    req.socket = fakeSocket
    req.connection = fakeSocket

    // Build streaming Node ServerResponse bridged to a Web ReadableStream
    return new Promise((resolve, reject) => {
      let streamController = null
      let resolved = false
      let finished = false
      const resHeaders = new Map()

      const res = new EventEmitter()
      res.statusCode = 200
      res.statusMessage = 'OK'
      res.headersSent = false
      res.writableEnded = false
      res.writableFinished = false
      res.socket = fakeSocket
      res.connection = fakeSocket

      const webStream = new ReadableStream({
        start(controller) {
          streamController = controller
        },
        cancel() {
          finished = true
          req.emit('aborted')
          req.emit('close')
          res.emit('close')
        },
      })

      const ensureResolved = () => {
        if (resolved) return
        resolved = true
        res.headersSent = true
        const outHeaders = new Headers()
        for (const [k, v] of resHeaders.entries()) {
          if (Array.isArray(v)) {
            for (const item of v) outHeaders.append(k, String(item))
          } else if (v !== undefined) {
            outHeaders.set(k, String(v))
          }
        }
        const status = res.statusCode || 200
        // 204 / 304 responses must not carry a body
        const emptyStatus = status === 204 || status === 304
        resolve(new Response(emptyStatus ? null : webStream, { status, headers: outHeaders }))
      }

      res.setHeader = (name, value) => {
        resHeaders.set(String(name).toLowerCase(), value)
        return res
      }
      res.appendHeader = (name, value) => {
        const key = String(name).toLowerCase()
        const existing = resHeaders.get(key)
        if (existing === undefined) {
          resHeaders.set(key, value)
        } else if (Array.isArray(existing)) {
          resHeaders.set(key, [...existing, ...(Array.isArray(value) ? value : [value])])
        } else {
          resHeaders.set(key, [existing, ...(Array.isArray(value) ? value : [value])])
        }
        return res
      }
      res.getHeader = (name) => resHeaders.get(String(name).toLowerCase())
      res.getHeaders = () => Object.fromEntries(resHeaders.entries())
      res.getHeaderNames = () => Array.from(resHeaders.keys())
      res.hasHeader = (name) => resHeaders.has(String(name).toLowerCase())
      res.removeHeader = (name) => {
        resHeaders.delete(String(name).toLowerCase())
      }
      res._implicitHeader = () => {
        ensureResolved()
      }
      res.cork = () => {}
      res.uncork = () => {}
      res.setTimeout = () => res
      res.destroy = () => {
        finished = true
      }
      res.flushHeaders = () => {
        ensureResolved()
      }
      res.writeHead = (statusCode, reasonOrHeaders, maybeHeaders) => {
        res.statusCode = statusCode
        const hdrs =
          typeof reasonOrHeaders === 'object' && reasonOrHeaders !== null
            ? reasonOrHeaders
            : maybeHeaders
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) {
            res.setHeader(k, v)
          }
        }
        ensureResolved()
        return res
      }
      res.write = (chunk, encoding, cb) => {
        ensureResolved()
        if (!finished && chunk !== undefined && chunk !== null && streamController) {
          const buf = Buffer.isBuffer(chunk)
            ? chunk
            : typeof chunk === 'string'
              ? Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
              : Buffer.from(chunk)
          if (buf.byteLength > 0) {
            try {
              streamController.enqueue(new Uint8Array(buf))
            } catch {
              // stream already closed
            }
          }
        }
        if (typeof encoding === 'function') encoding()
        else if (typeof cb === 'function') cb()
        return true
      }
      res.end = (chunk, encoding, cb) => {
        if (typeof chunk === 'function') {
          cb = chunk
          chunk = undefined
        } else if (typeof encoding === 'function') {
          cb = encoding
          encoding = undefined
        }
        if (chunk !== undefined && chunk !== null) {
          res.write(chunk, encoding)
        }
        ensureResolved()
        if (!finished) {
          finished = true
          res.writableEnded = true
          res.writableFinished = true
          try {
            streamController?.close()
          } catch {
            // already closed
          }
          res.emit('finish')
          res.emit('close')
        }
        if (typeof cb === 'function') cb()
        return res
      }

      Promise.resolve(nextHandler(req, res)).catch((err) => {
        if (!resolved) {
          reject(err)
        } else if (!finished) {
          finished = true
          try {
            streamController?.error(err)
          } catch {
            // ignore
          }
        }
      })
    })
  }
}

module.exports = { createInProcessNextHandler }
