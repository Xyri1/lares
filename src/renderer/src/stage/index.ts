import { Live2DRuntime } from '../runtime/live2d'
import { mountPanel } from './panel'

function showError(message: string): void {
  const el = document.createElement('div')
  el.className = 'boot-error'
  el.textContent = message
  document.body.appendChild(el)
}

async function boot(): Promise<void> {
  if (!('Live2DCubismCore' in window)) {
    showError('Live2D Cubism Core not found.\nRun "pnpm fetch-assets", then restart the app.')
    return
  }

  const character = await window.lares.getCharacter()
  if (!character.ok) {
    showError(character.error)
    return
  }

  const canvas = document.getElementById('stage') as HTMLCanvasElement
  const runtime = new Live2DRuntime(canvas)
  try {
    await runtime.load(character.live2d.model)
  } catch (err) {
    showError(
      `Failed to load "${character.name}": ${err instanceof Error ? err.message : String(err)}`
    )
    return
  }

  window.lares.reportInventory(runtime.parameters()) // body:inventory (root SPEC §8)

  if (import.meta.env.DEV) {
    window.__runtime = runtime // console access for A2/A4 gate checks
    mountPanel(runtime)
  }
}

void boot()
