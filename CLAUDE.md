# Everyday Orbit

A personal planner desktop app. Electron shell around a single-page web app.

## Layout

```
main.js            Electron main process: windows, menu, vault sync, updates
gcal.js            Google sign-in, tokens, Calendar and Drive requests (main process)
preload.js         The only bridge to the shell; exposes window.orbit
src/index.html     Page shell, SVG icon sprite, app markup
src/timer.html     The floating timer window (desktop only)
src/app.css        Every style; all colours are tokens on :root
src/app.js         The whole application, in one IIFE
scripts/           build-standalone.js, serve.js
test/              Convention guards, run by npm test
build/             icon.ico, icon.png, entitlements.mac.plist
docs/              The GitHub Pages download page
package.json       Dependencies plus the electron-builder config
```

**There is no bundler and no compile step.** Electron loads `src/index.html`
directly. `npm run build:html` inlines the three sources into
`dist/everyday-orbit.html`, a single file that runs from a double-click. Keep it
that way unless there is a strong reason not to.

## Running it

```
npm install          # first time only
npm start            # launch the desktop app
node scripts/serve.js  # or open it at http://localhost:4173 in a browser
npm test             # run the checks
npm run build        # produce installers into release/
```

## How the app is organised

`src/app.js` reads top to bottom; the sections are marked with comment banners.

### State

A single module-level object `S` holds all data:

```js
S = { categories, tasks, routines, notes, completions, prefs,
      activity, docs, sessions }
```

`KEYS` lists those nine names. Anything that changes data must call
`save("<key>")`, which writes to `localStorage` and, when the page is running as
a published Claude artifact, to a cloud store. `touched[key]` guards against a
slow cloud read overwriting a local edit; do not remove it.

`V` holds view state (current view, calendar anchor date, filters, search) and is
deliberately not persisted.

### Rendering

Rendering is full innerHTML replacement, no virtual DOM:

- `render()` redraws rail, top bar and view. Call after any data change.
- `renderView()` redraws only the viewport. Call for filter and search changes so
  the search box keeps focus.

Each view is a function returning an HTML string: `viewDashboard`, `viewCalendar`, `viewBoard`,
`viewList`, `viewMatrix`, `viewRoutines`, `viewNotes`.

**A redraw must not lose your place.** Replacing the HTML replaces every
scrolled box inside it, so ticking a missed routine halfway down the
dashboard used to throw the column back to the top, and the calendar went
back to 7am every minute. `renderView()` notes each scrolled box before
drawing (`scrollMarks()`: its id, or its first class and its place among
boxes of that class) and scrolls the box in the same place back afterwards
(`putScroll()`), and hands the keyboard back to the redrawn copy of the
button that was pressed. This only carries over within one screen
(`screenKey()`: the view, its mode, the open note) — a different screen
starts at its top. The week grid opens at 7am the first time it is shown
and stays where you left it after that. Give a new scrolling box a class of
its own and it is covered; nothing else is needed.

**Staying fast on a big planner.** Measured on a year of heavy use — 1,500
tasks, 25 routines ticked daily, 6,000 tracked sessions, 8,000 activity
entries — ticking a task took 0.8s and switching the board filter 0.9s.
Four things fixed it, and each is guarded by `npm test`:

- **Scroll positions are asked of scrolled boxes only.** `scrollMarks()`
  once read `scrollTop` from every element, which forces a full layout;
  over a second per redraw. A capturing `scroll` listener notes the boxes
  that have actually scrolled (`SCROLLED`), and only those are asked.
- **Big lists are looked up, not scanned.** The lookups section keeps each
  list grouped once (`ixTasks`, `ixAct`, `ixDocs`, `ixSess`, `ixSessDay`,
  `ixDay`, `ixBack`, and `overdueItems()`), dropped by `save()` and
  `render()` (`ixDrop()`) and rebuilt on first use. Reach for these rather
  than `S.x.filter(...)` inside anything that runs per card, per row or per
  day. Anything that changes `S` must `save()`, as it always has.
- **Storage is written once per burst.** `saveLocal()` gathers saves made in
  the same moment into one write 250ms later (`saveLocalNow()`), and
  `flushLocal()` writes at once on `pagehide`, `beforeunload` and the page
  being hidden. A test reading storage straight after a change must wait.
- **Long lists draw what can be seen.** A board column draws `COL_SHOWN`
  (50) cards and offers the rest on "Show more" (`V.colMore`); off-screen
  cards, list groups and note items use `content-visibility: auto`.
  `fitMonth()` measures every cell in one pass and changes them in another.

Search redraws once typing pauses (`V.qTimer`), and nothing live redraws
while the window is hidden — except the floating timer's second, which may be
the only thing on screen.

Modals follow the same rule: `openModal()` with the same `aria-label` as the
one already open swaps it in place — no pop-in replayed, its lists left
where they were scrolled. The day popup is redrawn by `render()` while it is
open (`V.peek`), because the ticks in it change the page underneath.

A task has one menu (`taskMenu()`), from the ⋯ in the panel's header and from a
right-click on the task anywhere on the page: Add subtask, Track time, Attach
files, Link task, Duplicate task, then Delete task apart from the rest (it
asks twice). Parts switched off in Customise are left out; from a card it
starts with Open task, and each action opens the task's panel where it
lands. A new task is created from the header's top right, or by Enter in its
name.

The task detail panel is a **second root**, `#sheetRoot`, drawn by
`renderSheet()`. `render()` deliberately does not touch it, because a redraw
while someone is typing in it would throw the caret away — so anything that
changes a task from outside the panel must call `renderSheet()` itself.
The panel has no save button: `patchTask()` commits on `change`, which is why
text fields pass `redraw:false`.

