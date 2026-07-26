import presetJson from '../../../../presets/default.json'
import { Live2DRuntime } from '../runtime/live2d'
import type { SynthPreset } from '../synth/synth'
import { createAffectDriver } from './affect'
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

  // Cue name → Live2D param set. The feed carries cue NAMES only (root §8);
  // resolving them to parameters is body-side knowledge and stops here (P6).
  const cues = await window.lares.listCues()
  const cueParams = Object.fromEntries(cues.map((c) => [c.name, c.params]))

  const driver = createAffectDriver(runtime, presetJson as SynthPreset, cueParams)

  if (import.meta.env.DEV) {
    window.__runtime = runtime // console access for A2/A4 gate checks
    window.__driver = driver

    // Second Hiyori loads lazily on the first A/B toggle (002-D2) — normal
    // mode never pays for it — into the SAME pixi app/context as stage A, then
    // just toggles visibility. Idempotent; resets on failure so it can retry.
    let stageB: Promise<Live2DRuntime> | null = null
    const setStageB = (on: boolean): Promise<void> => {
      if (!on) return Promise.resolve(stageB?.then((rb) => rb.setActive(false)) ?? undefined)
      stageB ??= (async () => {
        const rb = new Live2DRuntime(runtime)
        await rb.load(character.live2d.model)
        window.__runtimeB = rb
        driver.addStage('B', rb)
        return rb
      })().catch((err: unknown) => {
        stageB = null
        throw err
      })
      return stageB.then((rb) => rb.setActive(true))
    }

    mountPanel(runtime, driver, cues, setStageB)
  }
}

void boot()
