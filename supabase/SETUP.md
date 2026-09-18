# Supabase setup (free tier)

CareerAtlas uses Supabase for **authentication, profiles, saved jobs, search
history, and generated documents**. Extracted resume text is never stored. A
signed-in user's resume PDF is kept in a private `resumes` bucket, in a folder
only that user can open, so they do not have to upload it on every page.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a **new free project**.
2. Pick any region close to you and save the database password somewhere safe
   (the app itself never needs it).

## 2. Create the tables and security policies

1. Open **SQL Editor → New query** in the Supabase dashboard.
2. Paste the whole contents of [`schema.sql`](./schema.sql) and press **Run**.
3. The script creates four tables — `profiles`, `search_history`, `saved_jobs`,
   `job_materials` — enables Row Level Security on all of them, adds owner-only
   policies, and adds a trigger that creates a `profiles` row automatically on
   sign up. It is safe to run again after any edit.

   It also creates the private `resumes` storage bucket and its owner-only
   policies.

   **Upgrading an existing project?** Re-run the whole script. It only adds what
   is missing: the tailoring Studio needs the `job_materials` table, the
   application tracker needs the `status` and `notes` columns on `saved_jobs`
   with its update policy, and profiles plus cold emails need the columns and the
   `resumes` bucket added in sections 8 and 9.

   If the script prints `Storage policies need the dashboard`, your SQL role was
   not allowed to create them. Go to **Storage -> resumes -> Policies** and add
   four policies for `authenticated` (select, insert, update, delete), each using
   `bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text`.

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

Put the same two values in `backend/.env` (and the Render dashboard) as
`SUPABASE_URL` and `SUPABASE_ANON_KEY`. The backend uses them to verify that
document generation and job-link reading come from a signed-in user.

## 5. What happens if the variables are missing

Search and resume-aware ranking still work. Accounts, saved jobs, search history,
and the tailoring Studio's sign-in are switched off until the frontend variables
are set. Without the backend variables the API does not require sign-in, which is
fine locally but should not be deployed that way.

## Free-tier notes

- Free Supabase projects pause after about a week of inactivity; open the
  dashboard to resume one before a demo.
- Result snapshots are stored as JSON, which keeps the app within the free
  database size limits for a student-scale project.
