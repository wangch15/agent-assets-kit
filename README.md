# Agent Assets Kit

[繁體中文](README.zh-TW.md)

Project-local rules, skills, commands, and knowledge sync for coding agents.

Agent Assets Kit initializes a `.ai/` canonical source in your repository, then syncs that content into official agent entrypoints such as `AGENTS.md` and `CLAUDE.md`, plus tool-specific folders such as `.codex/`, `.claude/`, `.agent/`, and `.agents/`.

It can also store personal global skills under `skills/` and install them into Codex / Claude global skill homes.

This project is not published to the npm registry yet. The recommended setup flow is to paste the setup prompt below into your coding agent and let it initialize the project safely.

## Sync Mechanism

Agent Assets Kit keeps human-maintained agent assets in one canonical place, then generates or links the files each agent runtime expects.

- `.ai/entrypoints/project-context.md` becomes the project-specific context inside `AGENTS.md` and `CLAUDE.md`.
- `.ai/rules/*.md` are rendered into the shared rules sections of `AGENTS.md` and `CLAUDE.md`.
- `.ai/skills/*` are synced into `.agent/skills`, `.agents/skills`, `.claude/skills`, and `.codex/skills`.
- `.ai/commands/*` are copied into tool-specific command folders where supported.
- `scripts/sync-agent-assets.mjs` prefers symlinks for shared folders and falls back to copying when symlinks are unavailable.
- `skills/*` at this repo root are personal global skills; `scripts/install-global-skills.mjs` links them into `~/.agents/skills`, `~/.codex/skills`, and `~/.claude/skills`.

In short: project-local knowledge lives under `.ai/`; personal global skills live under this repo's `skills/`; generated entrypoints and tool folders are installation targets.

## Skill Capabilities

| Skill | Location | Capability |
| --- | --- | --- |
| `create-rule-folder` | `templates/default/.ai/skills/create-rule-folder` | Helps agents create co-located rule docs near the owning code, add a short `.ai/rules/*-reference.md` trigger, and keep long-lived project knowledge discoverable without bloating `AGENTS.md` / `CLAUDE.md`. |
| `delegate-low-risk-tasks` | `skills/delegate-low-risk-tasks` | Helps agents review a plan or spec, keep high-risk work with the primary reasoning model, identify low-risk work for cheaper agents, and generate a constrained handoff prompt plus review checklist. |

## Quick Start

Open your target project in a coding agent, then paste this prompt:

