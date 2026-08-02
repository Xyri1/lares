// Agent-integrations window: renders whatever IntegrationsState main pushes
// and answers with button actions. All strings arrive pre-localized; the page
// holds no logic about harnesses or phases beyond showing them.
import logoUrl from '../../../../resources/icon.png'

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

el<HTMLImageElement>('logo').src = logoUrl

const title = el<HTMLHeadingElement>('title')
const message = el<HTMLParagraphElement>('message')
const detail = el<HTMLParagraphElement>('detail')
const ledger = el<HTMLElement>('ledger')
const commands = el<HTMLOListElement>('commands')
const results = el<HTMLElement>('results')
const next = el<HTMLElement>('next')
const nextTitle = el<HTMLHeadingElement>('next-title')
const nextLines = el<HTMLDivElement>('next-lines')
const footer = document.querySelector('footer')!
const primary = el<HTMLButtonElement>('primary')
const secondary = el<HTMLButtonElement>('secondary')

let phase: IntegrationsState['phase'] = 'confirm'

function commandRow(row: IntegrationsCommandRow): HTMLLIElement {
  const li = document.createElement('li')
  li.className = row.status
  const glyph = document.createElement('span')
  glyph.className = 'glyph'
  if (row.status === 'running') {
    glyph.appendChild(document.createElement('span')).className = 'dot'
  } else {
    glyph.textContent = row.status === 'ok' ? '✓' : '✕'
  }
  const cmd = document.createElement('span')
  cmd.className = 'cmd'
  cmd.textContent = row.text
  cmd.title = row.text
  li.append(glyph, cmd)
  return li
}

function render(state: IntegrationsState): void {
  phase = state.phase
  const s = state.strings

  commands.replaceChildren(...state.commands.map(commandRow))
  ledger.hidden = state.phase === 'confirm'
  if (!ledger.hidden) ledger.scrollTop = ledger.scrollHeight

  results.hidden = state.phase !== 'result'
  next.hidden = state.phase !== 'result' || !state.results?.next.length
  footer.hidden = state.phase === 'running'

  if (state.phase === 'confirm') {
    title.textContent = s.confirmTitle
    message.textContent = s.message
    detail.textContent = s.detail
    message.hidden = detail.hidden = false
    secondary.hidden = false
    secondary.textContent = s.cancel
    primary.textContent = s.configure
    primary.focus()
    return
  }

  if (state.phase === 'running') {
    title.textContent = s.runningTitle
    message.textContent = s.runningNote
    message.hidden = false
    detail.hidden = true
    return
  }

  title.textContent = s.resultTitle
  message.hidden = detail.hidden = true
  results.replaceChildren(
    ...(state.results?.rows ?? []).map((row) => {
      const p = document.createElement('p')
      p.className = row.status
      const glyph = document.createElement('span')
      glyph.className = 'glyph'
      glyph.textContent = row.status === 'ok' ? '✓' : row.status === 'fail' ? '✕' : '—'
      p.append(glyph, row.text)
      return p
    })
  )
  nextTitle.textContent = s.nextTitle
  nextLines.replaceChildren(
    ...(state.results?.next ?? []).map((line) => {
      const p = document.createElement('p')
      p.textContent = line
      return p
    })
  )
  secondary.hidden = !state.results?.hasManual
  secondary.textContent = state.copied ? `${s.copy} ✓` : s.copy
  primary.textContent = s.done
  primary.focus()
}

primary.addEventListener('click', () => {
  window.lares.integrationsAction(phase === 'confirm' ? 'configure' : 'done')
})
secondary.addEventListener('click', () => {
  window.lares.integrationsAction(phase === 'confirm' ? 'cancel' : 'copy')
})
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (phase === 'confirm') window.lares.integrationsAction('cancel')
  if (phase === 'result') window.lares.integrationsAction('done')
})

window.lares.onIntegrationsState(render)
