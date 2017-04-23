const path = require('path')
const mongodb = require('mongodb')
const chokidar = require('chokidar')

const defaultOptions = {
  mongoUrl: 'mongodb://127.0.0.1:12701/test',
  collection: 'indiana',
  clearOnInit: true,
  matpath: {
    path: 'path',
    name: 'name',
    isdir: 'isdir'
  },
  root: process.cwd(),
  logger: { info: m => {}, debug: m => {} }
}

module.exports = function (options={}) {
  options = Object.assign(defaultOptions, options)

  let col
  let watcher
  let logger = options.logger

  logger.info('[indiana] Initializing indiana cache')

  mongodb.MongoClient.connect(options.mongoUrl)
    .then(async (db) => {
      logger.info('[indiana] Established connection to MongoDB')

      col = db.collection(options.collection)

      // Clear collection
      if (options.clearOnInit) {
        await col.drop()
        logger.info('[indiana] Dropping cache collection')
      }

      // Add root index
      const root = {
        [options.matpath.path]: [''],
        [options.matpath.name]: '',
        [options.matpath.isdir]: true
      }
      await col.findOneAndUpdate(root, root, { upsert: true })
      logger.info('Added Directory:\t(root)')

      // Chokidar
      watcher = chokidar.watch('**/*', {
        cwd: options.root
      })
        .on('add', async (contentPath) => {
          const info = path.parse(contentPath)
          const nodePath = info.dir.split(path.sep).filter(seg => seg)

          const node = {
            [options.matpath.path]: [''].concat(nodePath),
            [options.matpath.name]: info.name,
            [options.matpath.isdir]: false
          }

          // TODO: Parse front matter / data if .yml
          // TODO: Special case for files named 'index'

          await col.findOneAndUpdate(node, node, {upsert: true })

          logger.info(`Added Content:\t${contentPath}`)
        })
        .on('change', contentPath => {
          const info = path.parse(contentPath)

          // TODO: Update node

          logger.info(`Content Changed:\t${contentPath}`)
        })
        .on('unlink', contentPath => {
          const info = path.parse(contentPath)

          // TODO: Delete node

          logger.info(`Content Deleted:\t${contentPath}`)
        })
        .on('addDir', async (contentPath) => {
          const info = path.parse(contentPath)
          const nodePath = info.dir.split(path.sep).filter(seg => seg)

          const node = {
            [options.matpath.path]: [''].concat(nodePath),
            [options.matpath.name]: info.name,
            [options.matpath.isdir]: true
          }

          await col.findOneAndUpdate(node, node, { upsert: true })

          logger.info(`Added Directory:\t${contentPath}`)
        })
        .on('unlinkDir', contentPath => {
          const info = path.parse(contentPath)

          // TODO: Delete node (and all child nodes?)

          logger.info(`Removed Directory:\t${contentPath}`)
        })
        .on('error', err => logger.error(err))
    })

  return async function koaIndianaCache (ctx, next) {
    if (!ctx.indiana) {
      ctx.indiana = {
        col,
        watcher
      }
    }

    const path = ctx[options.matpath.key][options.matpath.path]
    const name = ctx[options.matpath.key][options.matpath.name]
    const isdir = ctx[options.matpath.key][options.matpath.isdir]

    // Get node for materialized path
    const node = {
      [options.matpath.path]: path,
      [options.matpath.name]: name
    }
    if (isdir) {
      node[options.matpath.isdir] = isdir
    }

    ctx.indiana.node = node
    logger.debug('[indiana] Current node', node)

    let result
    try {
      result = await col.findOne(node, {
        sort: { [options.matpath.isdir]: 1 } // Prefer file over directory
      })
    } catch (e) {
      logger.error('[indiana] Error retrieving node', e)
      return ctx.throw(500)
    }

    if (!result) {
      logger.warn('[indiana] Node not found', node)
      return ctx.throw(404, 'Content not found')
    }

    ctx.state = result

    // Get directory nodes
    if (isdir) {
      let query
      let segs = path
      if (name) {
        segs = segs.concat([name])
      }

      // Construct Mongo matpath query on __path array
      query = segs.reduce((q, seg, index) => {
        q[`${options.matpath.path}.${index}`] = seg
        return q
      }, { [options.matpath.path]: { $size: segs.length } })

      ctx.indiana.siblings = await col
        .find(query)
        .sort({ [options.matpath.isdir]: -1, [options.matpath.name]: 1 }) // Directories on top
        .toArray()
    }

    return next()
  }
}
