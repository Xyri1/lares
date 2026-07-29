import { constants } from 'node:fs'
import { copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

/** Atomically writes JSON to path: never leaves a partial or corrupt file on crash. */
export async function atomicWrite(path: string, value: Record<string, unknown>): Promise<void> {
  const temporary = `${path}.lares-tmp-${process.pid}-${randomUUID()}`
  try {
    let copied = false
    try {
      await copyFile(path, temporary, constants.COPYFILE_EXCL)
      copied = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: copied ? 'w' : 'wx'
    })
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}
