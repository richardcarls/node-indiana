const matter = require('gray-matter')

module.exports = function markdownParser (file) {
  const result = matter(file)

  return Object.assign({
    content: {
      'content-type': 'text/markdown',
      value: result.content
    }
  }, result.data)
}
