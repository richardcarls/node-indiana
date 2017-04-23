const path = require('path')
const winston = require('winston')
const mongodb = require('mongodb')
const chokidar = require('chokidar')
const Router = require('koa-router')
const handlebars = require('koa-handlebars')

const defaultOptions = {
  root: path.resolve(process.cwd(), 'data/content'),
  templates: path.resolve(process.cwd(), 'data/templates')
}

class Collection {

  constructor (name, options=defaultOptions) {
    if (!name) {
      throw new TypeError('name is required')
    }

    this.name = name
    this.root = options.root
    this.router = new Router()
  }

  async init () {
    const col = this

    // Mongo
    // TODO: Fallback to in-memory store
    col.db = await mongodb.MongoClient.connect(url)
      .then(db => db.collection(col.name))

    // Watcher
    col.watcher = chokidar.watch('**/*', {
      cwd: options.root
    })
      .on('add', async (contentPath) => {
        const info = path.parse(contentPath)

        const doc = {
          path: info.dir,
          slug: info.base
        }

        await col.db.findOneAndUpdate({
            path: doc.path,
            slug: doc.slug
          }, doc, {upsert: true })

        winston.info(`Added Content:\t${contentPath}`)
      })
      .on('change', contentPath => {
        const info = path.parse(contentPath)
        winston.debug('Collection: Change File', info)
      })
      .on('unlink', contentPath => {
        const info = path.parse(contentPath)
        winston.debug('Collection: Remove File', info)
      })
      .on('addDir', async (contentPath) => {
        const info = path.parse(contentPath)

        const doc = {
          path: info.dir,
          slug: info.base,
          index: true
        }

        await col.db.findOneAndUpdate({
            path: doc.path,
            slug: doc.slug
          }, doc, { upsert: true })

        winston.info(`Added Directory:\t${contentPath}`)
      })
      .on('unlinkDir', contentPath => {
        const info = path.parse(contentPath)
        winston.debug('Collection: Remove Directory', info)
      })
      .on('error', err => winston.error(err))

    // Router
    this.router
      .use(handlebars({
        root: options.templates,
        defaultLayout: 'layout.default.hbs',
        cache: process.env.NODE_ENV !== 'development'
      }))
      .get(`/*`, async (ctx) => {
        // TODO: Split request path for query
        winston.debug(ctx.params)

        await ctx.render('view.default.hbs', {})
      })
  }
}

module.exports = Collection
