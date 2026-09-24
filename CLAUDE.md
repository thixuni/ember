# Ember

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
`dist/ember.html`, a single file that runs from a double-click. Keep it
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
files, Link task, Duplicate task, Activity history, then Delete task apart
from the rest (it asks twice). The panel has no tabs: Activity history takes
the details' place with a Back to details link (`V.sheet.tab`).

**Everything else has a right-click menu too** (`ctxMenu(items, at, btn)`,
the right-click menus section): a routine wherever it shows — its card,
the calendar, the dashboard (`routineItems()`), a note (`noteItems()`),
unavailable time (`awayItems()`), a category in the sidebar (`catItems()`)
and a board lane (`laneItems()`). Items are `{icon, label, run, danger,
arm}` or `"sep"`; the thing's own actions first, deleting last, asking
twice. A routine card's ⋯ opens the same list. Text fields keep the
browser's own menu. Add a new kind of thing to the one `contextmenu`
listener there.

**Guided tips** (`TIP_TOURS`, `tipCheck()`, the guided tips section): one
short tour a screen — two to four pointers with Next and a count — played
the first time that screen is opened and never again. One long queue across
the whole planner was tried first, and a pointer about the sidebar landing
in the middle of learning the calendar lost the thread. A tour is a
section’s own: leaving half way keeps its place (`prefs.tips.at`),
finishing or skipping marks it done (`prefs.tips.done`), and Settings ▸
Appearance ▸ Show the tips again clears both. A step whose thing is not on
the screen is passed over, and a tour with nothing left to point at counts
as given rather than waiting for ever. They wait while setup, a window, a
menu or the task panel is open, or the window is hidden, and never take the
keyboard. A new tour is an entry in `TIP_TOURS` with a `where()` and its
steps.

**The sidebar folds** to its icons (`prefs.railMini`, `applyRail()`,
`body.rail-mini`) from the round button on its edge, shown on hover; open is
the default, and below 1080px the width decides instead. Parts switched off in Customise are left out; from a card it
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
`<vault>/Ember/<title> <id>.md` with YAML front matter carrying
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

