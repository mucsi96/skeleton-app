# Subscription-backed Codex automation

This is the shared review and skeleton-sync setup for the p07 application fleet
and the other repositories listed in
[p07's inventory](https://github.com/mucsi96/p07/blob/main/docs/codex-migration.md).
It uses ChatGPT sign-in and the plan's Codex allowances. There is no OpenAI API
key or AI execution job in GitHub Actions.

## Activate reviews and PR assistance

These are account-side settings, not settings that Git can enable:

1. Connect **GitHub** to Codex cloud using the ChatGPT account/subscription that
   will run the reviews. Grant access to every repository in the inventory.
   A connected GitLab plugin does not grant access to GitHub repositories.
2. In <https://chatgpt.com/codex/settings/code-review>, enable **Code review** and
   **Automatic reviews** for each repository. Use the same available trigger
   settings across the fleet, including new commits if that option is available.
3. On a representative PR, comment `@codex review` and verify that the native
   Codex connector posts a review. Check a new PR also receives an automatic
   review. Request another review explicitly after updates if the configured
   automatic trigger does not cover them.
4. Use `@codex fix the P1 issue` or `@codex fix the CI failures` on PRs to start
   follow-up work. Standalone issues can be supplied as context to a Codex task;
   this setup does not promise the old issue-assignment/comment workflow triggers.

Each repository's root `AGENTS.md` contains the same **Code Review Rules** plus
its project-specific guidance. Native reviews are findings, not a replacement
for build/test checks or human approvals. Update any branch protection rule
that still requires a removed Claude Actions check after verifying the native
review and retaining the applicable build/test requirements.

## Activate skeleton synchronization

Create a ChatGPT/Codex scheduled task for each downstream application listed in
the inventory. Use **Tuesday at 06:00 UTC** consistently. The task must have
access to both the downstream repository and `mucsi96/skeleton-app`.

For the desktop app, select the project and isolated-worktree mode, keep the
machine/app running, and make GitHub/network tools available. For web scheduled
tasks, verify that the connected tools can actually read the repository, edit
files, and open a PR; web schedules do not have access to local checkout paths.
Availability and tools depend on the ChatGPT plan/workspace.

Use this saved task prompt with the appropriate `OWNER/REPO`:

```text
In OWNER/REPO, follow .github/prompts/sync-skeleton.md from the current default
branch. Adapt relevant skeleton-app changes, run appropriate checks, and open
or update a pull request. Report its URL, the source revision considered,
skipped changes, and validation results. Do not merge or deploy.
```

Run it once manually before enabling recurrence. A committed prompt file does
not create a schedule. If the selected surface cannot edit code or open a PR,
report that limitation and use a Codex environment with those capabilities.

### Shared synchronization procedure

1. Read the target's `AGENTS.md` and README. Work from the latest default branch
   in an isolated worktree or cloud checkout. Preserve existing local work.
2. Fetch `https://github.com/mucsi96/skeleton-app` and resolve its current `main`
   to a full commit SHA. Read `.github/skeleton-sync-revision` in the target if
   present; it records the last source revision whose changes were considered
   and merged. Diff that revision against the resolved SHA. Fail visibly if the
   recorded revision cannot be resolved; do not silently substitute a date range.
3. On the first run, with no recorded revision, compare the current skeleton's
   shared patterns with the target to establish a baseline. Do not assume the
   absence of a checkpoint means the target is already synchronized.
4. Adapt applicable CI/CD, container/Podman, build, testing, authentication,
   deployment, dependency-management, and project-structure improvements.
   Preserve application behavior, schema, credentials, image names, ports,
   storage, and technology choices. Go services stay Go; Spring-specific changes
   apply only to Spring services. Do not copy skeleton business functionality.
5. Keep native Codex review guidance aligned. Do not reintroduce Claude workflows
   or API-billed AI jobs. Inspect dependency/build files as well as source files.
   The published Pages diff is only a convenience: its rolling window and file
   exclusions must not define the complete synchronization range.
6. Inspect existing open skeleton-sync PRs before creating another. If one is
   open, update its branch with the new default branch and new source changes,
   preserving prior proposed adaptations. If already at the source revision and
   no applicable drift exists, report a no-op.
7. Run the target's appropriate documented checks. Include applied changes,
   intentionally skipped changes with reasons, and actual check outcomes in the
   PR. Never claim a check ran when the environment prevented it.
8. Write the full source SHA to `.github/skeleton-sync-revision` in the same PR
   only after considering the full range. A checkpoint-only PR is appropriate
   when every upstream change was already present or inapplicable; explain why.
   The default-branch checkpoint advances only when that PR is merged.
9. Open/update a PR against the target's default branch, with a title beginning
   `chore: sync skeleton patterns`. Return the PR URL. Do not merge or deploy.

`skeleton-app` is the source and needs no self-sync schedule. p07, k8s-modules,
k8s-helm-charts, and image-processor share review setup but are not downstream
application-sync targets.

## Terraform version maintenance

p07 has a separate task prompt at `.github/prompts/update-terraform-versions.md`.
Schedule it for **Wednesday at 08:00 UTC**, using the same subscription-backed
environment approach. Test it manually and verify a PR is produced when updates
exist. It proposes changes only; infrastructure application remains separate.

## Rollout status and credentials

Repository changes alone do not activate native reviews or scheduled tasks.
Record account-side activation and representative run results in the p07
inventory. Publish the shared guidance and downstream prompts before enabling
tasks that read them from GitHub.

After the migrated default branches and replacement automation are verified,
remove obsolete `CLAUDE_CODE_OAUTH_TOKEN` repository secrets and unused Claude
GitHub app access. No replacement AI secret is required for this setup. Never
upload a local Codex `auth.json` to these public repositories or their workflows.

## References

- [Native GitHub review and PR tasks](https://developers.openai.com/codex/third-party/github)
- [Scheduled tasks](https://developers.openai.com/codex/automations)
- [Authentication](https://developers.openai.com/codex/auth)
- [Account-auth CI limitations](https://developers.openai.com/codex/auth/ci-cd-auth)
