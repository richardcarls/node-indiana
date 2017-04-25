const winston = require('winston')
const fs = require('mz/fs')
const path = require('path')
const yaml = require('js-yaml')
const mongoDb = require('mongodb')

const Koa = require('koa')
const Router = require('koa-router')
const handlebars = require('koa-handlebars')

const Collection = require('./lib/collection')
const contentHelper = require('./lib/helper-content')

const defaultConfig = {
  collection: 'indiana',
  staticDir: './data/static',
  contentDir: './data/content',
  handlebars: {
    root: './data/templates',
    defaultLayout: 'default:layout',
    cache: process.env.NODE_ENV !== 'development'
  },
  markdown: {
    html: true,
    xhtmlOut: true,
    typographer: true
  }
}

const indiana = new Koa()

// Config
let config
/*
try {
  config = yaml.safeLoad(fs.readFileSync('./data/config.yml', 'utf-8'))
} catch (e) {
  winston.error('Error loading config.yml', e)
}
*/

config = indiana.context.config = config || defaultConfig
config.handlebars.viewPath = function viewPath (id) {
  if (id === 'default:view') {
    return path.resolve(__dirname, 'hbs', 'view.default.hbs')
  }

  if (id === 'default:index') {
    return path.resolve(__dirname, 'hbs', 'index.default.hbs')
  }

  return id
}
config.handlebars.layoutPath = function layoutPath (id) {
  if (id === 'default:layout') {
    return path.resolve(__dirname, 'hbs', 'layout.default.hbs')
  }

  return id
}
config.handlebars.helpers = {
  content: contentHelper(config.markdown)
}

indiana.use(require('koa-static')(config.staticDir))

module.exports = indiana

// Mongo
const mongoUrl = [
  `mongodb://${process.env.MONGO_DOMAIN}`,
  `:${process.env.MONGO_PORT}`,
  `/${process.env.MONGO_DB}`
].join('')

mongoDb.MongoClient.connect(mongoUrl)
  .then(async (db) => {
    indiana.context.db = db

    // Drop collection if exists
    // TODO: Get collection name before watcher init?
    await db.collection('content').drop()
      .then(() => winston.info('Dropped collection'))

    // Collection
    const collection = new Collection(config.contentDir, {
      logger: winston
    })

    collection.on('add', (node, doc) => {
      db.collection(collection.name)
        .findOneAndUpdate(node, doc, {upsert: true })
        .catch(err => winston.error(err))
    })
      .on('change', (node, doc) => {
        db.collection(collection.name)
          .findOneAndUpdate(node, doc, {upsert: true })
          .catch(err => winston.error(err))
      })
      .on('unlink', (node) => {
        db.collection(collection.name)
          .findOneAndDelete(node)
          .catch(err => winston.error(err))
      })
      .on('addIndex', (node, doc) => {
        db.collection(collection.name)
          .findOneAndUpdate(node, doc, {upsert: true })
          .catch(err => winston.error(err))
      })
      .on('addDir', (node) => {
        db.collection(collection.name)
          .findOneAndUpdate(node, node, {upsert: true })
          .catch(err => winston.error(err))
      })
      .on('unlinkDir', (node) => {
        db.collection(collection.name)
          .findOneAndDelete(node)
          .catch(err => winston.error(err))
      })

    indiana.context.collection = collection

    // Create router
    const router = new Router()
    router
      .use(handlebars(config.handlebars))
      .use(collection.middleware())
      .use(async function nodeQuery (ctx, next) {
        let result
        try {
          result = await ctx.db
            .collection(collection.name)
            .findOne(ctx.currentNode, {
              sort: { isdir: 1 } // Prefer file over directory
            })
        } catch (e) {
          winston.error('[indiana] Error retrieving node', e)
          return ctx.throw(500)
        }

        if (!result) {
          winston.warn('[indiana] Node not found', ctx.currentNode)
          return ctx.throw(404, 'Content not found')
        }

        ctx.state = result

        return next()
      })
      .use(async function directoryQuery (ctx, next) {
        const { path, name, isdir } = ctx.currentNode

        if (isdir) {
          let query
          let segs = path
          if (name) {
            segs = segs.concat([name])
          }

          // Construct Mongo matpath query on `path` array
          query = segs.reduce((q, seg, index) => {
            q[`path.${index}`] = seg
            return q
          }, { path: { $size: segs.length } })

          try {
            ctx.siblings = await ctx.db
              .collection(collection.name)
              .find(query)
            // TODO: Allow custom sort
              .sort({ isdir: -1, name: 1 }) // Directories on top
              .toArray()
          } catch (e) {
            winston.error('Problem loading directory listing', e)
          }
        }

        return next()
      })
      .use(async function rootQuery (ctx, next) {
        try {
          ctx.root = await ctx.db
            .collection(collection.name)
            .find({ 'path.0': '', path: { $size: 1 }})
          // TODO: Allow custom sort
            .sort({ isdir: -1, name: 1 })
            .toArray()
        } catch (e) {
          winston.error('Problem loading root directory listing', e)
        }

        return next()
      })
      .get('*', async (ctx) => {
        const view = ctx.state.view || /* TODO: view with same name */ (ctx.state.isdir ? 'default:index' : 'default:view')

        const renderOpts = {
          data: {
            root: ctx.root,
            directory: ctx.siblings
          }
        }

        winston.debug('view', view)
        winston.debug(ctx.path, ctx.state)

        await ctx.render(view, ctx.state, renderOpts)
      })

    indiana.use(router.routes())
  })
