import * as core from '@actions/core'
import * as exec from '@actions/exec'
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
    // @actions/exec parses its command string, so quote paths containing spaces.
    const command = `"${cliPath}"`
    const installPath = core.getInput('install-path')
    if (installPath) {
      await exec.exec(command, [
        'install-path',
        '--set',
        path.resolve(installPath),
        '--non-interactive',
        '--no-banner'
      ])
    }

    await exec.exec(command, args)
    core.setOutput('cli-path', cliPath)
    core.setOutput('cli-version', cliVersion)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
