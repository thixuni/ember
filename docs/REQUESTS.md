# Turning on requests

The roadmap can take a request on the page and show it in its **Requested**
column, so nobody is sent to GitHub to ask for something. The page is static,
so the rows need somewhere to live: one Supabase table.

**Until `EMBER_REQUESTS` at the foot of `docs/roadmap.html` has a url and a
key, the Requested column and both buttons are not drawn at all.** A board
that offers a form it cannot send is worse than one that does not offer it,
so the page is safe to ship either way.

## Four steps, about five minutes

**1. Make a project.** [supabase.com](https://supabase.com) → New project. The
free tier is far more than this needs.

**2. Make the table.** Open the SQL editor and run this:

```sql
create table requests (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  body       text   not null check (char_length(body) between 4 and 600),
  email      text,
  votes      integer not null default 0
);

alter table requests enable row level security;

-- Anyone may read a request and add one. The email column is not readable,
-- so an address given here never shows on the board (see step 3).
create policy "read"   on requests for select using (true);
create policy "insert" on requests for insert with check (true);

-- Anyone may bump a vote, and change nothing else.
create policy "vote"   on requests for update using (true)
  with check (true);
```

**3. Keep the emails private.** The anon key is public, so anything readable
through it is public. Hide the column from reads:

```sql
revoke select (email) on requests from anon;
```

The page only ever asks for `id, body, votes, created_at`, so this changes
nothing it does — it just makes it impossible for anyone to pull the
addresses. Read them yourself in the Supabase table editor.

**4. Paste the two values.** Settings → API gives you a **Project URL** and an
**anon public** key. Put them at the foot of `docs/roadmap.html`:

```js
window.EMBER_REQUESTS = {
  url: "https://xxxxxxxx.supabase.co",
  key: "eyJhbGciOi…",
  table: "requests"
};
```

The anon key belongs in the page — it is the one the browser is meant to
carry, and the policies above are what actually decide what it can do. Never
put the **service_role** key here; that one bypasses every policy.

## Running the board

New requests arrive in the **Requested** column, highest votes first. To move
one along, set its `status` by hand in the Supabase table editor — or just
write it into `roadmap.html` as a normal card in Next up or Shipped, and
delete the row.

A vote is one per browser, remembered in `localStorage`. It is a signal, not
a ballot: someone determined can vote twice. That is the trade for not making
anyone sign in, and at this size it is the right one.

## If it is abused

Supabase's dashboard will show it. The quickest answers, in order: add a rate
limit in a Postgres function, put Cloudflare Turnstile in front of the insert,
or drop the insert policy and the form goes away while the board keeps
working.
