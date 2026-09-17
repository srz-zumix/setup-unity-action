import type * as exec from '@actions/exec'
import { jest } from '@jest/globals'
import { mkdir as fsMkdir } from 'node:fs/promises'
import * as path from 'node:path'
import * as core from '../__fixtures__/core.js'

const execMock = jest.fn<typeof exec.exec>()
const mkdirMock = jest.fn<typeof fsMkdir>()
const setupUnityCli =
  jest.fn<(version: string, hash: string) => Promise<string>>()
const getInstallArgs = jest.fn<() => string[]>()

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => ({ exec: execMock }))
jest.unstable_mockModule('node:fs/promises', () => ({ mkdir: mkdirMock }))
jest.unstable_mockModule('../src/inputs.js', () => ({ getInstallArgs }))
jest.unstable_mockModule('../src/unity-cli.js', () => ({
  DEFAULT_CLI_VERSION: '1.0.0-beta.9',
  setupUnityCli
}))

const { run } = await import('../src/main.js')

describe('main.ts', () => {
  const cliPath = path.resolve('tool cache', 'unity')
  const args = ['install', '6000.0.47f1', '--yes', '--non-interactive']

  beforeEach(() => {
    core.getInput.mockReturnValue('')
    getInstallArgs.mockReturnValue(args)
    mkdirMock.mockResolvedValue(undefined)
    setupUnityCli.mockResolvedValue(cliPath)
    execMock.mockResolvedValue(0)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Installs Unity and sets CLI outputs', async () => {
    await run()

    expect(setupUnityCli).toHaveBeenCalledWith('1.0.0-beta.9', '')
    expect(execMock).toHaveBeenCalledTimes(1)
    expect(execMock).toHaveBeenCalledWith(cliPath, args)
    expect(core.setOutput).toHaveBeenCalledWith('cli-path', cliPath)
    expect(core.setOutput).toHaveBeenCalledWith('cli-version', '1.0.0-beta.9')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Configures an absolute installation root before installing', async () => {
    core.getInput.mockImplementation((name) =>
      name === 'install-path' ? 'Unity Editors; echo not-a-command' : ''
    )

    await run()

    expect(mkdirMock).toHaveBeenCalledWith(
      path.resolve('Unity Editors; echo not-a-command'),
      { recursive: true }
    )
    expect(execMock).toHaveBeenNthCalledWith(1, cliPath, [
      'install-path',
      '--set',
      path.resolve('Unity Editors; echo not-a-command'),
      '--non-interactive',
      '--no-banner'
    ])
    expect(execMock).toHaveBeenNthCalledWith(2, cliPath, args)
  })

  it('Forwards custom CLI version and checksum inputs', async () => {
    core.getInput.mockImplementation(
      (name) =>
        ({ 'cli-version': '1.0.0-beta.10', 'cli-sha256': 'a'.repeat(64) })[
          name
        ] ?? ''
    )
    await run()

    expect(setupUnityCli).toHaveBeenCalledWith('1.0.0-beta.10', 'a'.repeat(64))
    expect(core.setOutput).toHaveBeenCalledWith('cli-version', '1.0.0-beta.10')
  })

  it('Validates installation inputs before downloading or executing anything', async () => {
    getInstallArgs.mockImplementation(() => {
      throw new Error('Invalid input')
    })
    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Invalid input')
    expect(setupUnityCli).not.toHaveBeenCalled()
    expect(execMock).not.toHaveBeenCalled()
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it('Fails if CLI setup fails', async () => {
    setupUnityCli.mockRejectedValue(new Error('Download failed'))
    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Download failed')
    expect(execMock).not.toHaveBeenCalled()
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it('Fails if setting the installation root fails', async () => {
    core.getInput.mockImplementation((name) =>
      name === 'install-path' ? '/editors' : ''
    )
    execMock.mockRejectedValue(new Error('Cannot set install path'))
    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Cannot set install path')
    expect(execMock).toHaveBeenCalledTimes(1)
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it('Fails if creating the installation root fails', async () => {
    core.getInput.mockImplementation((name) =>
      name === 'install-path' ? '/editors' : ''
    )
    mkdirMock.mockRejectedValue(new Error('Cannot create install path'))
    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Cannot create install path')
    expect(execMock).not.toHaveBeenCalled()
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it.each([new Error('Installation failed'), 'Installation failed'])(
    'Reports installation failures: %s',
    async (error) => {
      execMock.mockRejectedValue(error)
      await run()

      expect(core.setFailed).toHaveBeenCalledWith('Installation failed')
      expect(core.setOutput).not.toHaveBeenCalled()
    }
  )

  it.each(['--dry-run', '--list-modules'])(
    'Does not query an installed Editor for %s',
    async (flag) => {
      getInstallArgs.mockReturnValue([...args, flag])
      await run()

      expect(execMock).toHaveBeenCalledTimes(1)
      expect(execMock).toHaveBeenCalledWith(cliPath, [...args, flag])
      expect(core.setOutput).toHaveBeenCalledWith('cli-path', cliPath)
    }
  )
})
