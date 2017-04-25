const yaml = require('js-yaml')

module.exports = function yamlParser (file) {
  return yaml.safeLoad(file)
}
