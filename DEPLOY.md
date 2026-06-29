# Deploying DECANTVERSE StockApp (free)

This guide takes you from the local app to a live URL you can open on any device, with
your inventory stored in the cloud behind a per-user login.

There are three one-time pieces: **Supabase** (the database + login), **GitHub** (stores
the code), and **Vercel** (hosts the live site). All free.

---

## How it all fits together

- The app is a static site (just HTML/JS). **Vercel** serves it.
- Your inventory (brands, perfumes, sales, audit log) is saved as a single row in a
  **Supabase** Postgres database, so it survives cache-clears and is the same on every device.
- The browser also keeps a **local cache**, so the app still opens (read-only-ish) if you're
  offline; it re-syncs when back online.
- Access is gated by a **login** — each person has their own Supabase email + password, and
  everyone signed in shares the same inventory. The data is locked at the database level (Row
  Level Security), so only signed-in users can read or change it.
- The Google price sheets stay exactly as they are (read-only); nothing about them changes.

> If you skip Supabase entirely (no env vars), the app still runs in **local mode** —
> data in the browser only, no login. That's the current behavior.

---

## Step 1 — Supabase (database + login)

1. Go to <https://supabase.com>, sign up (free), and **New project**. Pick any name and a
   strong database password (you won't need it day-to-day). Wait ~2 min for it to provision.
2. Left sidebar → **SQL Editor** → **New query**, paste this, and **Run**:

   ```sql
   -- One row holds the whole inventory as JSON.
   create table if not exists app_state (
     id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );

   -- Lock the table: only logged-in users can read/write.
   alter table app_state enable row level security;

   create policy "authenticated can read"
     on app_state for select
     to authenticated using (true);

   create policy "authenticated can insert"
     on app_state for insert
     to authenticated with check (true);

   create policy "authenticated can update"
     on app_state for update
     to authenticated using (true) with check (true);
   ```

3. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
   Use a **real email you control** (so you can recover access later), set a password, and tick
   "Auto Confirm User". This is your own login — **each person who uses the app gets their own
   email + password the same way** (see "Add more users" below); everyone signed in has full
   access. (Avoid a fake email — no recovery mail if you forget the password. See "Locked out?".)
4. Get the URL and the browser key (two different pages in Settings):
   - **Project URL** → Settings → **Data API**. It looks like `https://<your-ref>.supabase.co`.
     This is `VITE_SUPABASE_URL`.
   - **Publishable key** → Settings → **API Keys**. Copy the key that starts with
     `sb_publishable_…` (labelled "can be safely shared publicly"). This is `VITE_SUPABASE_ANON_KEY`.
   - ⚠️ Do **NOT** use the **Secret key** (`sb_secret_…`) anywhere in the app — it grants
     privileged access and must never ship to the browser.

> The Publishable key is meant to be public — it's safe in the browser. The login + the policies
> above are what protect your data. (Supabase used to call this the "anon public" key; the env var
> name stays `VITE_SUPABASE_ANON_KEY`, you just paste the publishable key into it.)

### Try it locally first (optional but recommended)
Create a file named `.env` in the project root (copy `.env.example`) and fill in:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...your publishable key...
VITE_LOGIN_EMAIL=the-real-email-you-used@example.com   # optional — just pre-fills the email box
```

`VITE_LOGIN_EMAIL` is optional now (only two vars are required): the login screen asks for an
email + password, so anyone with a Supabase account signs in with their own. Run `npm run dev`,
open the app, sign in with the user from Step 3. Your existing local data is pushed up to Supabase
on first load.

---

## Step 2 — GitHub (store the code)

1. Create a free account at <https://github.com> if you don't have one.
2. Make a **new repository** (Private is fine), e.g. `stockapp`. Don't add a README.
3. In the project folder, run (replace the URL with your repo's):

   ```sh
   git init
   git add .
   git commit -m "StockApp"
   git branch -M main
   git remote add origin https://github.com/<you>/stockapp.git
   git push -u origin main
   ```

   `.env` is git-ignored, so your secrets are **not** uploaded — good.

---

## Step 3 — Vercel (host it live)

1. Go to <https://vercel.com>, sign up with your GitHub account (free).
2. **Add New… → Project**, and import your `stockapp` repo.
3. Vercel auto-detects **Vite** (build `npm run build`, output `dist`). Leave those as-is.
4. Expand **Environment Variables** and add (the first two are required;
   `VITE_LOGIN_EMAIL` is optional and only pre-fills the email box):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_LOGIN_EMAIL` *(optional)*
5. Click **Deploy**. After ~1 minute you get a URL like `https://stockapp-xxxx.vercel.app`.
   (If you add/change env vars later, **Redeploy** — Vite only reads them at build time.)
6. Open that URL on your phone and laptop, sign in with your email + password, and you'll see the
   same data on both. Every `git push` to `main` automatically redeploys.

---

## Day-to-day

- Edit code → `git push` → Vercel redeploys in ~1 min.
- Change your password: Supabase → Authentication → Users → your user → ⋮ menu → reset/update the
  password (or send a recovery mail if you used a real email).
- Sign out / switch user: use **Sign out** at the bottom of the sidebar.
- Forgot to set env vars? The app falls back to local-only mode and shows no login screen —
  add the vars in Vercel and redeploy to enable cloud sync.

### Add more users (each with their own login)
You don't share your password — give each person their own account:
1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter their email + a password, tick **Auto Confirm User**, save.
3. Send them the Vercel link + their email/password. They sign in and have full access
   (everyone shares the same inventory data). The sidebar shows who's signed in.
4. To remove someone: Authentication → Users → ⋮ → **Delete user** (their data isn't affected —
   it lives in `app_state`, shared by everyone).

### Locked out? (forgot the passcode)
Your inventory lives in the `app_state` table, **not** tied to the login user — so resetting the
login is safe and loses no data:
1. Supabase → **Authentication** → **Users** → find the user → **⋮** → **Delete user**.
2. **Add user** → **Create new user** with a real email and a password you'll remember
   (tick "Auto Confirm User").
3. If the new email differs, update `VITE_LOGIN_EMAIL` in your `.env` and in Vercel
   (Settings → Environment Variables), then redeploy.

Alternative without deleting — set a new password via the SQL editor:
```sql
update auth.users
set encrypted_password = crypt('YourNewPassword', gen_salt('bf'))
where email = 'the-email-you-used';
```

## Notes / limits
- Free Supabase pauses a project after ~1 week of **zero** activity. Normal use keeps it awake;
  if it ever pauses, opening the Supabase dashboard resumes it.
- Storage is "last edit wins" if two devices save at the exact same moment — fine for a small
  team that isn't editing simultaneously. (A future upgrade to per-row tables removes even that.)
