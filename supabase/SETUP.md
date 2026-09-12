# Supabase setup (free tier)

CareerAtlas uses Supabase only for **authentication, saved jobs, and search history**.
Resume PDFs and extracted resume text are never uploaded or stored.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a **new free project**.
2. Pick any region close to you and save the database password somewhere safe
   (the app itself never needs it).

## 2. Create the tables and security policies

1. Open **SQL Editor → New query** in the Supabase dashboard.
2. Paste the whole contents of [`schema.sql`](./schema.sql) and press **Run**.
3. The script creates three tables — `profiles`, `search_history`, `saved_jobs` —
   enables Row Level Security on all of them, adds owner-only policies, and adds
   a trigger that creates a `profiles` row automatically on sign up.
   It is safe to run again after any edit.

Verify in **Table Editor** that each table shows the green **RLS enabled** badge.

## 3. Turn on email/password auth

1. Go to **Authentication → Sign In / Providers**.
2. Keep **Email** enabled. Password is the only sign-in method CareerAtlas uses.
3. For a smooth demo, go to **Authentication → Sign In / Providers → Email** and
   turn **Confirm email** *off*. Leave it on if you prefer verified emails — the
   sign-up screen tells the user to check their inbox in that case.
4. Under **Authentication → URL Configuration**, set the **Site URL** to
   `http://localhost:5173` for local development, and add the deployed Vercel URL
   later as an additional redirect URL.

## 4. Copy the frontend environment variables

From **Project Settings → API**, copy:

| Supabase field           | Frontend variable        |
| ------------------------ | ------------------------ |
| Project URL              | `VITE_SUPABASE_URL`      |
| Project API key (`anon`) | `VITE_SUPABASE_ANON_KEY` |

Create `frontend/.env` (copy `frontend/.env.example`) and paste them in, then
restart `npm run dev` so Vite picks up the new values.

> **Security:** only the public `anon` key belongs in the frontend. Never put the
> `service_role` key in a `VITE_` variable or anywhere in the React app — every
> `VITE_` value is bundled into the public JavaScript. Row Level Security is what
> keeps one user's rows invisible to everyone else.

## 5. What happens if the variables are missing

The app stays fully usable as a guest: search, resume-aware ranking, and AI
tailoring all work. Only accounts, saved jobs, and search history are switched
off until the two variables are set.

## Free-tier notes

- Free Supabase projects pause after about a week of inactivity; open the
  dashboard to resume one before a demo.
- Result snapshots are stored as JSON, which keeps the app within the free
  database size limits for a student-scale project.
