const path = require('path')
const fs = require('mz/fs')
const EventEmitter = require('events').EventEmitter
const chokidar = require('chokidar')

const nullLogger = require('./null-logger')
const Node = require('./node')
const plainTextParser = require('./parser-plain-text')
const markdownParser = require('./parser-markdown')
const yamlParser = require('./parser-yaml')

const defaultOptions = {
  // name: <default to dir name>
  logger: nullLogger
}

class Collection extends EventEmitter {

  constructor (root, options={}) {
    super()

    this.root = root
    this.options = Object.assign(defaultOptions, options)

    const pathInfo = path.parse(root)
    this.name = options.name || pathInfo.name

    this.parsers = {
      txt: plainTextParser,
      md: markdownParser,
      yml: yamlParser,
      yaml: yamlParser
    }
    this.defaultParser = plainTextParser

    this.logger = options.logger

    this.__init()
  }

  __init () {
    this.logger.info(`Initializing Collection for "${this.name}"`)

    this.watcher = chokidar.watch('**/*', {
      cwd: path.resolve(process.cwd(), this.root),
      ignored: [
        '**/.*', // dotfiles
        '**/_*', // underscore prefixed
        '**/~*'  // emacs temp files
      ]
    })
      .on('ready', async () => {
        // Add root node
        const root = new Node('/', true)
        this.emit('addDir', root.toJSON())
        this.logger.info('Collection root added:\t\t/')
      })
      .on('add', async (contentPath, stats) => {
        const node = new Node(contentPath, false)
        let doc

        // Handle index files
        if (node.name === 'index') {
          node.name = node.path.pop()
          node.isdir = true

          doc = await this.parseNode(node)
          delete node.ext

          this.emit('addIndex', node.toJSON(), doc)

          this.logger.info(`Directory index added:\t\t${contentPath}`)
          return
        }

        doc = await this.parseNode(node)
        this.emit('add', node.toJSON(), doc)

        this.logger.info(`File added to Collection:\t\t${contentPath}`)
      })
      .on('change', async (contentPath, stats) => {
        const node = new Node(contentPath, false)
        let doc

        // Handle index files
        if (node.name === 'index') {
          node.name = node.path.pop()
          node.isdir = true

          doc = await this.parseNode(node)
          delete node.ext

          this.emit('addIndex', node.toJSON(), doc)

          this.logger.info(`Directory index changed:\t\t${contentPath}`)
          return
        }

        doc = await this.parseNode(node)
        this.emit('change', node.toJSON(), doc)

        this.logger.info(`File changed in Collection:\t\t${contentPath}`)
      })
      .on('unlink', async (contentPath, stats) => {
        const node = new Node(contentPath, false)

        this.emit('unlink', node.toJSON())

        this.logger.info(`File removed from Collection:\t\t${contentPath}`)
      })
      .on('addDir', async (contentPath, stats) => {
        const node = new Node(contentPath, true)

        this.emit('addDir', node.toJSON())

        this.logger.info(`Directory added to Collection:\t${contentPath}`)
      })
      .on('unlinkDir', async (contentPath, stats) => {
        const node = new Node(contentPath, true)

        this.emit('unlinkDir', node.toJSON())

        this.logger.info(`Directory removed from Collection:\t${contentPath}`)
      })
      .on('error', err => this.logger.error(err))
  }

  registerParser (ext, parser) {
    if (!ext) {
      throw new TypeError('ext must be a string')
    }

    if (typeof parser !== 'function') {
      throw new TypeError('parser must be a function')
    }

    this.parsers[ext] = parser
  }

  async parseNode (node) {
    const filePath = path.resolve(process.cwd(), this.root, node.relPath)

    // TODO: Support other encodings
    let file = await fs.readFile(filePath, 'utf-8')

    let parser = this.parsers[node.ext] || this.defaultParser
    let result = await parser(file)

    return Object.assign(node.toJSON(), result)
  }

  middleware (options) {
    // TODO: Allow specify context key

    return async (ctx, next) => {
      const node = Node.fromRouterPath(ctx.path)

      ctx.currentNode = node.toJSON()

      return next()
    }
  }
}

module.exports = Collection
