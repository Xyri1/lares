import presetJson from '../../../../presets/default.json'
import { ANCHOR_KEYS } from '../feel/feel'
import type { Live2DRuntime } from '../runtime/live2d'
import type { SynthPreset } from '../synth/synth'
import type { AffectDriver } from './affect'
import { drawOverlay, FEEL_AXES, xToT, type OverlayToggles } from './overlayCanvas'
import { PRESETS } from './presets'

const PANEL_WIDTH = 260 // must match #dev-panel width in index.html

const GOLDENS = [
  'smooth-build',
  'brutal-debugging-session',
  'long-wait-for-input',
  'recovery-arc'
]

// Dev-side only (SPEC §3): the corner mnemonics never cross the model-facing
// boundary and are not a runtime taxonomy — a label here is just a label.
const ANCHOR_LABELS: Record<string, string> = {
  neutral: 'neutral',
  '+++': 'triumphant',
  '++-': 'giddy',
  '+-+': 'serene',
  '+--': 'content',
  '-++': 'determined',
  '-+-': 'panic',
  '--+': 'grim resolve',
  '---': 'dejected'
}

/** Anchor key → the wire tuple that lands exactly on it (SPEC §3 corners are ±1 normalized = ±2 wire). */
function tupleForAnchor(key: string): { valence: number; activation: number; control: number } {
  if (key === 'neutral') return { valence: 0, activation: 0, control: 0 }
  const sign = (ch: string): number => (ch === '+' ? 2 : -2)
  return { valence: sign(key[0]), activation: sign(key[1]), control: sign(key[2]) }
}

// 001-D5: the gate harness. Ugly on purpose; survives behind the dev flag
// as the standing debug surface.
export function mountPanel(
  runtime: Live2DRuntime,
  driver: AffectDriver,
  setStageB?: (on: boolean) => Promise<void>
): void {
  const panel = document.createElement('div')
  panel.id = 'dev-panel'
  // Reserve the panel strip so stages (both, in A/B) render beside it, not under.
  document.getElementById('stage-wrap')!.style.right = `${PANEL_WIDTH}px`

  const fps = document.createElement('div')
  fps.textContent = 'fps: --'
  panel.appendChild(fps)
  setInterval(() => {
    fps.textContent = `fps: ${runtime.fps.toFixed(1)}`
  }, 500)

  // Scenario tab built first so its startPlay (A/B-aware, 002-D2) also backs
  // the one-click smoke buttons; DOM order below stays as before.
  const tab = mountScenarioTab(driver, setStageB)

  // Golden replay at 1×, fixed seed (A4 smoke) — kept as one-click smoke
  // buttons alongside the fuller scenario tab below.
  const scenarioRow = document.createElement('div')
  for (const name of GOLDENS) {
    scenarioRow.appendChild(button(`play ${name}`, () => tab.startPlay(name)))
  }
  panel.appendChild(scenarioRow)

  panel.appendChild(tab.el)

  // Motion playback (A7)
  const motionRow = document.createElement('div')
  const select = document.createElement('select')
  for (const [group, count] of Object.entries(runtime.motionGroups())) {
    for (let i = 0; i < count; i++) {
      const opt = document.createElement('option')
      opt.value = `${group}:${i}`
      opt.textContent = `${group}[${i}]`
      select.appendChild(opt)
    }
  }
  motionRow.append(
    select,
    button('play motion', () => {
      const [group, index] = select.value.split(':')
      runtime.playMotion(group, Number(index), 3)
    })
  )
  panel.appendChild(motionRow)

  // Anchor preview (013 I5) — neutral plus the eight corners. Holds the
  // target pose through the same live pose path the feed uses, then fades
  // back out on expiry — the preview is the truth about what a feel report
  // there will look like.
  const posesRow = document.createElement('div')
  for (const key of ANCHOR_KEYS) {
    const tuple = tupleForAnchor(key)
    posesRow.appendChild(button(`pose: ${ANCHOR_LABELS[key]}`, () => driver.previewPose(tuple)))
  }
  // Clean slate without restarting the app — the affect layer's writes are
  // sticky, so tuning sessions otherwise accumulate pinned parameters.
  posesRow.appendChild(
    button('reset', () => {
      stopSweep()
      driver.reset()
    })
  )
  panel.appendChild(posesRow)

  // Expression via raw param map, 500ms fade (A7). Face params if present,
  // first param otherwise — Hiyori ships no .exp3.json to reference.
  panel.appendChild(
    button('apply expression', () => {
      const params = runtime.parameters()
      const chosen: Record<string, number> = {}
      for (const p of params) {
        const id = p.id.toLowerCase()
        if (id.includes('mouth') || id.includes('brow') || id.includes('cheek')) {
          chosen[p.id] = p.max
        }
      }
      if (Object.keys(chosen).length === 0 && params[0]) chosen[params[0].id] = params[0].max
      runtime.applyExpression(chosen, 1, 500)
    })
  )

  // Sweep-all (A3 — the gate): each param min→max→default, sequential.
  const progress = document.createElement('div')
  panel.appendChild(button('sweep all', () => sweepAll(runtime, progress)))
  panel.appendChild(progress)

  // Per-param sliders (A2/A3)
  for (const p of runtime.parameters()) {
    const label = document.createElement('label')
    const span = document.createElement('span')
    span.textContent = p.id
    span.title = p.id
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(p.min)
    input.max = String(p.max)
    input.step = '0.01'
    input.value = String(p.default)
    input.addEventListener('input', () => runtime.setParams({ [p.id]: Number(input.value) }))
    label.append(span, input)
    panel.appendChild(label)
  }

  document.body.appendChild(panel)
}

