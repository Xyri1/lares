# Development guide

[English](../en/development.md) · [简体中文](../zh-CN/development.md)

This guide tells you how to build Lares, how its parts fit together, and how
to make a change that passes review.

For everyday use, read the [user guide](usage.md). For the character package
format, read the [character package guide](character-format.md). For
installers, read the [distribution guide](distribution.md).

---

## 1. Set up your machine

You need Node.js and pnpm. The release workflow pins Node 24.18.0. Use Node 24
to match it.

```sh
pnpm install
pnpm fetch-assets
pnpm dev
```

`pnpm fetch-assets` downloads two things into gitignored paths:

| Item | Path | Reason |
| --- | --- | --- |
| Live2D Cubism Core | `vendor/live2d/` | The license forbids redistribution |
| The Haru sample model | `characters/haru/runtime/` | Same reason |

Run `pnpm fetch-assets` one time after you clone the repository. Lares cannot
start without these files.

`pnpm dev` starts the Electron app. The renderer runs on `127.0.0.1:5300`.
Vite pins that address, because the default port 5173 falls inside an excluded
port range on some Windows machines.

### Repository map

| Path | What it holds |
| --- | --- |
| `sdd/` | The specification artifacts. `SPEC.md` is the source of truth |
| `src/main/` | The brain: server, sessions, affect, characters, config, tray |
| `src/renderer/` | The body: stage, synth, and the Live2D runtime |
| `src/preload/` | The IPC bridge and its types |
| `scripts/` | The hook forwarder, asset fetch, import, and packaging tools |
| `plugins/` | The Claude Code and Codex marketplace plugins |
| `characters/` | Committed manifests. The `runtime/` asset folders are gitignored |
| `scenarios/` | The four golden scenario files |
| `presets/` | Synthesis presets for the dev panel |
| `vendor/` | Gitignored. Cubism Core lands here |

Create `AGENTS.local.md` for machine-specific notes. The file is gitignored.
Copy `AGENTS.local.example.md` to start.

---

## 2. Architecture

Lares is one Electron application with two halves. The split is strict.

```
harness hooks ─┐
               ├─► brain (main process) ─── performance feed ──► body (renderer)
MCP feel ──────┘                                                      │
                                                                      ▼
                                                            Live2D parameters
```

### The brain

The main process owns the state. It has no renderer knowledge.

| Module | Responsibility |
| --- | --- |
| `server/` | The HTTP routes and the MCP server |
| `sessions/` | The session table, the event map, and the baseline resolver |
| `feel/` | The latch register, attribution, durable storage, and the feed gate |
| `characters/` | The manifest, the library, import, switch, and authoring |
| `scenario/` | The scenario player |
| `config.ts`, `strings.ts`, `shell.ts` | Settings, localized strings, and the tray |

### The body

The renderer process owns the picture. It receives a renderer-neutral feed.

| Module | Responsibility |
| --- | --- |
| `stage/` | The window, the feed subscription, and the dev panel |
| `feel/` | The nine-anchor blend and the operational overlay, in channel space |
| `synth/` | Per-frame parameter synthesis: breath, blink, and sway |
| `runtime/` | The `pixi-live2d-display` adapter behind the `IRuntime` interface |

### The seam

The performance feed is the one contract between the halves. It carries:

```
{ stageId, tick, feel, operational }
```

`feel` is the latched tuple — `{ valence, activation, control }` as wire
integers, or `null` for an empty register. `operational` is the resolved
session state. The body turns the tuple into a channel-space pose and
composites the operational overlay over it. **Asset paths never cross.**

Two rules bind every change here:

1. No brain module imports anything from the body.
2. No file outside `src/renderer/src/runtime/` imports `pixi-live2d-display`
   or `pixi.js`.

The second rule is why a future 3D body needs a new `runtime/` module only.

---

## 3. The dev control window

`pnpm dev` opens a second, framed window beside the overlay. A packaged build
shows the overlay alone.

The window looks for `ELECTRON_RENDERER_URL`, which only the dev server sets.
A check of `is.dev` alone is not enough, because `electron-vite preview` keeps
`is.dev` true.

The panel gives you:

