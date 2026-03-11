# Skill: Error-Free Code Standards

## Trigger
Read this file before marking any feature as "done" or before committing code.

## Core Rules
- **No Runtime Errors**: Code must compile and run without throwing errors.
- **Break Nothing**: Before implementing, identify what could break. Verify those areas still work.
- **Validate All Inputs**: Use Zod schemas for API payloads, form data, and external sources.
- **Type Safety ≠ Runtime Safety**: TypeScript won't catch invalid API responses — validate them.
- **Handle All Error Cases**: Every async call must have error handling — never ignore the error branch.
- **No Console Errors**: Check browser DevTools — zero red errors, no 404s, no CORS issues.
- **TypeCheck Must Pass**: Run `npm run typecheck` — fix all TypeScript errors before declaring done.
- **Lint Must Pass**: Run `npm run lint` — fix all ESLint errors before declaring done.

## Procedure
1. **Before Implementation**: Identify related files/components that could be affected by your changes.
2. **During Implementation**: 
   - Add proper error handling for all async operations.
   - Use optional chaining (`?.`) to prevent null reference errors.
   - Add Zod validation for external/user input.
3. **After Implementation**: 
   - Run `npm run typecheck` — must show 0 errors.
   - Run `npm run lint` — must show 0 errors.
   - Start dev server (`npm run dev`) — must start without errors.
   - Open browser DevTools console — must show no red errors.
   - Click through the affected feature — must work without console errors.
4. **Only Then**: Mark the task as complete.

## Custom Preferences
- Use `UToast` (Nuxt UI) to surface errors to users — never fail silently.
- Log errors with context: `console.error('[scope]', 'Error message', error)`.
- Prefer try-catch blocks for critical operations that must not crash the app.
- Check that existing functionality still works after your changes.
