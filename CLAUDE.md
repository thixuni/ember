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
  **`putScroll()` puts the box it just restored back into that set**, which
  is honest -- it is a scrolled box. `SCROLLED` holds node references and a
  redraw replaces every node in the viewport, so without it a position
  survived exactly one redraw (the one straight after you scrolled) and was
  lost on every redraw after that: scroll a board lane, change one card's
  category and it held, change a second card's and the lane jumped to the
  top, as did anything else that redrew in the meantime -- the minute tick
  on the calendar, a sync landing, reminders rebuilding. The task panel
  keeps its own position in `renderSheet()` and does not go through this.
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
the right-click menus section): a routine wherever it shows -- its card,
the calendar, the dashboard (`routineItems()`), a note (`noteItems()`),
unavailable time (`awayItems()`), a category in the sidebar (`catItems()`)
and a board lane (`laneItems()`). Items are `{icon, label, run, danger,
arm}` or `"sep"`; the thing's own actions first, then **Move to
<workspace>** (`wsMoveItems()`), deleting last, asking twice. A routine
card's ⋯ opens the same list. Add a new kind of thing to the one
`contextmenu` listener there.

**Text keeps the browser's own menu** -- cut, copy, paste, and the spelling
suggestions on a word with a red line under it. The listener returns early
for `input, textarea, select` and any `[contenteditable]` that is not
`false` (written that way, not `='true'`, because an editable set from
script can be spelt either way). **On the desktop that menu has to be built
by the app**: `spellcheck:true` gives Electron the red underline, but
Electron ships no context menu of its own -- Chromium's is part of the
browser, not of the engine -- so right-clicking a misspelled word did
nothing at all and there was no way to see what it thought you meant.
`attachEditMenu()` in main.js builds it from the `context-menu` event:
the suggestions, Add to dictionary, then the edit roles. It only ever fires
where the page let the right-click through, because a `preventDefault()` on
the DOM event stops the renderer asking for a menu at all -- so the
planner's own menus still win.

The things that deliberately have **no** menu: tracked time on the calendar
(a record of what happened, not something to change), Google's own events
(not ours), a checklist step in the list (it is not a task), and a task
inside the panel (the ⋯ in its header is the way in).

**Guided tips** (`TIP_TOURS`, `tipCheck()`, the guided tips section): one
short tour a screen — two to four pointers with Next and a count — played
the first time that screen is opened and never again. One long queue across
the whole planner was tried first, and a pointer about the sidebar landing
in the middle of learning the calendar lost the thread. A tour is a
section’s own: leaving half way keeps its place (`prefs.tips.at`),
finishing or skipping marks it done (`prefs.tips.done`), and Settings ▸
Appearance ▸ Show the tips again clears both. A step whose thing is not on
the screen is passed over, and a tour with nothing left to point at counts
as given rather than waiting for ever. **That forgiveness hides a broken
tour**: the Notes tour lost its opening tip when the New note button was
taken out of the list's head, and it simply began at "2 of 2" instead of
failing. A step should point at something that is on that screen whatever
state it is in — the top bar rather than a list head that only exists once
there are tags — and **moving or renaming anything a step points at means
running the tours.** So does changing what a step's words describe: the
routines tour told you the foot of the card showed the reminder for a
while after the reminder had gone. They wait while setup, a window, a
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

**An attachment opens in the planner** (`fileModal()`, `FV`, the file
viewer section). Clicking its name used to call `shell.openPath` and hand
it to Preview or Acrobat, which is a long way to go to check what is in a
PDF you attached a minute ago. The system's own app is a button inside the
viewer now rather than the only way, beside **Show in folder**.

- **The bytes come through the bridge**, not through a URL: `file:read` in
  main.js returns the file as an ArrayBuffer and the page makes a blob of
  it. A `file://` iframe inside a `file://` page is blocked, and a data URI
  of a 20MB PDF is not a thing to put in the DOM. It is a `File`, not a
  plain `Blob`, so the viewer's own download button saves it under the name
  it was attached with.
- **`plugins: true` is on the window** (main.js). Chromium's PDF viewer is
  a plugin and Electron leaves plugins off, so a PDF in an iframe rendered
  as an empty box without it.
