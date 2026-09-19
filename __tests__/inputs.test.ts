import { getInstallArgs } from '../src/inputs.js'

function input(name: string, value: string): void {
  process.env[`INPUT_${name.toUpperCase()}`] = value
}

describe('install inputs', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = Object.fromEntries(
      Object.entries(originalEnv).filter(([name]) => !name.startsWith('INPUT_'))
    )
    input('version', '6000.0.47f1')
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('Uses a positional version and non-interactive CI defaults', () => {
    expect(getInstallArgs()).toEqual([
      'install',
      '6000.0.47f1',
      '--yes',
      '--non-interactive',
      '--no-banner',
      '--format',
      'human'
    ])
  })

  it('Requires a version instead of interactive selection', () => {
    input('version', '')
    expect(getInstallArgs).toThrow('Input required and not supplied: version')
  })

  it('Trims surrounding whitespace from scalar inputs', () => {
    input('version', ' 6000.0.47f1 ')
    input('changeset', ' abc123def456 ')
    expect(getInstallArgs()).toEqual(
      expect.arrayContaining([
        'install',
        '6000.0.47f1',
        '--changeset',
        'abc123def456'
      ])
    )
  })

  it.each(['lts', 'latest', '6000.0', '6000.0.47f1'])(
    'Accepts the version selector %s',
    (version) => {
      input('version', version)
      expect(getInstallArgs().slice(0, 2)).toEqual(['install', version])
    }
  )

  it.each(['x86_64', 'arm64'])('Maps architecture %s', (architecture) => {
    input('architecture', architecture)
    expect(getInstallArgs()).toEqual(
      expect.arrayContaining(['--architecture', architecture])
    )
  })

  it('Trims surrounding whitespace from architecture', () => {
    input('architecture', ' arm64 ')
    expect(getInstallArgs()).toEqual(
      expect.arrayContaining(['--architecture', 'arm64'])
    )
  })

  it('Rejects the CLI binary architecture spelling for the Editor', () => {
    input('architecture', 'x64')
    expect(getInstallArgs).toThrow('architecture must be x86_64 or arm64')
  })

  it('Maps changesets and repeated module arguments', () => {
    input('changeset', 'abc123def456')
    input('module', 'android, ios\nwebgl   windows-mono\r\n')
    expect(getInstallArgs()).toEqual([
      'install',
      '6000.0.47f1',
      '--changeset',
      'abc123def456',
      '--module',
      'android',
      '--module',
      'ios',
      '--module',
      'webgl',
      '--module',
      'windows-mono',
      '--yes',
      '--non-interactive',
      '--no-banner',
      '--format',
      'human'
    ])
  })

  it.each([
    'child-modules',
    'no-child-modules',
    'force',
    'yes',
    'accept-eula',
    'dry-run',
    'resume',
    'no-elevate',
    'list-modules'
  ])('Maps the boolean flag %s without passing a false string', (name) => {
    input(name, 'true')
    expect(getInstallArgs()).toContain(`--${name}`)
    input(name, 'false')
    expect(getInstallArgs()).not.toContain(`--${name}`)
  })

  it('Leaves the child-module default to Unity CLI', () => {
    expect(getInstallArgs()).not.toContain('--child-modules')
    expect(getInstallArgs()).not.toContain('--no-child-modules')
  })

  it('Does not implicitly accept module license agreements', () => {
    expect(getInstallArgs()).not.toContain('--accept-eula')
  })

  it('Rejects conflicting child-module flags', () => {
    input('child-modules', 'true')
    input('no-child-modules', 'true')
    expect(getInstallArgs).toThrow('mutually exclusive')
  })

  it('Rejects invalid booleans', () => {
    input('force', 'enabled')
    expect(getInstallArgs).toThrow('Input does not meet YAML 1.2')
  })

  it.each(['TRUE', 'True'])('Accepts YAML boolean spelling %s', (value) => {
    input('force', value)
    expect(getInstallArgs()).toContain('--force')
  })

  it.each(['human', 'json', 'tsv', 'ndjson', 'github'])(
    'Maps output format %s',
    (format) => {
      input('format', format)
      expect(getInstallArgs().slice(-2)).toEqual(['--format', format])
    }
  )

  it('Trims surrounding whitespace from format', () => {
    input('format', ' json ')
    expect(getInstallArgs().slice(-2)).toEqual(['--format', 'json'])
  })

  it('Rejects invalid output formats', () => {
    input('format', 'xml')
    expect(getInstallArgs).toThrow('format must be')
  })

  it.each([
    ['version', '--force'],
    ['version', '6000.0.47f1 --force'],
    ['version', '6000.0.47f1\n--force'],
    ['changeset', '--force'],
    ['changeset', 'abc123def456 --force'],
    ['module', 'android --force']
  ])('Rejects option injection in %s', (name, value) => {
    input(name, value)
    expect(getInstallArgs).toThrow(`Invalid ${name}`)
  })
})
