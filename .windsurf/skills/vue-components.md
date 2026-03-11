# Skill: Vue Components

## Trigger
Read this file when creating or modifying any `.vue` Single File Component.

## Core Rules
- Use `<script setup lang="ts">` exclusively — no Options API.
- Nuxt UI v4 components are auto-imported (UButton, UInput, UTable, etc.) — never manually import them.
- Props must be defined with `defineProps<T>()` using a TypeScript interface, not runtime syntax.
- Emits must use `defineEmits<T>()` with a typed signature.
- Keep templates declarative; move logic into composables or `lib/` helpers.
- Scoped styles (`<style scoped>`) only — no global CSS in components.
- Max one component per file; filename must match its single responsibility.
- Follow existing ESLint rule: max 3 attributes per single-line element.
- Never disable `vue/multi-word-component-names` inline — it is already off globally.

## Procedure
1. Define the typed props/emits interface at the top of `<script setup>`.
2. Import composables or lib helpers for data/logic — keep the script block lean.
3. Use Nuxt UI components for all form elements, buttons, modals, tables, and toasts.
4. Organise new components under `src/components/<feature>/` matching existing structure.
5. If the component is a full page, place it under `src/pages/` and register its route in `src/main.ts`.

## Custom Preferences
- Color tokens: primary = `green`, neutral = `zinc` (set in vite.config.ts via Nuxt UI).
- Prefer `UModal`, `USlideover`, `UDropdownMenu` for overlays — avoid custom implementations.
- Use `date-fns` for all date formatting — never raw `Date.toLocaleDateString()`.
