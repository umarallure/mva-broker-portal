# Skill: Supabase Data Layer

## Trigger
Read this file when writing or modifying Supabase queries, creating migrations, or changing RLS policies.

## Core Rules
- The single Supabase client lives at `src/lib/supabase.ts` — never create another instance.
- All query/mutation functions belong in `src/lib/<domain>.ts` (e.g., `invoices.ts`, `orders.ts`).
- Always type query results explicitly; avoid `any`. Use `as` casts only on `.maybeSingle()` / `.single()` returns.
- Handle `{ data, error }` from every Supabase call — never ignore the error branch.
- Use `.select()` to request only the columns you need; never `select('*')` without justification.
- Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required; validated in `supabase.ts`.
- SQL migrations go in `supabase/migrations/` with timestamp-prefixed filenames: `YYYYMMDDHHMMSS_<description>.sql`.
- Every new table must have RLS enabled and at least one policy before merging.

## Procedure
1. Create or update the query function in the appropriate `src/lib/<domain>.ts` file.
2. Return typed data; define interfaces in the same file or in `src/types/` if shared.
3. If a new table is needed, create a migration file, enable RLS, and add policies.
4. Test queries against actual Supabase project; never assume schema matches.
5. For auth-related queries, rely on `useAuth` composable — do not call `supabase.auth` directly from pages.

## Custom Preferences
- Use `.maybeSingle()` when a row may not exist; `.single()` when it must.
- Prefer Supabase RPC (`supabase.rpc(...)`) for complex multi-table operations.
- Use `Zod` schemas to validate data coming from external input before inserting.