```text
Set up Agent Assets Kit in this repository.

Use this GitHub package, not the npm registry:

pnpm dlx github:wangch15/agent-assets-kit setup

Please handle the setup safely:

1. Confirm the repository root and run `git status --short`.
2. Inspect existing agent files before changing anything:
   - AGENTS.md
   - CLAUDE.md
   - .ai/
   - .codex/
   - .claude/
   - .agent/
   - .agents/
3. Inspect the project enough to write useful project context:
   - README files
   - package.json or equivalent project metadata
   - main app/package folders
   - common test, lint, build, and dev commands
4. Run a dry run first:

   pnpm dlx github:wangch15/agent-assets-kit setup --dry-run

5. If existing AGENTS.md or CLAUDE.md contains hand-maintained guidance, do not overwrite it blindly. Move the relevant content into `.ai/entrypoints/project-context.md` or `.ai/rules/*.md`, or ask me before proceeding.
6. Run setup without syncing entrypoints yet:

   pnpm dlx github:wangch15/agent-assets-kit setup --no-sync

7. Edit `.ai/entrypoints/project-context.md` so it accurately describes this project.
8. Add any project-specific shared rules under `.ai/rules/` only when they are clearly useful for future agents.
9. Run the local sync command:

   pnpm sync:agent-assets

   If this project has no package.json or no pnpm script, run:

   node scripts/sync-agent-assets.mjs

10. Run:

   pnpm dlx github:wangch15/agent-assets-kit doctor

11. Show me the files changed, summarize the initialized agent workflow, and mention any existing guidance that needed migration.
```

For a fork or another owner, replace the GitHub package:

```bash
pnpm dlx github:<owner>/agent-assets-kit setup
```

## Agent Setup Prompt

The setup prompt is intentionally the primary installation path. Agent initialization is safer than a blind installer because every project has different existing agent files, conventions, package manager scripts, and project-specific knowledge.

Use the prompt above when you want the agent to initialize the current repository. If you want the agent to initialize another path, add this line to the prompt:

```text
The target project path is: /path/to/project
```

Then ask the agent to add `--cwd /path/to/project` to the `setup` and `doctor` commands.

## Manual Command Reference

You can still run the commands yourself when you already understand the changes:

```bash
pnpm dlx github:wangch15/agent-assets-kit setup
pnpm dlx github:wangch15/agent-assets-kit setup --dry-run
pnpm dlx github:wangch15/agent-assets-kit setup --no-sync
pnpm dlx github:wangch15/agent-assets-kit setup --force
pnpm dlx github:wangch15/agent-assets-kit sync
pnpm dlx github:wangch15/agent-assets-kit doctor
node scripts/install-global-skills.mjs --dry-run
pnpm install:global-skills
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

After setup, use the local sync script from inside the target project:

```bash
pnpm sync:agent-assets
```

If the project does not use a package manager:

```bash
node scripts/sync-agent-assets.mjs
```

## Global Skills

Global skills are personal, cross-project skills that should be available to Codex and Claude in every repository. Keep them in this repo under `skills/`, not inside a project template, unless every newly initialized project should receive a local copy.

The current tracked global skill is `skills/delegate-low-risk-tasks`.

```text
skills/
  delegate-low-risk-tasks/
    SKILL.md
    agents/openai.yaml
scripts/install-global-skills.mjs
```

Install or update global skill links from this repository:

```bash
node scripts/install-global-skills.mjs --dry-run
pnpm install:global-skills
```

The installer symlinks each tracked skill into:

```text
~/.agents/skills
~/.codex/skills
~/.claude/skills
```

Use `node scripts/install-global-skills.mjs --force` when an existing skill path should be replaced with the repository-tracked version.

## Core Workflow

1. Maintain shared agent content in `.ai/`.
2. Keep project-specific knowledge near the code it describes.
3. Use `.ai/rules/*-reference.md` files as global triggers that tell future agents which local docs to read.
4. Run the sync command after changing `.ai/` files.
5. Do not hand-edit generated shared sections in `AGENTS.md` or `CLAUDE.md`.

## Rule Folder Pattern

For long-lived project knowledge, use a short global reference plus a local rule index near the owning code. The reference helps agents discover the rule set; the local docs hold the actual domain knowledge.

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

Then add a global agent reference when future agents must read those docs before editing related code:

```text
.ai/rules/<area>-rules-reference.md
```

The reference should define triggering paths, canonical sources, and read order. It should not become the primary storage for detailed rules.

The local `<area>-rules.md` should work as a local rule index with:

- Scope
- Navigation
- How to find rules
- Maintenance rules

For complex areas, add optional routing and history structure:

- `Change-Type Matrix`: maps task categories to required docs.
- `cases/`: bug background, reproduction notes, historical traps, and corrective decisions.
- `appendix/`: long reference material, old full explanations, schema examples, or tables.

Rules should be classified as:

- `Invariant`: a hard rule that must not be broken
- `Decision`: a current design decision
- `Open Question`: unresolved behavior that agents must not guess

Important `Invariant` and `Decision` entries should include a test or verification step when practical. If no automated check exists yet, mark it as `docs-only risk`.

## Safety Model

- The recommended prompt tells the agent to inspect existing agent files before syncing.
- `setup --no-sync` lets the agent customize `.ai/entrypoints/project-context.md` before generating `AGENTS.md` and `CLAUDE.md`.
- Existing template-managed files are skipped by default.
- Use `--dry-run` to preview setup writes.
- Use `--force` only when you want to overwrite existing template-managed files.
- Existing tool-managed preambles before `# AGENTS.md` or `# CLAUDE.md` are preserved.
- Symlinks are preferred for shared folders; the sync script falls back to copying when symlinks are unavailable.

## Requirements

- Node.js 20+
- pnpm for GitHub `dlx` usage

No npm registry publication is required.
