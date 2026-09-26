import type * as tc from '@actions/tool-cache'
import { jest } from '@jest/globals'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import * as core from '../__fixtures__/core.js'

const find = jest.fn<typeof tc.find>()
const downloadTool = jest.fn<typeof tc.downloadTool>()
const cacheFile = jest.fn<typeof tc.cacheFile>()
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/tool-cache', () => ({
  find,
  downloadTool,
  cacheFile
}))

const {
  DEFAULT_CLI_VERSION,
  LATEST_CLI_VERSION,
  PINNED_CLI_VERSION,
  getCliRelease,
  setupUnityCli
} = await import('../src/unity-cli.js')

describe('Unity CLI releases', () => {
  it.each([
    ['darwin', 'x64', 'darwin-x64', 'unity'],
    ['darwin', 'arm64', 'darwin-arm64', 'unity'],
    ['linux', 'x64', 'linux-x64', 'unity'],
    ['linux', 'arm64', 'linux-arm64', 'unity'],
    ['win32', 'x64', 'windows-x64', 'unity.exe'],
    ['win32', 'arm64', 'windows-arm64', 'unity.exe']
  ] as const)('Resolves %s/%s', (platform, arch, target, filename) => {
    const release = getCliRelease(PINNED_CLI_VERSION, '', platform, arch)
    expect(release).toEqual({
      url: `https://public-cdn.cloud.unity3d.com/hub/prod/cli/${PINNED_CLI_VERSION}/unity-${target}${platform === 'win32' ? '.exe' : ''}`,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      filename,
      cacheArch: target
    })
  })

  it.each([
    ['freebsd', 'x64'],
    ['linux', 'ia32'],
    ['win32', 'arm']
  ] as const)('Rejects unsupported %s/%s', (platform, arch) => {
    expect(() =>
      getCliRelease(DEFAULT_CLI_VERSION, '', platform, arch)
    ).toThrow('Unsupported Unity CLI platform')
  })

  it.each(['stable', '../1.0.0', '1.0.0/foo', '1.0.0?query', ''])(
    'Rejects invalid CLI version %s',
    (version) => {
      expect(() => getCliRelease(version, '', 'linux', 'x64')).toThrow(
        'cli-version must be latest or an exact version'
      )
    }
  )

  it('Requires a checksum for an unbundled version', () => {
    expect(() => getCliRelease('1.0.0-beta.10', '', 'linux', 'x64')).toThrow(
      'cli-sha256'
    )
  })

  it('Rejects malformed checksum overrides', () => {
    expect(() =>
      getCliRelease(PINNED_CLI_VERSION, 'bad', 'linux', 'x64')
    ).toThrow('cli-sha256')
  })

  it('Defaults to latest and resolves it without a checksum', () => {
    expect(DEFAULT_CLI_VERSION).toBe(PINNED_CLI_VERSION)
    const release = getCliRelease(LATEST_CLI_VERSION, '', 'linux', 'x64')
    expect(release.url).toContain('/latest/unity-linux-x64')
    expect(release.sha256).toBe('')
  })

  it('Pins latest to a checksum when one is supplied', () => {
    const release = getCliRelease(
      LATEST_CLI_VERSION,
      'A'.repeat(64),
      'linux',
      'x64'
    )
    expect(release.sha256).toBe('a'.repeat(64))
  })

  it('Rejects a malformed checksum for latest', () => {
    expect(() =>
      getCliRelease(LATEST_CLI_VERSION, 'bad', 'linux', 'x64')
    ).toThrow('cli-sha256')
  })

  it('Accepts a checksum-pinned custom version', () => {
    const release = getCliRelease(
      '1.0.0-beta.10',
      'A'.repeat(64),
      'linux',
      'x64'
    )
    expect(release.sha256).toBe('a'.repeat(64))
    expect(release.url).toContain('/1.0.0-beta.10/unity-linux-x64')
  })
})

