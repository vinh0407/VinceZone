const fs = require('node:fs')
const path = require('node:path')

/**
 * Lightweight zero-dependency rotating file logger for Electron main process.
 * Rotates when the active log exceeds `maxBytes` (default 2 MB) and retains up to `maxBackups` files.
 */
function createRotatingLogger(logFilePath, options = {}) {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024
  const maxBackups = options.maxBackups ?? 3

  function rotateIfNeeded() {
    try {
      if (!fs.existsSync(logFilePath)) return
      const stat = fs.statSync(logFilePath)
      if (stat.size < maxBytes) return

      for (let i = maxBackups; i >= 1; i -= 1) {
        const src = i === 1 ? logFilePath : `${logFilePath}.${i - 1}`
        const dest = `${logFilePath}.${i}`
        if (fs.existsSync(src)) {
          if (fs.existsSync(dest)) fs.unlinkSync(dest)
          fs.renameSync(src, dest)
        }
      }
    } catch {
      // Never throw from crash logger
    }
  }

  function write(level, message, detail) {
    try {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true })
      rotateIfNeeded()
      const ts = new Date().toISOString()
      const extra = detail ? ` | ${String(detail).replace(/\r?\n/g, ' \\n ')}` : ''
      fs.appendFileSync(logFilePath, `[${ts}] [${level}] ${message}${extra}\n`, 'utf8')
    } catch {
      // ignore disk write failures
    }
  }

  return {
    logFilePath,
    logDir: path.dirname(logFilePath),
    info: (msg, detail) => write('INFO', msg, detail),
    warn: (msg, detail) => write('WARN', msg, detail),
    error: (msg, detail) => write('ERROR', msg, detail),
  }
}

module.exports = { createRotatingLogger }
