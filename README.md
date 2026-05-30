# Kajola Care v16.1 Employee Username Portal

Updates in this package:
- Admin sign-in remains email/password through Supabase Auth.
- Employee sign-in now uses a separate username/password created by admin.
- Employees cannot use their employee username/password to access the admin portal.
- Admin can create, generate, reset and disable employee portal credentials in Compliance > Employees.
- Employee portal opens only assigned shifts, clock in/out and shift notes.
- Smart Scheduling remains available for assigning employees to participant shifts.

Note: In this client-only package, employee username credentials are stored inside the app snapshot available on the device/browser. For production multi-device employee login, move credential validation to a secure Supabase Edge Function or server endpoint.
