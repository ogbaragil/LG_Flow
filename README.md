# LG-Flow PWA

This is a GitHub-ready PWA conversion of the uploaded LG-Flow React Native/Expo app. It preserves the intended app flow: dashboard, clients, archived clients, invoices with service lines, invoice PDF export, transactions with filters, backup/restore, offline local storage, Supabase sync hooks, and Cloudflare Pages deployment.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env`.
4. Add your project URL and anon key.

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The app works offline first with browser local storage. Supabase sync is available from Settings once environment variables are configured.

## Cloudflare Pages

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

## GitHub Actions

`.github/workflows/cloudflare-pages.yml` is included. Add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Notes

- `docs/original-react-native-reference.js` is included as a reference copy of the uploaded app source.
- The PWA uses web equivalents for Expo features: localStorage for AsyncStorage, file download/upload for backup, and jsPDF for invoice PDF export.

## Supabase Auth setup

1. In Supabase, open **Authentication → Providers → Email** and enable Email sign ups/sign ins.
2. In **Authentication → URL Configuration**, add your Cloudflare Pages URL to Site URL and Redirect URLs.
3. Run `supabase/auth-app-snapshots.sql` in the Supabase SQL Editor.
4. Redeploy the app on Cloudflare Pages.

Cloud sync is now private per signed-in Supabase user.
