import { ANCHOR_KEYS } from '../feel/feel'
import type { Live2DRuntime } from '../runtime/live2d'
import type { AffectDriver, PipelineSnapshot } from './affect'
import { drawOverlay, FEEL_AXES, xToT, type OverlayToggles } from './overlayCanvas'

const PANEL_WIDTH = 380
const REPLAY_SEED = 42
const TRACE_LIMIT = 120
const GOLDENS = [
  'smooth-build',
  'brutal-debugging-session',
  'long-wait-for-input',
  'recovery-arc'
]

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

function tupleForAnchor(key: string): { valence: number; activation: number; control: number } {
  if (key === 'neutral') return { valence: 0, activation: 0, control: 0 }
  const sign = (ch: string): number => (ch === '+' ? 2 : -2)
  return { valence: sign(key[0]), activation: sign(key[1]), control: sign(key[2]) }
}

/** Dev-only control and evidence surface. Production overlay behavior is untouched. */
export function mountPanel(runtime: Live2DRuntime, driver: AffectDriver): void {
  const panel = document.createElement('div')
  panel.id = 'dev-panel'
  document.getElementById('stage-wrap')!.style.right = `${PANEL_WIDTH}px`

  const status = document.createElement('div')
  status.textContent = 'renderer fps: --'
  panel.appendChild(status)
  setInterval(() => {
    status.textContent = `renderer fps: ${runtime.fps.toFixed(1)}`
  }, 500)

  const pipeline = document.createElement('pre')
  pipeline.textContent = 'waiting for affect feed…'
  const liveLog = document.createElement('pre')
  liveLog.className = 'dev-log'
  liveLog.textContent = 'waiting for live ingress…'
  const trace: { key: string; line: string; count: number }[] = []
  const appendTrace = (event: LiveTraceEvent): void => {
    const time = new Date(event.at).toLocaleTimeString(undefined, { hour12: false })
    const feel = event.feel === undefined ? '' : ` feel=${formatFeel(event.feel)}`
    const operational = event.operational ? ` op=${event.operational}` : ''
    const session = event.session ? ` ${event.session}` : ''
    const detail = event.detail ? ` ${event.detail}` : ''
    const key = `${event.source}.${event.action}${session}${feel}${operational}${detail}`
    const last = trace.at(-1)
    if (last?.key === key) {
      last.count++
      last.line = `${time} ${key} ×${last.count}`
    } else {
      trace.push({ key, line: `${time} ${key}`, count: 1 })
    }
    if (trace.length > TRACE_LIMIT) trace.splice(0, trace.length - TRACE_LIMIT)
    liveLog.textContent = trace.map((entry) => entry.line).join('\n')
    liveLog.scrollTop = liveLog.scrollHeight
  }
  window.lares.onLiveTrace(appendTrace)

  driver.onPipeline((snapshot) => {
    pipeline.textContent = formatPipeline(snapshot)
  })
  driver.onFeed((feed, source) => {
    appendTrace({
      at: Date.now(),
      source: 'renderer',
      action: 'received',
      feel: feed.feel,
      operational: feed.operational,
      detail: source
    })
  })

  const manual = mountManualControls(driver)
  panel.append(
    section('semantic pipeline', pipeline),
    manual.el,
    mountLiveTrace(liveLog),
    mountScenario(driver, manual.disable),
    mountRigDiagnostics(runtime, driver)
  )
  document.body.appendChild(panel)
}

