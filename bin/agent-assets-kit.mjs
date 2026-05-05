#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultTemplateRoot = path.join(packageRoot, 'templates', 'default')

const helpText = `
agent-assets-kit

Usage:
  agent-assets-kit setup [--cwd <path>] [--dry-run] [--force] [--no-sync] [--skip-package-script]
  agent-assets-kit sync [--cwd <path>]
  agent-assets-kit doctor [--cwd <path>]
  agent-assets-kit --help

Commands:
  setup   Copy the default .ai templates and local sync script into a project.
  sync    Run the target project's scripts/sync-agent-assets.mjs.
  doctor  Check whether the target project has the expected agent asset files.

Options:
  --cwd <path>             Target project root. Defaults to the current directory.
  --dry-run                Print planned setup writes without changing files.
  --force                  Overwrite existing template-managed files during setup.
  --no-sync                Do not run the generated sync script after setup.
  --skip-package-script    Do not add scripts.sync:agent-assets to package.json.
`.trim()

function parseArgs(argv) {
  const firstArg = argv[0]
  const result = {
    command: (!firstArg || firstArg === '--help' || firstArg === '-h') ? 'help' : firstArg,
    cwd: process.cwd(),
    dryRun: false,
    force: false,
    sync: true,
    packageScript: true,
  }

  const optionStartIndex = result.command === 'help' ? 0 : 1
  for (let index = optionStartIndex; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === result.command) continue
    if (arg === '--cwd') {
      const value = argv[index + 1]
      if (!value) throw new Error('--cwd requires a path')
      result.cwd = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--dry-run') {
      result.dryRun = true
      continue
    }
    if (arg === '--force') {
      result.force = true
      continue
    }
    if (arg === '--no-sync') {
      result.sync = false
      continue
    }
    if (arg === '--skip-package-script') {
      result.packageScript = false
      continue
    }
    if (arg === '--help' || arg === '-h') {
      result.command = 'help'
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  return result
}

function listFiles(rootDir) {
  const files = []

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
        continue
      }
      if (entry.isFile()) files.push(entryPath)
    }
  }

  walk(rootDir)
  return files
}

function copyTemplates({ cwd, dryRun, force }) {
  const writes = []
  const skips = []

  for (const sourcePath of listFiles(defaultTemplateRoot)) {
    const relativePath = path.relative(defaultTemplateRoot, sourcePath)
    const targetPath = path.join(cwd, relativePath)
    const exists = fs.existsSync(targetPath)

    if (exists && !force) {
      skips.push(relativePath)
      continue
    }

    writes.push(relativePath)
    if (dryRun) continue

    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.copyFileSync(sourcePath, targetPath)
  }

  return { writes, skips }
}

function addPackageScript({ cwd, dryRun }) {
  const packageJsonPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return 'missing'
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  packageJson.scripts ??= {}

  if (packageJson.scripts['sync:agent-assets']) {
    return 'exists'
  }

  packageJson.scripts['sync:agent-assets'] = 'node scripts/sync-agent-assets.mjs'
  if (!dryRun) {
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  }
  return 'added'
}

function runTargetSync(cwd) {
  const syncScript = path.join(cwd, 'scripts', 'sync-agent-assets.mjs')
  if (!fs.existsSync(syncScript)) {
    throw new Error(`Cannot find ${path.relative(cwd, syncScript)}. Run setup first.`)
  }

  const result = spawnSync(process.execPath, [syncScript], {
    cwd,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error(`Sync script exited with status ${result.status}`)
  }
}

function setup(options) {
  if (!fs.existsSync(options.cwd)) {
    throw new Error(`Target cwd does not exist: ${options.cwd}`)
  }

  const { writes, skips } = copyTemplates(options)
  console.log(`Target: ${options.cwd}`)

  if (writes.length > 0) {
    console.log(options.dryRun ? 'Would write:' : 'Wrote:')
    for (const file of writes) console.log(`  ${file}`)
  }

  if (skips.length > 0) {
    console.log('Skipped existing files:')
    for (const file of skips) console.log(`  ${file}`)
  }

  if (options.packageScript) {
    const packageScriptStatus = addPackageScript(options)
    if (packageScriptStatus === 'added') {
      console.log(options.dryRun
        ? 'Would add scripts.sync:agent-assets to package.json'
        : 'Added scripts.sync:agent-assets to package.json')
    }
    if (packageScriptStatus === 'missing') {
      console.log('No package.json found; use node scripts/sync-agent-assets.mjs to sync.')
    }
  }

  if (options.sync && !options.dryRun) {
    runTargetSync(options.cwd)
  }
}

function doctor(cwd) {
  const checks = [
    '.ai/entrypoints/project-context.md',
    '.ai/rules/agent-asset-management-rules.md',
    '.ai/skills/create-rule-folder/SKILL.md',
    '.ai/commands/create-rule-folder.md',
    'scripts/sync-agent-assets.mjs',
    'AGENTS.md',
    'CLAUDE.md',
  ]

  let ok = true
  for (const check of checks) {
    const exists = fs.existsSync(path.join(cwd, check))
    console.log(`${exists ? 'OK ' : 'MISS'} ${check}`)
    ok &&= exists
  }

  if (!ok) {
    process.exitCode = 1
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.command === 'help') {
    console.log(helpText)
    return
  }

  if (options.command === 'setup') {
    setup(options)
    return
  }

  if (options.command === 'sync') {
    runTargetSync(options.cwd)
    return
  }

  if (options.command === 'doctor') {
    doctor(options.cwd)
    return
  }

  throw new Error(`Unknown command: ${options.command}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
