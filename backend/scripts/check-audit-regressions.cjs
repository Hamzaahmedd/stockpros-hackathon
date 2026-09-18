#!/usr/bin/env node
/**
 * Fails CI only on high/critical severity vulnerabilities NOT already present
 * in audit-baseline.json — a snapshot of known, accepted, pre-existing findings
 * (several with no upstream fix, e.g. xlsx). This is a "no new regressions"
 * gate, not a "zero vulnerabilities" gate: run `npm audit` directly to see the
 * full picture, and update audit-baseline.json when a listed package is
 * upgraded/replaced and its finding disappears.
 */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }
const FAIL_AT = SEVERITY_RANK.high

const baselinePath = path.join(__dirname, '..', 'audit-baseline.json')
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))

let auditJson
try {
  const raw = execSync('npm audit --json', {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  auditJson = JSON.parse(raw)
} catch (err) {
  // npm audit exits non-zero whenever it finds anything — stdout still has the JSON.
  auditJson = JSON.parse(err.stdout)
}

const current = Object.entries(auditJson.vulnerabilities || {}).map(
  ([name, v]) => ({ name, severity: v.severity }),
)

const newHighSeverity = current.filter((v) => {
  if (SEVERITY_RANK[v.severity] < FAIL_AT) return false
  const known = baseline.find((b) => b.name === v.name)
  if (!known) return true
  return SEVERITY_RANK[v.severity] > SEVERITY_RANK[known.severity]
})

if (newHighSeverity.length > 0) {
  console.error(
    'New high/critical severity vulnerabilities not present in audit-baseline.json:',
  )
  newHighSeverity.forEach((v) => console.error(`  - ${v.name} (${v.severity})`))
  console.error(
    '\nIf this is a legitimate new risk, fix it (upgrade/replace the package).' +
      '\nIf it is a known, accepted, pre-existing issue, add it to audit-baseline.json.',
  )
  process.exit(1)
}

console.log(
  'No new high/critical severity vulnerabilities beyond the accepted baseline.',
)
