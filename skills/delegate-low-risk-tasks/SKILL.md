---
name: delegate-low-risk-tasks
description: Use when a user wants to split a planned implementation across agents or models, delegate low-risk tasks to cheaper or smaller models, produce a prompt for Gemini/Flash/Claude/Codex/subagents, or decide which tasks must stay with the primary reasoning model.
---

# Delegate Low-Risk Tasks

## Purpose

Use this skill to turn an implementation plan or spec into a safe agent ownership split. The primary model keeps risky work; lower-cost or less capable agents receive narrow, reviewable prompts for low-risk tasks.

Preserve the user's and project's required output language.

## Workflow

1. Ensure there is a trackable plan.
   - If the project has Spectra, OpenSpec, issue templates, planning docs, or task files, use the native mechanism.
   - If no plan or task list exists, create one or ask for permission to create one before delegation.
   - Do not delegate directly from a vague conversation, even if the implementation sounds simple.

2. Read the relevant source of truth.
   - Load project instructions such as `AGENTS.md`, `CLAUDE.md`, local rules, and spec artifacts.
   - Read proposal/design/spec/tasks before classifying ownership.
   - Identify affected layers: UI, API, database, auth, routes, background jobs, generated files, docs, tests.

3. Classify each task.
   - `Retain`: the primary reasoning model must implement or directly pair on it.
   - `Delegate`: safe to hand to a lower-cost model with narrow instructions.
   - `Split`: delegate only a UI/copy/test shell after the primary model defines contracts, constraints, and forbidden files.

4. Produce a handoff prompt.
   - Include exact task IDs, allowed files, forbidden files/actions, expected behavior, verification commands, and return format.
   - Keep the delegated scope small enough that the primary model can review the diff quickly.

5. Review the delegate's work before accepting it.
   - Inspect the diff and verify forbidden files were not touched.
   - Run targeted tests and any required project checks.
   - Confirm the result still matches the spec before continuing retained work.

## Risk Matrix

Default to `Retain` whenever risk is unclear.

| Keep With Primary Model | Why |
| --- | --- |
| Auth, roles, permissions, admin boundaries | Small mistakes become security bugs. |
| Private data, unpublished drafts, moderation, audit trails | Privacy and trust boundaries need careful review. |
| Secrets, API keys, tokens, BYOK, localStorage credentials | Easy to introduce credential leakage or unsafe UX. |
| Database schema, migrations, indexes, constraints, backfills | Requires compatibility and rollback judgment. |
| API contracts, route resolution, backwards compatibility | Cross-client breakage is easy to miss. |
| Revision, recovery, conflict detection, delete/restore flows | State semantics are fragile. |
| Billing, quotas, payments, production deploys | High blast radius. |
| Shared core libraries or generated artifacts with strict process | Requires repo-specific discipline. |
| Ambiguous product behavior or unresolved spec questions | The primary model should resolve the ambiguity first. |

| Usually Delegable | Guardrails |
| --- | --- |
| i18n copy and wording | Provide exact keys/files and forbidden behavior claims. |
| Pure presentational UI components | API shape and permissions must already be defined. |
| Read-only UI panels over stable data | No mutation, auth, or route changes. |
| Component tests for stable behavior | Define expected states and fixtures. |
| Documentation or user-facing help text | Keep terminology aligned with the spec. |
| Mechanical type or import updates | Limit files and require tests/typecheck. |
| Styling/layout inside existing design patterns | Forbid new design systems or broad refactors. |

## Delegation Prompt Template

Use this shape when generating a paste-ready prompt:

```markdown
You are working in `[absolute project path]`.
Follow all project instructions in `AGENTS.md` / `CLAUDE.md` and keep responses in `[language]`.

Work only on this low-risk scope:

`[change/spec/task name]`

## Allowed Tasks
- `[task id]`: `[precise requirement]`
- `[task id]`: `[precise requirement]`

## Allowed Files
- `[file or directory]`
- `[file or directory]`

## Do Not Touch
- `[forbidden file/directory/action]`
- Do not change auth, permissions, API contracts, migrations, secrets, deployment, or retained tasks.
- Do not archive/close the spec or mark unrelated tasks complete.

## Expected Behavior
- `[observable behavior]`
- `[important negative behavior]`

## Verification
Run:
- `[targeted test/check command]`
- `[optional broader command]`

If a command is too slow or fails for unrelated reasons, report the exact command, failure summary, and relevant output.

## Return Format
1. Files changed.
2. Task IDs completed.
3. Forbidden areas confirmed untouched.
4. Tests/checks run and result.
5. Anything left for the primary model.
```

## Output Format For This Skill

When using this skill, return:

```markdown
## Recommended Owner Split

### Keep With Primary Model
| Task | Reason |
| --- | --- |

### Delegate To Lower-Cost Model
| Task | Allowed Scope | Verification |
| --- | --- | --- |

### Split After Primary Defines Contract
| Task | Primary Must Define | Delegate Can Do |
| --- | --- | --- |

## Prompt For Delegate

[paste-ready prompt]

## Review Checklist For Primary Model

- [ ] Inspect delegate diff.
- [ ] Confirm forbidden files/actions were untouched.
- [ ] Run targeted tests.
- [ ] Run required project checks.
- [ ] Verify completed tasks against the spec.
```

## Hard Stops

Do not delegate a task only because it is short. Delegate only when the blast radius is low and the acceptance criteria are concrete.

If a task contains words like `migration`, `auth`, `permission`, `admin`, `secret`, `token`, `draft`, `private`, `delete`, `restore`, `revision`, `recovery`, `route compatibility`, `API key`, `billing`, or `production`, keep it with the primary model unless the delegated portion is explicitly narrowed to copy, docs, or presentational UI.
