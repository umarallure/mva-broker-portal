# Skill: TypeScript Standards

## Trigger
Read this file when writing any `.ts` or `.vue` file in this project.

## Core Rules
- `strict: true` is enabled — never use `// @ts-ignore` or `// @ts-nocheck`.
- `noUnusedLocals` and `noUnusedParameters` are enforced — remove dead code, don't comment it out.
- Prefer `interface` for object shapes; use `type` for unions, intersections, and aliases.
- Export types from `src/types/` when shared across multiple files; co-locate when single-use.
- Use `as const` for literal tuples and fixed string arrays.
- Avoid `any` — use `unknown` and narrow with type guards when the type is truly unknown.
- Validate external/user input with `Zod` schemas; derive TS types via `z.infer<typeof schema>`.
- Path alias `#build/ui/*` maps to Nuxt UI internals — do not add custom aliases without updating `tsconfig.app.json`.

## Procedure
1. Define interfaces/types at the top of the file or in `src/types/`.
2. Use explicit return types on exported functions.
3. For Supabase row types, define them in the relevant `src/lib/<domain>.ts` file.
4. Run `npm run typecheck` (`vue-tsc`) before considering any change complete.

## Custom Preferences
- Target: ES2020, Module: ESNext, moduleResolution: bundler.
- Enums are discouraged — prefer union types or `as const` objects.
- Use `satisfies` operator for config objects to get type checking without widening.
