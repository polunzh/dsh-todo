[English](./README.md) | **简体中文**

# dsh-todo

[![DSH Plugin Index](https://dsh.127.dev/assets/badge-en.svg)](https://dsh.127.dev/)

A full-featured to-do list and Pomodoro timer plugin for DeepSeek Harness. Combines the core workflow of **Todoist** (Today, Upcoming, Inbox, Projects, Priorities, Natural-Language Quick Add) with the focused timeboxing of **TickTick** (Pomodoro timer bound to tasks, 25/5/15 cycles, and focus stats).

Runs entirely local: tasks, projects, settings, and Pomodoro sessions are saved to `$DSH_HOME/storages/todo/state.json` via atomic file writes. DeepSeek Harness agents can read and write the exact same task database via the built-in `todo` tool.

## Interface

Studio Vivid green is the default brand accent. Five persistent themes—Studio Vivid, Deep Teal Professional, Warm Orange Energy, Navy Blue Composure, and Rose Warm Gray—share the same semantic priority colors, 4/8 spacing rhythm, radii, elevation, light/dark parity, and persistent right-side context rail.

---

## Screenshots

### Today View (Light & Dark)
![Today View Light](./preview/screenshots/panel-light-en.png)

![Today View Dark](./preview/screenshots/panel-dark.png)

### Calendar View
![Calendar View](./preview/screenshots/calendar.png)

### Always-visible timer in the conversation header
The timer sits at the top right of every conversation, just before the host sidebar control: its second-precision countdown stays legible while the bound task, pause and skip remain within view as you chat.

![Pomodoro timer in the conversation header](./preview/screenshots/header-timer-en.png)

### Second-precision countdown on the sidebar icon
The remaining time sits under the to-do icon and ticks every second, so the logo stays fully visible while the sidebar is collapsed.

![Countdown under the sidebar icon](./preview/screenshots/sidebar-badge.png)

With the sidebar expanded, the countdown sits at the end of the row, right after the panel name, and steps aside when a pin button occupies the row tail.

![Countdown after the panel name](./preview/screenshots/sidebar-badge-wide.png)

An unstarted focus stays quiet; a short or long break shows as soon as it becomes the current mode, labelled with the mode name (`Short break 05:00`) and tinted blue to separate it from focus.

![Short break countdown on the sidebar](./preview/screenshots/sidebar-badge-wide-break.png)

### Pomodoro Timer & Focus Stats
![Pomodoro View](./preview/screenshots/pomodoro.png)

![30-day range](./preview/screenshots/pomodoro-stats-30d.png)

![A selected single day](./preview/screenshots/pomodoro-stats-day.png)

### Alerts and ticking
In Plugin settings, Alerts covers task completion and Pomodoro endings, while Ticking covers the focus countdown only. Each switch has its own Test button and both default to on.

![Plugin settings: Alerts and Ticking](./preview/screenshots/settings-sound.png)

![English: Alerts and Ticking](./preview/screenshots/settings-sound-en.png)

### Per-task focus length
Not every task deserves 25 minutes. Give a single todo its own focus length in the task drawer — 15 / 25 / 45 or any value from 1 to 180 minutes — and its play button starts exactly that session. Tasks without one keep following the global setting. The chip on the task row shows the assigned length, and the finished session is recorded with those minutes.

![Per-task focus length](./preview/screenshots/task-focus-en.png)

### Subtask editing
Click a subtask title in the task drawer and it becomes an input right there. Enter or clicking away saves, Esc cancels, and the checkbox state stays put — no delete-and-retype.

![Renaming a subtask in place](./preview/screenshots/subtask-edit-en.png)

### Theme picker
Use the top-right **Plugin settings → Appearance → Theme** control. It applies immediately, persists locally, supports keyboard navigation, and follows the host light or dark mode.

![Theme picker in Chinese](./preview/screenshots/theme-switcher.png)

![Theme picker in English](./preview/screenshots/theme-switcher-en.png)

### Mobile & Responsive Layout
![Mobile View](./preview/screenshots/mobile.png)

![Mobile theme picker](./preview/screenshots/theme-switcher-mobile.png)

---

## Features

### Task Management
- **Views**: Today (split into Overdue and Today), Upcoming (grouped by date), Inbox, Completed, Projects, Calendar, and Pomodoro.
- **Natural-Language Quick Add**: Type `Tomorrow 3pm review roadmap #work !p1 ~weekly` to parse due dates, times, projects, priorities, and recurrence rules into structured fields automatically.
- **Task Hierarchy**: One-level subtasks with progress tracking (`1/2 completed`), rename in place from the drawer, cascade completion, and cascade deletion with full undo support.
- **Recurring Tasks**: Supports `daily`, `weekday` (skipping weekends), `weekly` (optionally on multiple weekdays such as Mon/Wed/Fri), `monthly` (same day, last day of month, or the Nth weekday), and `yearly`, with catch-up logic. Marking a recurring task complete archives the current occurrence and immediately spawns the next one with fresh subtasks.
- **Priorities & Labels**: P0 (Critical, filled red), P1 (Urgent, red), P2 (High, orange), P3 (Medium, blue), P4 (Low, gray) shown in a dedicated column at the row start; quick add accepts `!p0`–`!p4`, plus arbitrary `#project` and `@tag` labels.
- **Calendar Grid**: Interactive monthly grid displaying task count dots; clicking any date filters tasks for that specific day.
- **Search & Filter**: Real-time keyword search across titles and notes, combined with multi-select priority filters.
- **Confident completion & editing**: The task drawer keeps autosave and adds an explicit Save button (`⌘/Ctrl+Enter`). Completing a task gets a focused confirmation with its title, a six-second Undo action, and the next date for recurring tasks; Today pairs a compact progress ring with completed/total counts.

### Pomodoro Timer
- **Work Cycles**: 25-minute focus, 5-minute short break, 15-minute long break every 4 focus sessions. Pick the focus length right on the timer (25 / 45 / 60 or custom) or fine-tune every duration in settings; changes apply immediately when idle and never cut a running session short.
- **Task Binding**: The play button on each task row starts a focus session for that task directly; completing it increments the task's Pomodoro counter.
- **Per-task focus length**: Each task can carry its own focus duration (15 / 25 / 45 or 1–180 minutes custom) set in the task drawer. Its play button starts that length right away, the task row shows the value, and leaving the field empty follows the global setting. The agent can set it too via `focusMinutes` on `add` / `update`.
- **Conversation-header timer**: A compact timer sits at the top right of every session — idle shows the configured focus length, running shows the countdown with the bound task and pause/skip controls. The sidebar icon mirrors the countdown as mm:ss, labelled with the mode while on a break.
- **Persistent Countdown**: Timer state is preserved in browser storage (`localStorage`) with absolute timestamps, surviving page refreshes without drifting.
- **Audio & Visual Alerts**: One Alerts setting, enabled by default for new users, covers both task completion and Pomodoro endings. Both task completion and Pomodoro endings play a single soft ding. Existing saved choices remain unchanged, and the Test button plays that ding immediately. With the notification center plugin (`@polunzh/dsh-task-notifier`) installed, Pomodoro endings are published there and it owns the system notification and chime; dsh-todo's own notification is the fallback when the notification center is absent.
- **Focus ticking**: While a focus session runs, a soft tick plays once a second, alternating tick and tock. Pausing, breaks, skipping, abandoning, and the final second stay silent — the ending alert takes over. A separate Ticking switch ships on and defaults to on, so you can silence the countdown while keeping the end alerts; its Test button plays three ticks.
- **Plugin settings & themes**: One top-right Plugin settings panel contains Pomodoro timings, alerts, ticking, goals, and the single Appearance control for five locally persisted themes. Studio Vivid green is the default; the picker works with keyboard navigation, click-outside dismissal, and host light/dark mode.
- **Focus stats**: switch the right-hand panel between 7 days, 30 days and all time; the 30-day view aggregates by week and all time by month. Click a bar to drill down (month → week → day), and selecting a day makes the task breakdown and focus log follow it. A per-task/project breakdown and streak sit alongside.
- **Trustworthy records**: only fully completed pomodoros count toward totals and the daily goal. Abandoning or skipping a focus records the actual minutes as an "interrupted" entry once you have focused for 5 minutes or more, and leaves nothing behind below that. Finishing a break no longer logs a focus session.

### Keyboard shortcuts

| Action | macOS / Windows |
| --- | --- |
| Start or pause the pomodoro | `⌘⌥P` / `Ctrl+Alt+P` |
| Open the to-do panel | `⌘⌥J` / `Ctrl+Alt+J` |

Both are editable in the host's own shortcut settings and fall back to the next free combination when another plugin already owns it.

### Agent Tool (`todo`)
Autonomous agents can inspect, organize, and update your task database using the registered `todo` tool:

```json
{
  "action": "list",
  "view": "today"
}
```

Supported actions:
- `list`: Filter by view (`today`, `upcoming`, `inbox`, `completed`, `all`), project, or search query.
- `add`: Create tasks with title, due date/time, priority, project, recurrence, and an optional per-task `focusMinutes`.
- `update`: Modify title, note, due date, priority, project, or a task's `focusMinutes` (`null` clears it back to the global setting).
- `complete`: Toggle task completion and generate recurring occurrences.
- `delete`: Remove tasks and their child subtasks.
- `stats`: Retrieve today's completed task count, focus minutes, and Pomodoro counts.
- `project`: Create a new project.
- `settings`: Adjust Pomodoro focus/short/long lengths, long-break interval, auto-start, sound, ticking, daily goal, and the theme (`studio-vivid`, `deep-teal`, `warm-orange`, `navy-blue`, or `rose-warm-gray`).

---

## Installation

Install from npm once published, or from a local checkout:

```bash
npm i -g @polunzh/dsh-todo   # or point the plugin manager at the folder
```

Inside DeepSeek Harness, open the Plugin Manager and install from a local directory:

```bash
/path/to/dsh-plugins/dsh-todo
```

Or clone into your local plugin folder and mount via `cordis.patch.yml`:

```yaml
- insert:
    - id: todo
      name: dsh-todo
```

Refresh the DeepSeek Harness Web GUI to see the **Todo** entry in the left sidebar.

---

## Development & Testing

Run the full test suite (184 unit and integration tests across storage, recurrence rules, HTTP routes, agent tool, natural language parsing, Pomodoro state machine, settings persistence, and bilingual dictionaries):

```bash
npm test
```

Start the standalone local preview server:

```bash
npm run preview
```

Generate fresh headless Chrome screenshots:

```bash
npm run screenshot
```

---

## License

[MIT](./LICENSE) © 2026 polunzh
