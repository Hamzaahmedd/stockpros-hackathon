const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.join(
  root,
  'src',
  'shared',
  'assets',
  'stockpros-logo.png',
)
const destination = path.join(
  root,
  'dist',
  'shared',
  'assets',
  'stockpros-logo.png',
)

if (fs.existsSync(source)) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}
