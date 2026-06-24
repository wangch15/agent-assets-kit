#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillsRoot = path.join(repoRoot, 'skills')
const targetRoots = ['.agents', '.codex', '.claude']

const helpText = `
install-global-skills

Usage:
  node scripts/install-global-skills.mjs [--home <path>] [--dry-run] [--force]
  node scripts/install-global-skills.mjs --help

Options:
  --home <path>  Home directory that contains .agents/.codex/.claude. Defaults to current user home.
  --dry-run      Print planned writes without changing files.
  --force        Replace existing skill paths even when they already exist.
`.trim()

function parseArgs(argv) {
  const options = {
    home: os.homedir(),
    dryRun: false,
    force: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--home') {
      const value = argv[index + 1]
      if (!value) throw new Error('--home requires a path')
      options.home = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function listSkillDirs() {
  if (!fs.existsSync(skillsRoot)) return []

  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(skillsRoot, name, 'SKILL.md')))
    .sort((a, b) => a.localeCompare(b))
}

function realpathOrNull(targetPath) {
  try {
    return fs.realpathSync(targetPath)
  } catch {
    return null
  }
}

function installLink({ sourcePath, linkPath, dryRun, force }) {
  const sourceRealpath = fs.realpathSync(sourcePath)
  const currentRealpath = realpathOrNull(linkPath)
  const exists = currentRealpath !== null

  if (exists && currentRealpath === sourceRealpath && !force) {
    return 'exists'
  }

  if (exists && !force) {
    return 'skipped'
  }

  if (dryRun) {
    return exists ? 'would-replace' : 'would-link'
  }

  fs.rmSync(linkPath, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  fs.symlinkSync(sourcePath, linkPath, 'dir')
  return exists ? 'replaced' : 'linked'
}

function installGlobalSkills(options) {
  const skillNames = listSkillDirs()
  if (skillNames.length === 0) {
    throw new Error(`No skills found in ${skillsRoot}`)
  }

  console.log(`Source: ${skillsRoot}`)
  console.log(`Home: ${options.home}`)

  for (const root of targetRoots) {
    const targetSkillsRoot = path.join(options.home, root, 'skills')
    if (!options.dryRun) fs.mkdirSync(targetSkillsRoot, { recursive: true })

    for (const skillName of skillNames) {
      const sourcePath = path.join(skillsRoot, skillName)
      const linkPath = path.join(targetSkillsRoot, skillName)
      const status = installLink({
        sourcePath,
        linkPath,
        dryRun: options.dryRun,
        force: options.force,
      })
      console.log(`${status.padEnd(13)} ${path.relative(options.home, linkPath)} -> ${sourcePath}`)
    }
  }
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
  } else {
    installGlobalSkills(options)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