### Events

One delegated `click` listener on `document` reads `data-act` from the closest
ancestor and switches on it. To add a control, give it `data-act="thing"` plus
any `data-id` / `data-date` it needs, then add a `case "thing":`. The whole
switch is wrapped in try/catch that surfaces the error in a toast.

Form inputs are the exception: `data-act="f"` is handled in the `change`
listener, not the click switch. `npm test` knows about both.

### Activity, documents and time

`logAct(taskId, kind, text, meta)` appends to `S.activity`; `logChanges()`
diffs a task before and after an edit and writes one entry per changed field.
Keep `FIELD_LABEL` in step with the fields a task has, or changes go unlogged.

Documents are markdown in `S.docs`, but nobody has to see it. The editor
(`docModal()`, the document editor section) is one page that looks like the
finished document, as Google Docs or Notion do — a split of text beside a
preview was tried and read as two documents. `mdToHtml(md, "edit")` draws
the page and `htmlToMd()` turns it back on save; a round trip must give back
the same Markdown, checklists, nested lists and tables included. The
**Markdown** toggle swaps the page for the text (`DE.src`), with the same
toolbar writing Markdown there (`srcTool()`).

- Inline formatting (bold, italic, strikethrough, links) uses the browser's
  `execCommand`, so Ctrl+Z undoes it. Line formatting — headings, quotes,
  code blocks, lists, checklists, indenting — does **not**: Chrome's list
  commands nest lists inside paragraphs and cannot turn a list back into
  text. `richConvert()` rebuilds the touched lines itself, carrying the
  caret on two marker spans (`richMutate()`), and keeps each change in
  `DE.hist` so Undo takes it back first (`richUndo()`).
