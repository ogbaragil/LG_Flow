# Kajola Care v16.7 - Schedule Load Fix + Employee Portal Route

## Changes
- Fixed Schedule page loading issue by normalising shift records before rendering.
- Added stronger null-safety for workers, clients and shift data loaded from Supabase/local snapshots.
- Added independent employee portal routes:
  - `/employee`
  - `/employee-portal`
  - `/worker`
  - `/staff`
- These routes show employee username/password sign-in only.
- Admin login remains available on the main app route `/`.
- Employee shift actions continue to auto-save to Supabase through the employee portal RPC functions.
- Admin still auto-loads cloud data on sign-in but does not auto-backup edits unless manually synced.

## Deployment note
For single-page hosting such as Cloudflare Pages, configure fallback routing so `/employee` serves `index.html`.
