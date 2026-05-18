# LG-Flow PWA

A GitHub-ready Progressive Web App version of the uploaded LG-Flow app. It includes offline support, installable PWA manifest, PDF invoice export, local backup/restore, optional Supabase cloud sync, and Cloudflare Pages deployment files.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open the local URL shown by Vite.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy your project URL and anon key into `.env`:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The app still works offline without Supabase. Supabase is used for manual snapshot sync from Settings.

## GitHub import

1. Create a new GitHub repo.
2. Upload or push all files in this folder.
3. Add GitHub repository secrets for Cloudflare deployment:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push to `main` to deploy with the included workflow.

## Cloudflare Pages manual deploy

```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name lg-flow-pwa
```

Set these Cloudflare Pages environment variables if using Supabase:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Notes

- Data is saved locally first for offline use.
- Backup JSON export/import is included.
- The included Supabase policy is intentionally simple for quick start. For production, use Supabase Auth and per-user row policies.
