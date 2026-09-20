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
