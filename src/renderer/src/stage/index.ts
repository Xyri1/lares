import presetJson from '../../../../presets/default.json'
import { resolveFeel } from '../feel/feel'
import { Live2DRuntime } from '../runtime/live2d'
import { isSynthPreset, type SynthPreset } from '../synth/synth'
import { createAffectDriver } from './affect'
import { createCharacterLoadHandler } from './characterSwitch'
import { wireOverlayPointer } from './overlayPointer'
import { mountPanel } from './panel'

// Which window this document is (003-D1). Both windows load the same bundle,
// so `import.meta.env.DEV` cannot tell them apart — it's build-time, and under
// `pnpm dev` it is true for the overlay too. Set before first paint so the
// desktop never flashes through the stage backdrop.
const OVERLAY = new URLSearchParams(location.search).get('mode') === 'overlay'
if (OVERLAY) document.documentElement.classList.add('overlay')

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
  if (OVERLAY) {
    try {
      runtime.setDisplayScale(await window.lares.getOverlayScale())
    } catch (error) {
      console.error('[lares] could not restore overlay scale', error)
    }
  }
  try {
    await runtime.load(character.live2d.model, character.live2d.fallbackPhysics)
  } catch (err) {
    showError(
      `Failed to load "${character.name}": ${err instanceof Error ? err.message : String(err)}`
    )
    return
  }

  window.lares.reportInventory(
    runtime.parameters(),
    runtime.compatibility()
  ) // body:inventory (root SPEC §8)

  // Cue name → Live2D param set. The feed carries cue NAMES only (root §8);
  // resolving them to parameters is body-side knowledge and stops here (P6).
  const cues = await window.lares.listCues()
  const cueParams = Object.fromEntries(
    cues.flatMap((c) => (c.params === undefined ? [] : [[c.name, c.params]]))
  )
  const cueMotions = Object.fromEntries(
    cues.flatMap((c) => (c.motion === undefined ? [] : [[c.name, c.motion]]))
  )

  // Anchors, operational overlays and expressiveness ride the same bootstrap
  // payload the character does; `expressiveness` is absent until the brain
  // starts sending the hidden AppConfig field (013 I3), and 1 is the default.
  const driver = createAffectDriver(
    runtime,
    isSynthPreset(character.live2d.performance)
      ? character.live2d.performance
      : presetJson as SynthPreset,
    cueParams,
    cueMotions,
    resolveFeel(character)
  )
  let currentCharacter = character
  if (OVERLAY) {
    const characterLoads = createCharacterLoadHandler(
      runtime,
      driver,
      cueParams,
      cueMotions,
      (result) => window.lares.reportCharacterPrepared(result as CharacterPrepareResult),
      (result) => window.lares.reportCharacterCommitted(result as CharacterCommitResult),
      (request) => {
        currentCharacter = request.character
        void window.lares.fitToModel(runtime.larSize()).catch((error) => {
          console.error('[lares] fit after character switch failed', error)
        })
      },
      window.lares.getCharacterDecision
    )
    window.lares.onCharacterPrepare(characterLoads.prepare)
    window.lares.onCharacterCommit(characterLoads.commit)
    window.lares.onCharacterRollback(characterLoads.rollback)
    window.lares.onCharacterFinalize(characterLoads.finalize)
    window.lares.onCharacterCancel(characterLoads.cancel)
  }

  if (OVERLAY) {
    const fitOverlay = (): void => {
      void window.lares.fitToModel(runtime.larSize()).catch((error) => {
        console.error('[lares] could not fit overlay', error)
      })
    }
    window.lares.onOverlayScale((scale) => {
      runtime.setDisplayScale(scale)
      fitOverlay()
    })
    // Tight fit last, once the model can report its own footprint (003-D5) —
    // main owns the padding and where she lands.
    fitOverlay()
    wireOverlayPointer(runtime)
  }

  // Scenario control stays a dev-window affair (003-D1): the overlay only
  // mirrors the feed, which reaches it over the broadcast (003-D2).
  if (import.meta.env.DEV && !OVERLAY) {
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
        await rb.load(
          currentCharacter.live2d.model,
          currentCharacter.live2d.fallbackPhysics
        )
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