function mountManualControls(driver: AffectDriver): { el: HTMLElement; disable(): void } {
  const box = document.createElement('div')
  const valence = range('valence', -2, 2, 1, 0)
  const activation = range('activation', -2, 2, 1, 0)
  const control = range('control', -2, 2, 1, 0)
  const expressiveness = range('expressiveness k', 0, 10, 0.1, 1)
  const operational = document.createElement('select')
  const preview = document.createElement('input')
  preview.type = 'checkbox'
  for (const state of ['idle', 'thinking', 'working', 'awaiting_input', 'error', 'done']) {
    operational.appendChild(option(state))
  }

  const apply = (): void => {
    driver.previewPose(
      {
        valence: Number(valence.input.value),
        activation: Number(activation.input.value),
        control: Number(control.input.value)
      },
      { operational: operational.value, expressiveness: Number(expressiveness.input.value) }
    )
  }
  const applyIfEnabled = (): void => {
    if (preview.checked) apply()
  }
  for (const slider of [valence, activation, control, expressiveness]) {
    slider.input.addEventListener('input', applyIfEnabled)
  }
  operational.addEventListener('change', applyIfEnabled)
  preview.addEventListener('change', () => {
    if (preview.checked) {
      void driver
        .stop()
        .then(() => {
          if (preview.checked) apply()
        })
        .catch((error) => {
          preview.checked = false
          console.error('[lares] could not enable manual preview', error)
        })
    } else {
      driver.previewPose(null)
    }
  })

  const anchors = document.createElement('div')
  for (const key of ANCHOR_KEYS) {
    anchors.appendChild(
      button(ANCHOR_LABELS[key], () => {
        const tuple = tupleForAnchor(key)
        valence.set(tuple.valence)
        activation.set(tuple.activation)
        control.set(tuple.control)
        applyIfEnabled()
      })
    )
  }

  box.append(
    note('renderer bypass — does not call MCP, persist, attribute, or consume spacing'),
    labelled('preview', preview),
    valence.el,
    activation.el,
    control.el,
    labelled('operational', operational),
    expressiveness.el,
    anchors
  )
  return {
    el: section('manual pipeline input', box),
    disable: () => {
      preview.checked = false
      driver.previewPose(null)
    }
  }
}

function mountLiveTrace(log: HTMLElement): HTMLElement {
  const box = document.createElement('div')
  box.append(
    note('real MCP sessions, accepted hooks/reports, feed emission, renderer receipt'),
    note('schema-invalid MCP calls are rejected by the SDK before Lares can trace them'),
    log
  )
  return section('live connection trace', box)
}

function mountScenario(driver: AffectDriver, disablePreview: () => void): HTMLElement {
  const box = document.createElement('div')
  const picker = document.createElement('select')
  for (const name of GOLDENS) picker.appendChild(option(name))
  box.append(
    note('deterministic bypass — skips MCP, hooks, attribution, persistence, and spacing'),
    picker,
    button('play', () => {
      disablePreview()
      driver.play(picker.value, REPLAY_SEED, 1)
    }),
    button('pause', () => driver.pause()),
    button('resume', () => driver.resume()),
    button('1x', () => driver.setSpeed(1)),
    button('8x', () => driver.setSpeed(8)),
    button('64x', () => driver.setSpeed(64))
  )

  const toggles: OverlayToggles = {
    valence: true,
    activation: true,
    control: true,
    synthParams: new Set()
  }
  const togglesRow = document.createElement('div')
  togglesRow.append(
    ...FEEL_AXES.map((axis) => checkbox(axis, toggles[axis], (value) => (toggles[axis] = value)))
  )
  box.appendChild(togglesRow)

  const canvas = document.createElement('canvas')
  canvas.width = 330
  canvas.height = 140
  canvas.style.background = '#111'
  canvas.style.cursor = 'crosshair'
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect()
    driver.seek(xToT(event.clientX - rect.left, canvas.width, driver.buffer().endMs))
  })
  box.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (ctx) {
    const draw = (): void => {
      drawOverlay(ctx, canvas.width, canvas.height, driver.buffer(), toggles)
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
  }
  return section('scenario replay', box)
}

function mountRigDiagnostics(runtime: Live2DRuntime, driver: AffectDriver): HTMLElement {
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = 'raw rig diagnostics'
  details.appendChild(summary)

  const motion = document.createElement('select')
  for (const [group, count] of Object.entries(runtime.motionGroups())) {
    for (let i = 0; i < count; i++) motion.appendChild(option(`${group}:${i}`, `${group}[${i}]`))
  }
  details.append(
    motion,
    button('play motion', () => {
      const [group, index] = motion.value.split(':')
      runtime.playMotion(group, Number(index), 3)
    })
  )

  const progress = document.createElement('div')
  details.append(
    button('sweep all', () => sweepAll(runtime, progress)),
    button('reset rig', () => {
      stopSweep()
      driver.reset()
    }),
    progress
  )

  for (const param of runtime.parameters()) {
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(param.min)
    input.max = String(param.max)
    input.step = '0.01'
    input.value = String(param.default)
    input.addEventListener('input', () => runtime.setParams({ [param.id]: Number(input.value) }))
    details.appendChild(labelled(param.id, input))
  }
  return details
}

