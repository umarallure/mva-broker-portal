# Skill: Clean Code Standards

## Trigger
Read this file before implementing any feature, refactoring code, or reviewing existing code.

## Core Rules
- **Single Responsibility**: Each function/component does one thing. If you need "and" to describe it, split it.
- **DRY (Don't Repeat Yourself)**: Extract repeated logic into helpers (`src/lib/`), composables, or components.
- **Meaningful Names**: Use descriptive names — `fetchUserInvoices()` not `getData()`, `isRetainerSigned` not `flag`.
- **Small Functions**: Max 30 lines per function. If longer, extract sub-functions.
- **No Magic Numbers**: Use named constants — `const MAX_RETRIES = 3` not hardcoded `3`.
- **Early Returns**: Guard clauses at the top; avoid deep nesting. Prefer `if (!valid) return` over nested `if (valid) { ... }`.
- **Immutability**: Prefer `const` over `let`. Use spread operators and array methods over mutations.
- **Error Handling**: Never silently catch errors. Log them or surface to UI via toast.
- **Comments**: Code should be self-documenting. Only comment "why", never "what".
- **Delete Dead Code**: Remove commented-out code, unused imports, and orphaned files.

## Procedure
1. Before writing new code, check if similar logic exists — reuse or refactor it.
2. Extract complex conditions into named boolean variables or functions.
3. Keep component `<script setup>` blocks under 100 lines — move logic to composables/lib.
4. Run ESLint (`npm run lint`) before considering any change complete.
5. If a function grows beyond 30 lines, pause and refactor into smaller units.
6. Review your own code: Can someone understand it without your explanation?

## Custom Preferences
- Prefer functional programming patterns (map, filter, reduce) over imperative loops.
- Use optional chaining (`?.`) and nullish coalescing (`??`) to avoid verbose null checks.
- Destructure objects/arrays at the top of functions for clarity.
- Group related imports: Vue → external libs → local composables → local lib → types.
