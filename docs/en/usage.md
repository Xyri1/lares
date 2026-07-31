# User guide

[English](../en/usage.md) · [简体中文](../zh-CN/usage.md)

This guide tells you how to install Lares, how to connect it to your agent,
and how to read what your Lar shows you.

For the character package format, read the
[character package guide](character-format.md). For builds and installers,
read the [distribution guide](distribution.md). To change the Lares source
code, read the [development guide](development.md).

---

## 1. What Lares does

Lares is a desktop companion. It gives your AI agent a face. The face is a
**Lar**: a Live2D character in a transparent overlay window.

The Lar shows the state of your agent sessions. You can see when the agent
works, when it fails, when it waits for you, and when it is done. You do not
need to open a second window.

Lares gets its information in two ways:

| Source | What it gives | Who sends it |
| --- | --- | --- |
| Lifecycle hooks | The baseline state of each session | The harness |
| MCP `emote` calls | First-person feelings | The agent |

The chain is `agent hooks + MCP → local affect engine → Live2D performance`.

Three limits apply always:

- Lares does not read your transcripts.
- Lares does not guess a sentiment from your text.
- Lares keeps all session data on your machine. The local server accepts
  connections from `127.0.0.1` only.

The one exception is the update check in section 9.

---

## 2. Install Lares

### Step 1 — Download