- **Four kinds are shown and the rest say so**: a PDF in an iframe (which
  brings Chromium's own page nav, zoom, print and download), an image
  centred on the panel grey, plain text as it is, and a **spreadsheet** as
  a table (`FV_PDF`, `FV_IMG`, `FV_TXT`, `FV_XL`, `FV_CSV`, by extension
  or mime). Anything else -- a .docx, an archive -- gets a line naming the
  kind and pointing at the system's app. So do a file that has been moved
  or deleted since it was attached, one too big to copy through IPC (over
  40MB), and one whose planner is open on a different computer from the one
  it was attached on. A file of a kind the viewer *does* read that will not
  read says something different ("This one would not open"), because that
  is a different thing from a kind it never reads.
- **A spreadsheet is read with nothing installed.** An `.xlsx` is a zip of
  XML, and `DecompressionStream("deflate-raw")` inflates it (`unzip()`,
  `inflateRaw()`) while `DOMParser` -- already here for pasted HTML --
  reads it. So it needs no 400KB library and does not break the no-bundler
  rule. Only the parts asked for are inflated. **Zip64 and encrypted
  archives are not handled**; they fall through to "This one would not
  open", which is honest. The same machinery would read a `.docx`, which
  is the same kind of archive, and that is the obvious next one.
- **What `readXlsx()` resolves**: shared strings (`xl/sharedStrings.xml`),
  inline strings, booleans as TRUE/FALSE, a formula's **cached value**
  (never the formula), and **serial dates** -- a cell whose style carries a
  date number format is a day, not 46023, worked out from
  `xl/styles.xml`'s `cellXfs` and `numFmt`. Sheets come in the book's own
  order through `xl/_rels/workbook.xml.rels`, and a tab each shows where
  there is more than one. **No formatting, no charts, no formulas, no
  editing** -- it is a reader.
- **It is drawn as a spreadsheet**: lettered columns across, numbered rows
  down, both pinned while you scroll, gaps in the row numbers kept so row 6
  is row 6. A big sheet is cut at `XL_ROWS` (400) and `XL_COLS` (40) with a
  line saying how much is not shown. A `.csv` goes through the same table
  (`readCsv()`, quoted fields and all), because a grid is what it is.
- **The height is on the modal**, not on each kind of body: giving the
  bodies their own heights inside a flex column that already had a
  `max-height` collapsed the iframe to a sliver. `.mbody` does not grow on
  its own either, so `.fv-body` carries `flex:1`.
- **The blob is revoked when the viewer closes** (`fvDrop()` from
  `closeModal()`), and a read that lands after the viewer has moved on is
  dropped (`FV.id`).
- Adding a bridge call means adding it in **three** places -- preload.js,
  main.js and the `surface` map in `test/smoke.test.js` -- and the test
  fails until all three agree.

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

**A routine can repeat monthly**, on a day of the month, which is what a
bill is. `freq:"monthly"` with `r.dom` (1--31), picked in words ("On the
1st of every month") rather than as a bare number, since a lone "1" reads
as a count of something. The one real question a monthly rule asks is what
to do with a month that has no 31st: `domIn()` uses that month's **last
day**, because that is what a bill due on the 31st means -- skipping those
months instead would quietly drop four payments a year. It is gated in
`routineOn()` like every other rule, so the calendar, the missed lists, the
streak walk and the reminders follow without knowing it exists, and a
streak counts times kept, so it reads "12 times". **One occurrence cannot
be dragged off its day** -- the same restriction Every few days has, and
for the same reason: there is no weekday to carry. Google gets
`FREQ=MONTHLY;BYMONTHDAY`, and a day past the 28th is written as
`BYMONTHDAY=-1`: Google skips a month with no 31st rather than falling back
to its last day, and -1 is how a calendar says "the last day", which is
what the planner means.

A routine's schedule is a plan, not a rule. `routineOn(r, d)` says when it
is *due* — reminders, the calendar's recurring events in Google and the
missed list all go by that — but any day's square up to today can be ticked (a day still to come
cannot be yet: the streak counts back from today, so a tick there changed
nothing; one already ticked can be taken off), and
`routineHere(r, d)` (due, or done anyway) is what decides where it *shows*:
the calendar, the dashboard's today and the day popup. A day it was done
counts towards the streak, scheduled or not; an off day left empty is
neutral; today is neutral until it is over; a scheduled day missed ends the
streak unless `madeUp()` finds it done on an off day after it and before the
next day it is due. That window is one per missed day, so one extra tick
never covers two, and a made-up day is not listed as missed either.

**A missed day can be let off.** `skipMap()` is `prefs.skips`, keyed
`"<routine>|<date>"` — in prefs like unavailable time, so it goes with
backups and Drive without a tenth entry in `KEYS`. A skipped day is
neither done nor missed: `routineOn()` still says it was due, but
`skippedR(r, s)` takes it out of the catch-up lists, out of the days
counted as due, and out of the way of a streak, so a week off does not end
one. `skipBtn()` puts it on every missed row in the calendar's Catch-up
panel and the dashboard's Missed routines, and it **asks twice**
(`arm()`), because it quietly changes what the streak counts and the toast
carries no undo. The way back is **Don't skip this day** in that day's
routine menu — right-click it wherever it shows, which a skipped day still
does. Checking a skipped day off clears the skip with it: a day cannot be
both let off and kept.

**One occurrence can be moved.** A routine repeats, so a block dragged off
its day or its hour has to say which occurrences were meant, and
`rtMoveModal()` asks the way Google asks, with the old time struck
through under the new one so the change is on the page rather than in the
head:

- **This one only** writes `prefs.rtMove`, keyed `"<routine>|<date>"` by
  the day the occurrence *left* and holding `{d, t}`, the day and time it
  now sits at — in prefs with the skips, so it travels with backups
  without a tenth entry in `KEYS`. The routine itself is untouched.
- **This and the ones after it** ends the routine the day before and
  carries a copy on from this day at the new time. A split, so the copy
  starts its own streak — the same trade Google makes. With nothing before
  that day there is nothing to split, so it just edits the routine.
- **Every one** changes the routine's own time, and its weekday with it if
  the day moved.

**The move is gated in exactly one place**, `routineOn()`: a day an
occurrence left is no longer due and the day it landed on is, decided
before the start and end dates are looked at, because a move is an
instruction about that one day. Everything asks `routineOn()`, so the
calendar, the missed lists, the streak walk and the reminders all follow
without knowing any of this exists. The map is keyed by the day left, so
drawing a day needs the other direction too — `ixMovedOnto()`, built once
per change like the other lookups, leaving out a move within the same day
because that day is due as it always was and only its hour changed.
`rtTime(r, s)` is the hour an occurrence actually sits at, and **every
reader of a routine's hour goes through it**, never `r.time`: the week
grid, the day popup, the dashboard's schedule, up next, the day strip and
`buildReminders()`. Two of the same routine cannot share a day —
completions are keyed by the day, so the second would have nowhere to
live — so a per-occurrence move onto a day it already falls on is refused.

**Google Calendar does not know about this yet.** The sync writes a
routine's *series* time, so an occurrence moved on its own is local only.
Recurrence exceptions are the way to fix it, and worth doing.

**A streak has no ceiling.** `streakNow(r)` walks the whole history in one
pass — from `firstDayOf(r)` (the routine's start, or its first tick,
whichever is earlier) to today — and returns the run still going, the best
there has ever been, every run it has had, how many times it was kept and
how many of the days it was due. `streakStats()` memoises that per routine
in the lookups, so every card in a redraw costs one walk; `streak(r)` is
just its `cur`, and nought for a paused routine because the card says
Paused in that corner instead. It used to walk back 366 days and `madeUp()`
forward 60, which capped a year-old streak and meant a routine due twice a
year could not be made up at all. The only limit left is a guard against a
date that cannot be real. Nothing prunes `S.completions` by age, so a
planner that has been running for years counts all of it.

**The card shows one week, and you can walk back through the others.**
`V.rweek[r.id]` is how many weeks back that card is, kept per routine and
not saved: you step back to fill something in, and next time the page opens
it is on this week, where the work is. `weekLabel()` says "This week" while
you are on it and the days it covers otherwise, naming the month twice only
when the week straddles two. Stepping back has no floor, because a routine
can be filled in long after it was made, while forward stops at this week,
where the days still to come say nothing you can act on.

**The week is one block** (`.rwk`): the week named on the left, Today and
the two arrows together on the right the way a calendar toolbar is laid
out, then seven equal columns (`grid-template-columns:repeat(7,1fr)`) so
the weekday and its square sit on one centre line and the row ends where
the card does, **each column one whole day**: its weekday over its date in
a single tile (`.rday`) that fills the column. Three shapes came before
it. The arrows were either side of the label with Today after them, which
stranded the forward arrow in the middle of the row. The columns were a
fixed 30px in a flex row, which left a ragged edge no card lined up with.
And the weekday letters were a row of their own above a row of squares --
three stacked things per day, and a 32px square centred in a 51px column
left 24px of air between days that read as seven islands rather than a
week. `.rweek .icon-btn` sets `padding:0`: the base `.icon-btn` carries
`padding:0 10px` for the wide ones, which pushed the chevron 11px from one
edge and 1px from the other once the button was made square.

**The streak log** (`streakModal(id)`, `V.slog`) is the rest of the
history. It opens from the streak on the card — a button, there at nought
too, so the way in does not appear only once you are already going — and
from **View streak log** in a routine's menu anywhere it shows. Inside:
four numbers, then **the year as twelve calendars**, every day under its own
weekday in its own month with its date on it. Over them, one bar
(`.slog-bar`) holding the key and the year picker, and it **sticks to the
top of the modal body**: on a screen short enough to scroll, the thing
that says what the colours mean should not scroll away from the colours.
A sticky child settles below the scrolling box’s own top padding, so a
`::before` covers that band -- the stat tiles slid through it on their way
past. The picker stops at the first tick and at this year. "Every day
since <the first tick>" held that line for a while and said nothing the
calendars below it do not. It was one wall of weeks, a column each,
the way a contribution chart is drawn — and a column that straddles two
months has to be labelled with one of them, so the week of Mon Sep 28 was
labelled October and a day ticked on Sep 29 looked like it was in October.
There is nothing left to work out now. Six months to a row rather than as
many as fit: twelve left 5, 5 and 2, and the short last row read as
something missing.

Every square is a real `routine-done` button, so a day pressed there goes
through the same handler as a day pressed on a card, and `render()` draws
the log again (the way it redraws the day popup for `V.peek`) because the
numbers above it have just changed. The modal is `.modal.slog` rather than
`wide` so a whole year fits without the body scrolling on a normal screen.
A list of every run the routine had ever had was under it for a while and
was taken out: the calendars above it already are those runs, and the two
that matter are the first two numbers.

**A streak counts times kept, not days**, and `streakUnit(r)` says which
word to use: a run of 38 on something due every day is 38 days, but a run
of 28 on a weekly review is 28 Fridays — near enough six months. Everything
that puts the number into words goes through `streakSays()`. `.sq.done` uses the category colour nearly
neat rather than the week squares' recipe: those mix toward the ink because
they carry a check mark, and at 13px with nothing on it that read as black.

### Workspaces, and customising tasks

Tasks has no row of quick filters (All, Today, This week…): they read as
noise over every board and list. **Filter** and **Customize** sit in the top
bar beside Board and List; Filter opens the panel (`filterBar()`, `V.adv`)
and, once shut, any filter still set shows as a chip with its own ×.

**The planner is divided into workspaces.** `prefs.spaces` is
`[{id, name, color, icon, lanes}]` — My workspace, Office — and
`prefs.spaceAt` is the one being shown, or `WS_ALL` (`"*"`) for the view
across all of them. A workspace owns everything the planner keeps *about
your life*: its **categories**, its tasks, its routines, its notes, its
documents, its tracked time, its unavailable time and its lanes. Personal
and Office are not two filters over one list, they are two lists, and the
sidebar — categories and all — changes with them. Boards, which this
replaced, only divided the Tasks section; a board could not give Office
its own categories, and categories were the thing that most needed it.

- **What a workspace does *not* own is the planner itself**: how it looks,
  when it reminds you, where it backs up, which fields a task has, which
  columns the list shows. Those stay one set, in `prefs` and
  `prefs.board`, because a copy of them per workspace would be its own
  chore and nobody wants a different accent in Office. **Reminders are
  global too** — a notification cannot ask which workspace you were
  looking at.
- **There is no nested state.** `KEYS` is the nine names it has always
  been; every record simply carries `ws`, so saving, backups, Drive and
  the vault are untouched. Things that hang off a record — a document, a
  session, an activity entry, a completion — carry no mark of their own
  and follow what they belong to.
- **One question does the scoping**: `inWs(x)`, true across all of them
  and otherwise only for this workspace's. `wsTasks()`, `wsRoutines()`,
  `wsNotes()` and `wsAway()` are the lists a section draws; `cats()` is
  the workspace's categories while `cat(id)` still finds any of them,
  because a task shown across all of them has to draw its own.
- **The dashboard is always across all of them** and says so in its
  subtitle, because it is today and today does not belong to one
  workspace. Everything else — Tasks, Calendar, Matrix, Routines, Notes —
  follows the workspace. `overdueItems()` stays whole for the dashboard
  and the sidebar's late count; `overdueHere()` is the cut-down one the
  calendar's Catch-up panel uses.
- **Across all of them the board is one board a workspace**, stacked and
  each collapsible (`viewBoard()` → `boardFor(w, list)`, `.wsboard`,
  `V.bshut`) — the same shape the list already takes there, where it is a
  table a workspace (`lgBy()` forces the `"ws"` grouping). **Lanes are
  never merged by name.** Two workspaces' *To do* are two different lanes,
  and one column holding both would have to guess which one a card dropped
  in it meant; worse, Personal's three lanes beside Studio's four would
  come out as six ragged columns with only *In progress* shared. Stacking
  guesses nothing and every lane keeps its own workspace's name, colour and
  order. The board was simply switched off there for a while, which was
  honest but left Tasks with one of its two modes dead.
- **A lane on screen is not necessarily the current workspace's**, so
  `.col` carries `data-ws` and everything that acts on a lane reads it:
  the quick-add at its foot (`qaOpen(lane, ws)`, so a task lands in that
  workspace with that workspace's categories offered and its *Other* as
  the fallback) and the drop handler. `laneWs(id)` finds the workspace
  from a lane id alone, since lane ids are unique across every workspace.
- **A card dragged onto another workspace's board moves workspace**
  (`moveTaskWs()`, so the category follows by name and the subtasks come
  too), and then lands in the lane it was actually dropped in rather than
  the nearest one. It is a big move to make by dragging, so it says so in
  a toast. Within one board nothing changed.
- **Each stacked board has a height of its own** (`.wsb-body`,
  `min(430px, 58vh)`) so its lanes scroll inside it and the page scrolls
  between boards; one long lane never stretches the whole page. In a single
  workspace the board is full height exactly as it always was
  (`.board-scroll`), and `viewBoard()` takes that path unchanged.
- The lane editor and the category window still refuse to edit anything
  across all of them and say which workspace they need (`wsOnlyNote()`),
  rather than quietly editing the first one's.
- **Creating across all of them asks which workspace** (`askSpace()`,
  `WSQ`), once, in front of the thing it is making -- not as a field on
  every form that would be answered already every other time. In a
  workspace it never asks. A task added under a workspace table in the
  list skips the question, because the table *is* the answer
  (`lgPreset("ws", k)`). **The dashboard asks even inside a workspace**
  (`askSpace(..., always)`), because it is across every workspace whatever
  the sidebar says: a line taken out of the scratch pad had no workspace to
  fall into and landed in whichever one the sidebar happened to be pointing
  at, invisible from there and wrong as often as not. One workspace is
  still no question.
- **Lane ids are unique across every workspace**, and so are category ids.
  A task carries its lane id and its category id and nothing else, so
  anything asking what colour that lane is, or whether it counts as
  finished, has to find it without being told which workspace to look in —
  `lane(id)` searches them all (`ixLanes()`) while `lanes()` is the
  current workspace's.
- **A task's lane and category must be its own workspace's.**
  `fixTasks()` enforces all three every render — a task with no workspace
  joins the first, a lane that is not its workspace's is replaced by
  `laneFor(status, ws)`, a category by `catFor(cat, ws)` — and both match
  by name first, so a task carried from one workspace's *In progress* and
  *Work* lands in the other's. `fixSpaces()` does the same for categories,
  routines, notes and unavailable time, so nothing is ever left belonging
  to a workspace that has gone.
- **Six workspaces is the most** (`WS_MAX`): enough to keep the parts of a
  life apart, few enough that the switcher stays a list you read rather
  than one you search. Past it the New workspace button is disabled and
  `spaceAdd()` refuses anyway, since a button is not a guard.
- **Workspaces are made and unmade in Settings ▸ Workspaces**
  (`setSpacesPane()`), not in Customize: a workspace is not a setting
  about tasks, it is where everything lives. A row each — drag to
  reorder, a tile that opens its colour and its icon, the name typed into,
  what it holds, Open, and a Remove that asks where its contents go:
  another workspace, or nowhere, which deletes them. A new workspace
  starts with the same five categories a new planner does, because one
  with no categories has nowhere to put a task. The last one cannot go.
  A new planner's one workspace is called **My Workspace** until it is
  renamed. There is no "Across all of them" section in the pane: the
  switcher in the sidebar already has All workspaces in it, and saying it
  twice made the pane look like it had two subjects.
- **The top of the sidebar is a brand line and a workspace control**
  (`.rail-top`), and they are told apart by being different *kinds* of
  thing rather than by arrangement. **Five arrangements were drawn and
  compared side by side before this one was picked**, because four goes at
  rearranging the same two elements had each ended the same way: the brand
  and the workspace competed at the top and you had to look twice to tell
  which was which. The ones not taken were worth the drawing: the workspace
  alone with no wordmark anywhere; the brand moved out to a top bar across
  the window; and a narrow strip of workspace tiles beside a panel of the
  open one. Any of them would still work if this stops reading.
- **The workspace is drawn as a control** (`.ws-btn`): a `--line-2`
  border, a `--surface-2` fill, a 10px radius, and the word **Workspace**
  as an eyebrow over the name. It is the one thing up here you press, so it
  looks pressable -- and naming it in words settles it outright, so nothing
  rests on the drawing alone. Its tile is the workspace's colour **solid**,
  not a tint, with an `--on-accent` glyph on it: `--solid-mix` pulls any
  colour far enough toward the theme's ink that white reads on it, which a
  pale workspace colour would not have done at a 16% tint.
- **There is no hairline under that band.** The box is its own edge, and a
  rule as well read as two separators inside 90px.
- **The fold button sits at the end of the brand line** (`.rail-fold`,
  `i-panel`), not on the rail's outer edge. It was a round button hanging
  off the border, shown only on hover, which is a lot of hiding for the
  control that changes the whole shape of the sidebar -- and it left the
  brand line with nothing on its right. It keeps `#railMini` and
  `data-act="rail-mini"`, so the handler, `applyRail()` and the guided tip
  that points at it all still work; below 1080px it is hidden, because
  there the width decides. Folded, the brand line stacks: the mark, then
  the button that brings the words back.
- **The box does not break the grid.** Its 1px border plus 9px of padding
  land the tile on 22 like every other leading mark, and its text on 56
  like every other label -- checked by measurement, not by eye.
- **The sidebar is two bands**: which app and workspace, then everything
  that belongs to the workspace. It was
  one run of rows in three sizes with nothing between them, which is what
  made the top look unsettled. The pencil sits against the word it belongs
  to and **Show all** goes to the far end: the heading used to stretch
  across the sidebar with the pencil stranded at the opposite edge from
  what it edits.
- **The whole sidebar is laid out on one grid, and nothing in it works its
  own columns out from its own padding.** Four variables on `.rail`:

  | | | |
  |---|---|---|
  | `--rail-edge` | where a row starts | 12px |
  | `--rail-in` | a row's own left padding | 10px |
  | `--rail-lead` | the slot the leading mark sits in | 24px (22 → 46) |
  | `--rail-gap` | between that slot and the words | 10px (words at 56) |

  Every row -- the brand, the workspace, a nav item, a category, the
  footer -- uses them, so there is **one glyph column and one label
  column**. It took three goes to get here: the marks landed at 16, 20 and
  22, then at 22, 27 and 46 (a nav icon, the glyph inside the workspace
  tile, a category's icon) with labels at 50, 55 and 69. **A mark is
  centred in the slot rather than flush to its left**, because the marks
  are different sizes -- an 18px nav icon, a 24px workspace tile, a 16px
  category glyph, a 26px avatar -- and it is their centres the eye lines
  up, not their boxes. A circle gets a touch of overhang (26 in the 24px
  slot) to look level with the squares above it. Measured: every mark
  centres on 34, every label starts at 56, every row at 12. A stray
  `border:1px solid transparent` on the workspace button was enough to put
  that one row 1px out.
- **The brand is a line of its own** above the workspace (`.rail-brand`):
  the flame, `ember` at 15px in the wordmark face and the theme's ink, and
  the fold button at the end. It is a title, not a label -- which is what
  keeps it from reading as something belonging to the workspace under it.
  Four shapes came before: a 32px tile beside `ember` over
  `PERSONAL PLANNER` (a lot of sidebar spent saying which app you have
  open); a filled mark the same size as the workspace tile beside it (two
  badges reading as two logos); a bare flame stranded two elements away
  from its own word; and the flame and word tucked into an eyebrow over the
  workspace name, sharing its text column, which read as a two-line label
  for the workspace.
- **A category row is the icon, the name, then the switch at the far end.**
  It was the switch, the icon and then the name -- two marks before a word,
  which put the category names in a column of their own 13px right of every
  other label in the sidebar. The icon leads now, as it does in the folded
  rail and in every menu, and the box that turns it on and off sits where a
  switch sits. Folded, the switch goes with the words it needs and the icon
  is the whole control.
- **The workspace menu reads widest first**: All workspaces, then the
  workspaces one at a time, then New workspace and Manage -- those two a
  size down and in the quieter grey (`sub` on a `ctxMenu` item), because
  they are housekeeping and the workspaces are the point of the menu.
- **The switcher is at the top of the sidebar**, under the brand
  (`wsBarHtml()`, `#wsBar`), because everything below it belongs to it,
  and it is the biggest thing up there. The brand above it is one slim
  line -- a 22px mark and the wordmark, no more. It was a 32px tile beside
  ``ember`` over ``PERSONAL PLANNER``, which is a lot of sidebar spent
  telling you which app you have open, and it made the workspace under it
  look like the smaller thing.
  It sat in the Tasks top bar while it was only a board; a workspace is
  not a property of one screen. Switching clears the filters, since a lane
  and a category belong to the workspace they were set in (`wsGo()`).
- **Everything a workspace holds can be handed to another one.** A task
  moves from the panel's header or its ⋯ menu, both through
  `moveTaskWs()`: the lane and the category move with it, the subtasks move
  with the task, and the change is logged (`ws` is in `FIELD_LABEL`, so it
  reads *Workspace: My workspace → Office*). `moveThingWs()` does the same
  for a routine, a note or a block of unavailable time -- none of those has
  lanes, and unavailable time has no category either, so there is nothing
  to find again for it. **`wsMoveItems()` builds the menu item**, so it
  reads the same wherever it shows: the other workspaces, one each, after
  the thing's own actions and before deleting, and nothing at all when
  there is only one workspace. `moveThingWs()` existed for a while with no
  way to reach it -- only tasks offered the move.
- **The panel header is two drop-downs**, in the order the thing is named:
  the workspace a task is in, then the lane it is in *in that workspace*
  (`.sh-where`). The lane list is `lanesOf(t.ws)` and the category list
  `catSelect(..., {ws: t.ws})` — never the current workspace's — because a
  task opened from the dashboard or the calendar knows nothing about which
  workspace the sidebar happens to be showing, and offering it another
  workspace's lanes would put it somewhere it cannot be. The workspace one
  appears only where there is a second to choose. They are one box so that
  under 640px they drop to a row of their own rather than squeezing until
  the name is a bare chevron.
- **Setup never mentions workspaces.** Everything it collects goes into the
  one that is already there, and the dashboard's guided tour introduces
  them in its first step — pointing at the switcher, because that is the
  thing everything else on the page belongs to.

How tasks work is the person's to set, in one window opened from
**Customize** beside Filter in the top bar (`customiseModal()`, the customise section).
All of it is `prefs.board`, filled in by `board()` on the one object, so it
goes with backups and Drive like any setting. **What lives there is every
board's**: which fields a task has, which columns the list shows, whether
subtasks are tasks. Those are settings about the planner rather than about
one workspace, and five copies of them to keep in step would be its own
chore.

- **Swimlanes** are `curSpace().lanes`: `{id, name, color, done}` in board
  order, and a task's `status` is its lane's id. A new planner starts with
  one workspace called *My Workspace* carrying To do, In progress and
  Completed (`DEFAULT_LANES`); a planner that already had tasks keeps the
  six it had (`LEGACY_LANES`), and a planner from before workspaces keeps
  its lanes — or each of its boards' — as its workspaces', so nothing
  moves. That is decided the first time `spaces()` runs, which `render()`
  makes happen before anything else — left later, a new planner's first
  sample tasks made it look like an old one. Lanes can be added, renamed,
  recoloured, reordered (drag, or the arrows) and removed; removing one
  with tasks asks where they go, and every workspace keeps its own set.
- **Done is a lane, not a word.** A lane marked done is where ticking sends a
  task (`firstDone(t.ws)`, and back to `firstOpen(t.ws)` — the task's
  own workspace, because a task is ticked from the dashboard, the calendar
  and the matrix, where no workspace is in sight), and what counts as finished
  everywhere through `isDoneT(t)`, which reads the lane and nothing else: a
  task whose lane has gone is not finished, and `fixTasks()` gives it one.
  Never test `t.status==="completed"` — a test fails on it. A status a lane no longer has (the sample week, an old
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
- **A checklist subtask can carry a day of its own**, behind the
  `subdate` switch, off to begin with (`FEAT_OFF`) because a checklist is
  a list of steps and most of them never want a date. It rides in a hidden
  input that `readSheetSubs()` reads back beside the name and the tick, so
  it needs no save of its own and switching the feature off keeps what is
  already there.
- **The list opens the steps inside a task.** The count beside a name is a
  button (`lr-subs`, `V.lsubs`), and it unfolds them underneath in the
  same grid, so every cell still lines up with its heading
  (`lrSubRows()`). A full subtask gets an ordinary `lrRow`, indented; a
  checklist step gets a lighter row with the two things it really has --
  its tick and, where the switch is on, its day -- both of which work from
  there. Renaming a step stays in the panel, which is where the checklist
  lives. Which tasks are open is view state, not a setting.
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
  workspace (offered only where there is more than one, and forced across
  all of them), start date or due date (a table a month, the empty ones last), status,
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

**A block already on the week is dragged to another day or hour** (`MV`,
the moving a block section), as in Google Calendar: the one it came from
dims, a ghost follows the pointer at the quarter hour it would land on
(`colAt()` for the column, `minuteIn()` for the hour), and letting go
puts it there. The press only becomes a drag past 4px, so a press that
does not move is still a click and blocks open as they always did; the
click that *ends* a drag is swallowed (`MV.skip`) or every move would
also open what it moved. A tick box on a block is a control, not a
handle. Tasks (`moveTask()`, which logs the change like any edit) and
unavailable time (`moveAway()`) move outright, keeping their length. A
routine asks first — see Routines. Google's own events are not ours to
move and tracked time is a record of what happened, so neither carries
`data-move` and neither can be picked up. It is on `mousedown`, like the
create-drag above it and for the same reason: a drag on a touch screen is
a scroll.

### Dashboard

**Three equal columns, and every card scrolls inside itself.** Left to
right in the order the day is read: **Today**, **Needs your attention**,
then the **scratch pad** with time tracked under it — a `.dcol` each, each card
`.dcard.fill` with a pinned `.dcard-h` over a scrolling `.dcard-body`.
Today and Needs your attention shared one scrolling column before, and a
day with a full schedule pushed the whole of the second card off the foot
of the page: the thing that tells you what is *late* was the thing a busy
day hid. Nothing a card holds can move another card now, because no card
can grow. Inside a body a group's heading is sticky, so "Schedule" is still
named halfway down it. A short window (under 720px) gives the grid a floor
of 420px and lets the page scroll the little that is past it — letting the
cards size to their content there put a thousand pixels of list on a
700px page, which is the thing this layout exists to stop. Under 1080px it
is one column in the same order, and the cards stop filling and stop
scrolling, because then the page is the scroll.

**A dashboard card has no hairline round it.** On a white page the border
was the only thing drawing the card, so three side by side read as three
ruled columns with lines between them. They sit on `--surface` with a
soft shadow instead, which is what a card is, and the three columns are
equal thirds.

**Every section is the accent**, keyed from the head (`--tone` on
`.dcard-h`): it colours the badge, a wash behind the heading, the hairline
under it and what a row lights up to on hover. The whole page follows the
colour the person picked, which is what anyone means by "my colour".
Sections are told apart by **how heavy the wash is** (`--wash`), not by
hue: 9% everywhere and 17% on what needs seeing to, which is all that card
has left to stand out with. Five different hues came first -- blue, danger,
violet, teal -- and the trouble with them was that four fifths of the page
ignored the accent entirely. The **overdue stamps inside the attention
card keep the danger colour**: those are words about something being late,
not chrome. `--tone-ink` is the same accent as text or as a glyph, because
`--accent` on its own tint is the one thing the accent rules forbid.
Measured in both themes: headings 10.5:1 or better on their wash, the small
grey 4.98:1 or better, and every badge glyph clears 3:1 against its own
tile -- which is why the tile is an 11% wash and not the 18% it started at.

**The dashboard's columns are `.dash-col`, never `.dcol`.** `.dcol` is
the week grid's day-column header and it carries a `border-right` and a
side padding of its own; sharing the name put a rule down every gap
between the dashboard's columns and set every card 6px inside its own
column. That was what looked like lines between the sections. The page
behind the cards is `--ground` rather than `--canvas`, so a white card
reads as a card on one tight shadow -- two heavy ones meeting in the gap
made a dark band that looked like a rule of its own.

**The attention card wears its state**: the danger tone on its head and a
ring of it round the card while there is something in it, neutral the
moment there is not (`.dash-attn:not(.clear)`). Its empty state is a row
at the top like every other empty state -- centred in a tall column it
floated in the middle of nowhere. There is still no total on it, for the reason
below. The welcome panel keeps now/next *beside* the greeting rather than
under it — it is the one thing on this page nobody needs to read, and every
row it costs is a row the three columns do not get.

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

**Categories belong to a workspace**, so the sidebar's list changes with
it and `cats()` is what everything offering a choice reads. **They are edited where the workspaces are**: in **Settings ▸
Workspaces**, opened under the workspace they belong to (`catListHtml()`,
`V.catWs` for the one open, `catsPane()` to get there, `refreshCats()` to
redraw it). They had a window of their own, and from Settings that meant
a popup opening on top of the popup that was already listing them. The
sidebar's pencil goes to the same place, with that workspace's list
already open.

**Folded to its icons, the sidebar names what the pointer is on**
(`data-hint`, `railHintShow()`, `.railtip`). It is drawn into `<body>`
rather than out of the button, because the rail scrolls and anything
positioned inside it is clipped at its edge; and the browser's own
tooltip is far too slow to be the label you need every time you point at
something. Nothing shows it while the sidebar is open, where every icon
has its words beside it. They all live
in the one `S.categories` array with a `ws` on each, so reordering one
workspace's writes them back into the places its own occupied
(`catsReorder()`) — mapping the dragged order straight onto
`S.categories`, as the old code did, would have deleted every category
belonging to every other workspace.

Categories are edited in one window (`catsModal()`, from the pencil by the
sidebar's Categories): a row each, dragged by its handle to reorder; the
icon and colour open their choices under the row (`V.catEdit`), with any
colour through Custom; the name is typed into. Hide, Show only this and Delete
are behind the row's ⋯, and Delete asks in the row, saying where its
tasks go. A second window for name, colour and icon, and a Shown label and
count on every row, were taken out. The sidebar has no "None"; "Show all"
appears only while something is hidden.

**Folded to its icons, a category is its own icon and nothing else** --
lit in its colour while it is shown, faint while it is not, with its name
on the hover. It was a tick box *and* its icon, two marks a row in 70px,
under a heading whose only surviving part was a stranded pencil; the
heading is hidden there now, since editing categories is a thing you do
with the sidebar open.

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
- **Quiet hours are a night at a time.** `remind.quietDays` holds the
  weekday numbers that have one and `remind.quietAt` the window each of
  them keeps (`{from, to}`, keyed 0=Sunday, the way a `Date` counts).
  One window for the whole week could not say "weekends I sleep in", which
  is most of what anyone wants them for. The control is the week as seven
  round buttons and a row of times under every night that is lit
  (`quietWeekHtml()`), in the order the planner's own week runs; setup
  shows the same seven buttons with **one** pair of times for all of them
  (`compact`), because nobody has a different Tuesday before they have
  used the thing. Switching quiet hours on quiets every night
  (`quietSeed()`) and the nights you want back are turned off one at a
  time; a night put out keeps its times, so turning it on again does not
  start from scratch. A planner set up when there was one window for the
  week is moved to seven of the same, once, in `remindPrefs()`.
- **A window that wraps belongs to the night it starts on.** 10pm–7am on
  Friday is Friday night, so `inQuiet()` asks the day's own window and
  then yesterday's, and Saturday morning is quiet whatever Saturday itself
  says. Rows say "next day" where `to` is not after `from`, because a
  window across midnight is two dates and reads as a mistake without it.
  A reminder inside one is skipped, not queued for later.

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
  (the greeting, the chip's own width and a category's label out in the
  hearth, `data-planet`) are written into the DOM by the
  `input` listener rather than redrawn.
- **Categories are chips, and the picture beside them is a hearth.**
  `obCats()` draws a chip a category -- its tile (the icon on its colour),
  its name typed straight into a self-sizing input, and a cross -- small
  enough that a dozen read as one answer, and they never change shape as
  you work because the colours and icons open *over* the page
  (`.obx-pick`, absolute, under the chip) rather than inside the chip. One
  panel holds both, Color then Icon (`ob-cat-swatch`, `ob-cat-icon`, the
  same `CAT_COLORS` and `CAT_ICONS` the planner's own category window
  offers), six colours and five icons to a row so neither ends in a ragged
  line. It **closes like a pop-over**: a click anywhere but its own chip
  or another chip's tile, Escape, adding a category or deleting the chip
  it belongs to. `obPickClose()` takes it out of the DOM rather than
  redrawing, because the click that closed it is often a click into
  another chip's name and a redraw would replace the input under the
  caret; `OB.pal` is cleared either way, so the next render draws it shut.
  The outside-click listener captures, so a press on another chip's tile
  shuts this one before the click switch opens that one. `obShowCats()` is the picture: a hearth in the middle carrying the
  flame and your name, two rings of warmth where Everyday Orbit had dashed
  orbits, and a category at each point of the circle in its own colour,
  taking two radii past six so a dozen still sit clear of each other.
  Between the two, a grid of tiles and a list of full-width rows were
  tried: the tiles read as loose boxes with a lot of air and a stranded Add
  card, and the rows put twelve colour dots on every line, which was a lot
  of page for one question. The gradient on the chip is what those two
  were worth keeping. A step that genuinely has nothing to show can still
  return "" from `obShow()`: `obRender()` then leaves the `<aside>` out
  and the stage takes the whole width (`.obx-stage.one`).
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
- **Never put a coloured stripe down the left edge of anything.** No row,
  card, chip or block carries its colour as a bar stuck to one side -- not
  a lane, a category, a workspace, a calendar block, a month chip. The
  colour goes in the fill, in a swatch or an icon tile, or in a hairline
  all the way round (`box-shadow: inset 0 0 0 1px`, the way Google’s own
  events are drawn). Quote bars in the note and document editors are the
  one left rule left, and they are the line grey, not a hue. This is a
  standing rule: do not reintroduce the pattern.
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
  **A backup says whether it worked.** `backup:write` in main.js is an
  `ipcMain.handle` answering `{ok}` or `{ok:false, error}`, and the page
  waits for it: it used to swallow every error and the page said "Backed
  up" either way, so a folder that had been moved, renamed or was on a
  drive that was not plugged in failed in silence. Every write that lands,
  by hand or on the schedule, goes through `backupDone()` -- it stamps
  `autoBackup.last` and calls `panels()`, so the line under the button
  changes where Settings is open. One line carries the time for both, since
  it is the same backup; a backup by hand quite rightly puts the next
  automatic one off, because `maybeAutoBackup()` counts its interval from
  that stamp.
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

**One thing decides whether the sidebar is folded, and it is
`body.rail-mini`.** `applyRail()` sets it from `prefs.railMini` *or* the
821--1080 band (`RAIL_BAND()`, re-run on resize); below 821 it is a drawer
at full width, so it is not folded there. That band used to fold the rail
through a media query of its own that reached a few of the rules and not
the rest: the workspace name squeezed to "Pers..." instead of collapsing to
its tile, the Categories pencil was left stranded with nothing beside it,
and the hover labels -- which only fire on `body.rail-mini` -- never came
at all. Every folded rule is now one `body.rail-mini` selector with no
width gate; the band's media query holds only what the narrow *view* needs.

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

## Gotchas when testing in a headless or hidden browser pane

CSS transitions do not advance while the pane is hidden, so a transitioning
property reads as stuck at its start value and `getComputedStyle` lies about it.
Check `element.getAnimations()` before concluding a rule is broken, or measure
with `style.transition = "none"`.

**The pane dispatches no `scroll` events at all** -- not for a wheel, not
for a `scrollTop` assignment, even though the assignment takes. So
`SCROLLED` stays empty there and scroll restore looks broken whether it is
or not. Dispatch `new Event("scroll")` on the box by hand after setting
`scrollTop`, or the whole mechanism cannot be exercised.

**A screenshot can lag a frame or two behind the DOM.** Measure with
`javascript_tool` and treat the picture as a second opinion, not the
first -- more than one "the layout is broken" turned out to be a stale
frame taken mid-transition.

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

**Write the changelog before running it, not after.** `docs/changelog.html`
gets an entry for the version about to go out, as part of the same commit as
any last change, so the release contains its own notes. Run it after, and the
page lags a version behind and nobody notices until someone asks what changed.
It has already happened once: 1.3.1 shipped and the page still ended at 1.3.0.
The entry is written for the person using the planner -- what is different
when they open it -- not a list of commit subjects, and the **Latest** pill
moves to the new one. `docs/roadmap.html` is checked at the same time: a card
sitting in Next up or Backlog that has just shipped moves to Shipped with its
version, and the empty In progress line names the version that just went out.

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
- Recurrence exceptions in the Google Calendar sync, so a routine occurrence
  moved on its own reaches Google instead of staying in the planner.
- Widen `test/` beyond convention guards — there is no coverage of the date
  helpers, recurrence logic or filtering, which is where the real logic lives.
