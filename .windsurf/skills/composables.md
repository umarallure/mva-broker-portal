# Skill: Vue Composables

## Trigger
Read this file when creating, modifying, or consuming any composable (`src/composables/use*.ts`).

## Core Rules
- Every composable file exports a single `use<Name>` function as a named export.
- Use `ref`, `computed`, `readonly` from Vue — avoid `reactive` for top-level state to prevent unwrap issues.
- For app-wide singletons (auth, dashboard), wrap with `createSharedComposable` from `@vueuse/core`.
- Composables must never import `.vue` files — they are pure TypeScript.
- Keep Supabase calls in `src/lib/` helpers; composables orchestrate, they don't query directly (except `useAuth` which is the established exception).
- Return `readonly()` refs for state that consumers should not mutate directly.
- Name the internal factory `_use<Name>` when using `createSharedComposable`.

## Procedure
1. Create `src/composables/use<Name>.ts`.
2. Define reactive state with `ref<T>()`, typed generically.
3. Define async action functions that call `src/lib/` helpers.
4. Return an object: `{ state: readonly(state), ...actions }`.
5. If singleton behaviour is needed, wrap with `createSharedComposable`.
6. Consume in components via `const { state, action } = use<Name>()`.

## Custom Preferences
- Existing composables: `useAuth`, `useAttorneyProfile`, `useDashboard` — follow their patterns.
- Prefer `console.info('[scope]', ...)` for debug logging inside composables.
- Never throw raw errors to the UI; catch and surface via Nuxt UI toast (`useToast()`).
