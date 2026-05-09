import os from 'node:os'
import { join } from 'node:path'

export interface Agent {
  name: string
  path: string
  description?: string
}

export const AGENTS: Agent[] = [
  {
    name: 'Antigravity',
    path: join(os.homedir(), '.agent/skills'),
    description: 'Custom AI agent for XC development'
  },
  {
    name: 'Trae',
    path: join(os.homedir(), '.trae/skills'),
    description: 'Trae AI IDE'
  },
  {
    name: 'Codex',
    path: join(os.homedir(), '.codex/skills'),
    description: 'Codex AI assistant'
  },
  {
    name: 'Claude Code',
    path: join(os.homedir(), '.claude/skills'),
    description: 'Anthropic Claude Code CLI'
  }
]
