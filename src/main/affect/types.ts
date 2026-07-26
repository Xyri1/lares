// Shared seam between affect/ (engine) and sessions/ (ingress mapping).
// Root SPEC §3 states — changing this list is a SPEC delta, not a refactor.
export type BaselineState =
  | 'awaiting_input'
  | 'error'
  | 'working'
  | 'thinking'
  | 'done'
  | 'idle'
