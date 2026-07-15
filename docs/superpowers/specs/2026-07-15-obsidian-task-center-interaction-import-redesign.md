# Obsidian Task Center Interaction and Import Redesign

**Date:** 2026-07-15  
**Status:** User-approved design, pending written-spec review  
**Repository:** `D:/ai-discovery/obsidian-task-matrix-calendar`

## 1. Problem Statement

The installed `0.1.0` plugin loads successfully, but its primary interaction does not yet match the intended product:

- The task workspace follows Obsidian's current light theme, which was initially mistaken for a missing dark design. The settled requirement is to continue following Obsidian rather than force a plugin-local theme.
- The project, status, due-risk, and source controls are placeholder buttons with no event handlers.
- Quick create silently does nothing when its title field is empty and does not collect the complete task data.
- The edit action uses a separate drawer pattern and is not reliably visible in the installed workspace.
- Task and calendar modes are separate Obsidian views, so the expected in-page switching and shared interaction state are absent.
- Legacy migration exists only as a command-palette action and scans too broadly; users cannot discover or safely operate it from the task center.
- The task schema has no multiline details field.

## 2. Goals

1. Replace quick create and the edit drawer with one shared task form modal.
2. Support multiline task details in readable Markdown.
3. Make all visible filters functional.
4. Combine task matrix and month calendar into one task workspace with in-page tabs.
5. Make task/calendar changes immediately visible in both modes.
6. Add a discoverable, preview-first legacy import flow that automatically scans configured task roots.
7. Continue following the active Obsidian light or dark theme.
8. Preserve Markdown as the only task source of truth and retain fingerprint-based write conflict protection.

## 3. Non-Goals

- A plugin-specific theme selector.
- Recurring tasks, hourly scheduling, reminders, mobile support, or OS notifications.
- More than one child-task level.
- A second persistent task database.
- Automatic modification of every legacy candidate without user preview.
- Importing outside configured scan roots.

## 4. Unified Task Workspace

The plugin will expose one primary workspace view with two internal modes:

- `任务`: unclassified inbox plus the four-quadrant matrix.
- `日历`: month calendar, selected-day details, and unscheduled tasks.

The view header contains a segmented `任务 / 日历` switch. Switching modes reuses the same `TaskIndex`, filters, selection, task form, and service instances. It must not open a second pane.

The existing commands remain:

- `打开任务中心` opens the unified workspace in task mode.
- `打开任务日历` opens the same workspace in calendar mode.

If a workspace leaf already exists, both commands reuse it and change only its internal mode.

## 5. Header and Filters

The header removes the quick-create text input. It contains:

- `+ 新任务`
- `导入旧任务`
- `任务 / 日历` switch

The task toolbar uses actual form controls rather than placeholder buttons:

- Search: free text across title, details, project, and tags.
- Project: `全部` plus the unique indexed projects.
- Status: `活动`, `全部`, `待办`, `进行中`, `暂停`, `已完成`.
- Due risk: `全部`, `已逾期`, `今天截止`, `即将截止`, `无风险`.
- Source: `全部` plus unique managed source paths.

Filters update the current mode immediately. Task and calendar modes share the same filter state during the lifetime of the workspace leaf.

## 6. Shared Create/Edit Task Modal

`+ 新任务`, task-card clicks, task-card `编辑`, and calendar-card clicks all open the same modal component.

### 6.1 Fields

- Title: required.
- Details: optional multiline textarea.
- Start date: defaults to the local current day for new tasks; optional when editing.
- Due date: optional.
- Quadrant: defaults to `unclassified`.
- Project: optional.
- Tags: optional comma-separated values, trimmed and deduplicated.

The UI labels `plannedDate` as `开始日期`, while the persisted schema keeps the established `计划日期::` label for backward compatibility.

### 6.2 Date Input

Both `YYYYMMDD` and `YYYY-MM-DD` are accepted. On blur and save, a valid compact value is normalized to `YYYY-MM-DD`. Invalid calendar dates show an inline error and do not close the modal.

### 6.3 Save Behavior

- Create calls `TaskService.create()` exactly once.
- Edit calls `TaskService.update()` exactly once.
- A successful write closes the modal; the index event refresh updates both task and calendar modes.
- A failed write keeps the modal open and shows the typed error near the affected field or as a form-level conflict message.
- Empty title submission shows `任务标题不能为空` instead of doing nothing.
- The old quick-create input and editor drawer are removed.

## 7. Multiline Details Markdown Contract

`TaskNode` gains `details?: string`. The canonical field is placed after classification and before project:

