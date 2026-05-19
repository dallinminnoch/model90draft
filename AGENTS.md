# Codex Project Instructions - MODEL90

## MODEL90 Identity

MODEL90 is a professional life-insurance planning, LENS analysis, and Income Impact application. Treat this codebase as production-bound work, not a prototype or experiment area.

Preserve backend integration readiness. Avoid fragile shortcuts, duplicated logic, hardcoded test paths, throwaway structures, and UI-only business logic that would make a backend transition harder.

## Codex Role

Codex is the careful implementer and auditor for this repo.

- Do not freestyle broad rewrites.
- Make bounded, professional, reviewable edits.
- Protect architecture, maintainability, and source ownership.
- Audit first when cause, ownership, or downstream impact is unclear.
- Prefer the smallest correct change that keeps the system coherent.

## Architecture Ownership

- `layout.css` owns shell, layout, height, overflow, and frame structure.
- `components.css` owns reusable component families and shared component styling. Treat it as high-risk for becoming a second monolith.
- `styles.css` is legacy holding space only. Do not add to it unless neutralizing proven legacy interference.
- `app.js` is bootstrap and orchestration only. It is not a dumping ground.
- Feature logic belongs in feature modules.
- Page-local inline style or script is technical debt unless it is tiny, temporary, and explicitly justified.
- Checks belong near the feature area they protect.
- Do not mix shell fixes, component redesign, feature rewrites, graph math, CSS cleanup, and legacy cleanup in one pass.
- Do not create `components-2.css`, overflow dump files, or page-specific CSS files unless the user explicitly approves a subsystem split.

## App File Placement Rules

### CSS

- Put structural, page-wrapper, viewport, width, spacing, alignment, and layout ownership in `layout.css`.
- Put coherent reusable component-family ownership in `components.css`.
- Leave mixed, coupled, or ambiguous legacy rules in `styles.css` and call them out explicitly.
- Never move code just because it exists in `styles.css`.
- Move only clearly live ownership proven by current HTML and JS render paths.
- Preserve valid media-query structure unless the pass is explicitly scoped to change it.
- If selectors are mixed with out-of-scope selectors, do not force the move.
- If same-name selectors exist in both `styles.css` and `components.css`, do not assume duplication. If declarations differ materially, treat them as active conflict until proven otherwise.

### JavaScript

- Edit the JS file that currently owns the live render path or event behavior.
- Do not move JS between files unless explicitly asked.
- Do not introduce new framework structure.
- Keep behavior changes minimal and local.
- If CSS work reveals a JS or state bug, fix only the smallest proven cause inside the current boundary.

### HTML

- Edit only the page or template that currently renders the live UI being changed.
- Do not rework page structure unless required for the requested task.
- Do not rename classes without explicit approval.

## Refactor And Feature Removal Rules

- No redesign unless explicitly requested.
- No selector renaming unless explicitly approved.
- No value normalization unless required by the scoped fix.
- No broad sweeps such as "move the rest of this page."
- Every pass must be bounded to one coherent family, one page section, or one proven ownership seam.
- If the requested boundary is false, say so and stop.
- Prefer a truthful partial move over a fake clean sweep.
- Preserve current appearance unless the user explicitly asks for a visual change.
- Remove features surgically: delete only feature-specific pages, selectors, hooks, and route entries.
- Preserve shared workspace, navigation, header, layout, and utility infrastructure during feature removal.
- If a selector or JS hook is shared, leave it in place and report it.
- Use `PLANS.md` only for large, multi-step efforts that need a reviewed approach, living checklist, or long-running implementation sequence.
- Do not create `PLANS.md` for small bounded refactors.

## Builder-Mode Saved Data Policy

MODEL90 is currently in builder mode. Existing saved data is test data, not customer data.

- Prefer deleting obsolete saved-data compatibility fields and legacy UI or logic when safe.
- Do not preserve compatibility for imaginary users.
- Keep compatibility layers only when they protect current calculations, active flows, or architecture.
- Do not change saved shape casually. Treat saved shape changes as product decisions.

## Bounded Pass Protocol

For every pass:

1. State the pass code.
2. State the exact boundary.
3. State expected files and owners.
4. State out-of-scope items.
5. Run initial `git status --short --untracked-files=all`.
6. Make only bounded edits.
7. Run relevant checks.
8. Report unrelated dirty files separately.
9. List only current-pass files.
10. Ask `Commit this pass?` after editing passes.

If the user asks for read-only work, do not edit files, stage files, format files, clean files, or commit.

## Parallel-Thread Workflow

Multiple Codex threads may be active at the same time. Unrelated dirty files from other threads must be ignored, not restored, staged, overwritten, or folded into the current pass.

Every editing pass must maintain an ignored local pass manifest under:

```text
codex-temp-<PASSCODE>/
```

Required manifest files:

- `files.txt`
- `stage-command.txt`
- `commit-message.txt`
- `checks.txt`

Manifest rules:

- `files.txt` contains only current-pass files.
- `stage-command.txt` uses `git add --` with explicit paths only.
- `commit-message.txt` contains the generated commit message.
- `checks.txt` lists checks run and their results.
- `codex-temp-*` folders are ignored and must not be staged.

## Commit-On-Command Protocol

At the end of each editing pass, return:

```text
Pass code: <CODE>

Files changed for this pass:
- <path>

Unrelated dirty files:
- <path>

Checks run:
- <command> - passed/failed

Stage only these files:
- <path>

Generated commit message:
<message>

Commit this pass?
```

If the user says `yes`, `commit`, or `commit this pass`:

- Stage only the listed files.
- Use explicit `git add -- <file> <file>`.
- Commit with the generated message.
- Do not stage unrelated dirty files.
- Do not use `git add .`.
- Do not use `git commit -am`.
- After committing, run `git status --short --untracked-files=all` and `git log -1 --oneline`.
- Report the latest commit and remaining unrelated dirty files.

## Cleanup And Quality Alerts

When Codex finds brittle, duplicated, unoptimized, misleading, poorly-owned, or dead code, report it separately:

```text
Potential cleanup found:
- File/path:
- Issue:
- Risk:
- Recommended future pass:
- Safe to delete now: yes/no/unclear
```

Do not fix cleanup unless it is inside the current pass boundary.

## Quality Expectations

- Prefer small, reviewable diffs.
- Prefer pure helpers before runtime wiring.
- Prefer runtime wiring before display.
- Prefer display before polish.
- Do not duplicate business logic in UI renderers.
- Do not hide complex calculation behavior in display code.
- Do not change formulas casually.
- Do not change saved shape casually.
- Do not add settings unless a product decision requires them.
- Do not fake data, runtime proof, or check coverage.
- If a check is blocked by an older pass-specific source guard, explain why and identify the authoritative checks for the current pass.

## Verification

- Use source-level checks first.
- Use browser or Playwright smoke checks when UI, layout, graph, or page behavior changes.
- Do not ask the user to run checks unless clearly labeled as a manual check.
- If plain `node` is unavailable, use bundled Node:

```powershell
$env:LOCALAPPDATA\OpenAI\Codex\bin\node.exe
```

## Commit Message Style

Commit messages must be short, imperative, and specific. Avoid vague messages like `updates` or `fix stuff`.

Examples:

- `Add transition outlook graph annotation`
- `Wire Income Impact transition outlook runtime`
- `Clarify healthcare expense duration behavior`
- `Remove asset offset source selector`
