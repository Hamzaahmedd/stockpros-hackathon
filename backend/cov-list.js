const s = require('./coverage/coverage-summary.json')
const cwd = process.cwd()
const rows = Object.entries(s)
  .filter(([k]) => k !== 'total')
  .map(([file, m]) => ({
    file: file.startsWith(cwd) ? file.slice(cwd.length + 1) : file,
    lines: m.lines.pct,
    branches: m.branches.pct,
    functions: m.functions.pct,
    linesTotal: m.lines.total,
  }))
const under90 = rows.filter((r) => r.lines < 90 || r.branches < 90 || r.functions < 90)
console.log('TOTAL', JSON.stringify(s.total))
console.log('files under 90%:', under90.length, 'of', rows.length)
under90
  .sort((a, b) => b.linesTotal - a.linesTotal)
  .forEach((r) =>
    console.log(
      r.lines.toFixed(0) + '%L',
      r.branches.toFixed(0) + '%B',
      r.functions.toFixed(0) + '%F',
      r.linesTotal + 'loc',
      r.file,
    ),
  )
