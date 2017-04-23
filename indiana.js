const winston = require('winston')
const fs = require('mz/fs')
const path = require('path')
const yaml = require('js-yaml')

const Koa = require('koa')
const Router = require('koa-router')
const handlebars = require('koa-handlebars')
//const Markdown = require('markdown-it')
//const matter = require('gray-matter')

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

indiana.use(require('koa-static')(config.staticDir))

module.exports = indiana

// Create router
const router = new Router()
router
  .use(handlebars(config.handlebars))
  .use(require('./lib/koa-materialized-path')({
    matpath: {
      key: 'matpath',
      path: '__path',
      name: '__name',
      isdir: '__isdir'
    }
  }))
  .use(require('./lib/koa-indiana-cache')({
    mongoUrl: [
      `mongodb://${process.env.MONGO_DOMAIN}`,
      `:${process.env.MONGO_PORT}`,
      `/${process.env.MONGO_DB}`
    ].join(''),
    collection: 'indiana',
    matpath: {
      key: 'matpath',
      path: '__path',
      name: '__name',
      isdir: '__isdir'
    },
    root: config.contentDir,
    logger: winston
  }))
  .get('*', async (ctx) => {
    const view = /* ctx.state.view */'' || (ctx.state.__isdir ? 'default:index' : 'default:view')

    const renderOpts = {
      data: {
        directory: ctx.indiana.siblings
      }
    }

    await ctx.render(view, ctx.state, renderOpts)
  })

indiana.use(router.routes())
