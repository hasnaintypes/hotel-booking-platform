# Contributing

Thanks for helping with the hotel booking platform. This repository uses a protected `main`, short-lived
branches, small commits and pull requests. The same rules apply to maintainers and outside
contributors.

## Set up

Use Node 22 and pnpm 10.15.0.

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env   # fill in local values; never commit it
docker compose up -d mongo
```

`pnpm dev` runs every workspace; individual apps are `pnpm --filter @hotel-booking/api dev`,
`pnpm --filter @hotel-booking/web dev` and `pnpm --filter @hotel-booking/admin dev`. See the
[README](README.md) for ports, configuration and the production warning.

**Never run `pnpm --filter @hotel-booking/api seed` against data you need:** it deletes all five
collections first.

## Workflow

1. Open or claim an issue before starting non-trivial work. Milestone plans marked
   `status:awaiting-approval` must be approved before implementation starts.
2. Branch from `main` with a type prefix: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`,
   `test/…`, `perf/…` or `ci/…`. Keep the branch focused on one issue or change.
3. Commit in logical pieces. Use a one-line Conventional Commit subject with a scope, then an
   optional blank line and 2–3 bullets explaining what changed and why:
   `feat(api): add booking cancellation endpoint`.
   Do not add `Co-Authored-By` trailers or "Generated with" lines.
4. Push the branch and open a pull request into `main`. Never commit or push directly to `main`.
5. After the PR merges, delete the branch (`gh pr merge --delete-branch`) and prune local remotes.

## Pull requests

Use the pull request template. A reviewable PR:

- explains the behaviour change and the affected apps/packages;
- links the issue, using `Closes #N` or `Fixes #N` **only** when every acceptance criterion is met.
  If scope changed or a criterion is unmet, leave the issue open and comment on it listing the
  remaining work;
- lists the verification commands actually run and their results;
- includes screenshots for visible UI changes;
- does not mix unrelated changes or reformat untouched files.

`main` is protected and requires a pull request and a passing `verify` job. CODEOWNERS review is
requested for sensitive paths (auth, payments, database, CI, shared contracts).

## Verification

Run from the repository root before opening a PR:

```bash
pnpm check:license
pnpm check:unused
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
```

- `pnpm test` runs every workspace. The API suite boots the real application against a disposable
  MongoDB (in-memory locally, a `mongo:7` service in CI) and fakes Stripe, Cloudinary and logging.
- Changes that affect persistence should include a test that exercises a real database, not only a
  mocked service.
- Run `pnpm format` only when you intend to format the whole repository; prefer formatting the files
  you changed.

## Definition of Done

A change is done when:

- [ ] the issue's acceptance criteria are met (or the issue is left open with the gaps listed);
- [ ] new behaviour has tests, including real-database tests where persistence is involved;
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:bundle` pass;
- [ ] documentation and `.env.example` are updated when setup, scripts or configuration changed;
- [ ] the PR is reviewed, CI is green and the branch is merged through a pull request;
- [ ] the merged branch is deleted and the linked issue is closed (or explicitly kept open).

## Labels

Use the existing taxonomy instead of inventing labels:

| Group | Labels |
| --- | --- |
| Type | `type:feature`, `type:bug`, `type:chore`, `type:security`, `type:test`, `type:docs` |
| Area | `area:api`, `area:web`, `area:admin`, `area:db`, `area:payments`, `area:suppliers`, `area:contracts`, `area:infra`, `area:security`, `area:observability`, `area:testing` |
| Priority | `priority:P0` (blocking correctness/safety), `priority:P1` (target product), `priority:P2` (valuable), `priority:P3` (later) |
| Status | `status:needs-decision`, `status:blocked`, `status:awaiting-approval` |

Paths are labelled automatically by `.github/labeler.yml`; add a type and priority label when
triage is not obvious.

## Security and data

- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not open a public
  issue with exploit details.
- Never commit credentials, tokens, real customer data or live Stripe keys. Payment, refund, upload
  and seed operations can affect external systems or persistent data: use test credentials and a
  disposable database for manual checks.
