# Database migrations (prepared, not yet adopted)

Today the schema is applied with `npm run db:sync` (`prisma db push`). That is
fine while databases hold only synthetic data, because `db push` leaves no
history and can drop or rewrite columns. **Adopt migrations before real users
or real payments touch a database.** The scripts below are ready; nothing
switches over until you run the baseline.

| Script | What it does |
| --- | --- |
| `npm run db:migrate:dev -- --name <change>` | Normalises `schema.prisma` (snake_case mapper + Prettier), writes the SQL for the change under `prisma/migrations/`, applies it to your dev database and regenerates the client. Commit the SQL. |
| `npm run db:migrate:deploy` | Applies committed migrations in order. This is what staging and production run. It never edits the schema on its own. |
| `npm run db:migrate:status` | Shows which migrations a database has applied. |
| `npm run db:migrate:check` | Fails if `schema.prisma` differs from the migration history. Skips itself until `prisma/migrations` exists. Needs `SHADOW_DATABASE_URL`. |

`db:sync` keeps working for throwaway local databases.

## One-time adoption (needs a real database)

1. **Create the baseline from the schema**

   ```
   mkdir -p prisma/migrations/0_init
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
   ```

2. **Add the ID function to the top of `0_init/migration.sql`.** Every model
   defaults its id to `uuid_generate_v7()`, which is a database function, not
   something Prisma generates. A migration built from the schema alone will not
   create it, so a fresh database would fail. Check which extension provides it
   on your Neon branch (`\df uuid_generate_v7` in psql; it is normally the
   `pg_uuidv7` extension) and add, for example:

   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
   ```

3. **Mark the baseline as already applied on every existing database** (dev,
   staging, production), since their tables already exist:

   ```
   npx prisma migrate resolve --applied 0_init
   ```

   Confirm with `npm run db:migrate:status`. Do production last, after the same
   steps succeed on a copy.

4. **Switch the workflow:** developers use `db:migrate:dev`, deploys run
   `db:migrate:deploy`, and `db:sync` is no longer used on shared databases.

5. **CI:** provide an empty Postgres with the same extension as
   `SHADOW_DATABASE_URL` (a Neon branch or a container image that ships
   `pg_uuidv7`) so the `db:migrate:check` step can run.

## Day to day

- Change `schema.prisma`, run `npm run db:migrate:dev -- --name add_x`, review
  the generated SQL, commit it with the schema change.
- **Renames:** Prisma generates drop-and-add, which loses data. Edit the SQL to
  `ALTER TABLE ... RENAME` before applying.
- Two branches that both add migrations can conflict; re-create the later one
  after merging the earlier.
