#!/usr/bin/env node
import crypto from 'node:crypto'
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
  agent-assets-kit update [--cwd <path>] [--apply] [--force] [--only <substring>] [--no-sync]
  agent-assets-kit sync [--cwd <path>]
  agent-assets-kit doctor [--cwd <path>]
  agent-assets-kit --help

Commands:
  setup   Copy the default .ai templates and local sync script into a project.
  update  Refresh template-managed files in an already-installed project.
  sync    Run the target project's scripts/sync-agent-assets.mjs.
  doctor  Check whether the target project has the expected agent asset files.

Options:
  --cwd <path>             Target project root. Defaults to the current directory.
  --dry-run                Print planned setup writes without changing files.
  --force                  setup: overwrite every template-managed file.
                           update: also overwrite locally modified files.
  --only <substring>       update: only touch template paths containing this substring.
  --apply                  update: perform the writes. Without it, update only previews.
  --no-sync                Do not run the sync script afterwards.
  --skip-package-script    Do not add scripts.sync:agent-assets to package.json.

update classifies every template file before writing:
  add        the project does not have it yet
  current    the project copy already matches the template
  safe       the project never edited it since install, so it can be refreshed
  conflict   the project edited it locally; skipped unless --force
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
    only: null,
    apply: false,
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
    if (arg === '--only') {
      const value = argv[index + 1]
      if (!value) throw new Error('--only requires a substring')
      result.only = value
      index += 1
      continue
    }
    if (arg === '--apply') {
      result.apply = true
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

const IGNORED_FILENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

function listFiles(rootDir) {
  const files = []

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      if (IGNORED_FILENAMES.has(entry.name)) continue
      files.push(entryPath)
    }
  }

  walk(rootDir)
  return files
}

const MANIFEST_RELATIVE_PATH = path.join('.ai', '.agent-assets-kit.json')

function hashContent(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function hashFile(filePath) {
  return hashContent(fs.readFileSync(filePath))
}

function readManifest(cwd) {
  const manifestPath = path.join(cwd, MANIFEST_RELATIVE_PATH)
  if (!fs.existsSync(manifestPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    return (parsed && typeof parsed.files === 'object') ? parsed : null
  } catch {
    return null
  }
}

function writeManifest({ cwd, files, dryRun }) {
  if (dryRun) return
  const manifestPath = path.join(cwd, MANIFEST_RELATIVE_PATH)
  const previous = readManifest(cwd)
  const manifest = {
    kit: 'agent-assets-kit',
    updatedAt: new Date().toISOString(),
    files: { ...(previous?.files ?? {}), ...files },
  }
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/**
 * 分類每個 template 檔案，讓 update 知道哪些可以安全刷新、哪些是使用者改過的。
 * 沒有 manifest 的舊專案會退化成保守判斷：內容不同一律當 conflict，不自動覆蓋。
 */
function classifyTemplateFiles({ cwd, only }) {
  const manifest = readManifest(cwd)
  const entries = []

  for (const sourcePath of listFiles(defaultTemplateRoot)) {
    const relativePath = path.relative(defaultTemplateRoot, sourcePath)
    if (only && !relativePath.includes(only)) continue

    const targetPath = path.join(cwd, relativePath)
    const templateHash = hashFile(sourcePath)

    if (!fs.existsSync(targetPath)) {
      entries.push({ relativePath, sourcePath, targetPath, templateHash, status: 'add' })
      continue
    }

    const projectHash = hashFile(targetPath)
    if (projectHash === templateHash) {
      entries.push({ relativePath, sourcePath, targetPath, templateHash, status: 'current' })
      continue
    }

    const recordedHash = manifest?.files?.[relativePath]
    const status = recordedHash && recordedHash === projectHash ? 'safe' : 'conflict'
    entries.push({ relativePath, sourcePath, targetPath, templateHash, status, tracked: Boolean(recordedHash) })
  }

  return entries
}

function update(options) {
  if (!fs.existsSync(options.cwd)) {
    throw new Error(`Target cwd does not exist: ${options.cwd}`)
  }

  const entries = classifyTemplateFiles(options)
  if (entries.length === 0) {
    console.log(options.only
      ? `No template file matches --only ${options.only}`
      : 'No template files found.')
    return
  }

  const willWrite = entries.filter((entry) =>
    entry.status === 'add' || entry.status === 'safe' || (entry.status === 'conflict' && options.force))
  const blocked = entries.filter((entry) => entry.status === 'conflict' && !options.force)

  console.log(`Target: ${options.cwd}`)
  if (!readManifest(options.cwd)) {
    console.log('No install manifest found; every differing file is reported as a conflict.')
  }

  for (const entry of entries) {
    const marker = entry.status === 'conflict' && !options.force ? 'conflict' : entry.status
    console.log(`  ${marker.padEnd(8)} ${entry.relativePath}`)
  }

  if (!options.apply) {
    console.log(`\nPreview only. ${willWrite.length} file(s) would change; re-run with --apply to write.`)
    if (blocked.length > 0) {
      console.log(`${blocked.length} locally modified file(s) would be skipped. Review them, then use --force to overwrite.`)
    }
    return
  }

  const written = {}
  for (const entry of willWrite) {
    fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true })
    fs.copyFileSync(entry.sourcePath, entry.targetPath)
    written[entry.relativePath] = entry.templateHash
  }

  // current 的檔案也要記進 manifest，否則下次編輯後會被誤判成 conflict。
  for (const entry of entries.filter((item) => item.status === 'current')) {
    written[entry.relativePath] = entry.templateHash
  }

  writeManifest({ cwd: options.cwd, files: written, dryRun: false })
  console.log(`\nUpdated ${willWrite.length} file(s).`)
  if (blocked.length > 0) {
    console.log(`Skipped ${blocked.length} locally modified file(s); use --force to overwrite them.`)
  }

  if (options.sync) {
    runTargetSync(options.cwd)
  }
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

  // 記錄安裝當下的內容 hash，讓之後的 update 能分辨「沒動過」與「本地改過」。
  const installedHashes = {}
  for (const sourcePath of listFiles(defaultTemplateRoot)) {
    const relativePath = path.relative(defaultTemplateRoot, sourcePath)
    const targetPath = path.join(options.cwd, relativePath)
    if (fs.existsSync(targetPath)) installedHashes[relativePath] = hashFile(targetPath)
    else if (options.dryRun) installedHashes[relativePath] = hashFile(sourcePath)
  }
  writeManifest({ cwd: options.cwd, files: installedHashes, dryRun: options.dryRun })

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

  // doctor 只回報，不改檔案；過期不算失敗，因為專案可能刻意保留本地版本。
  const entries = classifyTemplateFiles({ cwd, only: null })
  const counts = entries.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1
    return acc
  }, {})
  const stale = (counts.add ?? 0) + (counts.safe ?? 0)
  const conflicts = counts.conflict ?? 0

  console.log(`\nTemplate files: ${counts.current ?? 0} current, ${stale} updatable, ${conflicts} locally modified`)
  if (!readManifest(cwd)) {
    console.log('No install manifest; run `agent-assets-kit update --apply` once to start tracking.')
  }
  if (stale > 0) {
    console.log('Run `agent-assets-kit update` to preview the refresh.')
  }
  for (const entry of entries.filter((item) => item.status === 'conflict')) {
    console.log(`  local  ${entry.relativePath}`)
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

  if (options.command === 'update') {
    update(options)
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
