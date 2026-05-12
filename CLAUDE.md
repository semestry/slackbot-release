# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A GitHub Action (not a library or CLI) that posts a rich-text Slack notification when a release is published in the consumer's repo. Fork of `amendx/slackbot-release` maintained by Semestry. The single action input is `slack_webhook_url`; the action manifest is [action.yaml](action.yaml) and it runs on `node20`.

## Build and packaging model

GitHub Actions execute the committed `dist/index.js` directly — there is no install step at runtime. Two build stages must both pass:

1. `npm run build` — `tsc` type-checks and emits to `lib/` (not shipped).
2. `npm run package` — `ncc` bundles `src/main.ts` + all `node_modules` into a single `dist/index.js` (+ source map + `licenses.txt`). **This bundle is committed.**

`npm run all` runs `build → format → lint → test → package` and is the expected pre-commit ritual. The [check-dist workflow](.github/workflows/check-dist.yml) re-runs build+package in CI and **fails if `git diff dist/` is non-empty** — so any change under `src/` (or any dependency bump that affects the bundle) must be accompanied by a regenerated and committed `dist/`.

## Tests

`npm test` runs Node's built-in test runner (`node --test`) via `tsx` against [tests/*.test.ts](tests/). Two complementary styles:

- [tests/changelog-notification.test.ts](tests/changelog-notification.test.ts) — in-process unit tests. `sinon` stubs `axios.post`; assertions inspect the captured payload (text, header / actions / context block shapes, mack markdown conversion, error propagation).
- [tests/main.test.ts](tests/main.test.ts) — subprocess integration tests. Each test spawns `node --import tsx src/main.ts` against a local HTTP server standing in for the Slack webhook, with `GITHUB_*` / `INPUT_*` env vars scrubbed from the parent then explicitly set. This sidesteps `main.ts`'s top-level `run()` and `@actions/github`'s module-load env reads without refactoring `src/`.

Tests live outside `src/` so `tsc`'s `rootDir: "./src"` doesn't compile them into `lib/` and `ncc` doesn't bundle them. `tests/` is also added to [eslint.config.mjs](eslint.config.mjs) ignores because they're outside the eslint tsconfig project.

Note: directory mode (`--test tests/`) doesn't work cleanly with tsx's resolver — use the explicit glob `tests/*.test.ts`. Node ≥20 is required for `.ts` test-file discovery; the project pins v22 via `.node-version`.

## Code architecture

Two source files, straightforward data flow:

- [src/main.ts](src/main.ts) — entrypoint. Reads `slack_webhook_url` via `@actions/core`, pulls the `release` payload from `@actions/github`'s `context` (typed as `ReleaseReleasedEvent` from `@octokit/webhooks-types`), guards that `eventName === 'release'`, and delegates to `notifyChangelog`. Top-level `run()` call — no exports.
- [src/changelog-notification.ts](src/changelog-notification.ts) — pure transformation + HTTP. Builds Slack Block Kit blocks (header / body / divider / action button / context) from the release. The release body is markdown and is converted to Slack blocks via `@tryfabric/mack`'s `markdownToBlocks`. POSTs the final payload to the Slack incoming-webhook URL with `axios`. The local `Release` / `Repository` / `Author` interfaces are deliberately narrower than the full octokit types — only the fields actually consumed are typed.

Adding fields to the Slack message: extend the block array in `notifyChangelog`. Adding action inputs: declare in `action.yaml` AND read via `getInput` in `main.ts` — both are required.

## Release flow

1. `npm run release` (release-it) on `main` only — bumps `package.json`, commits `chore: release vX.Y.Z`, tags, pushes. Configured in [.release-it.json](.release-it.json) to **not** create a GitHub release or publish to npm.
2. The tag push triggers [create-release.yml](.github/workflows/create-release.yml), which uses `softprops/action-gh-release` (with `PAT_CREATE_GITHUB_RELEASE_ACTION` so the resulting `release` event can fan out to consumer workflows) to create the GitHub release with auto-generated notes.
3. Floating major tags (e.g. `v2`) are **not** updated automatically — repoint manually per the README:
   ```
   git tag -fa v2 -m "Update v2 tag" && git push origin v2 --force
   ```

## Node / tooling versions

- [.node-version](.node-version) pins `v22`; CI uses `node-version: 22.x`. The `runs.using` in `action.yaml` is `node20` (the GitHub Actions runtime), which is independent of the build-time Node version.
- TypeScript config in [tsconfig.json](tsconfig.json) currently uses `module: node16` / `moduleResolution: node16`. Note that `@actions/core` v3 and `@actions/github` v9 are pure ESM — bumping to those versions requires also making this package ESM (`"type": "module"` in package.json) and raising `target` to at least `es2022` (for `ErrorOptions` in transitive `@octokit/request-error` types).
