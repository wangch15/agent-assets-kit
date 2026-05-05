---
name: Create Rule Folder
description: Create persistent rule documentation for a project area
category: Project
tags: ["rules", "docs", "agent-assets"]
---

Use the `create-rule-folder` skill.

Treat input after `/create-rule-folder` as the target project area and any initial rule decisions.

Expected output:

- Local canonical docs near the owning code.
- `open-questions.md` for unresolved behavior.
- Optional `.ai/rules/<area>-rules-reference.md` when future agents must read the local docs before editing related code.

Classify rules as:

- `Invariant`
- `Decision`
- `Open Question`

After changing `.ai/rules`, `.ai/skills`, or `.ai/commands`, run the agent asset sync command.
