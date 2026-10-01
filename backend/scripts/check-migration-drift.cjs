const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

/**
 * Fails when prisma/schema.prisma no longer matches the SQL history in
 * prisma/migrations (someone edited the schema without `npm run db:migrate:dev`).
 *
 * A no-op until migrations are adopted (no prisma/migrations folder), so it is
 * safe to run in CI today. Needs SHADOW_DATABASE_URL: an empty, disposable
 * Postgres that has the same extensions as the real one (see
 * docs/migrations.md).
 */
const root = path.resolve(__dirname, '..')
const migrationsDir = path.join(root, 'prisma', 'migrations')

if (!fs.existsSync(migrationsDir)) {
  console.log('No prisma/migrations folder yet: migration drift check skipped.')
  process.exit(0)
}

const shadowUrl = process.env.SHADOW_DATABASE_URL
if (!shadowUrl) {
  console.error('SHADOW_DATABASE_URL is required to check migration drift.')
  process.exit(1)
}

const result = spawnSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-migrations',
    'prisma/migrations',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--shadow-database-url',
    shadowUrl,
    '--exit-code',
  ],
  { cwd: root, stdio: 'inherit', shell: true },
)

if (result.status === 2) {
  console.error(
    'schema.prisma has changes with no migration. Run `npm run db:migrate:dev -- --name <change>` and commit the SQL.',
  )
}
process.exit(result.status ?? 1)