Timing a task means it has begun: `startTimer()` moves a task still in an
earlier lane to the lane for work in hand (`workLane()`, found by a name
like "In progress" or "Doing", since lanes are the person's) and says so in
a toast. A task already past that lane, or done, stays where it is.

The timer is drawn as a small orbit, in the top bar (`timerBar()`) and in
the floating window: a ring filling against the estimate, a planet at its
end (lapping once a minute with no estimate or once over), hollow when
paused. Both are one line — the floating one is a capsule of two lines at
most, 320×76 with its shadow — and their controls appear only on hover:
Stop and Pop out in the bar, pause, stop, open and hide over the clock in
the window, whose clock then moves into its second line. The floating
window has no system drag region, because one swallows the hover; it is
moved by hand (`drag-start`, `drag`, `drag-end` commands on
`timer:state`, handled in main.js before anything is forwarded).

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

The routine window (`routineModal(id, preset)`) is one short form: the
name; Time, How long and Category as three labelled fields; then Repeats,
one drop-down (Every day, Weekdays, On chosen days, Every few days) with
the week under it, lit for the choice. Tapping a day makes it On chosen
days, or Every day or Weekdays again when the days match (`rtRepeat()`
and the `r-day` case); Every few days shows its gap instead of the week.
Reminder, start, end and Paused sit under More options, always closed at
first. "At 9am For 30m In Personal" as a sentence read as a puzzle, and
four tabs with nothing under two of them looked broken.

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

Tasks has no row of quick filters (All, Today, This week…): they read as
noise over every board and list. **Filter** and **Customize** sit in the top
bar beside Board and List; Filter opens the panel (`filterBar()`, `V.adv`)
and, once shut, any filter still set shows as a chip with its own ×.

How tasks work is the person's to set, in one window opened from
**Customize** beside Filter in the top bar (`customiseModal()`, the customise section).
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
  (`qaCard()`, `V.qa`), kept as plain as a name: the name; category and
  priority as dashed pills, empty until picked (`qaMenu()`); then round
  icons for start date, due date, estimate and files, each only if its
  switch is on, showing its value once set. No category picked means Other.
  Enter adds the task and leaves the card open, keeping the date and
  category; Esc or a click away from an empty card closes it. Files creates
  the task first (a file needs a task to belong to). `renderView()` puts
  the caret back (`qaRefocus()`). The side panel is the detail and edit view.
- **A category pill is a button** where it belongs to a task or routine
  (`catChip(id, kind, of)`, the board card's `.tc-cat`): it opens a short
  list of categories (`catMenu()`) and changes it in place.
- **A lane scrolls its own cards.** The board scrolls sideways only; each
  lane is full height and its card list scrolls inside it (`.col-list`),
  so every lane's heading and its Add task stay where they are however
  long one lane gets. Its scrollbar sits inside the lane, level with the
  heading’s own edge, with the cards stopping 10px short of it, and is
  drawn only while the pointer is on the lane.
- **The list view** (`viewList()`) is a table per group, each a card with
  its own headings and its own + Add task. What it groups by is the
  person's, in Customize ▸ List view (`board().lgroup`, `lgChoices()`):
  start date or due date (a table a month, the empty ones last), status,
  category, priority, a field of their own that is a date, a single choice
  or a checkbox, or nothing. Only fields switched on are offered; with none
  picked, or the pick switched off, it is the start date, then the due
  date, then status (`lgBy()`). `lgOf(t, g)` says a task's table and
  `lgPreset(g, k)` what a task added under it gets, so it lands there
  (`V.lqa` is the table). A single heading over lane sections was tried and
  taken back: a group reads on its own. Customize ▸ List view also holds
  the column order, moved out of Task details, as a plain list of the
  columns with a handle each — a strip drawn like the list's own heading
  sat above it and read as a second thing to set. Every cell is edited in place
  (`lrCell()`): the name by clicking it, which puts the caret where the click
  landed rather than selecting the lot (`V.lrename`, `lrCaretAt()`) and
  leaves the panel shut; **the row opens nothing at all** (it carries
  `data-task`, not `data-act="task"`): the panel is Details’ job, at the end
  of the task column, or the right-click menu’s; dates from the
  picker, priority, lane and estimate from a short list, tags added by the box
  the Tags cell offers on hover — “Add a tag” where there are none, “Add”
  after the ones there are, never a plus stranded in the middle of the
  cell (`V.ltag`) — and removed, fields in their own controls. **An empty cell is
  empty** — no dash, no "Pick a date" (`dateField(..., {ph:""})`) — and
  hovering one shows only its control, centred in it. The task column ends
  in a set place for Details, shown on the row's hover: the name
  is always cut where it begins, so a long name never runs under it. Changing
  lane is the Status cell's job; a Move button beside Details repeated it.
  Every cell starts where its heading does — text and labels alike, the
  pickers' own padding taken back with a negative margin. Status is a label
  in its lane's colour, like priority; the category label has no arrow here.
  The tick and task columns stay put when the list scrolls sideways
  (`.lr-lead` and `.name`, sticky, flush with the edge; `lr-x` draws their
  edge once scrolled). `.ltable` is `overflow: clip`, not `hidden`, or
  they would not stick.
  **A heading click sorts** A to Z, then Z to A, then back to the usual
  order (`board().lsort`, `lrSorted()`: within each month, empty cells last
  either way); Enter does the same on a focused heading. Column widths are
  variables on the page (`--w-<col>`), dragged at a heading's edge and kept
  in `board().colW` (a click just after a resize does not sort); a heading
  dragged along reorders `board().cols`, which Customise shows.
- **The list's columns** are `board().cols` (`{k, on}` in order, a field as
  `"cf:<id>"`), read through `listCols()`, which sets `on` from the panel; the row grid is built from them,
  so a hidden column takes no room.

### When a task happens

Put the way Google Calendar puts it. A task has a **date** — stored as
`due`, a name older than the idea, and what places it on the calendar, on
the dashboard's today and in overdue — and on that date it is either **all
day** (no `dueTime`) or runs from a **start** to an **end time** (`dueTime`,
`endTime`). **That is the only date a task has.** A second one, the day it
was due by (`deadline`), sat under it with a switch of its own and was taken
out: people read the two as two deadlines, and the wrong one was always the
one being looked at. A task is overdue when its date has gone
(`isOverdue()`). `tSpan()` gives the start and end in minutes — a start with
no end, from before tasks had one, is half an hour. Old planners keep
whatever is in `deadline`; nothing reads it.

A reminder counts back from the start time when a task has one; without
one — no date, all day, or the Date row switched off — it is set for a day
and a time of its own (`remindAt`, "YYYY-MM-DD HH:MM", which a timed task
can choose too), and `buildReminders()` fires it then.

In the panel it is the **Date** row: the date, then start – end on one line,
"All day" beneath, as Google's event form has it, behind the `when` switch
in Customize. A new start time keeps the length the task had; the end
time's list starts after the start and says how long each choice makes it.

A planner still on the ten categories it started with, untouched
(`OLD_CATS`: id, name and colour), moves to the five (`baseCategories()`) in
`fixCats()`, also run from `render()`; tasks, routines and notes follow
`OLD_CAT_TO`. A set anyone has changed is left alone.

The form once had a *start date* beside the due date. `fixTasks()`, run at
the top of every `render()` and harmless to repeat, moves any that remain:
the start date becomes the date.

On the calendar, a task with a time is a block in the week grid with its
tick box in the corner (kind `"task"`, added in `weekGrid()` beside Google's
events — **not** in `eventsFor()`, for the reason given under Google
Calendar); all-day tasks stay in the band across the top, and in the month
a timed task is a line with its time. **Dragging down an empty stretch of a
day makes a task** for that time, as in Google Calendar (`DG`): quarter-hour
steps, a click without a drag makes an hour, and the placeholder stays on the
grid until the new thing is made or abandoned. Letting go opens a small
card beside the stretch, as Google Calendar's does (`qcOpen()`, the quick
create section; `QC`): a name, then **Task**, **Routine** or **Unavailable**
across the top, and only the fields that matter for each — a task's date,
start and end, category and priority; a routine's time, length, how it
repeats (every day, weekdays, or that weekday) and category; unavailable
time's date and hours. Enter or Save makes it, More options carries what is
typed into the task panel or the routine window, and a click away or
Escape drops it with the placeholder. Unavailable time is
`prefs.away` (`{id, date, start, end, title}`, so it goes with backups),
drawn hatched in the greys in the week and as a hollow-dot line in the
month; clicking it opens the same card to change or delete it. It is the
planner's own and is not synced to Google. The once-a-minute redraw of
the week waits while a drag or a placeholder is on it. Google Calendar sync
writes a timed task as a timed event and reads times back from it; the
date and its times are all there is to sync.

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

