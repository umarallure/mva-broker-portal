# Skill: Routing & Vercel API

## Trigger
Read this file when adding pages/routes, modifying navigation guards, or creating Vercel serverless functions.

## Core Rules
- All client routes are defined in `src/main.ts` inside `createRouter({ routes: [...] })`.
- Use lazy imports: `component: () => import('./pages/<name>.vue')`.
- Auth guards live in `router.beforeEach` (in `main.ts`) — do not add per-route guard files.
- Route meta flags: `public` (no login needed), `requiresAdmin`, `requiresSuperAdmin`.
- Serverless API functions go in `api/<name>.ts` and are deployed to Vercel automatically.
- API functions must use `@vercel/node` types: `VercelRequest`, `VercelResponse`.
- `vercel.json` rewrites are already configured — check it before adding new API routes.

## Procedure
1. Create the page component in `src/pages/<name>.vue`.
2. Add the route entry in `src/main.ts` with the correct `meta` flags.
3. If the page needs admin access, set `meta: { requiresAdmin: true }`.
4. For API endpoints, create `api/<name>.ts` exporting a default handler function.
5. Validate request body with Zod in API handlers before processing.
6. Test the route locally with `npm run dev` and verify guard behaviour.

## Custom Preferences
- Keep routes flat — avoid deeply nested route children (settings is the one exception).
- Page filenames use kebab-case matching the URL path segment.
- Dynamic params use `:param` syntax (e.g., `/orders/:id`).
- Prefer returning JSON with proper HTTP status codes from API functions.
