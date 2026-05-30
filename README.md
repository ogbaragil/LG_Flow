# Kajola Care v16.5 - End-to-End Shift Operations

This release completes the shift operations workflow:

1. Admin creates and assigns a client shift.
2. Worker sees only their assigned shifts in the employee portal.
3. Worker clocks in.
4. Worker clocks out.
5. Worker submits shift notes.
6. Shift becomes Completed only after notes are submitted.
7. Admin reviews clock-in/out evidence and worker notes.
8. Admin generates timesheet status.
9. Admin generates an invoice-ready record and creates a draft invoice from the reviewed shift.

## Important Supabase step
Run `supabase/schema.sql` in Supabase SQL Editor if you have not already installed the employee portal RPC functions from v16.4 or later.

## Build
`npm install`
`npm run build`
