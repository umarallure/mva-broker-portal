# Skill: Modular Architecture & Reusability

## Trigger
Read this file when structuring new features, creating components, or refactoring large files.

## Core Rules
- **Feature-Based Organization**: Group related components in `src/components/<feature>/`.
- **Shared Components**: Truly reusable components (used 3+ times) go in `src/components/` root.
- **Service Layer**: All Supabase queries live in `src/lib/<domain>.ts` — never in components.
- **Composables for State**: Shared reactive state and logic go in `src/composables/use*.ts`.
- **Types in One Place**: Shared types in `src/types/`, domain-specific types co-located in `src/lib/`.
- **No Prop Drilling**: If passing props through 2+ levels, use a composable or provide/inject.
- **Component Composition**: Build complex UIs from small, focused components — not one giant file.
- **Extract Utilities**: Pure functions (formatting, validation, parsing) go in `src/utils/`.
- **API Functions Separate**: Vercel functions in `api/` must not import Vue code.

## Procedure
1. **Before Creating a Component**: Check if a similar one exists — extend or reuse it.
2. **Component Design**: 
   - Props for input, emits for output.
   - No direct Supabase calls — use composables or lib functions.
   - Max 150 lines per component; split if larger.
3. **Creating Reusable Logic**:
   - Pure function → `src/utils/<name>.ts`
   - Stateful logic → `src/composables/use<Name>.ts`
   - Data fetching → `src/lib/<domain>.ts`
4. **Naming Convention**:
   - Components: PascalCase (e.g., `InvoiceCard.vue`)
   - Composables: camelCase with `use` prefix (e.g., `useInvoices.ts`)
   - Lib functions: camelCase (e.g., `fetchInvoiceById`)
5. **Refactoring Trigger**: If a file exceeds 200 lines, it's time to modularize.

## Custom Preferences
- Prefer composition over inheritance — use composables, not mixins.
- Keep page components (`src/pages/`) as orchestrators — they wire composables and components together.
- Nuxt UI components are already modular — use them as building blocks (UCard, UTable, UForm).
- Extract table columns, form schemas, and config objects into separate const exports.
