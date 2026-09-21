# Sequential Git patch workflow

Patches are email-format diffs produced with `git format-patch`, applied with `git am`. Applying a patch creates its commit; do not make a second commit just to record the patch.

## Before applying

```bash
git status --short
git log -1 --oneline
```

Start with a clean worktree. Do not erase local changes to make a patch apply. If you have changed the same files, share your diff and current commit before the next patch is generated.

## Apply a downloaded increment

```bash
git am "$HOME/Downloads/001-relay-foundation.patch"
```

Use the exact downloaded filename. If your browser appends a suffix, rename the file or change the quoted path. Do not run a patch twice and do not use `git apply` for these commit-bearing patches.

## Verify and publish

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
git status --short
git push origin main
```

On first setup the remote is created separately with `gh repo create`.

## If application fails

```bash
git status
```

Stop and inspect the error. `git am --abort` cancels the in-progress patch operation and returns to the pre-application state. Share the error, `git status`, and latest commit. Do not use `git reset --hard` or force-push as a routine recovery step.

If you deliberately resolve an application conflict, stage the resolution and use `git am --continue`. Prefer having the patch regenerated against your actual source when the conflict reflects local changes.

## Patch delivery baseline

Increment 001 adds the entire project to an empty repository with an existing empty initial commit. It does not depend on the initial commit's hash. Future patches will depend on the files produced by earlier increments. Keep your repository history and worktree state visible when requesting the next patch.

## Increment 002

Apply `002-relay-persistence.patch` on top of increment 001, with a clean worktree. The published base checked during preparation was `fcfe034` in `DeadPoet404/relay-ops`; its tracked source matched the original foundation exactly. Commit hashes can differ when patches are applied; the source baseline is what matters.

```bash
git am "$HOME/Downloads/002-relay-persistence.patch"
npm ci
```

Then follow `docs/PERSISTENCE.md`: configure the ignored local environment, start PostgreSQL, apply migrations, and seed the fictional dataset before selecting database mode. New dependencies are already recorded in the lockfile. Do not run create-next-app, regenerate the initial migration, or recommit the patch manually.

Increment 002 also adds a GitHub Actions workflow. If GitHub rejects the push because your OAuth token lacks the workflow scope, run `gh auth refresh -h github.com -s workflow` and retry the push. Check the Actions tab to verify the remote checks actually ran; local test success does not establish a remote workflow result.

## Increment 003

Apply `003-relay-execution.patch` over increment 002. The published source checked during preparation was `ca71a6d` in `DeadPoet404/relay-ops`; its tracked tree matched the local persistence baseline.

```bash
git am "$HOME/Downloads/003-relay-execution.patch"
npm ci
npm run db:migrate
npm run db:seed
npm run queue:init
npm run demo:configure
```

Do not regenerate migrations or reset the database. Node 22.12+ is now required by the pinned pg-boss release. Start the simulator, worker, and loopback development UI in separate terminals as described in `docs/EXECUTION.md`. `demo:configure` adds ignored `.env.local` settings; it does not commit credentials.

The database test suite now also clears the test database's simulator/run tables and jobs and spawns real short-lived worker processes. Never supply a non-disposable database.

## Increment 004

Apply `004-relay-safe-recovery.patch` over increment 003. The published base checked during preparation was `5f17ff4` in `DeadPoet404/relay-ops`; its tracked source matched local `10861a5`. Stop the web app, worker, and simulator before upgrading. Do not leave a Patch 003 worker running against the upgraded schema.

```bash
git am "$HOME/Downloads/004-relay-safe-recovery.patch"
npm ci
npm run db:migrate
npm run queue:init
```

Keep existing environment files, database volume, seed records, receipts, and audit history. Migration `0002_safe_recovery.sql` adds recovery metadata and a simulator request ledger. Existing attempts become attempt 1 with their original run ID as job ID. Previous migrations are unchanged. No reseed, database reset, or migration regeneration is required.

Restart all three processes using the execution guide. Existing unresolved lab runs are eligible for read-only lookup on worker startup; historical unavailable runs are **not** retroactively authorized for submission retry. Rows already escalated by this increment remain in review. Seed-only examples are not recovery jobs.

Verify lint, type checking, 38 unit tests, 39 disposable-database integration tests, and production build. Apply the test-database warnings above; never run the integration suite against preserved application data. Push normally and inspect the actual GitHub Actions result.