// Scenario tab (slice 002 step 6, decision 5 — a section, not a new
// window): picker, transport, and the trace overlay canvas. Click on the
// canvas scrubs (decision 4); values it draws come straight off
// driver.buffer(), the same objects that land in the trace file.
const REPLAY_SEED = 42
const OVERLAY_WIDTH = 460
const OVERLAY_HEIGHT = 140

function mountScenarioTab(
  driver: AffectDriver,
  setStageB?: (on: boolean) => Promise<void>
): { el: HTMLElement; startPlay: (name: string) => void } {
  const section = document.createElement('fieldset')
  const legend = document.createElement('legend')
  legend.textContent = 'scenario'
  section.appendChild(legend)

  const picker = document.createElement('select')
  for (const name of GOLDENS) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    picker.appendChild(opt)
  }
  section.appendChild(picker)

  // A/B row (002-D2): toggle loads the second Hiyori, widens the window and
  // reveals slot B; per-stage preset pickers choose each stage's mapping.
  // Transport stays global — both stages get the same ticks.
  let abOn = false
  const presetA = presetPicker('default')
  const presetB = presetPicker('expressive')
  const abRow = document.createElement('div')
  const abToggle = checkbox('A/B', false, (on) => {
    void (setStageB?.(on) ?? Promise.resolve())
      .then(() => {
        abOn = on
        presetB.disabled = !on
        return window.lares.setAbMode(on)
      })
      .catch((err: unknown) => {
        console.error(`[lares] A/B stage B failed to load: ${String(err)}`)
        abToggle.querySelector('input')!.checked = false
        abOn = false
      })
  })
  presetB.disabled = true
  abRow.append(abToggle, labelled('A:', presetA), labelled('B:', presetB))
  section.appendChild(abRow)

  const startPlay = (name: string): void =>
    driver.play(name, REPLAY_SEED, 1, {
      A: presetA.value,
      ...(abOn ? { B: presetB.value } : {})
    })

  const transportRow = document.createElement('div')
  transportRow.append(
    button('play', () => startPlay(picker.value)),
    button('pause', () => driver.pause()),
    button('resume', () => driver.resume()),
    button('1x', () => driver.setSpeed(1)),
    button('8x', () => driver.setSpeed(8)),
    button('64x', () => driver.setSpeed(64))
  )
  section.appendChild(transportRow)

  const toggles: OverlayToggles = {
    valence: true,
    activation: true,
    control: true,
    synthParams: new Set()
  }
  const togglesRow = document.createElement('div')
  togglesRow.append(
    ...FEEL_AXES.map((axis) => checkbox(axis, toggles[axis], (v) => (toggles[axis] = v)))
  )
  for (const p of (presetJson as SynthPreset).params) {
    togglesRow.appendChild(
      checkbox(p.id, false, (v) => {
        if (v) toggles.synthParams.add(p.id)
        else toggles.synthParams.delete(p.id)
      })
    )
  }
  section.appendChild(togglesRow)

  const canvas = document.createElement('canvas')
  canvas.width = OVERLAY_WIDTH
  canvas.height = OVERLAY_HEIGHT
  canvas.style.background = '#111'
  canvas.style.cursor = 'crosshair'
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect()
    const t = xToT(e.clientX - rect.left, canvas.width, driver.buffer().endMs)
    driver.seek(t)
  })
  section.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (ctx) {
    const draw = (): void => {
      drawOverlay(ctx, canvas.width, canvas.height, driver.buffer(), toggles)
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
  }

  // ponytail: overlay draws stage A only — per-stage curves are M2b's judging
  // problem, and the written traces already carry both stages.
  return { el: section, startPlay }
}

function presetPicker(initial: string): HTMLSelectElement {
  const el = document.createElement('select')
  for (const name of Object.keys(PRESETS)) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    el.appendChild(opt)
  }
  el.value = initial
  return el
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const el = document.createElement('label')
  const span = document.createElement('span')
  span.textContent = text
  el.append(span, control)
  return el
}

function checkbox(label: string, initial: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const el = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = initial
  input.addEventListener('change', () => onChange(input.checked))
  const span = document.createElement('span')
  span.textContent = label
  el.append(input, span)
  return el
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = text
  el.addEventListener('click', onClick)
  return el
}

// The sweep owns a rAF loop; the handle is what lets reset (and a second
// sweep click) stop it instead of leaving it driving params forever.
let sweepRaf = 0

function stopSweep(): void {
  if (sweepRaf) cancelAnimationFrame(sweepRaf)
  sweepRaf = 0
}

function sweepAll(runtime: Live2DRuntime, progress: HTMLElement): void {
  stopSweep()
  const params = runtime.parameters()
  const PER_PARAM_MS = 400
  let i = 0
  let phaseStart = performance.now()
  const step = (): void => {
    const p = params[i]
    if (!p) {
      sweepRaf = 0
      progress.textContent = `sweep done (${params.length} params)`
      return
    }
    const t = (performance.now() - phaseStart) / PER_PARAM_MS
    if (t >= 1) {
      runtime.setParams({ [p.id]: p.default })
      i++
      phaseStart = performance.now()
    } else {
      // triangle: min → max across the phase, then default on exit
      const v =
        t < 0.5 ? p.min + (p.max - p.min) * (t * 2) : p.max - (p.max - p.min) * ((t - 0.5) * 2)
      runtime.setParams({ [p.id]: v })
      progress.textContent = `sweep ${i + 1}/${params.length}: ${p.id}`
    }
    sweepRaf = requestAnimationFrame(step)
  }
  sweepRaf = requestAnimationFrame(step)
}
