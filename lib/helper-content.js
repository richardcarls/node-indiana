const MarkdownIt = require('markdown-it')

module.exports = function (options = {}) {
  const md = new MarkdownIt(options)

  return function contentHelper (content) {
    switch (content['content-type']) {
      case 'text/plain':
        return '<div style="white-space: pre-line;">'
          + content.value + '</div>'
      case 'text/markdown':
        return md.render(content.value)
      default:
        return content.value
    }
  }
}
