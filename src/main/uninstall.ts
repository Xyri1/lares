import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, parse, posix, resolve, win32 } from 'node:path'
import { removeClaudeCode } from './adapters/claude-code/writer.ts'
import { removeCodexHooks } from './adapters/codex/hooks.ts'

export async function removeOwnedIntegrations(
  home = homedir(),
  log: (message: string) => void = console.error
) {
  const [claude, codex] = await Promise.all([
    removeClaudeCode({
      claudeDirectory: join(home, '.claude'),
      settingsPath: join(home, '.claude', 'settings.json'),
      claudeConfigPath: join(home, '.claude.json'),
      log
    }),
    removeCodexHooks({
      codexDirectory: join(home, '.codex'),
      hooksPath: join(home, '.codex', 'hooks.json')
    }),
    rm(join(home, '.lares', 'bin', 'lares-forwarder'), { force: true }),
    rm(join(home, '.lares', 'bin', 'lares-forwarder.cmd'), { force: true })
  ])
  return { claude, codex }
}

export function validatedUserDataPath(userData: string, appData: string): string {
  const target = resolve(userData)
  const parent = resolve(appData)
  const name = basename(target).toLowerCase()
  if (
    target === parse(target).root ||
    dirname(target) !== parent ||
    (name !== 'lares' && name !== 'lares-app')
  ) {
    throw new Error(`Refusing unsafe Lares userData path: ${userData}`)
  }
  return target
}

export async function removeLaresUserData(userData: string, appData: string): Promise<void> {
  await rm(validatedUserDataPath(userData, appData), { recursive: true, force: true })
}

export function macBundlePath(
  execPath: string,
  packaged: boolean,
  platform: NodeJS.Platform
): string {
  if (platform !== 'darwin') throw new Error('macOS uninstall is available only on macOS')
  if (!packaged) throw new Error('Refusing to remove an unpackaged Lares build')
  const executable = posix.resolve(execPath)
  for (let current = posix.dirname(executable); current !== posix.parse(current).root; current = posix.dirname(current)) {
    if (
      current.endsWith('.app') &&
      posix.relative(current, executable).startsWith('Contents/MacOS/')
    ) {
      const parent = posix.dirname(current)
      if (parent !== '/Applications' && parent !== posix.resolve(homedir(), 'Applications')) {
        throw new Error(`Refusing to remove a Lares bundle outside an Applications folder: ${current}`)
      }
      return current
    }
  }
  throw new Error('Could not resolve the installed Lares app bundle')
}

export function windowsUninstallerPath(
  execPath: string,
  packaged: boolean,
  platform: NodeJS.Platform
): string {
  if (platform !== 'win32') throw new Error('Windows uninstall is available only on Windows')
  if (!packaged) throw new Error('Refusing to remove an unpackaged Lares build')
  return win32.join(win32.dirname(win32.resolve(execPath)), 'Uninstall Lares.exe')
}

export async function runMacUninstall(options: {
  execPath: string
  packaged: boolean
  platform: NodeJS.Platform
  userData: string
  appData: string
  deleteData: boolean
  cleanup(): Promise<void>
  removeData(path: string, appData: string): Promise<void>
  trash(path: string): Promise<void>
  quit(): void
}): Promise<void> {
  const bundle = macBundlePath(options.execPath, options.packaged, options.platform)
  const data = options.deleteData
    ? validatedUserDataPath(options.userData, options.appData)
    : undefined
  await options.cleanup()
  if (data) await options.removeData(data, options.appData)
  await options.trash(bundle)
  options.quit()
}

export async function runWindowsUninstall(options: {
  execPath: string
  packaged: boolean
  platform: NodeJS.Platform
  exists(path: string): boolean
  launch(path: string): Promise<string>
  quit(): void
}): Promise<void> {
  const uninstaller = windowsUninstallerPath(
    options.execPath,
    options.packaged,
    options.platform
  )
  if (!options.exists(uninstaller)) throw new Error(`Lares uninstaller not found: ${uninstaller}`)
  const error = await options.launch(uninstaller)
  if (error) throw new Error(error)
  options.quit()
}