function formatFeel(feel: LiveTraceEvent['feel']): string {
  return feel ? `${feel.valence},${feel.activation},${feel.control}` : 'neutral'
}

function formatPipeline(snapshot: PipelineSnapshot): string {
  const normalized = snapshot.normalized
    ? `${snapshot.normalized.valence.toFixed(2)}, ${snapshot.normalized.activation.toFixed(2)}, ${snapshot.normalized.control.toFixed(2)}`
    : 'neutral anchor'
  const channels = Object.entries(snapshot.pose)
    .map(([name, value]) => `${name}=${value.toFixed(3)}`)
    .join('  ')
  const bindings = snapshot.bindings
    .map(({ id, value, raw, clipped, missing }) =>
      `${id}=${value.toFixed(3)}${clipped ? ` (raw ${raw.toFixed(3)}, clipped)` : ''}${missing ? ' (missing)' : ''}`
    )
    .join('\n')
  return [
    `source: ${snapshot.source}`,
    `feel wire: ${formatFeel(snapshot.feel)}`,
    `normalized: ${normalized}`,
    `operational: ${snapshot.operational}`,
    `expressiveness k: ${snapshot.expressiveness.toFixed(1)}`,
    `channels: ${channels}`,
    'wired parameters:',
    bindings || '(none)'
  ].join('\n')
}

function range(
  name: string,
  min: number,
  max: number,
  step: number,
  initial: number
): { el: HTMLElement; input: HTMLInputElement; set(value: number): void } {
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(initial)
  const value = document.createElement('output')
  const set = (next: number): void => {
    input.value = String(next)
    value.textContent = input.value
  }
  input.addEventListener('input', () => set(Number(input.value)))
  set(initial)
  const el = labelled(name, input)
  el.appendChild(value)
  return { el, input, set }
}

function section(title: string, child: HTMLElement): HTMLFieldSetElement {
  const el = document.createElement('fieldset')
  const legend = document.createElement('legend')
  legend.textContent = title
  el.append(legend, child)
  return el
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const el = document.createElement('label')
  const span = document.createElement('span')
  span.textContent = text
  span.title = text
  el.append(span, control)
  return el
}

function note(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'dev-note'
  el.textContent = text
  return el
}

function option(value: string, text = value): HTMLOptionElement {
  const el = document.createElement('option')
  el.value = value
  el.textContent = text
  return el
}

function checkbox(label: string, initial: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = initial
  input.addEventListener('change', () => onChange(input.checked))
  return labelled(label, input)
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = text
  el.addEventListener('click', onClick)
  return el
}

let sweepRaf = 0

function stopSweep(): void {
  if (sweepRaf) cancelAnimationFrame(sweepRaf)
  sweepRaf = 0
}

function sweepAll(runtime: Live2DRuntime, progress: HTMLElement): void {
  stopSweep()
  const params = runtime.parameters()
  const perParamMs = 400
  let i = 0
  let phaseStart = performance.now()
  const step = (): void => {
    const param = params[i]
    if (!param) {
      sweepRaf = 0
      progress.textContent = `sweep done (${params.length} params)`
      return
    }
    const t = (performance.now() - phaseStart) / perParamMs
    if (t >= 1) {
      runtime.setParams({ [param.id]: param.default })
      i++
      phaseStart = performance.now()
    } else {
      const value =
        t < 0.5
          ? param.min + (param.max - param.min) * t * 2
          : param.max - (param.max - param.min) * (t - 0.5) * 2
      runtime.setParams({ [param.id]: value })
      progress.textContent = `sweep ${i + 1}/${params.length}: ${param.id}`
    }
    sweepRaf = requestAnimationFrame(step)
  }
  sweepRaf = requestAnimationFrame(step)
}
