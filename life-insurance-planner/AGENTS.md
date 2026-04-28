# AGENTS.md

This repository is being refactored incrementally. Do not redesign, rename, or broadly rewrite anything unless explicitly asked.

## Primary architecture rules

- `layout.css` owns shell, scaffold, wrapper, viewport, width, spacing, alignment, and page-structure ownership.
- `components.css` owns coherent UI/component families only.
- `styles.css` is legacy holding space and should shrink over time toward:
  - dead code
  - stale bridge code
  - mixed tails
  - intentionally deferred leftovers
- Do not create a `components-2.css` or overflow dump file.
- Do not create page-specific CSS files unless the user explicitly approves a subsystem split.

## File placement rules

### CSS
- Put structural/page-wrapper/layout ownership in `layout.css`.
- Put coherent reusable family ownership in `components.css`.
- Leave mixed, coupled, or ambiguous rules in `styles.css` and call them out explicitly.
- Never move code just because it exists in `styles.css`.
- Move only clearly live ownership proved by current HTML/JS render paths.
- Preserve valid media-query structure exactly.
- If a selector is mixed with out-of-scope selectors, do not force the move.

### JavaScript
- Edit the JS file that currently owns the live render path or event behavior.
- Do not move JS between files unless explicitly asked.
- Do not introduce new framework structure.
- Keep behavior changes minimal and local.
- If CSS work reveals a JS/state bug, fix only the smallest proven cause.

### HTML
- Edit only the page/template that currently renders the live UI being changed.
- Do not rework page structure unless required for the requested task.
- Do not rename classes without explicit approval.

## Refactor rules

- No redesign.
- No selector renaming.
- No value normalization unless required to preserve current behavior.
- No broad sweeps like “move the rest of X page.”
- Every pass must be bounded to one coherent family or one page section.
- If the requested boundary is false, say so and stop.
- Prefer a truthful partial move over a fake clean sweep.
- Preserve current appearance unless the user explicitly asks for a visual change.

## Cleanup rules

- Cleanup is allowed only when the target is provably dead or duplicated.
- Before removing CSS, confirm there are no current HTML or JS render hits.
- If same-name selectors exist in both `styles.css` and `components.css`, do not assume duplication.
- If the declarations differ materially, treat them as active conflict, not safe cleanup.
- Do not fold unrelated cleanup into a migration pass.

## Feature removal rules

- Remove features surgically.
- Delete only feature-specific pages, selectors, hooks, and route entries.
- Preserve shared workspace, nav, header, layout, and utility infrastructure.
- If a selector or JS hook is shared, leave it in place and report it.

## Audit-first workflow

For any non-trivial task:
1. Read current repo state first.
2. Prove the target is live using current HTML/JS.
3. Identify exact selectors/files in scope.
4. Exclude mixed or shared seams explicitly.
5. Make the smallest honest change.
6. Report what part of the app changed so it can be verified in-browser.

## Verification expectations

Always tell the user exactly what part of the web app changed and what to verify.
Examples:
- which page(s)
- which component/family
- what should still be untouched
- what responsive area should be checked

## Commit discipline

- Do not commit automatically unless the user explicitly asks.
- Prefer batching commits every 3 clean refactors when requested.
- Do not describe incomplete work as finished.

## Current project-specific guidance

- Treat `components.css` as high-risk for becoming a second monolith.
- Prefer `layout.css` whenever ownership is truly structural.
- Be extra skeptical about:
  - broad Client Detail modal moves
  - broad prospect/profile form moves
  - anything that tries to “finish the page”
- When a messy area is not honestly bounded, do not force it. Name the seam correctly and either:
  - choose a smaller clean slice, or
  - propose a broader honest boundary for approval.

## When to use plans

Use a `PLANS.md` file only for large, multi-step efforts that need:
- a reviewed approach before editing
- a living checklist
- a long-running implementation sequence

Do not create `PLANS.md` for small bounded refactors.
