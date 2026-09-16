import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod } from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'

export const DEFAULT_CLI_VERSION = '1.0.0-beta.9'

// Pinned binary checksums from Homebrew/homebrew-cask and ScoopInstaller/Versions.
const checksums: Record<string, string> = {
  'darwin-arm64':
    '459d6830a411df86e9db0579b803932f0c6bc2eff6a7ab483385f1676fdab21f',
  'darwin-x64':
    '5e98989144dd24a0b74cdb2a5ca08674e1ec7f6847fea03eeacd7eeb6d4cd196',
  'linux-arm64':
    '6775b274533b94a56acc949c3a80233dc15d5c52127d9ba3f69182f931fce0db',
  'linux-x64':
    '8c0d6e2435449c8be7f0e6b2ce6330bfc5f17a98aec4b659c859940455dd0fe5',
  'windows-x64':
    '325c5f4d0a241121034e0c066b3d6169ef776cd33b73b1489d5c151440c77876',
  'windows-arm64':
    '89641751d777379c38ec1a31dd75e5e4baf45a2ff3f9a89e43153c0cf5834be9'
}

/**
 * Resolve the official standalone binary for the runner, not the Editor target.
 */
export function getCliRelease(
  version: string,
  sha256: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): { url: string; sha256: string; filename: string; cacheArch: string } {
  const os = platform === 'win32' ? 'windows' : platform
  const cacheArch = `${os}-${arch}`
  if (!Object.hasOwn(checksums, cacheArch)) {
    throw new Error(`Unsupported Unity CLI platform: ${platform}/${arch}`)
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(
      'cli-version must be an exact version, such as 1.0.0-beta.9'
    )
  }

  const expected =
    sha256 || (version === DEFAULT_CLI_VERSION ? checksums[cacheArch] : '')
  if (!/^[0-9a-f]{64}$/i.test(expected)) {
    throw new Error(
      'cli-sha256 must be a SHA-256 hash and is required for a custom cli-version'
    )
  }
  const extension = platform === 'win32' ? '.exe' : ''
  return {
    url: `https://public-cdn.cloud.unity3d.com/hub/prod/cli/${version}/unity-${os}-${arch}${extension}`,
    sha256: expected.toLowerCase(),
    filename: `unity${extension}`,
    cacheArch
  }
}

async function verifyChecksum(file: string, expected: string): Promise<void> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  if (hash.digest('hex') !== expected) {
    throw new Error('Unity CLI SHA-256 checksum mismatch')
  }
}

/**
 * Download, verify and cache Unity CLI, and make it available to later steps.
 */
export async function setupUnityCli(
  version: string,
  sha256: string
): Promise<string> {
  const release = getCliRelease(version, sha256)
  let directory = tc.find('unity-cli', version, release.cacheArch)
  if (directory) {
    await verifyChecksum(path.join(directory, release.filename), release.sha256)
  } else {
    core.info(`Downloading Unity CLI ${version} for ${release.cacheArch}`)
    const downloaded = await tc.downloadTool(release.url)
    await verifyChecksum(downloaded, release.sha256)
    if (process.platform !== 'win32') await chmod(downloaded, 0o755)
    directory = await tc.cacheFile(
      downloaded,
      release.filename,
      'unity-cli',
      version,
      release.cacheArch
    )
  }

  core.addPath(directory)
  return path.join(directory, release.filename)
}
