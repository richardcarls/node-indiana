const defaultOptions = {
  matpath: {
    key: 'matpath',
    path: 'path',
    name: 'name',
    isdir: 'isdir'
  },
  logger: { debug: m => {} }
}

module.exports = function (options={}) {
  options = Object.assign(defaultOptions, options)

  return async function koaMaterializedPath (ctx, next) {
    let [ path, trailingSlash ] = /^(.+?)(\/)?$/.exec(ctx.path).slice(-2)

    // Get last path segment
    path = path.split('/')
    let name = path.pop()

    const pathInfo = {
      [options.matpath.path]: path,
      [options.matpath.name]: name
    }

    if (trailingSlash === '/' || ctx.path === '/') {
      pathInfo[options.matpath.isdir] = true
    }

    ctx[options.matpath.key] = pathInfo
    options.logger.debug('Materialized path', pathInfo)

    return next()
  }
}
