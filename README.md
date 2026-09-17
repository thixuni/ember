# Everyday Orbit

A personal planner: a dashboard for today, calendar, task board, Eisenhower
matrix, routines, notes and time tracking. Six views over one set of tasks,
sharing one set of categories that work like calendar layers.

Open any task and a panel slides in from the right with its dates, priority,
tags, linked tasks, files, an estimate, a timer and a full history of everything
that has happened to it. Comments and documents live in that history; documents
are markdown, so they can be mirrored straight into an Obsidian vault.

You sign in with your Google account. Everything is stored on your own device,
and backed up to your own Google Drive if you choose; there is no server of ours.

**[Download the latest release](https://github.com/thixuni/everyday-orbit/releases/latest)** ·
[Download page](https://thixuni.github.io/everyday-orbit/)

---

## Running it

```bash
npm install
npm start
```

`npm start` opens the Electron app, which loads `src/index.html` directly. There
is no bundler and no compile step.

To open it in a browser instead:

```bash
node scripts/serve.js
```

Then visit <http://localhost:4173>.

## The commands

| Command | What it does |
| --- | --- |
| `npm start` | Run the desktop app |
| `npm test` | Run the checks in `test/` |
| `npm run build:html` | Inline `src/` into `dist/everyday-orbit.html` |
| `npm run check` | Build the single file, then test |
| `npm run build` | Build installers into `release/` (for testing only — never hand these out) |
| `npm run release patch` | Cut a release: check, bump, tag, push |

## Layout

```
src/index.html   Page shell, the SVG icon sprite, and the app markup
src/timer.html   The floating timer window
src/app.css      Every style. All colours are tokens on :root
src/app.js       The whole application, in one IIFE
main.js          Electron shell: windows, menu, vault sync, backups, updates
gcal.js          Google sign-in, Calendar and Drive requests, main process only
preload.js       The only bridge between the app and the shell
scripts/         build-standalone.js (the single file), serve.js (dev server)
test/            Guards for the conventions in CLAUDE.md
docs/            The download page, served by GitHub Pages
build/           App icons and macOS entitlements
```

`dist/` and `release/` are build output and are not committed.

## Two ways it ships

**The desktop app** is what most people should use. It installs properly, gets a
Start menu entry, and updates itself from GitHub Releases.

**The single file** — `dist/everyday-orbit.html` — is the whole planner inlined
into one HTML file that runs by double-clicking it, with no install. It is
attached to every release. `scripts/build-standalone.js` produces it, and
`npm test` checks that it stays genuinely self-contained.

## Cutting a release

One command, from a clean `main`:

```bash
npm run release patch
```

Use `patch` for ordinary work — a fix, a refinement, a small addition — and
`minor` for a major change, like a new view. The version number moves here and
nowhere else, so every number that exists is one somebody can download.

The command checks that the working tree is clean, that you are on `main` and
up to date, and that the checks pass. It changes nothing until all of that
holds, so a refusal is safe to retry. Then it raises the version, commits,
tags and pushes, and the **Build installers** workflow publishes a GitHub
Release with the installers for all three platforms, the single-file build,
and the `latest.yml` metadata that installed copies read.

Pressing **Run workflow** on the Actions tab builds without publishing, which is
the way to test a change to the pipeline.

## Updates

Installed copies check for a new version on launch and every six hours, download
it in the background, and offer to restart. Updating never touches planner data.

Auto-update only works in the installed build. The portable `.exe`, the
AppImage and `npm start` all skip it — **Help ▸ Check for updates** says so
rather than failing quietly. Set `EVERYDAY_ORBIT_NO_UPDATE=1` to turn the check
off entirely.

## Code signing

The build works without certificates and produces unsigned installers. Windows
then shows a SmartScreen warning, and macOS asks the user to right-click and
choose Open. To sign, add repository secrets — the workflow already reads them:

| Secret | For |
| --- | --- |
| `CSC_LINK` | The certificate, base64-encoded (`.pfx` on Windows, `.p12` on macOS) |
| `CSC_KEY_PASSWORD` | Its password |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarisation |

For notarisation, also set `"notarize": true` under `build.mac` in
`package.json`. Leave it off until the Apple credentials are in place, or the
macOS build will fail.

Costs, roughly: an OV Windows certificate is 200–400 USD a year (EV clears
SmartScreen immediately, and costs more); the Apple Developer Programme is
99 USD a year.

## Time tracking

Give a task an estimate and press **Start**. The timer counts up against that
estimate — "12:30 of 45m", with a bar that fills and turns red once you pass it
— so being over or under is plain at a glance. No estimate is fine too; it just
counts. Hover the total anywhere to see the individual sessions behind it. Either way each run is
stored as a session, and each run is drawn straight onto the calendar, at the hour it happened and as
long as it lasted, so planned and actual time sit side by side

**View ▸ Floating timer** (or the pop-out button on the timer strip) opens a
small always-on-top window that stays above other apps while you work, with
pause, stop and a button that jumps back to the task. Closing the planner
window leaves the app running so the timer keeps going; the icon by the clock
reopens it, and quits it for real. That window is desktop only — a browser tab cannot float
above anything else.

## Documents and Obsidian

Any task can hold documents, written in markdown with a live preview. Connect a
vault in **Settings ▸ Obsidian vault** and each one is mirrored to
`<vault>/Everyday Orbit/` as a `.md` file with YAML front matter. Edits you make
in Obsidian flow back into the planner, and edits made here are written out —
the planner never writes back in response to a change it just read, so the two
sides cannot loop.

Vault sync is desktop only, for the same reason: a browser tab has no access to
a folder on your disk.

## Your account and setup

The planner is used signed in with a Google account, in the desktop app and in
a browser alike. The first launch is a setup of its own:

1. **Sign in with Google.** The desktop app opens Google's sign-in in your
   browser; a browser copy opens it in a Google window. Either way it asks
   only who you are.
2. **Your data.** Back up to your own Google Drive — a copy goes into one file
   there, *Everyday Orbit backup.json*, after every change, and signing in on
   another computer offers to bring it back — or keep it on this device only.
   The app can see only the file it makes, not the rest of your Drive.
3. **About you, categories, starter routines** — your name for the greeting,
   the categories made yours, and a few common routines with their times.
4. **Google Calendar** and **Obsidian** (desktop only), each skippable.
5. **Appearance** and **notifications**.

Someone who already had a planner signs in and picks where it lives, and that
is all. **Settings ▸ Account** shows who is signed in, has the Drive backup
(back up now, restore) and signs out; signing out keeps the planner on the
computer.

Only a copy with no web address cannot sign in — the single file opened by
double-click, or the Claude artifact — because Google signs in only to an
address it has been told about. Those keep the planner in the browser and skip
the steps that need the account.

### Signing in from a browser

A browser has nowhere safe to keep a long-lived key, so Google gives the page
one that lasts an hour. It survives reloading the tab. When it runs out, a
**Reconnect** button appears in the corner; one click and Google's window opens
and closes by itself, and anything held back (a backup, a sync) carries on.
Staying signed in for weeks without that click would need a small server of
our own to hold the key.

It needs a second Google client, of type **Web application**, in the same
Cloud project, with every address the planner is served from under
**Authorised JavaScript origins** — `http://localhost:4173` for
`node scripts/serve.js`, and the address of the hosted copy. Its Client ID is
not a secret. Put it beside the page as `google-web-client.json` (either
`{"clientId": "…"}` or the JSON Google Cloud offers; git-ignored), or set
`ORBIT_GOOGLE_WEB_CLIENT_ID` when running `serve.js`. Without either, the
sign-in page asks for it and keeps it in that browser.

Access is asked for a piece at a time — who you are at sign-in, Drive when you
choose it, Calendar when you connect it — and every later ask keeps what was
granted before, so there is one key for all of it.

### The app's Google client

Signing in needs a Google OAuth client of type **Desktop app**, in a Google
Cloud project with the **Google Calendar API** and **Google Drive API**
enabled, and the scopes `openid`, `email`, `profile`,
`calendar.readonly`, `calendar.events` and `drive.file` on its consent
screen. It is **not** kept in the repository:

- **Releases** read it from two repository secrets, `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` (Settings ▸ Secrets and variables ▸ Actions); the
  workflow writes `google-client.json` at build time and the installers
  carry it.
- **Running from source**, put the JSON Google Cloud offers for download next
  to `main.js` as `google-client.json` (it is git-ignored), or set
  `ORBIT_GOOGLE_CLIENT_ID` and `ORBIT_GOOGLE_CLIENT_SECRET`.
- A build with neither asks for a Client ID and secret on the sign-in page, and
  keeps them, encrypted, on that computer.

Calendar is a *sensitive* scope, so until Google verifies the app, the sign-in
page warns that it is unverified, and only up to 100 people can use it. In
*Testing* mode, sign-ins also expire every seven days — publish the app under
**Audience** to stop that. Verification is Google's process, done once, in the
Cloud console.

## Google Calendar

Connect it during setup, or later in **Settings ▸ Connections ▸ Google
Calendar**. It uses the account you signed in with.
Two things then happen:

- **Your Google events show in the planner** — on the calendar, the day
  popup, and the dashboard's Today and Up next. Tick which calendars to show.
  Events you declined are left out. They are Google's, so change them there.
- **Dated tasks and routines go into your main Google calendar.** Tasks as
  all-day events (a finished one gains a ✓), routines as repeating events.
  Rename or move one in Google and the planner follows; change it here and
  Google follows. Delete one in Google and it stops syncing but stays in the
  planner. Either kind can be switched off in Settings, which removes its
  events from Google. Tasks due more than two weeks ago are not sent on a
  first sync.

It syncs on start-up, every five minutes, a few seconds after you change a
task or routine, and when you press **Sync now**.

### Getting a Client ID

Needed only when the app has no Google client of its own (see above). It takes
about five minutes, once:

1. Open [console.cloud.google.com](https://console.cloud.google.com) and
   create a project — call it Everyday Orbit.
2. **APIs & Services ▸ Library**: enable the **Google Calendar API** and the
   **Google Drive API**.
3. **Google Auth Platform**: set up the consent screen. Choose **External**
   and give it a name and your email.
4. **Audience**: press **Publish app**. An app left in *Testing* has its
   sign-in expire every seven days.
5. **Clients**: create a client of type **Desktop app**, and copy its
   **Client ID** and **Client secret** into the sign-in page.
6. Press **Continue with Google**. Your browser opens; sign in and allow access. Google
   warns that it has not verified the app — it is yours, not a published
   one — so choose **Advanced**, then go to the app.

The sign-in follows Google's flow for installed apps: the system browser, a
one-off redirect to `127.0.0.1`, and PKCE. The key it gets back is encrypted
with your operating system's keychain and never leaves the main process; the
planner page asks the main process to make each request.

## Reminders

The desktop app sends notifications even with its window closed, since it
keeps running in the tray. Routines, and tasks with a start time, remind you
30 minutes before; change that per task or routine, or turn it off. Once a
day, at 12:00 unless you choose another time, one notification says how many
tasks are overdue. Quiet hours, if you set them, hold everything back.
Settings ▸ Reminders has it all, and a button to send a test.

The browser build can remind you too, after you allow notifications, but
only while its tab is open.

## Backups

**File ▸ Back up planner** writes a `.json` file and **File ▸ Restore from
backup** reads one back. That is also how you move a planner to another
computer. In the browser build the same two actions are the download and upload
icons at the bottom of the sidebar.

## Contributing to the code

Read [CLAUDE.md](CLAUDE.md) first — it documents the conventions that are not
obvious from reading the source, several of which exist because breaking them
fails silently. `npm test` enforces the ones that can be checked mechanically.
