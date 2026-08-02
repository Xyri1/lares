import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Nerves, type ParamInfo } from '../nerves'
import { importCharacterPackage, listCharacterPackages } from './library'
import { createCharacterSwitcher, type CharacterPackage } from './switch'

function writePackage(root: string, directory: string): string {
  const packageRoot = join(root, directory)
  mkdirSync(join(packageRoot, 'runtime'), { recursive: true })
  writeFileSync(
    join(packageRoot, 'lar.character.json'),
    JSON.stringify({
      format: 'lares/1',
      identity: { name: 'Same Name', license: 'test' },
      renderers: { live2d: { model: 'runtime/model.model3.json' } }
    })
  )
  writeFileSync(
    join(packageRoot, 'runtime', 'model.model3.json'),
    JSON.stringify({
      FileReferences: { Moc: 'model.moc3', Textures: ['model.png'] }
    })
  )
  writeFileSync(join(packageRoot, 'runtime', 'model.moc3'), 'moc')
  writeFileSync(join(packageRoot, 'runtime', 'model.png'), 'png')
  return packageRoot
}

const inventory = (id: string): ParamInfo[] => [
  { id, name: id, min: -1, max: 1, default: 0 }
]

function managedPackages(): { root: string; packages: CharacterPackage[] } {
  const workspace = mkdtempSync(join(tmpdir(), 'lares-switch-'))
  const root = join(workspace, 'managed')
  importCharacterPackage(root, writePackage(join(workspace, 'one'), 'character'))
  importCharacterPackage(root, writePackage(join(workspace, 'two'), 'character'))
  return { root, packages: listCharacterPackages(root) }
}

