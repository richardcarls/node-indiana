// Logger
const winston = require('winston')
winston.addColors({
  silly: 'magenta',
  debug: 'blue',
  verbose: 'cyan',
  info: 'green',
  warn: 'yellow',
  error: 'red'
})

winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
  level: process.env.LOG_LEVEL,
  prettyPrint: true,
  colorize: true,
  silent: false,
  timestamp: false
})
winston.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`)

const http = require('http')
const https = require('https')
const fs = require('fs')

const indiana = require('./indiana')

// Env
const secure = process.env.SSL_KEY && process.env.SSL_CERT
const port = process.env.PORT || 80
const securePort = process.env.SECURE_PORT || 443

process.on('exit', () => {
  winston.info('Exiting')
})

// Server
if (secure) {
  winston.info(`Starting https server on ${securePort}`)

  secureOpts = {
    key: fs.readFileSync(process.env.SSL_KEY, 'utf-8'),
    cert: fs.readFileSync(process.env.SSL_CERT, 'utf-8')
  }

  https.createServer(secureOpts, indiana.callback())
    .listen(securePort)

  http.createServer((req, res) => {
    res.writeHead(301, {
      Location: `https://${req.headers.host}${req.url}`
    })

    return res.end()
  }).listen(port)
} else {
  winston.info(`Starting http server on ${port}`)

  http.createServer(indiana.callback())
    .listen(port)
}
