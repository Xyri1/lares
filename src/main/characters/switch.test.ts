import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Nerves, type ParamInfo } from '../nerves'
import { importCharacterPackage, listCharacterPackages } from './library'
import { createCharacterSwitcher, type CharacterPackage } from './switch'

function writePackage(root: string, directory: string, cue: string): string {
  const packageRoot = join(root, directory)
  mkdirSync(join(packageRoot, 'runtime'), { recursive: true })
  writeFileSync(
    join(packageRoot, 'lar.character.json'),
    JSON.stringify({
      format: 'lares/1',
      identity: { name: 'Same Name', license: 'test' },
      expressions: { [cue]: { valence: 0.2, arousal: 0.3 } },
      renderers: {
        live2d: {
          model: 'runtime/model.model3.json',
          cues: { [cue]: { params: { [`Param${cue}`]: 1 } } }
        }
      }
    })
  )
  writeFileSync(join(packageRoot, 'runtime', 'model.model3.json'), '{}')
  return packageRoot
}

const inventory = (id: string): ParamInfo[] => [
  { id, name: id, min: -1, max: 1, default: 0 }
]

function managedPackages(): { root: string; packages: CharacterPackage[] } {
  const workspace = mkdtempSync(join(tmpdir(), 'lares-switch-'))
  const root = join(workspace, 'managed')
  importCharacterPackage(root, writePackage(join(workspace, 'one'), 'character', 'First'))
  importCharacterPackage(root, writePackage(join(workspace, 'two'), 'character', 'Second'))
  return { root, packages: listCharacterPackages(root) }
}

describe('transactional character switching', () => {
  it('selects both duplicate-labelled packages and commits every character surface together', async () => {
    const { root, packages } = managedPackages()
    expect(packages.map((entry) => entry.label)).toEqual(['Same Name', 'Same Name (2)'])
    const firstPackage = packages.find((entry) => 'First' in entry.character.expressions)!
    const secondPackage = packages.find((entry) => 'Second' in entry.character.expressions)!
    const nerves = new Nerves(
      firstPackage.character.name,
      firstPackage.character.expressions,
      0
    )
    const surfaces = {
      manifestPath: firstPackage.manifestPath,
      assetRoot: dirname(firstPackage.manifestPath),
      cues: Object.keys(firstPackage.character.live2d.cues ?? {}),
      inventory: [] as string[]
    }
    const switcher = createCharacterSwitcher(
      root,
      firstPackage,
      {
        precompute: (candidate) => candidate.character.live2d.cues ?? {},
        prepare: async ({ candidate }) =>
          inventory(`Param${Object.keys(candidate.character.expressions)[0]}`),
        prepareCommit: (_candidate, params, cues) => ({ params, cues }),
        commit: async () => {},
        cancel: () => false,
        rollback: () => false,
        rollbackPublish: () => {},
        finalize: () => {},
        publish: (candidate, { params, cues }) => {
          nerves.switchCharacter(
            candidate.character.name,
            candidate.character.expressions,
            Object.fromEntries(Object.keys(cues).map((cue) => [cue, 'raw' as const])),
            params
          )
          Object.assign(surfaces, {
            manifestPath: candidate.manifestPath,
            assetRoot: dirname(candidate.manifestPath),
            cues: Object.keys(cues),
            inventory: params.map((param) => param.id)
          })
        }
      }
    )

    await expect(switcher.switchTo(secondPackage.manifestPath)).resolves.toMatchObject({ ok: true })
    expect(surfaces).toEqual({
      manifestPath: secondPackage.manifestPath,
      assetRoot: dirname(secondPackage.manifestPath),
      cues: ['Second'],
      inventory: ['ParamSecond']
    })
    expect(nerves.listCues().map((cue) => cue.name)).toEqual(['Second'])

    await expect(switcher.switchTo(firstPackage.manifestPath)).resolves.toMatchObject({ ok: true })
    expect(switcher.active().manifestPath).toBe(firstPackage.manifestPath)
    expect(nerves.listCues().map((cue) => cue.name)).toEqual(['First'])
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
        rollbackPublish: () => {},
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
      rollbackPublish: () => {},
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
    const thirdSource = writePackage(dirname(root), 'third', 'Third')
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
        rollbackPublish: () => {},
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
      rollbackPublish: () => {},
      finalize: () => events.push('finalize-body'),
      publish: () => events.push('publish-main')
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toMatchObject({ ok: true })
    expect(events).toEqual([
      'precompute',
      'prepare-bodies',
      'prepare-main',
      'commit-bodies',
      'publish-main',
      'finalize-body'
    ])
  })

  it('rolls the acknowledged body back when main publication throws', async () => {
    const { root, packages } = managedPackages()
    const events: string[] = []
    let mainCharacter = 'first'
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => null,
      prepare: async () => inventory('ParamSecond'),
      prepareCommit: () => null,
      commit: async () => {
        events.push('commit')
      },
      cancel: () => false,
      rollback: () => {
        events.push('rollback')
        return true
      },
      rollbackPublish: () => {
        mainCharacter = 'first'
        events.push('rollback-main')
      },
      finalize: () => events.push('finalize'),
      publish: () => {
        mainCharacter = 'second'
        events.push('publish')
        throw new Error('main publication failed')
      }
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toEqual({
      ok: false,
      error: 'main publication failed'
    })
    expect(switcher.active()).toEqual(packages[0])
    expect(mainCharacter).toBe('first')
    expect(events).toEqual(['commit', 'publish', 'rollback-main', 'rollback'])
  })

  it('rolls published main and tentative body state back when finalize handoff fails', async () => {
    const { root, packages } = managedPackages()
    const events: string[] = []
    let mainCharacter = 'first'
    const switcher = createCharacterSwitcher(root, packages[0], {
      precompute: () => null,
      prepare: async () => inventory('ParamSecond'),
      prepareCommit: () => null,
      commit: async () => {
        events.push('commit')
      },
      cancel: () => false,
      rollback: () => {
        events.push('rollback-body')
        return true
      },
      rollbackPublish: () => {
        mainCharacter = 'first'
        events.push('rollback-main')
      },
      finalize: () => {
        events.push('finalize')
        throw new Error('finalize send failed')
      },
      publish: () => {
        mainCharacter = 'second'
        events.push('publish')
      }
    })

    await expect(switcher.switchTo(packages[1].manifestPath)).resolves.toEqual({
      ok: false,
      error: 'finalize send failed'
    })
    expect(switcher.active()).toEqual(packages[0])
    expect(mainCharacter).toBe('first')
    expect(events).toEqual([
      'commit',
      'publish',
      'finalize',
      'rollback-main',
      'rollback-body'
    ])
  })
})
