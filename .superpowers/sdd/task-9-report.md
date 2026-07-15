# Task 9 Report: Plugin Wiring and Single-Leaf Commands

## Status

Complete. The plugin now registers one `TaskWorkspaceView`, reuses one workspace leaf for task/calendar/ribbon activation, and routes both migration entry points through the same zero-argument `MigrationModal.preview()` instance.

Base commit: `b6afe1d`

## TDD evidence

- RED: `npx.cmd vitest run tests/plugin-lifecycle.test.ts` exited 1 with 3 expected failures: the plugin registered the legacy task/calendar views, task/calendar commands did not create the unified workspace, and the shared migration modal could not be reached from the workspace.
- GREEN: `npx.cmd vitest run tests/plugin-lifecycle.test.ts` exited 0: 1 file passed, 3 tests passed.
- Focused UI/lifecycle: `npx.cmd vitest run tests/plugin-lifecycle.test.ts tests/ui` exited 0: 9 files passed, 37 tests passed.
- Full suite (run once): `npm.cmd test` exited 0: 28 files passed, 129 tests passed.
- Build: `npm.cmd run build` exited 0 (`tsc -noEmit -skipLibCheck` plus production esbuild).
- Lint: `npm.cmd run lint` exited 0.
- Diff validation: `git diff --check` exited 0.
- Legacy reference scan returned `NO_LEGACY_REFERENCES` for `TaskMatrixView`, `TASK_MATRIX_VIEW_TYPE`, `TaskEditorDrawer`, `task-editor-drawer`, `CALENDAR_VIEW_TYPE`, and `new CalendarView` under `src` and `tests`.
- Preview argument scan returned `NO_PREVIEW_ARGUMENTS` under `src` and `tests`.

PowerShell blocked the `npx.ps1` shim under the machine execution policy, so the equivalent Windows executable shim `npx.cmd` was used for all requested Vitest commands.

## Files modified

- `src/main.ts`
- `src/services/migration-service.ts`
- `src/ui/calendar-view.ts`
- `src/ui/migration-modal.ts`
- `tests/mocks/obsidian.ts`
- `tests/plugin-lifecycle.test.ts`
- `tests/ui/calendar-view.test.ts`

## Files deleted

- `src/ui/task-matrix-view.ts`
- `tests/ui/task-matrix-view.test.ts`
- `src/ui/task-editor-drawer.ts`
- `tests/ui/task-editor-drawer.test.ts`

## Self-review

- Command IDs remain `open-task-matrix`, `open-task-calendar`, and `migrate-legacy-tasks`.
- Only `TASK_WORKSPACE_VIEW_TYPE` is registered; task/calendar commands and the ribbon all call `activateTaskWorkspace`.
- A new leaf is created only when no workspace leaf exists, then `leaf.view` is mode-switched and revealed; lifecycle tests assert `getLeaf` is called once across task/calendar/ribbon routes.
- One `TaskFormModal` and one `MigrationModal` are constructed during plugin load and injected into the workspace creator.
- The migration command and workspace import button invoke the same modal object and pass no preview argument.
- `MigrationService.preview()` discovers paths from its vault port; its public API no longer accepts a legacy path override.
- The `CalendarView` compatibility class/type constant were removed while `buildMonthModel` and `renderCalendarPanel` remain covered by UI tests.
- The diff contains no unrelated edits and no whitespace errors.

## Concerns

None.
