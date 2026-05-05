# Agent Assets Kit

[繁體中文](README.zh-TW.md)

Project-local rules, skills, commands, and knowledge sync for coding agents.

Agent Assets Kit initializes a `.ai/` canonical source in your repository, then syncs that content into official agent entrypoints such as `AGENTS.md` and `CLAUDE.md`, plus tool-specific folders such as `.codex/`, `.claude/`, `.agent/`, and `.agents/`.

This project is not published to the npm registry yet. Use it directly from GitHub.

## Quick Start

Run the setup command from the target project root:

```bash
pnpm dlx github:wangch15/agent-assets-kit setup
```

For a fork or another owner:

```bash
pnpm dlx github:<owner>/agent-assets-kit setup
```

To initialize a specific project path:

```bash
pnpm dlx github:wangch15/agent-assets-kit setup --cwd /path/to/project
```

Preview changes before writing files:

```bash
pnpm dlx github:wangch15/agent-assets-kit setup --dry-run
```

## What Setup Creates

```text
.ai/
  README.md
  entrypoints/project-context.md
  rules/agent-asset-management-rules.md
  skills/create-rule-folder/SKILL.md
  commands/create-rule-folder.md
scripts/sync-agent-assets.mjs
AGENTS.md
CLAUDE.md
.codex/rules
.codex/skills
.claude/rules
.claude/skills
.claude/commands
.agent/rules
.agent/skills
.agents/rules
.agents/skills
```

If the target project has `package.json`, setup also adds:

```json
{
  "scripts": {
    "sync:agent-assets": "node scripts/sync-agent-assets.mjs"
  }
}
```

## Commands

```bash
pnpm dlx github:wangch15/agent-assets-kit setup
pnpm dlx github:wangch15/agent-assets-kit setup --dry-run
pnpm dlx github:wangch15/agent-assets-kit setup --force
pnpm dlx github:wangch15/agent-assets-kit sync
pnpm dlx github:wangch15/agent-assets-kit doctor
```

After setup, use the local sync script from inside the target project:

```bash
pnpm sync:agent-assets
```

If the project does not use a package manager:

```bash
node scripts/sync-agent-assets.mjs
```

## Core Workflow

1. Maintain shared agent content in `.ai/`.
2. Keep project-specific knowledge near the code it describes.
3. Use `.ai/rules/*-reference.md` files as global triggers that tell future agents which local docs to read.
4. Run the sync command after changing `.ai/` files.
5. Do not hand-edit generated shared sections in `AGENTS.md` or `CLAUDE.md`.

## Rule Folder Pattern

For long-lived project knowledge, create local canonical docs:

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

Then add a global agent reference:

```text
.ai/rules/<area>-rules-reference.md
```

Rules should be classified as:

- `Invariant`: a hard rule that must not be broken
- `Decision`: a current design decision
- `Open Question`: unresolved behavior that agents must not guess

## Safety Model

- Existing template-managed files are skipped by default.
- Use `--dry-run` to preview setup writes.
- Use `--force` only when you want to overwrite existing template-managed files.
- Existing tool-managed preambles before `# AGENTS.md` or `# CLAUDE.md` are preserved.
- Symlinks are preferred for shared folders; the sync script falls back to copying when symlinks are unavailable.

## Requirements

- Node.js 20+
- pnpm for GitHub `dlx` usage

No npm registry publication is required.
