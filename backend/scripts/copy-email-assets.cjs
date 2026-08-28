const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const source = path.join(
  root,
  'src',
  'modules',
  'notifications',
  'email-templates',
  'stockpros-logo.png',
)
const destination = path.join(
  root,
  'dist',
  'modules',
  'notifications',
  'email-templates',
  'stockpros-logo.png',
)

fs.mkdirSync(path.dirname(destination), { recursive: true })
fs.copyFileSync(source, destination)
