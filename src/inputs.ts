import * as core from '@actions/core'

const booleanFlags = [
  'child-modules',
  'no-child-modules',
  'force',
  'yes',
  'accept-eula',
  'dry-run',
  'resume',
  'no-elevate',
  'list-modules'
] as const

function validateValue(name: string, value: string): void {
  if (value.startsWith('-') || /[\0\s]/.test(value)) {
    throw new Error(`Invalid ${name}: expected a value, not a CLI option`)
  }
}

/**
 * Convert action inputs to an argument array without invoking a shell.
 */
export function getInstallArgs(): string[] {
  const version = core.getInput('version', { required: true }).trim()
  if (!version) throw new Error('Input required and not supplied: version')
  validateValue('version', version)
  const args = ['install', version]

  const architecture = core.getInput('architecture')
  if (architecture) {
    if (!['x86_64', 'arm64'].includes(architecture)) {
      throw new Error('architecture must be x86_64 or arm64')
    }
    args.push('--architecture', architecture)
  }

  const changeset = core.getInput('changeset').trim()
  if (changeset) {
    validateValue('changeset', changeset)
    args.push('--changeset', changeset)
  }

  for (const module of core
    .getInput('module')
    .split(/[\s,]+/)
    .filter(Boolean)) {
    validateValue('module', module)
    args.push('--module', module)
  }

  for (const flag of booleanFlags) {
    const enabled = core.getInput(flag)
      ? core.getBooleanInput(flag)
      : flag === 'yes'
    if (enabled) args.push(`--${flag}`)
  }
  if (args.includes('--child-modules') && args.includes('--no-child-modules')) {
    throw new Error('child-modules and no-child-modules are mutually exclusive')
  }

  const format = core.getInput('format') || 'human'
  if (!['human', 'json', 'tsv', 'ndjson', 'github'].includes(format)) {
    throw new Error('format must be human, json, tsv, ndjson or github')
  }
  args.push('--non-interactive', '--no-banner', '--format', format)
  return args
}