- Typing `# `, `- `, `1. `, `[] `, `> `, ` ``` ` or `--- ` at the start of a line
  formats it. That runs a tick after the keystroke (`richAutoNow()`): a
  formatting command inside another command's input event is ignored.
- A checklist item is `li.md-task`, its box drawn by the stylesheet;
  `richTick()` ticks it on a click in the box's space.
- Pasted content goes through `htmlToMd()` and back (parsed with
  `DOMParser`, which runs nothing), so other pages' styles never arrive and
  pasted Markdown is formatted. Links and images ask for their address in a
  bar under the toolbar, never `prompt()`.
- Nothing is required to save, and every way out (the close button, the
  backdrop, Escape) goes through `docMayClose()`, which asks before unsaved
  changes are thrown away.
- Write non-breaking and zero-width spaces as \u00a0 and \u200b escapes. A
  test fails on the literal characters: in a regex they look like ordinary
  spaces.

On the desktop each document is mirrored into
`<vault>/Everyday Orbit/<title> <id>.md` with YAML front matter carrying
`orbit-id`, which is how an edit made in Obsidian finds its way back to the
right document. The loop is broken on both sides: the main process ignores
file events for two seconds after its own write, and `applyVaultChange()`
never writes back to the vault.

Tracked time is drawn on the calendar rather than summarised elsewhere:
`eventsFor()` returns routines and tracked time together, and the week grid
lays them out side by side. Tracked time is drawn as *sittings*, not runs:
`sittings()` merges a task's runs on a day when the gap between them is
under `RUN_GAP` (30 minutes), so pausing and restarting reads as one block
from the first start to the last stop, labelled with the time actually
tracked. A longer gap starts a new block — one block across a morning run
and an afternoon run would claim the hours between. A sitting is its true
length with a 16px floor, just enough to click; readers of a session event
use `e.g` (the sitting) and `e.secs`, not a single row.

The run in progress is part of this too. It has no `S.sessions` row until it
stops, so `sittings()` adds it as one — from `began` to now, or as far as it
got if paused — and it merges like any other run, so resuming soon after a
stop carries on the same block. That block is marked `live`; the per-second
tick writes its clock (`data-live-base` plus the live seconds) and its height
into the DOM directly, and the grid itself redraws once a minute.

The month view shows only the weeks the month touches — four, five or six
rows — with the neighbouring months' days only where they fill out a first or
last week, and every day a cell with a hairline round it. A cell lists up to
`MONTH_LINES` (four) things, as Google Calendar does: tasks as chips, all-day
events, then everything timed in order as dot · time · name, and the day's
tracked time as one line. Past four, three show with "+N more" (the day popup).
A week row never gets shorter than four lines need (`--mrow-min`); on a short
screen a six-week month scrolls a little instead. After drawing, `fitMonth()`
drops lines from any cell that still overflows and folds them into the count,
so a line is never cut in half.

In the task panel the total is a button, not a hover: it opens the time
breakdown (`timeBreakdown()`) — a meter against the estimate with the
overrun hatched past a marker, then each day as a 6am–midnight strip with
its runs laid where they happened. It is open while `V.tmBreak` holds the
task id; a click elsewhere or Escape takes it out in place rather than
redrawing the panel.

Time tracking has one control, Start, and no modes. A run counts up; if the
task has an estimate the readouts say "elapsed of estimate" and turn red past
it, and with no estimate they simply count. Stopping asks whether the task is
done rather than deciding.

The app keeps running when its window closes — a timer must survive the window
being tidied away — so `window-all-closed` deliberately does not quit and the
tray is the only way out. Anything that should really quit sets `quitting`
first, or the close handler will just hide the window again.

Time tracking stores one `S.sessions` row per run. A task total is always
summed from those rows, never cached on the task. The timer in flight lives in
`prefs.running` so it survives a reload, and it is paused rather than resumed
on start-up, so a timer left running overnight does not bank the hours.

### Routines

A routine's schedule is a plan, not a rule. `routineOn(r, d)` says when it
is *due* — reminders, the calendar's recurring events in Google and the
missed list all go by that — but any day's square up to today can be ticked (a day still to come
cannot be yet: the streak counts back from today, so a tick there changed
nothing; one already ticked can be taken off), and
`routineHere(r, d)` (due, or done anyway) is what decides where it *shows*:
the calendar, the dashboard's today and the day popup. `streak()` counts
every day it was done, scheduled or not; an off day left empty is neutral;
a scheduled day missed ends the streak unless `madeUp()` finds it done on an
off day after it and before the next day it is due. That window is one per
missed day, so one extra tick never covers two, and a made-up day is not
listed as missed either.

### Customising tasks

How tasks work is the person's to set, in one window opened from
**Customise** beside Advanced (`customiseModal()`, the customise section).
All of it is `prefs.board`, filled in by `board()` on the one object, so it
goes with backups and Drive like any setting.

- **Swimlanes** are `board().lanes`: `{id, name, color, done}` in board
  order, and a task's `status` is its lane's id. A new planner starts with
  To do, In progress and Completed (`DEFAULT_LANES`); a planner that already
  had tasks keeps the six it had (`LEGACY_LANES`), so nothing moves. That is
  decided the first time `board()` runs, which `render()` makes happen before
  anything else — left later, a new planner's first sample tasks made it look
  like an old one. Lanes can be added, renamed, recoloured, reordered (drag,
  or the arrows) and removed; removing one with tasks asks where they go.
- **Done is a lane, not a word.** A lane marked done is where ticking sends a
  task (`firstDone()`, and back to `firstOpen()`), and what counts as finished
  everywhere through `isDoneT(t)`. Never test `t.status==="completed"` — a
  test fails on it. A status a lane no longer has (the sample week, an old
  backup) is moved to the nearest one by `fixTasks()` via `laneFor()`.
- **The task panel's parts** can be switched off (`BOARD_FEATS`: key, name, a
  line on what it is for, icon; read with `feat(k)`); hidden parts keep their
  data, and cards and the list follow. The Task details tab is the one place
  fields are managed, kept plain: every field (built in or the person's
  own) as a row with **one** switch, its name and a short line on what it
  is for, beside a task panel in miniature (`czPanelPreview()`); then
  Subtasks, as two small picture cards; then the order of the list's columns. A task shows the same fields opened and in the list: `listCols()`
  turns a column on exactly when its panel part is (`FEAT_COL_OF`; a field's
  `list` follows its `panel`). Lane is the lane picker at the top of the
  panel and Created a line under Schedule, so they obey the rule too; Created
  starts off (`FEAT_OFF`). Separate In task and In list switches were tried
  and read as two names for one thing; Lane and Created as list-only switches
  changed nothing the preview could show.
- **Subtasks that are tasks** (`board().fullSubs`), offered as two drawn
  choices, Checklist and Full tasks, not a switch: a subtask is a task with
  a `parent`, opening like any task with a way back to its parent. Switching
  it on turns every checklist subtask into one. They live inside their parent
  only: everything that lists tasks reads `tops()`, never `S.tasks`, and
  `kidsOf(id)` finds a task's own. Deleting a task deletes its subtasks.
- **Fields of their own** are `board().fields` (`CF_TYPES`: text, number,
  date, single- and multi-select with coloured options, checkbox, link,
  rating, progress), their values in `t.cf` by field id. A field is made and
  changed in place, inside Your own fields (`czFieldEditor()` in the row's
  place, `V.cz.edit`), not on a page of its own, and is not asked where to
  show: it shows on tasks and in the list like every other field. Each can show in
  the panel, as a list column and on board cards; changes are in the task's
  history. Changing a field's type, or taking options away, clears values
  that no longer fit.
- **Adding in a lane.** "Add task" at a lane's foot opens a card there
  (`qaCard()`, `V.qa`): the name, then start date, priority, category and a
  tag, each only if its switch is on. Enter adds the task and leaves the card
  open and empty, keeping the date and category, so a run goes in without
  leaving the board; Esc or a click away from an empty card closes it. What
  is typed lives on `V.qa`, and `renderView()` puts the caret back
  (`qaRefocus()`). The side panel is the detail and edit view.
- **A category pill is a button** where it belongs to a task or routine
  (`catChip(id, kind, of)`, the board card's `.tc-cat`): it opens a short
  list of categories (`catMenu()`) and changes it in place.
- **The list's columns** are `board().cols` (`{k, on}` in order, a field as
  `"cf:<id>"`), read through `listCols()`, which sets `on` from the panel; the row grid is built from them,
  so a hidden column takes no room.

### When a task happens

Put the way Google Calendar puts it. A task has a **date** — stored as
`due`, a name older than the idea, and what places it on the calendar, on
the dashboard's today and in overdue — and on that date it is either **all
day** (no `dueTime`) or runs from a **start** to an **end time** (`dueTime`,
`endTime`). Apart from both, an optional **deadline** (`deadline`): the day it
must be done by, which is not the day you plan to do it. A task is overdue
when its date *or* its deadline has gone (`isOverdue()`); a task with a
deadline and no date sits on its deadline's day. `tSpan()` gives the start
and end in minutes — a start with no end, from before tasks had one, is half
an hour.

In the panel the date is the **Start** row: the start date, then start – end
on one line, "All day" beneath, as Google's event form has it. The deadline
is a row of its own, **Deadline**. Each row has its own switch in Customise
(`when`, `deadline`). One "When" row holding both, with "Add deadline"
tucked under it, read as two deadlines, and switching either off alone
changed nothing. A new start time keeps the length the task had; the end
time's list starts after the start and says how long each choice makes it.

A planner still on the ten categories it started with, untouched
(`OLD_CATS`: id, name and colour), moves to the five (`baseCategories()`) in
`fixCats()`, also run from `render()`; tasks, routines and notes follow
`OLD_CAT_TO`. A set anyone has changed is left alone.

The form once had a *start date* beside the due date. `fixTasks()`, run at
the top of every `render()` and harmless to repeat, moves any that remain:
the start date becomes the date, and a due date after it the deadline.

On the calendar, a task with a time is a block in the week grid with its
tick box in the corner (kind `"task"`, added in `weekGrid()` beside Google's
events — **not** in `eventsFor()`, for the reason given under Google
Calendar); all-day tasks stay in the band across the top, and in the month
a timed task is a line with its time. **Dragging down an empty stretch of a
day makes a task** for that time, as in Google Calendar (`DG`): quarter-hour
steps, a click without a drag makes an hour, and the placeholder stays on the
grid until the new task is made or abandoned. The once-a-minute redraw of
the week waits while a drag or a placeholder is on it. Google Calendar sync
writes a timed task as a timed event and reads times back from it; the
deadline is the planner's own and is never synced.

### Dashboard

`viewDashboard` is today on one page and owns no data of its own. The
scratch pad (`prefs.scratch`) lives only here — Notes once had a button
opening it too, and it was taken out so there is one place for it. "Needs your
attention" reuses `overdueItems()` — the calendar's Catch-up panel — and
`noteActionItems()` reads open action items straight from `S.notes`. An
action item already due today or overdue is left out of "From your notes",
because it is on the page once already; showing it twice would make one
piece of work look like two. Missed routines fold away past `MISS_SHOWN`:
they are the least actionable thing there, and ten of them buried the rest.

The sidebar carries one number, and only when something is late: overdue
tasks, on Dashboard, in the danger colour (`navAlert()`). Counts on every
section were inventory, and a number that is always there stops being seen.
What is due today is a plan, not an alarm. The badge is a `<b>`, not a
`<span>`, because the icon-only rail hides every span in a nav button.

The foot of the sidebar is one button to Settings (`renderMe()`): a letter,
the person's name, and under it where the planner is kept (`saveWhere()`,
written by `setSync()`). Backup and restore were two bare arrow icons
there; they live in Settings > Your data, in words.

The category boxes in the sidebar can be swept: press one and drag over the
others, and every row between takes the state the first took, saved once on
release (`CP`, the sweeping section of app.js). On a touch screen the sweep
starts after a short hold so a swipe still scrolls; the click that ends a
sweep is ignored (`CP.skipUntil`), and a tap or a key is still a toggle.

The dashboard is the page the planner opens on. Everyone set up before it
existed has `launch:"calendar"` saved — the old default, not a choice — so
start-up moves them once; picking a page in Settings sets `launchSet` and is
never overridden.

The top of it is a welcome panel (`dashHero()`): a greeting by time of day,
a sentence on how today stands, the day's progress drawn as an orbit — a
planet that travels round as today's tasks and routines get done, the app's
name made literal, and the only orbit on the panel (a large faint one behind
it was tried and taken out as clutter) — and the whole day on one strip (`dayStripHtml()`). It is
the one place on the page with atmosphere, so the lists below stay calm. The
schedule lays routines and Google events on a timeline; a routine's dot is its
tick box, an event's is a square because it is Google's to change.

It is also where the caret is most likely to be, in the scratch pad, so
nothing live on it redraws the page. Now/next and the day strip are swapped in
place every 30 seconds (`upNextHtml()` into `#dashNext`, `dayStripHtml()` into
`#dashStrip`), and the per-second timer tick
writes the running task's clock and today's total into `data-live` and
`data-live-total` nodes directly. A full `render()` there would throw the
caret out of whatever is being typed.

