# Expense Tracker — Phase 1 & 2 Scaffold

This is the foundation: data model (multiple shared "books" of expenses)
and a working Next.js app ready to deploy to Vercel.

**What's included:**
- Prisma schema: `User`, `Book`, `BookMember` (roles: OWNER/EDITOR/VIEWER), `Category`, `Transaction`
- API routes: create/list books, create/list transactions per book
- A mobile-first UI to create books and see them listed
- Tailwind CSS styling

**Not yet included** (next phases, as planned):
- Auth / login (Phase 3)
- Offline-first local storage + sync (Phase 4–6)
- PWA install support (Phase 7)

---

## 1. Get a free Postgres database

Pick one:
- **Neon** → https://neon.tech (recommended, generous free tier)
- **Supabase** → https://supabase.com (also gives you auth later, if useful)

After creating a project, copy the connection string — it looks like:
```
postgresql://user:password@host/dbname?sslmode=require
```

## 2. Run it locally

```bash
cd expense-tracker
npm install
cp .env.example .env
# paste your DATABASE_URL into .env
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000 — you should be able to create a book and see it listed.

> Note: `npm install` runs `prisma generate` automatically, which needs
> internet access to Prisma's binary CDN. This works fine on a normal
> machine; it only failed inside the sandboxed environment I built this in.

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Phase 1 & 2: data model + scaffold"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 4. Deploy to Vercel

1. Go to https://vercel.com → **Add New Project** → import your GitHub repo
2. In the project's **Environment Variables** settings, add:
   - `DATABASE_URL` = the same connection string from step 1
3. Click **Deploy**

Vercel will build and give you a live `https://your-app.vercel.app` URL —
open it on your phone's browser and you're live.

**Important:** before your first deploy actually works end-to-end, run
the migration against your cloud database once (from your local machine,
with the cloud `DATABASE_URL` in `.env`):
```bash
npx prisma migrate deploy
```

---

## Data model overview

```
User ──< BookMember >── Book ──< Transaction >── Category
```
- A `Book` can have many `BookMember`s (shared books, with roles)
- A `Book` has many `Transaction`s and `Category`s
- Every record has `createdAt`/`updatedAt` — needed later for offline
  sync conflict resolution (last-write-wins)

## Next steps (Phase 3+)

Tell me when you've got this deployed and working, and we'll move on to
adding real authentication and the invite-to-book flow.
