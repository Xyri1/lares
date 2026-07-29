import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packagePreflight } from './scripts/distribution.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const { character } = packagePreflight(root)

export default {
  appId: 'io.lares',
  productName: 'Lares',
  asar: true,
  directories: {
    output: 'dist',
    buildResources: 'resources'
  },
  files: [
    'out/**/*',
    'scripts/forwarder.js',
    'resources/icon.png',
    'package.json'
  ],
  extraResources: [
    { from: character, to: 'default-character', filter: ['**/*'] },
    { from: 'LICENSE', to: 'LICENSE' },
    { from: 'NOTICE', to: 'NOTICE' }
  ],
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    category: 'public.app-category.utilities',
    minimumSystemVersion: '13.0',
    identity: null,
    icon: 'resources/icon.png',
    artifactName: 'Lares-${version}-macOS-universal-unsigned.${ext}'
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.png',
    artifactName: 'Lares-${version}-Windows-${arch}-unsigned.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    include: 'build/installer.nsh',
    deleteAppDataOnUninstall: false,
    uninstallDisplayName: 'Lares'
  }
}
