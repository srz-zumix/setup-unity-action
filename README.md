# Setup Unity

![CI](https://github.com/srz-zumix/setup-unity-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/srz-zumix/setup-unity-action/actions/workflows/check-dist.yml/badge.svg)
![Coverage](./badges/coverage.svg)

Install the Unity Editor and modules on **macOS, Windows and Linux** using the
official standalone [Unity CLI](https://docs.unity.com/en-us/unity-cli). This
action uses `unity install`, not Unity Hub's legacy headless interface.

## Usage

```yaml
jobs:
  unity:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
      - name: Install Unity
        uses: srz-zumix/setup-unity-action@main
        with:
          version: 6000.0.47f1
          accept-eula: 'true'
      - name: Show installed Editors
        run: unity editors --installed
```

Pin the action to a commit SHA for reproducible workflows. `version` selects the
**Editor**, while `cli-version` selects the standalone CLI. The CLI is added to
`PATH` for subsequent steps; the Editor executable is not.

### Install modules

```yaml
- uses: srz-zumix/setup-unity-action@main
  with:
    version: 6000.0.47f1
    module: |
      android
      webgl
    child-modules: 'true'
    accept-eula: 'true'
    install-path: ${{ runner.temp }}/Unity Editors
```

`module` also accepts whitespace- or comma-separated IDs. Each ID is passed as a
separate `--module` argument. Availability depends on the Editor release and OS.

### Preview or list modules

```yaml
- uses: srz-zumix/setup-unity-action@main
  with:
    version: 6000.0.47f1
    module: android
    dry-run: 'true'
    format: json
```

Use `list-modules: 'true'` to list modules instead. Neither mode installs an
Editor, but both still download and set up the CLI.

## Inputs

The canonical `unity install` options are mapped directly to inputs. `version`
is required to avoid interactive version selection. All other inputs are
optional. Boolean inputs accept YAML `true` / `false` spellings; quote them in
workflows.

| Input              | CLI argument / behavior                                                         | Default                               |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------- |
| `version`          | Positional Editor version or selector, such as `6000.0.47f1`, `lts` or `latest` | Required                              |
| `architecture`     | `--architecture`: `x86_64` or `arm64` for the Editor                            | CLI default                           |
| `changeset`        | `--changeset`: archive changeset hash                                           | Unset                                 |
| `module`           | Repeated `--module` arguments                                                   | Unset                                 |
| `child-modules`    | `--child-modules`: include child modules                                        | `false`                               |
| `no-child-modules` | `--no-child-modules`: exclude child modules                                     | `false`                               |
| `force`            | `--force`: reinstall an existing Editor                                         | `false`                               |
| `yes`              | `--yes`: select the first matching version without prompting                    | `true`                                |
| `accept-eula`      | `--accept-eula`: accept module license agreements                               | `false`                               |
| `dry-run`          | `--dry-run`: preview without installing                                         | `false`                               |
| `resume`           | `--resume`: resume cached downloads                                             | `false`                               |
| `no-elevate`       | `--no-elevate`: skip the Windows elevated install helper                        | `false`                               |
| `list-modules`     | `--list-modules`: list modules and exit                                         | `false`                               |
| `format`           | `--format`: `human`, `json`, `tsv`, `ndjson` or `github`                        | `human`                               |
| `install-path`     | Set the Editor root with `unity install-path --set` before installing           | CLI default                           |
| `cli-version`      | Exact CLI version to download                                                   | `1.0.0-beta.9`                        |
| `cli-sha256`       | SHA-256 of the runner-specific CLI binary                                       | Built-in checksum for the default CLI |

- The action always adds `--non-interactive` and `--no-banner`. With
  `yes: 'false'`, commands requiring a choice may fail rather than prompt.
- `child-modules` and `no-child-modules` cannot both be true. When both are
  false, neither flag is sent, preserving the CLI's default behavior.
- The current CLI retains older aliases such as `--cm` and `--list-components`;
  use the canonical action inputs `child-modules` and `list-modules`.
- `install-path` is a root directory, not an Editor executable. Relative paths
  resolve from the working directory. Setting it updates the CLI's persistent
  configuration, including during a dry run; take care on shared self-hosted
  runners.
- CLI failures, including partial module-installation failures, fail the action.

## Outputs

| Output        | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `cli-path`    | Absolute path to the CLI executable (`unity` or `unity.exe`) |
| `cli-version` | CLI version used                                             |

To locate an installed Editor, use `unity editors path <version>` after a
successful installation. Outputs describe the CLI only, including in dry-run and
list modes.

## Platforms and licensing

CLI downloads support x64 and ARM64 on macOS, Windows and Linux. The CLI binary
is selected automatically for the **runner's** OS and architecture; the
`architecture` input instead controls the **Editor** architecture (`x86_64`, not
`x64`). An ARM64 CLI does not imply that every Editor release or module supports
ARM64 on that OS.

Use a runner compatible with Node.js 24 actions. Self-hosted runners also need
the OS dependencies, disk space and installation permissions required by Unity.
On Windows, run CI agents elevated when installers require administrator
permissions: `no-elevate` disables the CLI helper, but cannot guarantee that an
underlying installer will not request elevation.

Set `accept-eula: 'true'` **only if you agree to the applicable module
licenses**. `yes` is not EULA acceptance. This action does not sign in, activate
a Unity license, build a project, or return a license. Configure licensing
separately before launching the Editor.

## CLI downloads and caching

The action downloads raw executables over HTTPS from Unity's
`public-cdn.cloud.unity3d.com` CDN, verifies SHA-256, and caches only the CLI in
the runner tool cache. Cached binaries are checked again before use. Editor
installations and Unity's download cache are managed by the CLI, not by an
`actions/cache` step.

The default CLI checksums are pinned from the
[Homebrew manifest](https://github.com/Homebrew/homebrew-cask/blob/c9c6ce69ce87cfa22290d2a0351f0f76894037a3/Casks/u/unity-cli.rb)
and
[Scoop manifest](https://github.com/ScoopInstaller/Versions/blob/2bcdda3b7cb2d800949781b8c0e0bdfa5315e9d3/bucket/unity-cli-beta.json).
Overriding `cli-version` requires a trusted `cli-sha256` for each runner
platform. Custom CLI versions must support the options you select.

The command mapping follows Unity's
[official CLI reference](https://github.com/Unity-Technologies/skills/blob/645158263ad5f93296ca54444db8f2ec5dbf8c4d/skills/unity-cli/references/editors-install.md).

## Development

Use Node.js 24 and the existing project commands:

```bash
npm ci
npm run all
```

Unit tests cover option mapping, platform selection, checksum verification,
caching and failure propagation. CI runs the unit tests and the bundled action's
dry-run smoke test on macOS, Windows and Linux. Smoke tests do not verify a full
Editor installation or license activation.

After changing `src/`, run `npm run bundle` and commit the generated `dist/`
files. For local debugging, copy `.env.example` to `.env` and run
`npm run local-action`; the example defaults to a dry run.
