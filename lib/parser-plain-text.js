module.exports = function plainTextParser (file) {
  return {
    content: {
      'content-type': 'text/plain',
      value: file
    }
  }
}