| Control | What it does |
| --- | --- |
| Golden buttons | Play one of the four scenarios |
| Scenario tab | Select, play, pause, resume, and set the speed to 1×, 8×, or 64× |
| A/B toggle | Render two stages beside each other with different presets |
| Pose buttons | Preview the anchor tuples on the live character |
| Motion picker | Play one motion of the loaded model |
| Parameter sliders | Drive a parameter by hand |
| Sweep | Move each parameter through its full range |
| FPS counter | Report the render rate |

The panel is intentionally plain. It is a test harness, not a product surface.

---

## 4. Follow one event end to end

Use this path when you debug.

1. **The harness fires a hook.** The plugin hook command calls the launcher
   shim at `~/.lares/bin/`. The application re-stamps this shim at each
   launch, so a plugin never holds a machine-specific path.
2. **The forwarder posts the event.** `scripts/forwarder.js` reads
   `~/.lares/runtime.json` for the port. It wraps the harness payload in an
   envelope and posts it to `/v1/events`. If Lares is absent, the forwarder
   exits 0 in silence. It never blocks the agent turn.
3. **The server validates the request.** `server/server.ts` rejects any
   request with an `Origin` header. It requires
   `Content-Type: application/json` on each POST.
4. **The adapter maps the event.** `sessions/mapEvent.ts` turns a
   harness-native payload into one baseline state. Add a harness case here.
5. **The table updates.** `sessions/ingest.ts` holds the session rows. It is a
   pure state table: the caller supplies the clock.
6. **The resolver picks a baseline.** `sessions/resolveBaseline.ts` returns the
   highest-priority state of all live sessions.
7. **The engine ticks.** `affect/engine.ts` runs at 10 Hz. It applies the decay,
   the mood average, the nudges, and the saturation scale.
8. **The feed goes out.** The brain sends `affect:update` over IPC.
9. **The body renders.** `synth/` computes the per-frame values. `runtime/`
   writes them to the model.

The budget for the whole path is 250 milliseconds, from the hook to a visible
reaction. This budget is hard, because legibility depends on it.

---

## 5. Test your change

```sh
pnpm test        # Vitest
pnpm typecheck   # Both TypeScript projects
pnpm build       # Typecheck, then a production build
```

`pnpm test` covers main-side pure logic and the renderer modules that hold no
Live2D dependency. Tests live beside their subject as `*.test.ts`.

The feel register and the session table take their time from the caller. Write
a test that supplies the timestamps. Do not use a wall clock, and do not sleep.

For a live check against a running app:

```sh
pnpm smoke:nerves
```

The script reads `~/.lares/runtime.json`, posts a synthetic session, and calls
the MCP tools. Start `pnpm dev` first.

For a visual check, play a golden scenario from the dev panel. The scenario
player injects through the same ingress path as real traffic.

---

## 6. Make a common change

### Add a harness

1. Add the harness name to the union in `src/main/sessions/mapEvent.ts`.
2. Map its events to the baseline states in the same file. Do not add a new
   state. A new state needs a change to `sdd/SPEC.md` first.
3. Add a plugin directory under `plugins/`. Keep it thin: hook commands, the
   MCP URL, and the skill file. The plugin holds no logic, so an old
   application still works with a new plugin.
4. Add the discovery and the install commands to `src/main/integrations.ts`.
   Use fixed arguments. Never interpolate external input into a command.
5. Add a removal pass for the legacy configuration, if an older build wrote
   one.

### Tune the feel behavior

| Constant | Where | Default | Effect |
| --- | --- | --- | --- |
| `expressiveness` | app config file | 1 | Scales the blend away from neutral |
| `TRANSITION_MS` | `renderer/feel/feel.ts` | 700 | The one ease every target change travels |
| `OVERLAY_WEIGHT` | `renderer/feel/feel.ts` | 0.6 | How much of the pose an operational overlay owns |
| `FEEL_SPACING_MS` | `main/feel/register.ts` | 2 000 | The minimum spacing between two reports |
| `LATCH_CAPACITY` | `main/feel/register.ts` | 64 | How many session latches are kept |

The anchor poses themselves live in `renderer/feel/anchors.default.json` and
`operational.default.json`. These numbers are tunable defaults. A change to a number is not a contract
change. A change to a schema, an interface, a state machine, or a scenario is.