Categories are edited in one window (`catsModal()`, from the pencil by the
sidebar's Categories): a row each, dragged by its handle to reorder; the
icon and colour open their choices under the row (`V.catEdit`), with any
colour through Custom; the name is typed into. Hide, Show only this and Delete
are behind the row's ⋯, and Delete asks in the row, saying where its
tasks go. A second window for name, colour and icon, and a Shown label and
count on every row, were taken out. The sidebar has no "None"; "Show all"
appears only while something is hidden.

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

- **How it looks. Setup is lit by one fire.** `obFlame(cls, color)` draws
  the brand's flame -- three still layers, body, middle and core, taking
  their colour from `--c` and the two warm tokens `--flame-mid` and
  `--flame-core` (see The brand: it is the logo, so it does not flicker).
  The sign-in is a hearth
  (`obSky()`, kept by that name): the flame with the wordmark tight under
  it -- the flame is drawn in the top four fifths of its box, so `.obx-fire`
  is pulled up past the hero's own gap by a measured negative margin and
  its glow is a `::before` so it stays behind the flame -- over
  warmth banked at the foot of the page, embers rising off it in the accent
  and the category colours, and the planner's parts drifting among them. Each
  ember carries its own size, drift, pace and a negative delay, so they are
  already in the air when the page opens. Every later step stands over the
  same fire more faintly (`.obx-warm`, twelve embers, behind everything and
  taking no clicks), and its step on the track is a small flame rather than a
  dot. Turning orbits stood here while the planner was called Everyday Orbit;
  the rings, planets, core and burst they needed are gone. Every later step
  is a question on the left and, on the
  right, a live picture of the answer (`obShow()`): the greeting with the
  name being typed,
  the week filling in as routines are ticked -- a day kept is simply its
  colour; a little flame in each square was tried and read as decoration on
  a control -- the app in miniature in
  the theme being chosen, a
  reminder arriving and the day as a 24-hour clock with quiet hours shaded,
  and a bonfire at the end (`obShowDone()`: sparks off a blaze, the name on
  the hearthstone, what was set up as logs beside it). The steps run along a track at
  the top that can be clicked back along; Enter moves on; the footer sticks to
  the bottom. A step's entrance plays only when the step changes
  (`OB.drawn`), and `OB.pop` animates only the routine just ticked — a redraw
  replaying every animation made each click look like a new page. All of it
  stops under `prefers-reduced-motion`. Live bits that must not cost the caret
  (the greeting, a category's name under its flame) are written into the DOM by the
  `input` listener rather than redrawn.
- **Categories is the one step with no picture beside it**, because its
  answer *is* the thing being edited: `obShow()` returns nothing for it,
  `obRender()` leaves the `<aside>` out and the stage takes the whole width
  (`.obx-stage.one`). `obCats()` draws **a list, a row a category**
  (`.obx-crow`), each washed from the left in its own colour -- the
  gradient, the border and the name (through the calendar's `--ev-label`
  recipe, so any colour reads in either theme). **Every colour is on the
  row**: twelve dots, the one in force ringed, one click to change
  (`ob-cat-swatch`) with nothing to open and nothing to remember. Only the
  icons need the room of a grid, so the tile opens those under the row, ten
  to a line (`ob-cat-icon`, `.obx-ico`; a pop-over was clipped by the foot
  of the page, and "as many as fit" left the twentieth stranded). The same
  `CAT_COLORS` and `CAT_ICONS` the planner's own category window offers.
  The name is typed straight in, a cross drops it, and an Add category row
  sits at the end; under 700px the colours take a line of their own
  (`grid-template-areas`). Two shapes came before: chips beside a row of
  flames, which fell apart the moment anyone had more than six categories,
  and a grid of tiles, which read as loose boxes with a lot of air and one
  stranded Add card. Rows stack, so any number is fine. Any step that has
  nothing worth showing can do the same by returning "" from `obShow()`.
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
- **Settings ▸ Account ▸ Run setup again** (`setup-again`) replays the whole
  flow on a planner that already has one: it writes `onboard` as
  `{done:false, step:"signin", mode:"new", made:[]}` and calls `obStart()`,
  so every step shows rather than the short `returning` one. Nothing is
  thrown away — categories keep their names, routines setup did not create
  are left alone (`made` is empty, so it replaces nothing), and tasks are
  untouched. Restoring a backup marks setup done, which is why someone who
  restored never sees it otherwise.
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
- **Colours** open the planner's own picker (`cpOpen()`, the colour picker
  section), never `<input type="color">`: the accent, a category, a lane
  and a field's option. It opens from the multicoloured swatch (`cpSwatch()`,
  the spectrum until a colour of one's own is set, then that colour ringed
  in it), in the panel colours of the theme: a shade square, a hue strip, a
  preview, the colour code to type and a dropper where the system has one.
  A drag shows as it goes (`onLive`), letting go or Done keeps it
  (`onDone`), Escape puts back what was there. Its code sits after the
  accent section on purpose: `test/contrast.test.js` lifts the colour maths
  out by position, and code that touches the page cannot sit in that stretch.
