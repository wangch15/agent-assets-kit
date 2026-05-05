---
name: create-rule-folder
description: Use when creating persistent rule documentation for a large feature module, page logic, workflow, domain area, or long-lived project knowledge area.
---

# Create Rule Folder

## Goal

Create maintainable rule documentation for a project area so future agents preserve decisions, invariants, edge cases, and open questions.

The pattern has two parts:

1. Local canonical docs near the implementation.
2. A global agent reference under `.ai/rules/` that tells agents when to read the local docs.

## When To Use

Use this for:

- A large feature module
- A workflow or domain area
- A page with complex behavior
- A calculator, importer, parser, editor, or runtime subsystem
- Any area where decisions need to survive across agent sessions

Do not use this for small one-off changes.

## Folder Pattern

Prefer placing the canonical docs near the owning code:

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

Create a global reference when future agents must read those docs before editing related code:

```text
.ai/rules/<area>-rules-reference.md
```

## Rule Classification

Classify rules with:

- `Invariant`: a hard rule that must not be broken
- `Decision`: a current design decision
- `Open Question`: unresolved behavior that agents must not guess

Important invariants and decisions should have tests or verification steps when practical.

## Workflow

1. Identify the area name, slug, owner path, related paths, and reason the docs are needed.
2. Read nearby docs and existing `.ai/rules` references.
3. Create `<area>-rules.md` as the local index.
4. Create `open-questions.md`.
5. Add topic files only when the area already has enough detail to justify them.
6. Create or update `.ai/rules/<area>-rules-reference.md`.
7. Run the agent asset sync command.
8. Run the smallest useful verification command.

## Local Index Template

```markdown
# <Area> Rules

## Scope

- `<primary path>`
- `<related path>`

## Navigation

- Open questions: `<area>-rules/open-questions.md`

## How To Update

1. Read this index first.
2. Read the nearest topic document for the touched behavior.
3. Add unresolved items to `open-questions.md`.

## Maintenance Rules

1. Keep rules near the behavior they describe.
2. Mark each rule as `Invariant`, `Decision`, or `Open Question`.
3. Update old rules instead of appending contradictions.
4. Run the agent asset sync command when `.ai/` files change.
```

## Global Reference Template

```markdown
# <Area> Rules Reference

Read these docs before changing:

- `<primary path>`
- `<related path>`

Canonical source:

- `<target-root>/docs/<area>-rules.md`
- `<target-root>/docs/<area>-rules/*.md`

Work rules:

- Read the local rules index before editing related code.
- If implementation and docs disagree, fix the implementation or update the docs in the same change.
- Add new rules, exceptions, and semantic decisions to the local docs.
- Prefer `Invariant`, `Decision`, and `Open Question` labels.
- Run the agent asset sync command when `.ai/` files change.
```
