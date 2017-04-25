const path = require('path')

class Node {

  constructor (nodePath, isdir) {
    const pathInfo = path.parse(nodePath)
    const segs = pathInfo.dir.split(path.sep).filter(seg => seg)

    this.relPath = nodePath
    this.path = [''].concat(segs)
    this.name = pathInfo.name

    if (isdir !== undefined) {
      this.isdir = isdir
    }

    if (pathInfo.ext) {
      this.ext = pathInfo.ext.substr(1)
    }
  }

  static fromRouterPath (route) {
    let node
    if (route === '/') {
      node = new Node(route, true)
    } else {
      let [ path, trailingSlash ] = /^\/?(.+?)(\/)?$/.exec(route).slice(-2)

      if (trailingSlash) {
        node = new Node(path, true)
      } else {
        node = new Node(path)
      }
    }

    return node
  }

  toJSON () {
    const json = {
      path: this.path,
      name: this.name
    }

    if (this.isdir !== undefined) {
      json.isdir = this.isdir
    }

    if (this.ext) {
      json.ext = this.ext
    }

    return json
  }

}

module.exports = Node