- **One width for every short value in the task panel** (240px): the date
  boxes, the category and reminder drop-downs and the estimate. The width
  goes on the box round a field (`.pkf`), never on the button inside it,
  which shrinks to its words; and `min(240px, 100%)` only where the parent
  has a width of its own — inside the Start row the parent is
  shrink-to-fit, so the percentage resolved to the words and the row came
  out short.
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

**The brand.** Ember opens on Ember orange (`#E8622A`, first in `ACCENTS`),
which `accentTrio()` pulls to `#C94B16` — the brand’s Ember Deep — so white
text on a filled button clears AA; the CSS holds that trio as its default
(`--a-base`, `--a-dark`, `--a-lift`). Anyone who has picked another accent
keeps it. The neutrals stay the plain greys they were: the brand’s warm Ash
Rose and Char belong to the download page and anything outward-facing, not
to a planner whose accent may be any colour.

**The mark is a flame, and it is the same flame everywhere.** `obFlame()`
draws it large on setup's first page in three layers; `i-ember` in the
sprite is that same outline in one colour, the flame's outer layer scaled
from its own 40×58 box into 24×24 (`translate(2.56 .55) scale(.473)`,
copied into `scripts/make-icon.js` too) with the inner teardrop punched
out so the tile shows through, which is what keeps it reading as a flame
at 14px. **The punch is two subpaths in one `d`**: `fill-rule="evenodd"`
works within a single path, and as two `<path>` elements the core simply
painted on top. `npm run icon` redraws `build/icon.png` and
`build/icon.ico` from the same shape, and docs/index.html carries a copy.
**It never moves.** The three layers each flickered at their own pace
once; a mark that is a different shape every time you look at it is not a
mark, so the flicker is gone and only the embers drifting behind the page
still move. An ember spark -- a coal with a tongue of flame and a loose
spark -- was the mark before this. The wordmark is “ember”, lower case, in **Bricolage Grotesque**
(`--fw`, the `.wordmark` class and `.brand-name`) — the third face, used
for the wordmark and nothing else; headings stay Gabarito and text stays
Plus Jakarta Sans.

