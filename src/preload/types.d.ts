type CharacterPayload =
  | { ok: true; name: string; live2d: { model: string } & Record<string, unknown> }
  | { ok: false; error: string }

interface LaresBridge {
  getCharacter(): Promise<CharacterPayload>
  reportInventory(params: unknown[]): void
}

interface Window {
  lares: LaresBridge
}