describe('Unity CLI setup', () => {
  let directory: string
  let downloaded: string
  const content = 'test binary content'
  const checksum = createHash('sha256').update(content).digest('hex')
  const filename = process.platform === 'win32' ? 'unity.exe' : 'unity'
  const originalPlatform = process.platform
  const originalArch = process.arch

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'setup-unity-test-'))
    downloaded = path.join(directory, filename)
    await writeFile(downloaded, content, { mode: 0o600 })
    find.mockReturnValue('')
    downloadTool.mockResolvedValue(downloaded)
    cacheFile.mockResolvedValue(directory)
  })

  afterEach(async () => {
    jest.resetAllMocks()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    Object.defineProperty(process, 'arch', { value: originalArch })
    await rm(directory, { recursive: true, force: true })
  })

  it('Verifies a download before caching it and adding it to PATH', async () => {
    await expect(setupUnityCli(DEFAULT_CLI_VERSION, checksum)).resolves.toBe(
      downloaded
    )
    const release = getCliRelease(DEFAULT_CLI_VERSION, checksum)
    expect(downloadTool).toHaveBeenCalledWith(release.url)
    expect(cacheFile).toHaveBeenCalledWith(
      downloaded,
      filename,
      'unity-cli',
      DEFAULT_CLI_VERSION,
      release.cacheArch
    )
    expect(core.addPath).toHaveBeenCalledWith(directory)
  })

  if (process.platform !== 'win32') {
    it('Makes the downloaded binary executable on Unix', async () => {
      await setupUnityCli(DEFAULT_CLI_VERSION, checksum)
      expect((await stat(downloaded)).mode & 0o777).toBe(0o755)
    })
  }

  it('Verifies and reuses the cached CLI without downloading', async () => {
    find.mockReturnValue(directory)
    await expect(setupUnityCli(DEFAULT_CLI_VERSION, checksum)).resolves.toBe(
      downloaded
    )
    expect(downloadTool).not.toHaveBeenCalled()
    expect(cacheFile).not.toHaveBeenCalled()
    expect(core.addPath).toHaveBeenCalledWith(directory)
  })

  it('Does not cache or expose a download with an incorrect checksum', async () => {
    await expect(
      setupUnityCli(DEFAULT_CLI_VERSION, 'a'.repeat(64))
    ).rejects.toThrow('checksum mismatch')
    expect(cacheFile).not.toHaveBeenCalled()
    expect(core.addPath).not.toHaveBeenCalled()
  })

  it('Rejects cached binaries that fail checksum verification', async () => {
    find.mockReturnValue(directory)
    await expect(
      setupUnityCli(DEFAULT_CLI_VERSION, 'a'.repeat(64))
    ).rejects.toThrow('checksum mismatch')
    expect(downloadTool).not.toHaveBeenCalled()
    expect(core.addPath).not.toHaveBeenCalled()
  })

  it('Propagates download failures', async () => {
    downloadTool.mockRejectedValue(new Error('Download unavailable'))
    await expect(setupUnityCli(DEFAULT_CLI_VERSION, checksum)).rejects.toThrow(
      'Download unavailable'
    )
    expect(cacheFile).not.toHaveBeenCalled()
    expect(core.addPath).not.toHaveBeenCalled()
  })

  it('Propagates cache failures without exposing the tool', async () => {
    cacheFile.mockRejectedValue(new Error('Cache unavailable'))
    await expect(setupUnityCli(DEFAULT_CLI_VERSION, checksum)).rejects.toThrow(
      'Cache unavailable'
    )
    expect(core.addPath).not.toHaveBeenCalled()
  })

  it('Downloads latest without verifying or reusing the tool cache', async () => {
    find.mockReturnValue(directory)
    await expect(setupUnityCli(LATEST_CLI_VERSION, '')).resolves.toBe(
      downloaded
    )
    expect(find).not.toHaveBeenCalled()
    expect(downloadTool).toHaveBeenCalledWith(
      getCliRelease(LATEST_CLI_VERSION, '').url
    )
    expect(cacheFile).toHaveBeenCalled()
    expect(core.addPath).toHaveBeenCalledWith(directory)
  })

  it('Falls back to the x64 latest CLI on macOS ARM when the ARM download is unavailable', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    Object.defineProperty(process, 'arch', { value: 'arm64' })
    const fallbackRelease = getCliRelease(
      LATEST_CLI_VERSION,
      '',
      'darwin',
      'x64'
    )
    const fallbackCliPath = path.join(directory, fallbackRelease.filename)
    downloadTool
      .mockRejectedValueOnce(new Error('Unexpected HTTP response: 404'))
      .mockResolvedValueOnce(downloaded)

    await expect(setupUnityCli(LATEST_CLI_VERSION, '')).resolves.toBe(
      fallbackCliPath
    )

    expect(downloadTool).toHaveBeenNthCalledWith(
      1,
      getCliRelease(LATEST_CLI_VERSION, '', 'darwin', 'arm64').url
    )
    expect(downloadTool).toHaveBeenNthCalledWith(2, fallbackRelease.url)
    expect(cacheFile).toHaveBeenCalledWith(
      downloaded,
      'unity',
      'unity-cli',
      LATEST_CLI_VERSION,
      'darwin-x64'
    )
    expect(core.addPath).toHaveBeenCalledWith(directory)
  })

  it('Falls back to the x64 latest CLI when the ARM download reports HTTP 404 via status', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    Object.defineProperty(process, 'arch', { value: 'arm64' })
    const fallbackRelease = getCliRelease(
      LATEST_CLI_VERSION,
      '',
      'darwin',
      'x64'
    )
    const fallbackCliPath = path.join(directory, fallbackRelease.filename)
    downloadTool
      .mockRejectedValueOnce(
        Object.assign(new Error('Download unavailable'), {
          httpStatusCode: 404
        })
      )
      .mockResolvedValueOnce(downloaded)

    await expect(setupUnityCli(LATEST_CLI_VERSION, '')).resolves.toBe(
      fallbackCliPath
    )

    expect(downloadTool).toHaveBeenNthCalledWith(
      1,
      getCliRelease(LATEST_CLI_VERSION, '', 'darwin', 'arm64').url
    )
    expect(downloadTool).toHaveBeenNthCalledWith(2, fallbackRelease.url)
    expect(cacheFile).toHaveBeenCalledWith(
      downloaded,
      'unity',
      'unity-cli',
      LATEST_CLI_VERSION,
      'darwin-x64'
    )
  })

  it('Preserves the fallback download failure after the ARM latest download 404s', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    Object.defineProperty(process, 'arch', { value: 'arm64' })
    downloadTool
      .mockRejectedValueOnce(new Error('Unexpected HTTP response: 404'))
      .mockRejectedValueOnce(new Error('Fallback unavailable'))

    await expect(setupUnityCli(LATEST_CLI_VERSION, '')).rejects.toThrow(
      'Fallback unavailable'
    )
    expect(downloadTool).toHaveBeenNthCalledWith(
      1,
      getCliRelease(LATEST_CLI_VERSION, '', 'darwin', 'arm64').url
    )
    expect(downloadTool).toHaveBeenNthCalledWith(
      2,
      getCliRelease(LATEST_CLI_VERSION, '', 'darwin', 'x64').url
    )
    expect(cacheFile).not.toHaveBeenCalled()
    expect(core.addPath).not.toHaveBeenCalled()
  })

  it('Propagates missing binary failures', async () => {
    downloadTool.mockResolvedValue(path.join(directory, 'missing'))
    await expect(setupUnityCli(DEFAULT_CLI_VERSION, checksum)).rejects.toThrow(
      'ENOENT'
    )
    expect(cacheFile).not.toHaveBeenCalled()
    expect(core.addPath).not.toHaveBeenCalled()
  })
})
