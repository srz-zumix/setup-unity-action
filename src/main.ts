import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { mkdir } from 'node:fs/promises'
import * as path from 'node:path'
import { getInstallArgs } from './inputs.js'
import { DEFAULT_CLI_VERSION, setupUnityCli } from './unity-cli.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const args = getInstallArgs()
    const cliVersion = core.getInput('cli-version') || DEFAULT_CLI_VERSION
    const cliPath = await setupUnityCli(cliVersion, core.getInput('cli-sha256'))
    const installPath = core.getInput('install-path').trim()
    if (installPath) {
      const resolvedInstallPath = path.resolve(installPath)
      await mkdir(resolvedInstallPath, { recursive: true })
      await exec.exec(cliPath, [
        'install-path',
        '--set',
        resolvedInstallPath,
        '--non-interactive',
        '--no-banner'
      ])
    }

    await exec.exec(cliPath, args)
    core.setOutput('cli-path', cliPath)
    core.setOutput('cli-version', cliVersion)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
