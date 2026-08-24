const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const src = path.join(root, 'src')
const legacyFolders = ['controllers', 'routes', 'services', 'validators', 'types', 'constants', 'jobs', 'websockets']
const violations = []

for (const folder of legacyFolders) {
  if (fs.existsSync(path.join(src, folder))) violations.push(`legacy layer folder still exists: src/${folder}`)
}

const files = []
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
  const file = path.join(directory, entry.name)
  if (entry.isDirectory()) walk(file)
  else if (/\.(?:d\.)?ts$/.test(entry.name)) files.push(file)
})
walk(src)

const resolveImport = (file, specifier) => {
  if (!specifier.startsWith('.')) return null
  const base = path.resolve(path.dirname(file), specifier)
  for (const suffix of ['', '.ts', '.d.ts', path.join('', 'index.ts')]) {
    if (fs.existsSync(base + suffix)) return base + suffix
  }
  return false
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const imports = source.matchAll(/(?:from\s+|require\()(['"])([^'"]+)\1/g)
  for (const match of imports) {
    const target = resolveImport(file, match[2])
    if (target === false) {
      violations.push(`${path.relative(root, file)} -> ${match[2]}`)
      continue
    }
    if (!target) continue

    const sourceParts = path.relative(src, file).split(path.sep)
    const targetParts = path.relative(src, target).split(path.sep)
    if (sourceParts.length > 2 && targetParts.length > 2 &&
        sourceParts[0] === 'modules' && targetParts[0] === 'modules' &&
        sourceParts[1] !== targetParts[1] && !['public.ts', 'index.ts'].includes(path.basename(target))) {
      violations.push(`private cross-module import: ${path.relative(root, file)} -> ${path.relative(root, target)}`)
    }
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log(`Module boundaries valid; ${files.length} TypeScript files checked.`)
