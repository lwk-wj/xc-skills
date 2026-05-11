#!/usr/bin/env node
import { cac } from 'cac'
import { addCommand } from './commands/add.js'
import { removeCommand } from './commands/remove.js'
import { listCommand } from './commands/list.js'
import { updateCommand } from './commands/update.js'
import { configCommand } from './commands/config.js'
import { syncCommand } from './commands/sync.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const cli = cac('xc-skills')

// --- Add Command ---
cli
  .command('add <source>', 'Add skills from a local directory or GitHub URL')
  .option('-s, --skill <skills>', 'Specific skills to install')
  .option('-a, --agent <agents>', 'Specific agents to install to')
  .option('-d, --dir <dir>', 'The directory name containing skills', { default: 'skills' })
  .option('-o, --out <path>', 'Specify a custom output directory')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(addCommand)

// --- Remove Command ---
cli
  .command('remove', 'Remove installed skills from the current project or global directory')
  .alias('cleanup')
  .alias('rm')
  .option('-g, --global', 'Remove global skills instead of project skills')
  .action(removeCommand)

// --- List Command ---
cli
  .command('list', 'List installed skills')
  .alias('ls')
  .option('-g, --global', 'List global skills instead of project skills')
  .action(listCommand)

// --- Update Command ---
cli
  .command('update [dir]', 'Update local skills to a remote repository')
  .option('-r, --remote <url>', 'The target remote repository URL')
  .option('-d, --dir <dir>', 'The directory containing local skills', { default: 'skills' })
  .option('-b, --branch <branch>', 'The target branch', { default: 'main' })
  .action(updateCommand)

// --- Config Command ---
cli
  .command('config', 'Configure global settings')
  .option('-r, --repo <path>', 'Set the central skills repository path')
  .action(configCommand)

// --- Sync Command ---
cli
  .command('sync', 'Sync evolved skills (with PENDING_SYNC.md) to central repository')
  .option('-d, --dir <dir>', 'The directory containing local skills', { default: '.agents/skills' })
  .action(syncCommand)

cli.help()
cli.version(pkg.version)

cli.parse()