"Make task" in the scratch pad works on the selection, or on the line the
caret is in; "Save as note" on the selection, or with nothing selected the
whole pad, formatting kept (taking only the caret's line once lost
everything above it). Both *move* the text rather than copy it. The toolbar keeps the selection alive through the
click the same way the formatting buttons do: they are in the `mousedown`
guard that calls `saveSel()` and prevents the default.

### Reminders

Worked out in app.js, delivered by main.js. `buildReminders()` turns tasks,
routines and `prefs.remind` into a flat list of `{id, at, title, body, open}`
for the next 36 hours, and `scheduleReminders()` hands the *whole* list to
the shell every time anything changes (any save of tasks, routines,
completions or prefs, debounced) and every five minutes. main.js clears its
timers and sets them again from that list; its timers are not throttled the
way a hidden window's are, and they keep running with the window closed.
Clicking a notification sends `remind:open`, and `openReminder()` opens the
task or the dashboard. In a plain browser the page keeps the timers itself,
behind a permission prompt, and only while the tab is open.

- An item's `remind` is unset (the default, 30 minutes before), a number of
  minutes, or `false`. Tasks need a time to have a reminder at all; "before"
  needs something to be before.
- Reminders count back from a task's **start time** on its date (see When a
  task happens). All-day tasks have no reminder.
- A reminder's id carries what it was worked out from — item, day, time,
  lead — so changing any of them makes a new reminder rather than one the
  shell has already marked as sent.
- The overdue count is one notification a day at `remind.overdueAt`
  (12:00 unless changed), counting tasks as they will stand *then*: open and
  due before that day. It is rebuilt every five minutes, so it is never more
  than that out of date.
- Quiet hours have no default and may wrap midnight. A reminder inside them
  is skipped, not queued for later.

### Account and setup