```markdown
- [ ] 任务标题 #task ^task-01...
  - 状态:: 待办
  - 分类:: 未分类
  - 详情::
    > 第一行
    > 第二行
  - 计划日期:: 2026-07-15
  - 截止日期:: 2026-07-31
```

Rules:

- Each logical details line is serialized as an indented Markdown blockquote.
- Empty lines are represented by an indented `>` line.
- Parsing removes only the structural indentation and the first blockquote marker, preserving line order and content.
- A details header without continuation lines resolves to an empty/absent value.
- Unknown content inside the managed task block remains a read-only format error.
- Parse → serialize → parse preserves details and the source line-ending style.
- Existing tasks without details remain valid and require no migration.

Details are included in free-text search and migration correction controls.

## 8. Task and Calendar Linkage

Both modes query the same filtered index.

Calendar placement rules remain:

- Start date only: show a main task card on the start date.
- Due date only: show a main task card on the due date with a deadline marker.
- Same start and due date: show one card with a deadline marker.
- Different start and due dates: show a main card on the start date and a compact due marker on the due date.
- No dates: show under `未安排任务`, not on a date cell.

The calendar provides:

- Previous/next month navigation.
- A 42-cell month grid.
- A selected-day task panel.
- An unscheduled-task panel.
- Click-to-edit using the shared modal.
- Dragging an unscheduled or scheduled task onto a day updates only `plannedDate`; it never changes `dueDate`.

Saving dates in the shared modal or dragging in calendar mode immediately updates the matrix risk badges and calendar placement after the repository refresh.

## 9. Legacy Import Flow

`导入旧任务` is available in the unified workspace header.

### 9.1 Discovery

The action scans only Markdown files under configured `scanRoots`, applying:

- User exclude globs.
- Unconditional trash-file exclusion.
- Unconditional backup-root exclusion.
- Exclusion of already canonical managed task blocks from legacy candidacy.

The scan is read-only and opens a preview modal.

### 9.2 Preview

Candidates are grouped by source file and show:

- Original text.
- Proposed title, multiline details, status, start date, due date, quadrant, and legacy priority.
- Confidence: high, medium, or low.
- Per-candidate selection.
- Per-file selection.
- Editable correction controls.

High-confidence candidates are selected by default. Medium- and low-confidence candidates are unselected by default.

### 9.3 Apply and Safety

- Apply receives exactly the selected candidate IDs and the user-corrected candidate values.
- Every selected source file is backed up first to `<backupRoot>/<timestamp>/<sourcePath>`.
- Writes use latest file content and reject stale preview locations.
- The result is reparsed and checked for selected IDs, unchanged unselected text, and new parser issues.
- A failed verification restores that file's backup.
- A successful import refreshes the shared index, making imported tasks visible in task and calendar modes immediately.
- Canonical block detection and stable generated task IDs prevent repeated import of the same already-converted text.

## 10. Theme and Accessibility

The plugin continues to follow Obsidian:

- Light Obsidian theme produces a light workspace.
- Dark Obsidian theme produces a dark workspace.

All surfaces use Obsidian variables such as `--background-primary`, `--background-secondary`, `--text-normal`, `--text-muted`, and `--background-modifier-border`. Quadrant colors remain accents, not the only semantic signal. Modal fields and toolbar controls have visible labels, keyboard focus rings, and usable tab order.

## 11. Error Handling

- Empty or invalid fields show inline errors and do not dispatch writes.
- Repository fingerprint conflicts keep the modal open and show path plus task ID.
- Import preview read failures are grouped by file without preventing readable files from being previewed.
- Import apply failure stops further writes for the affected file and restores its backup.
- Filter controls must never dispatch task writes.
- All asynchronous button actions disable the initiating button while pending and show a visible success or failure state.

## 12. Testing and Acceptance

Implementation follows TDD and adds regression coverage for:

- Create button opens the modal without requiring a pre-entered title.
- Create defaults start date to today and accepts both supported date formats.
- Multiline details parse/serialize/patch round trip.
- Edit button and task-card click open a populated modal.
- Create/edit validation, pending state, success close, and failure stay-open behavior.
- Every project/status/risk/source filter changes query results.
- Task/calendar internal switching reuses one view and preserves filters.
- Commands open the shared workspace in the requested mode.
- Calendar click-to-edit, unscheduled list, date placement, and planned-date-only drag.
- Automatic scan-root migration discovery, canonical-task exclusion, default candidate selection, correction persistence, backup, verification, rollback, and duplicate avoidance.
- Readability under both Obsidian light and dark theme variable sets.

Before local installation, run the complete test, coverage, lint, and production build gates. Install the verified three release artifacts with the existing backup-first installer, reload the plugin, and smoke-test create, edit, filters, task/calendar switching, and import preview without applying imports to the main Vault during verification.