Two things vary independently: the neutral ramp (light or dark) and the accent
hue. Both live as attributes on the root element — `data-theme` and
`data-accent` — set by `applyAppearance()` from `prefs`. Theme "system"
sets no attribute at all, which is the only way the media query can keep
tracking the OS.

**Light is the planner's own default, and only the person changes it.** A
new planner is `theme:"light"` and every fallback reads `|| "light"`, not
`|| "system"`. `src/index.html` and `src/timer.html` carry
`data-theme="light"` on `<html>` so the page is light before a line of
script runs — without it the dark media query paints a dark page on a dark
computer for the moment before `applyAppearance()`. The planner followed
the computer before, which is nobody's choice, so a planner still on
"system" with no theme picked is moved to light once at start-up, before
`applyAppearance()`; `prefs.themeSet`, written by `set-theme` whenever
anyone picks a theme — **including "Match system"** — is what tells the two
apart, exactly as `launchSet` does for the page the planner opens on.

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

- **US English** in everything a person reads: color, customize,
  organize, prioritized, check off (not tick). Dates are written the
  American way, `fmtDate()` giving Sep 25 (Sep 25, 2027 in another year)
  and `pkDateText()` Fri, Sep 25; `toLocale*String` is always `"en-US"`.
  Code names older than this (`customiseModal`, `data-act="customise"`)
  are left alone.

- **Rows are reordered by their handle only** (`.cz-grip[data-grip]`: lanes,
  the list's columns, categories): dragged, or moved with the arrow keys
  once the handle has the keyboard. Up and down buttons beside it were a
  second way to do one thing and were taken out.

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

Renumbering a release is the one exception, and it has happened once: the
batch published as 1.2.0 on 21 September was rebuilt as 1.1.1 the next day
and the 1.2.0 release deleted, to keep 1.2.0 for the rebrand to Ember. It
was safe only because the single installed copy was rebuilt by hand
afterwards. Do not do this once anyone else has the app.

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
