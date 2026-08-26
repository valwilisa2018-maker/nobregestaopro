# Automatic database migrations

The `Apply Supabase migrations` GitHub Actions workflow applies pending files
from `supabase/migrations` whenever they are merged into `main`. It can also be
started manually from the Actions page.

## One-time setup

Create a GitHub environment named `production` and add an encrypted environment
secret named `SUPABASE_DB_URL`. Its value must be the production Postgres
connection string supplied by the Supabase/Lovable project administrator.

Use a transaction-pooler connection string when the direct database hostname is
not reachable from GitHub Actions. The value has this general form:

`postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres`

Do not put this value in `.env`, a migration, a commit, or a Lovable prompt.

The public Supabase URL and publishable/anon key cannot run migrations. If the
database is managed by Lovable, its database password or an equivalent
administrator connection string must be obtained once from Lovable support.

After the secret is configured, open the workflow in GitHub Actions and use
`Run workflow` once to apply migrations that were merged before the workflow was
added. Future migration changes on `main` are applied automatically.
