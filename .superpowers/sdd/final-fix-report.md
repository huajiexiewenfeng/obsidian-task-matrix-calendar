# Final Review Fix Wave Report

Date: 2026-07-15

Base: `fa5c72197d43131600405786b844185c78c4f662`

Scope: four Important final-review findings plus the Minor rejected-date test gap.

## Finding 1: Explicit Date Clearing

- RED: `npm.cmd test -- tests/ui/task-form-modal.test.ts tests/services/task-service.test.ts tests/domain/dates.test.ts`
  - `submits empty edit dates as explicit clears` failed because the edit modal sent `plannedDate: undefined` and `dueDate: undefined`.
- Fix: edit mode now maps normalized blank dates to the service's explicit clear contract (`''`); create mode continues to send `undefined` for an empty optional date.
- Persistence regression: `TaskService.update(..., { plannedDate: '', dueDate: '' })` reparses with both dates absent.
- GREEN: 3 files, 38 tests passed.
- Files: `src/ui/task-form-modal.ts`, `tests/ui/task-form-modal.test.ts`, `tests/services/task-service.test.ts`.

## Finding 2: Migration Domain Validation

- RED: `npm.cmd test -- tests/services/migration-service.test.ts tests/ui/migration-modal.test.ts`
  - Service accepted a blank selected correction and resolved; a prior valid file could be written first.
  - Modal dispatched `apply()` with a blank title and an `in-progress`/`unclassified` task.
- Fix:
  - Added shared `validateTaskDraft()` for normalized nonblank titles, exact valid ISO dates, and classification of every non-`todo` task.
  - `TaskService.create()` and `TaskService.update()` reuse the domain validator.
  - `MigrationService.apply()` gathers and validates every selected correction across all files before any backup or write.
  - `MigrationModal` displays candidate-local title/quadrant errors and does not dispatch invalid selections.
- Atomicity regression verifies both source files remain byte-for-byte unchanged and no backup path is created when any selected correction is invalid.
- GREEN: 4 files, 40 tests passed.
- Files: `src/domain/rules.ts`, `src/services/task-service.ts`, `src/services/migration-service.ts`, `src/ui/migration-modal.ts`, and migration/service tests.

## Finding 3: Duplicate Async Task Actions

- RED: `npm.cmd test -- tests/ui/task-workspace-view.test.ts`
  - Double-clicking an unclassified Start invoked two classification prompts.
  - Double-clicking direct Pause invoked two service transitions.
- Fix: `TaskWorkspaceView` tracks one pending action per task ID, guards reentry before the first await, rerenders immediately, and clears state in `finally`. `renderTaskCard()` disables that card's action controls while pending.
- Regressions verify one prompt/service call, all controls on the pending card disabled, unrelated-card controls enabled, and controls restored on completion.
- GREEN: workspace/card focused set, 9 tests passed.
- Files: `src/ui/task-workspace-view.ts`, `src/ui/task-card.ts`, `tests/ui/task-workspace-view.test.ts`.

## Finding 4: Persistent Visible Filter Labels

- RED: workspace DOM regression failed because the filter controls had no containing `<label>`.
- Fix: visible captions now wrap Search, Project, Status, Due Risk, and Source controls using real labels. Existing `data-filter` attributes remain on the controls.
- Regression asserts all five captions; existing filtering and search focus/caret tests continue to pass.
- GREEN: all affected tests, 65 tests passed.
- Files: `src/ui/task-workspace-view.ts`, `tests/ui/task-workspace-view.test.ts`.

## Minor: Exact Rejected Date Shapes

- Added table coverage for `2026/07/15`, `2026-7-15`, `2026071`, `202607150`, and `2026-07-15T00:00:00`.
- These tests were GREEN immediately because the existing parser already enforced the approved exact shapes; no production change was needed.
- File: `tests/domain/dates.test.ts`.

## Final Gates

- Focused affected tests: PASS — 7 files, 65 tests.
- Full suite (`npm.cmd test`): PASS — 28 files, 143 tests.
- Coverage (`npm.cmd run coverage`): PASS — statements 91.81%, branches 81.54%, functions 90.00%, lines 93.92%.
- Lint (`npm.cmd run lint`): PASS.
- Production build (`npm.cmd run build`): PASS.
- Whitespace (`git diff --check`): PASS; Git only reported informational LF-to-CRLF working-copy warnings.

## Self-Review

- Markdown-only persistence remains unchanged; no database or alternate store was added.
- Repository fingerprint conflict checks and refresh behavior were not bypassed or weakened.
- Migration backup-before-write, stale-plan checks, post-write verification, and rollback remain intact; validation now runs earlier, before any file side effect.
- The unified single workspace remains the only task/calendar surface.
- No dependency or package-script changes were made.
- Existing create-mode date defaults, filter selectors, filtering behavior, focus/caret restoration, and accessible naming remain covered.
- No external Vault install command was run.
- Diff review found no unrelated source changes.

## Concerns

- No known functional blocker.
- The production build updates local ignored build output only; the committed scope is source, tests, and this report.
