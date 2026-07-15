# Task 5 Report: Three-Step Legacy Import Wizard

## Scope

- Baseline SHA: `4af40dd227c61524fc0501eb4fb9baa8970b8ccc`
- Implementation SHA: `5ebe77becc9e28bb5461c1abcc674b702702921e`
- Implemented the approved three-step flow: explicit Markdown file selection, candidate review/correction, and final write confirmation.
- Replaced `MigrationModal` with one shared `LegacyImportWizard` instance for both the command and workspace action.
- Removed the Task 4 `confidence` compatibility layer; the wizard consumes `recognition.kind`, `recognition.reason`, and `recognition.defaultSelected` directly.
- No external Vault or ledger was read or modified.

## RED Evidence

1. Wizard module RED:
   - Command: `npm.cmd test -- tests/ui/legacy-import-wizard.test.ts`
   - Result: exit `1`; Vitest could not resolve `../../src/ui/legacy-import-wizard` because the module did not exist.
2. Plugin wiring RED:
   - Command: `npm.cmd test -- tests/plugin-lifecycle.test.ts`
   - Result: exit `1`; expected command name `导入旧任务`, received the old `预览旧任务迁移`, proving the old modal wiring was still active.
3. Apply-error state RED found during self-review:
   - Command: `npm.cmd test -- tests/ui/legacy-import-wizard.test.ts -t "keeps the wizard open"`
   - Result: exit `1`; the pending status remained visible after a rejected apply.

## GREEN Evidence

- Implemented `renderLegacyCandidateEditor()` with cloned `TaskNode` updates and editable title, details, status, planned/due dates, quadrant, project, and tags.
- Implemented the `select -> review -> confirm` state machine with stable action selectors, correction/selection preservation, validation and date normalization, backup summaries, failure feedback, cancel/back navigation, and final-confirm-only apply.
- Apply is single-flight: `pending` is set before the first `await`; all visible controls are disabled and a double click invokes `apply()` once.
- Apply failures keep the wizard open, hide the pending status, show the error, and restore controls. Success shows `Notice`, closes the wizard, and relies on `MigrationService.apply()` for repository refresh after verified writes.
- Replaced legacy modal CSS with the required wizard selectors, Obsidian theme variables, evidence-before-fields layout, sticky actions, and a single-column layout below `650px`.

## Final Verification

All commands were run fresh after the last behavior change:

| Check | Command | Result |
| --- | --- | --- |
| Focused tests | `npm.cmd test -- tests/ui/legacy-import-wizard.test.ts tests/services/legacy-task-candidates.test.ts tests/services/migration-service.test.ts tests/plugin-lifecycle.test.ts` | 4 files, 30 tests passed |
| Full tests | `npm.cmd test` | 31 files, 165 tests passed |
| Build | `npm.cmd run build` | exit `0` |
| Lint | `npm.cmd run lint` | exit `0` |
| Diff whitespace | `git diff --check` | no output |
| Legacy residue | `rg -n "migration-modal|MigrationModal|MigrationPlanCandidate|confidence|tmc-migration-row" src tests styles.css` | no matches |

## Self-Review

- Confirmed `apply()` is unreachable from select/review actions and is called only by the final confirm action.
- Confirmed revisiting unchanged candidate IDs preserves both edits and deliberate selection changes.
- Confirmed only candidates in the current preview plan can be validated or applied; stale retained corrections are not submitted.
- Confirmed every candidate row includes the relative path, one-based line number, exact source text, recognition reason, and proposed editable fields.
- Confirmed all foreground/background declarations added for the wizard use Obsidian theme variables.
- Confirmed old modal source/test and temporary confidence mapping have no imports or references.

## Known Issues

- No known blocking functional issues.
- Per task constraints, no manual smoke test was run against an external Obsidian Vault; automated jsdom, service, lifecycle, full-suite, build, and lint verification cover the delivered change.