Download the installer for your system from the
[latest release](https://github.com/Xyri1/lares/releases/latest).

Lares supports macOS 13 or later, and Windows 10 or Windows 11 on x64.

### Step 2 — Get past the warning

The installers are unsigned, so both systems block the first launch. macOS
refuses it with *"Apple could not verify 'Lares' is free of malware…"* and
offers only **Move to Trash**. Do not take that action.

The [README install section](../../README.md#install) holds the exact steps
for each system. It is the one place these steps are maintained.

To verify your download first, compare its SHA-256 checksum against the
checksum file in the release.

### Step 3 — Start Lares

Start Lares. Your Lar appears on the desktop. Lares is tray-only: it shows a
tray icon, but no Dock icon, no taskbar button, and no settings window. The
tray menu holds every control.

Drag the Lar to move it. Clicks pass through the transparent area around the
body.

---

## 3. Connect your agent

Lares supports two harnesses: **Claude Code** and **Codex**.

### Automatic setup

1. Open the tray menu.
2. Choose **Configure Agent Integrations…**.
3. Read the disclosure. It names the public download, the hooks, and the local
   MCP connection.
4. Choose **Configure**.

Lares then calls the plugin manager of each harness that it finds. It installs
the Lares marketplace plugin. Lares never writes the configuration files of a
harness, and never bypasses a trust prompt.

The result dialog reports one line for each harness. If a plugin manager is
absent, choose **Copy Manual Commands** and use the commands below.

### Manual setup

For Claude Code:

```sh
claude plugin marketplace add Xyri1/lares --scope user
claude plugin install lares@lares --scope user
```

For Codex:

```sh
codex plugin marketplace add Xyri1/lares --json
codex plugin add lares@lares --json
```

### Reload your harness

A harness reads its hooks and its MCP configuration at session start. Your
current session does not see the new plugin.

- **Claude Code**: start a new session, or run `/reload-plugins`.
- **Codex**: start a new task in the CLI or in the ChatGPT desktop app. Codex
  asks you to trust the Lares hooks. Trust them. You can also review them with
  `/hooks`.

The Codex CLI, the Codex IDE extension, and the Codex desktop app share one
Codex home. One installation serves all three.

Then work as usual. The Lar follows your session.

---

## 4. Read your Lar

### Baseline states

Each session has one state. Lares maps the harness events to these states:

| Harness event | State |
| --- | --- |
| SessionStart, UserPromptSubmit | thinking |
| PreToolUse, PostToolUse | working |
| Permission request | awaiting_input |
| Stop, with no error | done |
| Tool failure | error |
| SubagentStart, SubagentStop | working, and a subagent count |

### One Lar for all sessions

You get one Lar, and you can run many sessions. The Lar shows the most
actionable state of all live sessions:

```
awaiting_input > error > working > thinking > done > idle
```

A session that waits for you is never masked by a session that works. When
you answer the prompt, the lower state returns within one second.

### Time changes the face

Lares keeps a history. The same event does not always look the same.

- **Decay.** A feeling returns to the rest point. Half of the displacement is
  gone after 45 seconds.
- **Mood.** A slow average of the recent emotion moves the rest point. A long
  and difficult session leaves a mark that one success does not clear.
- **Saturation.** Repeated identical emotes have less effect each time. Five
  frustrated emotes in one minute move the face less than two times one emote.
- **Sleep.** After 10 minutes of idle time, the Lar goes to sleep.

This history is the reason a third failure reads worse than the first.

---

## 5. The tray menu

| Item | What it does |
| --- | --- |
| **Characters** | Select the active Lar. This submenu also holds **Import Character…** and **Open Character Folder** |
| **Scale** | Set the Lar size: 50%, 75%, 100%, 125%, or 150% |
| **Do Not Disturb** | Hide the Lar |
| **Launch at Login** | Start Lares when you sign in |
| **Reset Position** | Move the Lar to the bottom right of the primary display |
| *Calibration status* | A line that reports the mapping state. You cannot select it |
| **Map expressions…** | Start the calibration flow for the active character |
| **Automatically Check for Updates** | Enable or disable the daily check |
| **Check for Updates…** | Check now |
| **Configure Agent Integrations…** | Install the harness plugins |
| **Language** | Select System, English, or 简体中文 |
| **Quit** | Stop Lares |

The tray holds no uninstall action. See section 10.

Notes:

- **Do Not Disturb** hides the body only. The server, the sessions, the affect
  engine, and the mood continue to run. When you disable it, the Lar shows the
  current state immediately.
- **Launch at Login** and **Do Not Disturb** are off by default. Automatic
  update checks are on by default.
- Lares saves every setting. The settings survive a restart.

---

## 6. Change your Lar

### Import a character

1. Extract your Live2D model folder.
2. Choose **Import Character…** from the tray.
3. Select the folder.

Lares copies the folder into its managed library. Lares does not change your
original folder.

Lares accepts a complete Lares package, or a raw model tree that holds exactly
one `.model3.json` file. Lares refuses a tree with zero or with more than one
model file, because a guess would be wrong.

Lares validates the package, and then loads it. If the load fails, your
current Lar continues to run. A character switch keeps your sessions, your
affect state, your position, your scale, and your Do Not Disturb setting.

Two characters can have the same name. The tray adds a number to the second
one: `Name` and `Name (2)`.

Supported runtimes are Cubism SDK 3.0 to 4.2. Lares refuses Cubism 2.1 and
MOC version 5 or later.

### Map the expressions

A new character arrives with cues, but with no emotional meaning. The tray
shows the state:

| Tray line | Meaning |
| --- | --- |
| 🔴 Expressions not mapped | No cue has a coordinate |
| 🟡 *n* expressions left | Some cues have a coordinate |
| Expressions mapped | Every cue has a coordinate |

An unmapped cue still works: your agent can play it by name. But the affect
engine does not select it on its own.

To map the cues, choose **Map expressions…**. Lares copies a prompt to your
clipboard. Paste the prompt into an agent session that has the Lares MCP
connection. The agent then previews each cue on your desktop and asks you what
it needs to know.

Keep the Lar visible during this flow. Mapping is a visual decision, and the
agent needs your eyes.

The [character package guide](character-format.md) holds the manifest schema,
the command-line import flow, and the full prompt.

---

## 7. What your agent can call

The Lares MCP server gives your agent these tools:

| Tool | What it does |
| --- | --- |
| `emote` | Play a cue, or drive parameters directly |
| `list_cues` | List the cues, with their coordinates and their source |
| `status` | Report the active character and a session summary |
| `list_parameters` | List the parameters of the loaded model |
| `preview_expression` | Show an exact expression, for calibration |
| `save_expression` | Write a new authored expression |
| `update_expression` | Change the coordinates or the parameters of a cue |

The server tells the agent when to emote: at session start, at a state change,
at a third failure, at a recovery, and at completion. The agent must not emote
for each tool call.

The server enforces every limit itself. Your agent cannot exceed them:

| Limit | Value |
| --- | --- |
| Intensity | 0 to 1 |
| Duration | 30 seconds maximum, 6 seconds by default |
| Queue depth | 4 expressions |
| Freeform parameters | 24 per call |
| Emote rate | One each 2 seconds, per source |
| Authored expressions | 50 per package |

A value out of range is clamped. An unknown parameter is dropped. An emote
that arrives too soon is merged: the feeling still applies, but no new
expression starts.

---

## 8. Troubleshooting

**The Lar does not react to my agent.**
Start a new agent session. A harness reads its hooks at session start only. In
Claude Code, `/reload-plugins` also works. In Codex, confirm that you trusted
the hooks.

**Lares reports that the port is in use.**
Lares uses port 21473. Lares fails loudly instead of moving to a free port,
because the registered MCP URL holds the port number. Stop the other program.

You can move Lares with the `LARES_PORT` environment variable, but the harness
plugins hold `127.0.0.1:21473` in their configuration. After a move, the hooks
still work, and the MCP connection fails. Prefer to free the port.

**My agent reports a connection error.**
Lares is not running. Start Lares. Your agent turn is not affected: the hooks
exit silently, and the MCP tools tell the agent to continue without a comment.

**The Lar disappeared.**
Check **Do Not Disturb** in the tray. Check also **Reset Position**: your Lar
can be on a display that you disconnected.

**Clicks go through my Lar.**
This is correct behavior for the transparent area. The body itself accepts
clicks and drags.

**My character shows no emotion of its own.**
Map its expressions. See section 6.

---

## 9. Privacy

Lares keeps your data on your machine:

- The local server binds `127.0.0.1` only. It refuses any request that carries
  an `Origin` header.
- Lares sends no telemetry.
- Lares reads no transcript, and no harness file.
- Lares senses only what a harness or an agent sends to it.

Lares makes one network request of its own: the update check. It reads
`https://api.github.com/repos/Xyri1/lares/releases/latest` at each launch, and
each 24 hours while it runs. You can disable this check in the tray. Lares
notifies you and opens the release page. Lares never downloads or installs an
update on its own.

The plugin installation in section 3 also downloads from the network. It
starts only after you request it and confirm it.

---

## 10. Uninstall Lares

Quit Lares first. Then start the uninstall:

- **Windows**: use **Apps & Features**, or run `Uninstall Lares.exe` from the
  installation directory.
- **macOS**: run the application binary with the `--uninstall` argument.

```sh
/Applications/Lares.app/Contents/MacOS/Lares --uninstall
```

The `scripts/install-local.sh uninstall` helper runs that same command for you.

Lares then asks you to confirm. The uninstall always removes:

- The Lares application.
- The Lares hooks, MCP entries, and launcher shims.

The dialog holds an **Also delete Lares data** checkbox. The checkbox is clear
by default:

| Checkbox | Result |
| --- | --- |
| Clear | Your characters, authored expressions, calibration, settings, and window position remain. A new installation reuses them. |
| Selected | Lares deletes all of that data. |

The harness plugins are yours, and they stay. Remove them yourself:

- Claude Code: `/plugin uninstall lares@lares`
- Codex: `/plugins`

Without Lares, the hooks and the MCP entry point at nothing.
