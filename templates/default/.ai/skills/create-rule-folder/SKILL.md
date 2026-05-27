---
name: create-rule-folder
description: Use when creating persistent rule documentation for a large feature module, page logic, calculator, workflow, domain area, or long-lived project knowledge area.
---

# Create Rule Folder

## Overview

Create maintainable rule documentation for a project area so future agents preserve decisions, invariants, edge cases, and open questions across sessions.

The pattern has two parts:

1. **Local canonical docs** near the implementation. These are the source of truth.
2. **Global agent reference** under `.ai/rules/`. This is the searchable trigger that tells agents when and how to read the local docs.

## When To Use

Use this for:

- A large feature module
- A workflow or domain area
- A page with complex behavior
- A calculator, importer, parser, editor, or runtime subsystem
- Any area where decisions need to survive across agent sessions
- Any area where repeated bugs, exceptions, or semantic decisions are already accumulating

Do not use this for:

- Small one-off changes
- Pure copy or style edits
- Areas that already have clear rules docs and only need content updates

## Required Inputs

Before creating files, identify or infer:

- Area name, slug, and type
- Primary owner path and related paths
- Why this area needs persistent rules
- Where the canonical docs should live
- Whether future agents must read the docs before touching related code
- Whether a domain-specific command is justified

If the owner path or domain boundary is unclear, ask one concise question before creating files.

## Folder Pattern

Prefer placing the canonical docs near the owning code:

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

Create a global reference for large or long-lived areas:

```text
.ai/rules/<area>-rules-reference.md
```

The global agent reference is not the primary storage for detailed rules. It should stay short enough to work as a trigger and navigation header.

## Global Agent Reference

`.ai/rules/<area>-rules-reference.md` should define:

- Which paths or work types trigger this rule set
- The canonical local index and topic docs
- The read order before editing related code
- Cross-area docs that must also be read
- The requirement to update local docs when behavior changes
- The repo's agent asset sync command

Keep domain details in `<target-root>/docs/<area>-rules*.md` so `.ai/rules` does not become a large knowledge dump.

## Rule Classification

Classify rules with:

- `Invariant`: a hard rule that must not be broken
- `Decision`: a current design decision
- `Open Question`: unresolved behavior that agents must not guess

Important invariants and decisions should have tests or verification steps when practical.

## Local Index

`<area>-rules.md` is the local rule index. It should let an agent find the smallest necessary document without reading the whole folder.

Required sections:

- Scope
- Navigation
- How to find rules
- Maintenance rules

For complex areas, add one or both of:

- `Change-Type Matrix`: maps task categories to required docs.
- `File Classes`: explains which files are mainline rules, cases, and appendix material.

## Complex Area Extensions

Do not force every area to use this structure. Use it when a rules folder has enough volume or risk to justify it:

```text
<target-root>/docs/<area>-rules/
  cases/
    <bug-or-decision-case>.md
  appendix/
    <long-reference>.md
```

Recommended file classes:

- Mainline rules: active rules future agents should read before relevant work.
- `cases/`: bug background, reproduction notes, historical traps, corrective decisions, and linked tests.
- `appendix/`: long tables, old full explanations, schema examples, or reference material that should not stay on the main path.

Mainline rules may use rule cards:

```markdown
- Type: `Invariant` | `Decision` | `Open Question`
- Applies to: `<paths or behavior>`
- Rule: `<the current rule>`
- Why: `<short reason>`
- Enforced by: `<test, command, or docs-only risk>`
```

Use `docs-only risk` when a rule has no automated enforcement yet.

## Workflow

1. Identify the area name, slug, owner path, related paths, and reason the docs are needed.
2. Read nearby docs and existing `.ai/rules` references.
3. Choose the canonical docs location near the owning code.
4. Create `open-questions.md`.
5. Create `<area>-rules.md` as the local index.
6. Add topic files only when the area already has enough detail to justify them.
7. For complex areas, add `Change-Type Matrix`, `cases/`, or `appendix/` only when they reduce required reading.
8. Create or update `.ai/rules/<area>-rules-reference.md` unless there is a clear reason future agents should not be forced to read it.
9. Run the agent asset sync command if `.ai/` changed.
10. Run the smallest useful verification command.

## Local Index Template

```markdown
# <Area> Rules

## Scope

- `<primary path>`
- `<related path>`

## Navigation

- `<topic>`: `<area>-rules/<topic>.md`
- Open questions: `<area>-rules/open-questions.md`

## How To Find Rules

1. Read this index first.
2. Read the nearest topic document for the touched behavior.
3. If no rule exists, add it to `open-questions.md` or define the rule in the same change.

## Maintenance Rules

1. Keep rules near the behavior they describe.
2. Mark each rule as `Invariant`, `Decision`, or `Open Question`.
3. Important `Invariant` and `Decision` rules should include a test or verification step when practical.
4. If an old rule is stale, update the canonical rule or move it to `Open Question`; do not append contradictions.
5. Run the agent asset sync command when `.ai/` files change.
```

## Global Reference Template

```markdown
# <Area> Rules Reference

When work touches any of these areas, read the local rules first:

- `<primary path>`
- `<related path>`

Canonical source:

- `<target-root>/docs/<area>-rules.md`
- `<target-root>/docs/<area>-rules/*.md`

Work rules:

- Read `<area>-rules.md` before editing related code, then read the smallest topic document for the touched behavior.
- If implementation and docs disagree, fix the implementation or update the docs in the same change.
- Add new rules, exceptions, and semantic decisions to the local docs.
- Prefer `Invariant`, `Decision`, and `Open Question` labels.
- Important `Invariant` and `Decision` rules should include tests or verification steps when practical.
- Run the agent asset sync command when `.ai/` files change.
```

## Command Guidance

Create a domain-specific command only when that area will be updated frequently. Commands should stay thin: they trigger the skill and summarize input, but they should not duplicate the full workflow.

## Completion Checklist

- Local canonical rules index exists or was updated.
- `open-questions.md` exists.
- Rules use `Invariant`, `Decision`, or `Open Question` labels.
- Global agent reference exists or omission is explicitly justified.
- Old rules were updated in place; contradictions were not appended.
- `.ai/` changes were synced.
- The smallest useful verification command was run.
