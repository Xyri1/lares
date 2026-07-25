import type { Live2DRuntime } from '../runtime/live2d'

// 001-D5: the gate harness. Ugly on purpose; survives behind the dev flag
// as the standing debug surface.
export function mountPanel(runtime: Live2DRuntime): void {
  const panel = document.createElement('div')
  panel.id = 'dev-panel'

  const fps = document.createElement('div')
  fps.textContent = 'fps: --'
  panel.appendChild(fps)
  setInterval(() => {
    fps.textContent = `fps: ${runtime.fps.toFixed(1)}`
  }, 500)

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

function button(text: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = text
  el.addEventListener('click', onClick)
  return el
}

function sweepAll(runtime: Live2DRuntime, progress: HTMLElement): void {
  const params = runtime.parameters()
  const PER_PARAM_MS = 400
  let i = 0
  let phaseStart = performance.now()
  const step = (): void => {
    const p = params[i]
    if (!p) {
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
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