describe('transactional character switching', () => {
  it('selects both duplicate-labelled packages and commits every character surface together', async () => {
    const { root, packages } = managedPackages()
    expect(packages.map((entry) => entry.label)).toEqual(['Same Name', 'Same Name (2)'])
    const [firstPackage, secondPackage] = packages
    const nerves = new Nerves(firstPackage.character.name)
    const surfaces = {
      manifestPath: firstPackage.manifestPath,
      assetRoot: dirname(firstPackage.manifestPath),
      inventory: [] as string[]
    }
    const paramFor = (candidate: CharacterPackage): string =>
      candidate.manifestPath === secondPackage.manifestPath ? 'ParamSecond' : 'ParamFirst'
    const switcher = createCharacterSwitcher(root, firstPackage, {
      precompute: () => null,
      prepare: async ({ candidate }) => inventory(paramFor(candidate)),
      prepareCommit: (_candidate, params) => params,
      commit: async () => {},
      cancel: () => false,
      rollback: () => false,
      finalize: () => {},
      publish: (candidate, params) => {
        nerves.switchCharacter(candidate.character.name, params)
        Object.assign(surfaces, {
          manifestPath: candidate.manifestPath,
          assetRoot: dirname(candidate.manifestPath),
          inventory: params.map((param) => param.id)
        })
      }
    })

    await expect(switcher.switchTo(secondPackage.manifestPath)).resolves.toMatchObject({ ok: true })
    expect(surfaces).toEqual({
      manifestPath: secondPackage.manifestPath,
      assetRoot: dirname(secondPackage.manifestPath),
      inventory: ['ParamSecond']
    })
    expect(nerves.listParameters().map((param) => param.id)).toEqual(['ParamSecond'])

    await expect(switcher.switchTo(firstPackage.manifestPath)).resolves.toMatchObject({ ok: true })
    expect(switcher.active().manifestPath).toBe(firstPackage.manifestPath)
    expect(nerves.listParameters().map((param) => param.id)).toEqual(['ParamFirst'])
  })

  it('keeps every prior surface when renderer loading fails', async () => {
    const { root, packages } = managedPackages()
    let commits = 0
    const switcher = createCharacterSwitcher(
      root,
      packages[0],
      {
        precompute: () => null,
        prepare: async () => {
          throw new Error('renderer fixture refused model')
        },
        prepareCommit: () => null,
        commit: async () => {},
        cancel: () => true,
        rollback: () => true,
        finalize: () => {},
        publish: () => commits++
      }
    )

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toEqual({
      ok: false,
      error: 'renderer fixture refused model'
    })
    expect(switcher.active()).toEqual(packages[0])
    expect(commits).toBe(0)
  })

  it('cancels prepared bodies without publishing when main-side preparation fails', async () => {
    const { root, packages } = managedPackages()
    const events: string[] = []
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => null,
      prepare: async () => inventory('ParamSecond'),
      prepareCommit: () => {
        throw new Error('expression fixture is invalid')
      },
      commit: async () => {
        events.push('commit')
      },
      cancel: () => {
        events.push('cancel')
        return true
      },
      rollback: () => {
        events.push('rollback')
        return true
      },
      finalize: () => events.push('finalize'),
      publish: () => events.push('publish')
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toEqual({
      ok: false,
      error: 'expression fixture is invalid'
    })
    expect(switcher.active()).toEqual(packages[0])
    expect(events).toEqual(['cancel'])
  })

  it('rejects a stale out-of-order renderer result', async () => {
    const { root } = managedPackages()
    const thirdSource = writePackage(dirname(root), 'third')
    const third = importCharacterPackage(root, thirdSource)
    if (!third.ok) throw new Error(third.error)
    const all = listCharacterPackages(root)
    const pending = new Map<number, (value: ParamInfo[]) => void>()
    const commits: string[] = []
    const switcher = createCharacterSwitcher(
      root,
      all[0],
      {
        precompute: () => null,
        prepare: ({ id }) => new Promise((resolve) => pending.set(id, resolve)),
        prepareCommit: (_candidate, params) => params,
        commit: async () => {},
        cancel: () => true,
        rollback: () => true,
        finalize: () => {},
        publish: (candidate) => commits.push(candidate.manifestPath)
      }
    )

    const older = switcher.switchTo(all[1].manifestPath)
    const newer = switcher.switchTo(all[2].manifestPath)
    pending.get(2)!(inventory('ParamThird'))
    await expect(newer).resolves.toMatchObject({ ok: true })
    pending.get(1)!(inventory('ParamSecond'))
    await expect(older).resolves.toEqual({ ok: false, error: 'character switch was superseded' })
    expect(switcher.active().manifestPath).toBe(all[2].manifestPath)
    expect(commits).toEqual([all[2].manifestPath])
  })

  it('precomputes fallible state before prepare and publishes only after body commit', async () => {
    const { root, packages } = managedPackages()
    const events: string[] = []
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => {
        events.push('precompute')
        return 'files-ready'
      },
      prepare: async () => {
        events.push('prepare-bodies')
        return inventory('Param')
      },
      prepareCommit: (_candidate, params, files) => {
        events.push('prepare-main')
        return { files, params }
      },
      commit: async () => {
        events.push('commit-bodies')
      },
      cancel: () => false,
      rollback: () => false,
      finalize: () => events.push('finalize-body'),
      publish: () => events.push('publish-main')
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toMatchObject({ ok: true })
    expect(events).toEqual([
      'precompute',
      'prepare-bodies',
      'prepare-main',
      'commit-bodies',
      'finalize-body',
      'publish-main'
    ])
  })

  it('keeps main and Nerves state old when finalize handoff fails', async () => {
    const { root, packages } = managedPackages()
    const events: string[] = []
    let mainCharacter = 'first'
    let assetRoot = 'first'
    let previewReverts = 0
    const nerves = new Nerves('first', undefined, {
      revertPreview: () => {
        previewReverts++
      }
    })
    expect(nerves.setInventory(inventory('ParamFirst'))).toBe(true)
    nerves.previewExpression({ params: { ParamFirst: 0.5 } }, 2)
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => null,
      prepare: async () => inventory('ParamSecond'),
      prepareCommit: () => nerves.prepareCharacter('second', inventory('ParamSecond')),
      commit: async () => {
        events.push('commit')
      },
      cancel: () => false,
      rollback: () => {
        events.push('rollback-body')
        return true
      },
      finalize: () => {
        events.push('finalize')
        throw new Error('finalize send failed')
      },
      publish: (_candidate, prepared) => {
        mainCharacter = 'second'
        assetRoot = 'second'
        nerves.commitCharacter(prepared)
        events.push('publish')
      }
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toEqual({
      ok: false,
      error: 'finalize send failed'
    })
    expect(switcher.active()).toEqual(packages[0])
    expect(mainCharacter).toBe('first')
    expect(assetRoot).toBe('first')
    expect(nerves.status().active_character).toBe('first')
    expect(nerves.listParameters().map((param) => param.id)).toEqual(['ParamFirst'])
    expect(previewReverts).toBe(0)
    expect(events).toEqual(['commit', 'finalize', 'rollback-body'])
  })

  it('stops main scenario replay before a successful switch resolves', async () => {
    const { root, packages } = managedPackages()
    let replayActive = true
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => null,
      prepare: async () => inventory('ParamSecond'),
      prepareCommit: () => null,
      commit: async () => {},
      cancel: () => false,
      rollback: () => false,
      finalize: () => {},
      publish: () => {
        replayActive = false
      }
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toMatchObject({ ok: true })
    expect(replayActive).toBe(false)
  })

  it('keeps main scenario replay active when finalization rolls back', async () => {
    const { root, packages } = managedPackages()
    let replayActive = true
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => null,
      prepare: async () => inventory('ParamSecond'),
      prepareCommit: () => null,
      commit: async () => {},
      cancel: () => false,
      rollback: () => true,
      finalize: () => {
        throw new Error('finalize send failed')
      },
      publish: () => {
        replayActive = false
      }
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toEqual({
      ok: false,
      error: 'finalize send failed'
    })
    expect(replayActive).toBe(true)
  })
})
