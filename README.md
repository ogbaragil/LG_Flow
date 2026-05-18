# LG Flow Premium PWA

Premium NDIS operations PWA for clients, invoices, transactions, PDF export, offline storage and Supabase Auth cloud sync.

## Deploy

Cloudflare Pages settings:

- Framework preset: None
- Build command: `npm install && npm run build`
- Build output directory: `dist`
- Root directory: `/`

Environment variables:

- `NODE_VERSION=20`
- `VITE_SUPABASE_URL=https://your-project.supabase.co`
- `VITE_SUPABASE_ANON_KEY=your-anon-public-key`

You can also set runtime config in `public/supabase-config.js` or in the in-app Supabase setup screen.

## Supabase

Run `supabase/schema.sql` in your LG Flow Supabase project.

## New in this build

- Personalised greeting from Supabase user metadata or email.
- User-specific onboarding for business profile.
- Business name, ABN, email, phone, address and payment details are stored in the user's private cloud snapshot.
- Exported invoices use the signed-in user's business information.
- Settings includes editable business profile.