The planner is used signed in with a Google account, and the first launch
is a setup page of its own (`#obRoot`, the account + setup section of app.js),
not a dialog. Steps (`obSteps()`): sign in → where the planner lives (Google
Drive backup, or this device only) → name → categories → starter routines →
Google Calendar → Obsidian → appearance → notifications → all set. Where it
has got to is in `prefs.onboard` (`{done, step, mode, made}`), so closing half
way picks up at the same step; `made` is the ids of the routines setup
created, replaced rather than added to when someone goes back and forth.

- **How it looks.** The sign-in is a sky of turning orbits (`obSky()`: rings
  with planets in the category colours, the planner's parts drifting between)
  around the welcome. Every later step is a question on the left and, on the
  right, a live picture of the answer (`obShow()`): the greeting with the
  name being typed, the categories as planets round you, the week filling in
  as routines are ticked, the app in miniature in the theme being chosen, a
  reminder arriving and the day as a 24-hour clock with quiet hours shaded,
  and a final orbit with what was set up lit. The steps run along a track at
  the top that can be clicked back along; Enter moves on; the footer sticks to
  the bottom. A step's entrance plays only when the step changes
  (`OB.drawn`), and `OB.pop` animates only the routine just ticked — a redraw
  replaying every animation made each click look like a new page. All of it
  stops under `prefers-reduced-motion`. Live bits that must not cost the caret
  (the greeting, a category's planet label) are written into the DOM by the
  `input` listener rather than redrawn.
- **How it reads.** Short and about the person: a heading that says what they
  get, one line under it, labels a person would say out loud. It does not
  explain where things appear or how they work, and it never shows a code, a
  file name or a key (the accent picker hides its hex here: `accentPickHtml(true)`).
  The previews carry no captions; they speak for themselves.
- The routines setup suggests (`OB_RT`) are the default set, like the five
  categories: the step starts with none picked and what it ends with is the
  person's choice; a planner begun before setup offered them is given them once by
  `fixRoutines()` in `render()`, held back while setup is needed or open.
  `prefs.rtSeeded` marks the choice made, so an emptied list stays empty.
- On the routines step a card only picks a routine; its days and length are
  changed in the week preview beside it, which is the editor: a square is a
  day to tap, the length at the end of a row opens the lengths under it
  (`OB.rtOpen`). Time and category stay as suggested, to change later. A
  routine the person adds (`custom`) is named in its own card and can be
  removed. Editing inside the cards was tried twice: an open card grew and
  broke the grid. On a narrow screen the preview shows under the cards.
- In a browser, All set ends with a card to get the desktop app (`obGetApp()`,
  `DOWNLOAD_URL`, the GitHub Pages download page); the desktop app never shows it.
- `mode` decides the steps: `"new"`; `"returning"` — someone with a planner
  from before setup existed, who signs in, picks where it lives, and is done;
  `"restored"` — a planner brought back from Drive or a file, which skips
  everything that came back with it; `"again"` — signed out after setup,
  which shows the sign-in and nothing else.
- `obNeeded()` is the gate: where Google can be reached (`hasGoogle()`),
  setup not done or not signed in; in a copy that cannot sign in, only a
  brand-new one. Obsidian is the one step that needs the desktop itself. At
  start-up the page is hidden (`body.ob-wait`) until the account status is
  in, so nobody sees their planner flash up only to be asked to sign in.
- The steps reuse the settings' own controls — `set-pref` switches and time
  fields, `set-theme`, `set-accent`, `vault-pick` — and those handlers call
  `panels()`, which redraws Settings if it is open and setup if it is. Call
  `panels()`, not `settingsModal()`, anywhere that redraws after a change;
  `settingsModal()` itself *opens* Settings.
- **The account is Google's, and nothing else is involved.** `gcal.js` signs
  in and holds the key. Access is asked for a piece at a time with
  `gcalConnect({want:[...]})` — `"account"` (openid, email, profile) at sign
  in, `"drive"` (drive.file: only files this app made) when Drive backup is
  chosen, `"calendar"` when Calendar is connected — and every ask carries the
  earlier grants (`include_granted_scopes`), so one key covers all three.
  `status().parts` says which are granted; `signedIn()` and `acctParts()`
  read it. A key saved before any of this is treated as Calendar only.
- Calendar is one part of the account, so disconnecting it sets
  `prefs.gcal.off` and keeps the key; only Sign out (Settings ▸ Account, and
  the foot of the Settings sidebar, shown only while signed in)
  revokes it, and the planner stays on the computer.
- The app's own Google client is not in the repo. main.js reads
  `google-client.json` (written by the release workflow from the
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets, git-ignored) or two
  environment variables, and hands it to gcal.js as `builtIn`; a shipped
  client is never written into settings, so a new build's keys take over. A
  build with none runs without an account (`googleReady()` is false): the
  sign-in page says so in a sentence and carries on. **Never ask the person
  using the planner for a Client ID or any other key** — that is setup for
  whoever builds or hosts it.

**Signing in from a browser** (google in a browser section). `gAcct()` is
the account, whichever way it is reached: `window.orbit` on the desktop,
otherwise `WEB_GOOGLE`, which answers the same five calls with Google
Identity Services — so setup, Drive and Calendar never ask which. Use
`gAcct()`, never `desktop()`, for anything Google. It exists only on an
http(s) address outside the artifact (`wgOrigin()`): Google signs in only
to authorised JavaScript origins, so a file opened by double-click cannot.

- The Client ID is a *Web application* client's, not a secret:
  `google-web-client.json` beside the page (git-ignored), or
  `ORBIT_GOOGLE_WEB_CLIENT_ID` for serve.js. With neither, `gAcct()` is null
  in the browser. Setup waits for `wgLoad()` before deciding, and so does
  `gcalBoot()`.
- Google's library is loaded at start-up, not on the click, and
  `wgConnect()` calls `requestAccessToken` before any `await`: its window
  is a pop-up, and a browser opens one only straight from a click.
- The key lasts an hour, in sessionStorage; who is signed in and the granted
  scopes are in localStorage. There is no refresh key. When it runs out a
  request answers `error:"renew"` — not `"reconnect"`, which means signed
  out — and `wgPill()` shows Reconnect, whose click gets the next key
  silently and reruns the sync and backup.
- A later ask made with a different account in Google's window replaces the
  sign-in rather than merging the grants.

**Drive backup** (google drive backup section): with `prefs.storage` at
`"drive"`, every `save()` schedules `driveBackup()` twenty seconds after the
last change — one upload for a burst of edits — into one file, *Everyday
Orbit backup.json*, the same payload as a backup by hand (`backupPayload()`).
Recording when it last backed up is itself a save of prefs, which would
schedule another backup forever; `DB.quiet` holds that one off. If a backup is found but will not
download, setup stops with an error rather than carrying on, because carrying
on backs the empty planner up over it. A restore
(`applyBackup()`) brings back everything except what belongs to the computer
it lands on: the vault path, the backup folder, a running timer, setup's own
state and the storage choice.

### Google Calendar

Split across the two processes on purpose. `gcal.js` (main) owns the
sign-in — system browser, loopback redirect to `127.0.0.1`, PKCE — and the
refresh token, sealed with `safeStorage`. It never hands a token to the page;
the page calls `gcalRequest({method, path, query, body})` and the main
process signs it, refusing any path that is not the Calendar API.
`test/gcal.test.js` runs the whole sign-in against a fake Google.

What to sync lives in app.js with the data, in the google calendar section:

- **Showing.** `gcalFetchShown()` fetches the ticked calendars for the weeks
  around the one on screen into `GC.events`. `GC` is memory only — events
  are Google's data, never saved, cloud-synced or backed up — which is also
  why there is no tenth entry in `KEYS`. Views read it through `gcalFor(d)`
  and draw it explicitly; it is **not** folded into `eventsFor()`, because
  the callers of that assume a routine or a session and a new kind in there
  broke the month view once before.
- **Syncing.** `gcalSync()` writes dated tasks and active routines into the
  *primary* calendar, tagged with `orbitApp/orbitKind/orbitId` in private
  extended properties. That tag is how it finds its own events, and why it
  filters them out of what it shows. `prefs.gcal.links[id]` is
  `{e, h, u}`: event id, hash of what was last written, the event's
  `updated` stamp when last seen. New hash → the planner changed it → PATCH.
  New stamp → Google changed it → apply it here. Both → the planner wins.
  Deleted in Google → `{off:true}`: the item stops syncing and is never put
  back, and disconnecting keeps those markers.
- `gcalPrefs()` fills defaults **on the one object**. A sync holds it across
  many awaits; handing out a fresh copy meanwhile once left it writing "last
  synced" into an object nothing read. The nested `set-pref` handler
  mutates in place for the same reason.
- `GC.applying` is up while the sync saves what it pulled, so those saves do
  not schedule another sync. A local save of tasks or routines otherwise
  schedules one four seconds later (`gcalSoon()`).
- A sync finishing redraws through `softRender()`, which waits if the caret
  is in a field in the viewport — the scratch pad, most likely.

### Pickers

Every date, time and drop-down opens the planner's own pop-over (the
pickers section of app.js), never the browser's: those came in whatever
grey the operating system chose and matched nothing on the page.

- **Dates and times** are written with `dateField(attrs, value, opts)` and
  `timeField(...)`, never `<input type="date|time">`. A time is a box you type
  in, as Google Calendar's is (`pk-tin`): clicking opens one plain column of
  half hours scrolled to the time (a time typed in between is kept), typing jumps the list to it
  (`tinTyped()`), arrows walk it, and Enter or leaving the box reads what was
  typed (`tinCommit()`). An end time (`after`) lists the times after the
  start with how long each makes it at the row's end. A grid of times in two
  columns with a separate box to type in was tried and read as hard to use. Each is a button
  showing the value in words beside a hidden input carrying `attrs` — the
  `id`, or `data-act`/`data-k`. Picking sets that input and fires a real
  `change` from it, so the existing handlers (`sh-set`, `set-pref`, `f`, a
  read by id on save) see what they always saw. `req` hides "Clear" for a
  field that must have a value; `ph` is the words shown when it is empty.
- **Selects** stay real `<select>` elements, so values, handlers and arrow
  keys stay native. A capturing `mousedown` stops the browser's list and
  opens the same pop-over over the options; a list of categories shows their
  colours. Write a category drop-down with `catSelect(attrs, value, opts)`:
  it puts the chosen category's colour as a dot inside the closed field too,
  and a `change` listener keeps that dot in step where nothing redraws. On a touch screen the phone's own picker is better, so there it
  is left alone (`pkSelectable`).
- The pop-over is appended to `<body>`, so a modal's or the panel's
  overflow cannot clip it, and is placed against its field. A redraw under an
  open one is common — a sync lands, the panel refreshes — so it finds its
  field again by `pkKey()` rather than writing into a detached copy.

### Settings

Settings is a sidebar of sections with one pane open at a time — the tab
list is `SET_TABS`, and the open tab lives in `V.setTab` because which tab
you were on is not a setting. Every change redraws settings, so when the modal
is already open `settingsModal()` swaps its insides rather than calling
`openModal()` again; opening it afresh would replay the pop-in animation on
every toggle, the same flicker the task panel once had. The modal has a fixed
height so switching tabs does not make it jump.

### Theme and accent

Two things vary independently: the neutral ramp (light or dark) and the accent
hue. Both live as attributes on the root element — `data-theme` and
`data-accent` — set by `applyAppearance()` from `prefs`. Theme "system"
sets no attribute at all, which is the only way the media query can keep
tracking the OS.

**The accent never touches the neutrals.** The page, panels, cards and lines
are fixed, plain greys in both themes; changing the accent changes only the
places that *are* the accent — primary buttons, the current page in the
sidebar, ticks, switches, selected options, progress, the date on the
dashboard. The greys once carried a trace of the accent, so every change of
accent repainted the whole page, and large accent washes (the dashboard's
welcome panel, the quick-add row, a category glow on board cards) did the
same; all of those are neutral now. Keep a new background out of the accent.

Dark follows ClickUp: a near-black `--ground` (#1B1B1D), board columns,
side panels a shade above it (`--surface-2`), the sidebar (`--rail`,
#141416) darker than the page, and cards, panels and modals a
clear step above those (`--surface`, #28282B) with a fine `--line`. A
mid-charcoal page was tried once and read as washed out: nothing can lift off
a ground that is already halfway up the ramp. Text is measured on the
lightest background it lands on, a hover fill or an accent tint.

Main sections — the calendar, the board, notes, the dashboard — are painted
`--canvas`, not `--surface`. In light mode the two are the same white. In dark,
`--canvas` is the ground, so the cards and panels on it (which stay `--surface`)
lift off it instead of everything sitting at one grey. Paint a new main area
with `--canvas`.

**One rule for every screen: sections are panels, what is in them is
cards.** A section on a page — a board column, a dashboard card, the list
table, a routine, a stats tile, an empty state — is `--panel` (the
`--surface-2` shade) with a `--line` border; a thing inside one — a task
card, the quick-add row, a note in the list, a hover — is `--surface`. The
dashboard once painted its sections `--surface` and read as a different app
beside the board. A new section takes `--panel`, and nothing but the accent
varies between screens.

Calendar blocks and chips take their category colour through `--ev-fill`,
`--ev-label` and `--ev-time`. Light mode puts a strong tint in the text; dark
cannot — a title that is 58% category colour on a dark block measured 5.3:1 and
read as mush — so dark makes the text mostly ink and lets the colour ride in the
fill, the edge and the icon. A finished item in dark swaps to the quieter time
tone (`--label-done`) rather than fading a light title into its block.

Anything tinted is derived with `color-mix()` from `--surface`, never
written twice, which is why `--tint-base` is a variable. Add a soft colour the
same way or it will be wrong in one of the two themes. An accent names three
shades and nothing more: on white the mid shade takes white text, on a dark
ground it vanishes, so the light shade becomes `--accent` and `--on-accent`
goes dark.

Those three shades are **not** in the stylesheet, one rule per hue. The accent
can be any colour the user picks, and no stylesheet can hold a rule for a
colour that does not exist yet — so `accentTrio()` works them out from a
single colour and `applyAppearance()` writes them onto the root element. The
CSS holds one default so the page has an accent before any script runs, and
`ACCENTS` in app.js is the palette: presets are just colours that happen to
have names. Clamps keep a bad pick readable rather than refusing it: each
shade moves in lightness until every place it is used clears 4.5:1 against
what it is *actually* used on — white text on the mid shade; the dark shade
as text on white and on the accent's own tint; the light shade as text on a
dark panel and on its tint, and under the dark on-accent text. Checking only
against plain white and plain grey is what let a black accent put black text
on a near-black tint. The check runs on the rounded colour, because rounding
alone can take 4.50 to 4.49.

**Accent as text is `--accent-ink`**, never `--accent` on a tint and never a
"dark" shade: it is the dark shade in light mode and the light shade in dark.
`--accent-2` used to be the dark shade in both themes and every use of it was
text, which is why it is gone. A pressed primary button is `--accent-hover`,
moved away from the text on it in either theme.

**Every other hue used as text has an `-ink` too** — `--amber-ink`,
`--apricot-ink`, `--danger-ink`, `--blue-ink` — half hue, half the theme's
ink. The bare hues are for fills, edges and icons. A category colour as text
uses the calendar recipe (`--ev-label`); a solid category fill under text uses
`--solid-mix`. Quadrants carry `--q` (hue) and `--qt` (text).

**Nothing is faded below AA.** A finished item is struck through and takes a
quieter colour that still reads (`--label-done`, `--muted`); `--done-fade` is
1 in light mode. The four text greys clear 4.5:1 on the darkest background
they can land on in either theme, for any accent. The steps between them are
tighter than a designer might like — AA leaves no room for a grey that is only
suggested.

`test/contrast.test.js` holds all of this: it lifts `accentTrio()` out of
app.js and sweeps some 450 colours through it, and reads the ramp straight out
of app.css and checks every grey on every panel. A colour change that breaks
AA fails `npm test`.

A swatch paints itself from `--dot`, set inline, and shows the shade the
theme in force would actually use. Reading `--a-base` in the rule was the old
bug: it resolves on `:root`, so every swatch showed whichever accent was
already chosen.

`src/timer.html` is a second window with its own stylesheet, so it cannot see
any of this. It is *told*: `syncTimerWindow()` sends the resolved theme as
`dark` in the payload and the window sets `data-theme` from it. That is why
changing the theme, changing the accent and the OS flipping at dusk all call
`syncTimerWindow()` — the media query in that file is only what shows before
the first message lands.

### Empty states

Every section says something when it has nothing, through one helper:
`es(kind, title, text, {mini, hue, icon, actions, cls})` (the empty states
section). Each has its own little drawing (`ES_ART`, drawn in the theme's
greys and the section's colour `--h`, so it follows light and dark), a
heading that says where things stand, one line on what to do next, and the
button that does it where one helps. `mini` puts it in a row inside a card.
Keep them distinct — the same icon and "Nothing here" everywhere read as a
broken page — and tell apart *empty* from *filtered to nothing*: the list,
routines and notes each say which, and offer the way back (clear filters,
show everything). The matrix quadrants (`QUAD_EMPTY`) and board columns
(`COL_EMPTY`) have a line each of their own.

## Conventions that exist for a reason

- **Icons and labels inside a clickable row need `pointer-events: none`.** Clicks
  landing on an inner SVG were breaking the category toggles.
- **Never use `confirm()`, `prompt()` or `alert()`.** They are blocked when the
  page runs inside the artifact sandbox and fail silently. Destructive actions use
  `arm(button, label)`, which requires a second click. The note editor's link
  button uses an inline bar, not a prompt.
- **Never hardcode a colour in a rule.** Every colour is a token on `:root`,
  including `--on-accent` (text on a filled colour) and `--tint-base` (what
  `color-mix()` mixes a category colour toward). A test enforces this.
- **Backups go to a folder the person chose, not Downloads.** `exportData()`
  writes into `prefs.autoBackup.dir`, asking for a folder first if there is
  none (`pickBackupFolder()`): the main process on the desktop, and in Chrome
  or Edge the File System Access API, its folder kept in IndexedDB (`BF`,
  `bfWrite()`; after the browser restarts it asks once before writing again,
  so an automatic backup there waits for that). Setup's All set step asks for
  the folder (`obBackupCard()`), which turns on a weekly copy. Only where no
  folder can be chosen (Firefox, Safari, the artifact) does it fall back to
  the artifact `downloads` capability, then a blob link; keep both working.
- **Dates** are `YYYY-MM-DD` strings in local time throughout. Use the helpers
  `ymd`, `parseD`, `addDays`, `startOfWeek`. Weeks start on Monday.
- **Eisenhower quadrant** is derived, never stored. `urgent` and `important` are
  `true`, `false` or `null`; both must be non-null for a task to enter a quadrant.
- The planner ships with **no personal data**. `blankState()` is the default and
  `sampleState()` is the optional demo content offered on first run. Do not seed
  real tasks into the file — a test checks for this.

### Responsive behaviour

Three widths. Above 1080px the rail is full width. Between 821 and 1080 it
collapses to icons. At 820 and below it becomes a drawer over the view, toggled
by `data-act="rail"`, which adds `rail-open` to `<body>`; `closeRail()` clears it
when a nav item is picked.

Only one rule ever sets the rail's transform — `body:not(.rail-open) .rail` —
rather than a base rule plus an override. Keep it that way; it is easier to reason
about and avoids a cascade fight.

## Desktop-only features

The floating timer needs a second always-on-top window and the vault sync needs
a real filesystem, so both live behind `window.orbit` from `preload.js`.
`hasDesktop()` gates the UI: in a browser those controls are hidden or say
plainly that they need the desktop app. Never let a `window.orbit` call run
unguarded — the browser build is not a degraded mode, it is the common one.

`ipcMain.on("timer:state")` carries traffic **both** ways on one channel: a
payload with `cmd` is a button press on the floating window heading for the
planner, anything else is state heading for the widget.

## The two places this code runs

The same sources are both the desktop app and a published Claude artifact
(a hosted web page). Code must degrade gracefully when `window.claude` is absent,
which is the desktop and plain-browser case. Test a change in both if it touches
saving, downloads or dialogs.

## Gotcha when testing in a headless or hidden browser pane

CSS transitions do not advance while the pane is hidden, so a transitioning
property reads as stuck at its start value and `getComputedStyle` lies about it.
Check `element.getAnimations()` before concluding a rule is broken, or measure
with `style.transition = "none"`.

## Releasing

**Never bump `version` by hand, and never push a tag by hand.** One command
does the whole thing:

```
npm run release patch    # ordinary work: a fix, a refinement, a small addition
npm run release minor    # a major change: a new view, something people notice
```

It refuses unless the working tree is clean, you are on `main`, you are up to
date with origin, and the checks pass — and it changes nothing until every one
of those holds, so a refusal is always safe to ignore and retry.

Then it raises the version, commits, tags, and pushes. The workflow takes over
from the tag and publishes the installers, the single-file build, and the
`latest.yml` metadata that installed copies read.

### Why the version only moves here

The number moves during a release and at no other time. Commits and pushes in
between leave it alone, so **every number that exists is one somebody can
download** and the releases page reads straight through with no gaps. Bumping
per push was tried first and produced exactly those gaps.

Several pushes therefore share a version between releases, which is safe
because installers only ever come from the release workflow. **Do not build
installers locally and give them to anyone** — that is the one way two
different builds could claim the same number, and an installed copy decides
whether an update is newer by comparing exactly that.

Renumbering a release that people already have is worse than a gap: publishing
a lower number than an installed copy is running strands it, because it
compares the two and concludes it is already newer. The workflow runs the
checks, builds on all three platforms, and publishes a release with the
installers, the single-file build, and the `latest.yml` metadata that
electron-updater reads. See DEVELOPMENT.md for code signing.

## Worth doing next

- Code signing certificates, so the SmartScreen and Gatekeeper warnings go away.
- Widen `test/` beyond convention guards — there is no coverage of the date
  helpers, recurrence logic or filtering, which is where the real logic lives.