### Add a user-visible string

Add the key to `en` in `src/main/strings.ts`, then add the same key to `zhCN`.

The `zhCN` table has a `typeof en` annotation. A missing key, an extra key, or
a wrong type fails `pnpm typecheck`. The type checker enforces the translation
parity, so Lares needs no i18n framework.

Read strings through the live `L` binding, never through a captured value.

### Change the character schema

The schema lives in `sdd/SPEC.md` §5 and in `src/main/characters/manifest.ts`.

Validation is one pure function with three callers: the import script, its
`--check` flag, and the application at load. Keep it that way.

Identity and emotional semantics stay outside the renderer block. Ask this
question: could a future VRM block implement this character without a change
to the shared part? If the answer is no, the change is wrong.

---

## 7. Rules that bind every change

The full statements live in `sdd/PRINCIPLES.md`. A change that breaks one is
wrong, even when it works.

| Rule | Short form |
| --- | --- |
| P1 | Every behavior tells the user something they can act on |
| P2 | The agent reports its own feeling. Lares never infers one |
| P3 | Nothing leaves the machine, except the disclosed update check |
| P4 | No inference in the render path. The dynamics are deterministic |
| P5 | Character identity stays above any renderer |
| P6 | The brain holds no renderer knowledge |
| P7 | All ingress is validated, clamped, and rate-bounded on the server |
| P8 | The same event under a different history reads differently |
| P9 | The non-goals hold until a written decision revises them |
| P10 | A session that needs input is never visually masked |
| P11 | Lares senses what harnesses send. It reads no harness file |

P11 is the most common trap. A change that tails a log, polls a process, or
watches a harness file fails review, even when it fixes a real gap.

### Where to look before you write code

| Your task | Read this |
| --- | --- |
| Touch a contract, a schema, or an invariant | `sdd/SPEC.md` |
| Work on a milestone | `sdd/slices/NNN-name/` |
| Check a change against the rules | `sdd/PRINCIPLES.md` |
| Question a design choice | `sdd/DECISIONS.md`, and cite the D number |
| Ask what is in scope | `sdd/ROADMAP.md` |
| Ask why Lares exists | `sdd/PRD.md` |

### Commit messages

Use conventional commits: `type(scope): imperative summary`. The types are
`feat`, `fix`, `chore`, `docs`, `refactor`, and `test`.

---

## 8. Build and release

| Command | What it does |
| --- | --- |
| `pnpm build` | Typecheck, then build the production output |
| `pnpm package:preflight` | Validate the local distribution inputs |
| `pnpm package:mac` | Build the unsigned universal macOS DMG |
| `pnpm package:win` | Build the unsigned Windows x64 NSIS installer |
| `pnpm package:inspect` | Inspect a built artifact |
| `pnpm import` | Import a character package from the command line |
| `pnpm adapter:remove` | Remove the Lares adapter entries from this machine |

`build/default-character` names the one character that the installer bundles.
Change that line only to a package that is cleared for redistribution and that
holds its own `NOTICE`. Preflight refuses a missing notice.

A release starts from one signal: a semantic version increase in
`package.json`, pushed to `master`. Nothing else packages. GitHub Actions then
creates the tag, publishes both installers with their SHA-256 files, and marks
a version that holds a `-` as a prerelease.

The [distribution guide](distribution.md) holds the full procedure and the
clean-machine checklists.

---

## 9. Environment variables

| Variable | Effect |
| --- | --- |
| `LARES_PORT` | Override the ingress port. The default is 21473 |
| `LARES_DEFAULT_CHARACTER` | Select the default character. The default is `haru` |
| `LARES_DENSITY_LOG` | Write an affect density log to this path |
| `LARES_RUNTIME_FILE` | Point the forwarder at a different discovery file |
| `LARES_FORWARDER_TIMING` | Make the forwarder report its own timing |
| `LARES_HARNESS_PID` | The harness pid that the shim captures |

Use `LARES_PORT` and `LARES_RUNTIME_FILE` together when you run a second
instance beside your normal one. The harness plugins hold `127.0.0.1:21473`,
so only the instance on the default port answers their MCP calls.
