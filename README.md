# Kajola Care v16.1 Employee Username Portal

Updates in this package:
- Admin sign-in remains email/password through Supabase Auth.
- Employee sign-in now uses a separate username/password created by admin.
- Employees cannot use their employee username/password to access the admin portal.
- Admin can create, generate, reset and disable employee portal credentials in Compliance > Employees.
- Employee portal opens only assigned shifts, clock in/out and shift notes.
- Smart Scheduling remains available for assigning employees to participant shifts.

Note: In this client-only package, employee username credentials are stored inside the app snapshot available on the device/browser. For production multi-device employee login, move credential validation to a secure Supabase Edge Function or server endpoint.

## v16.4 employee portal production notes

This version fixes the Worker Portal blank-page issue caused by the shift-duration helper being scoped only to the admin scheduling screen.

It also changes employee login from device-local lookup to Supabase-backed lookup when the new SQL functions are installed. This means an employee can sign in from their own phone/device using only their employee username and password.

Important setup step:
1. Open Supabase SQL Editor.
2. Run the updated `supabase/schema.sql` file, or at minimum the final section titled `Employee portal username/password RPCs`.
3. Sign into the admin app once and allow the workspace to auto-sync, or press Settings > Sync to Supabase.
4. Employees can then sign in from their own devices.
