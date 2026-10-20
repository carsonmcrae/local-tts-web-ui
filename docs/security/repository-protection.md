# How the repository is protected

The `main` branch and release tags are protected by GitHub rulesets (repository **Settings** →
**Rules** → **Rulesets**). The aim: every change reaches `main` through a pull request that passes CI,
outside contributors need the maintainer's approval, and the history can't be rewritten or deleted.
The maintainer can still merge their own pull requests without a second person.

Configuration checked on 2026-10-20 (`gh api repos/carsonmcrae/ttsnative/rulesets`).

## Rulesets

### `main: integrity and CI (no bypass)`

Applies to the default branch with **no bypass for anyone**, including administrators:

| Rule                   | Effect                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Require a pull request | No direct pushes to `main`; merge or squash only.                                                            |
| Required status checks | `Validate` (ci.yml: web, server, API contract and security jobs) and `review` (dependency review) must pass. |
| Block force pushes     | History on `main` can't be rewritten.                                                                        |
| Restrict deletions     | `main` can't be deleted.                                                                                     |

### `main: reviews (code owner approval)`

Applies to the default branch:

- 1 approving review, which must come from a code owner (`.github/CODEOWNERS`: `@carsonmcrae`).
- The approval must come after the latest push; new commits dismiss earlier approvals.
- All review conversations must be resolved.
- **Bypass:** the repository admin role, **for pull requests only**. The maintainer can merge their
  own pull request without an approval (GitHub never lets authors approve their own work), but only
  through a pull request, so the CI ruleset above still applies.

### `Protect release tags`

Tags matching `v*` can't be moved, updated or deleted. Admins can bypass this, which is needed to repair
a release; creating a new tag is unaffected.

## Other settings

- **CODEOWNERS** assigns every path to `@carsonmcrae`, with explicit entries for security-sensitive code,
  `.github/` (workflows, Dependabot and templates) and the CODEOWNERS file itself. Changing any of them
  needs the code owner's approval.
- **Fork pull requests:** workflows don't run for any outside contributor until the maintainer approves
  them (`all_external_contributors`).
- **Actions token:** the default `GITHUB_TOKEN` is read-only and can't approve pull requests. Workflows
  ask for extra permissions per job.
- **Auto-merge** is off. Merged branches are deleted.

## Verified behaviour

- A normal merge of a pull request with passing CI but no approval is refused (checked on #28); only
  the administrator's pull-request bypass can merge it.
- `GET /repos/carsonmcrae/ttsnative/rules/branches/main` lists `deletion`, `non_fast_forward`,
  `required_status_checks` and both `pull_request` rules as in force.
- The rulesets kept working after the repository was renamed from `local-tts-web-ui`.

## Limitations

- **One maintainer.** The review requirement is meaningful for other contributors only. The
  maintainer's own changes rely on CI and on the maintainer reviewing their own diff.
- **The admin bypass belongs to the role.** Anyone given the admin role would also be able to skip
  reviews (but not CI). Keep the maintainer as the only administrator.
- **Required checks are enforced for everyone.** A broken or renamed check blocks every merge,
  including the maintainer's. Fix CI in a pull request, or update the check names in the ruleset if a
  job is renamed.
- **Personal account.** Features that need an organisation, such as team code owners, organisation-wide
  rulesets and push rules managed across repositories, aren't available. If the project moves to an
  organisation, revisit this setup.
