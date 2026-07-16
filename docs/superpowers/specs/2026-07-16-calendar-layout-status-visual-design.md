# Calendar Layout and Status Visual Design

## Goal

Keep the month calendar inside the Obsidian task workspace boundary and make every calendar task visually match the status semantics used by task cards.

## Root cause and layout decision

`renderCalendarPanel` adds both `task-matrix-calendar` and `tmc-calendar-view` to the nested calendar host. The shared `task-matrix-calendar` class sets `min-height: 100%`, so the nested calendar consumes a full workspace height in addition to the workspace header and filter bar. The six-week month grid therefore extends below the pane.

The calendar-specific rule must reset that inherited minimum with `min-height: 0`. The shared root rule remains unchanged because dialogs and the outer task workspace still depend on it.

## Calendar status semantics

Every generated calendar entry carries the task's canonical status through `data-status`:

- `todo`: muted gray
- `in-progress`: Obsidian interactive accent purple
- `paused`: orange
- `done`: green

The calendar entry uses the same status color as a narrow left border and a restrained tinted background. The entry text remains readable with Obsidian theme variables in light and dark themes.

## Deadline semantics

Status and deadline risk remain independent:

- A planned-date task uses its status color for the left border and background.
- A due-date marker keeps red text to communicate the deadline.
- A due-date marker still uses the task status color for its left border and tinted background.

This prevents a red deadline marker from hiding whether the task is waiting, active, paused, or completed.

## Data and rendering changes

`CalendarEntry` gains a `status` field copied from `TaskNode.status` for planned entries, due-only entries, and due markers. `renderCalendarPanel` writes that value to `button.dataset.status` without changing click, drag, drop, date selection, filters, or task editing behavior.

CSS maps `.tmc-calendar-entry[data-status="..."]` to the same semantic colors as task cards. No new persisted fields or Markdown changes are introduced.

## Verification

- A CSS regression test proves the nested calendar resets `min-height`.
- Calendar model tests prove every entry kind preserves task status.
- Calendar rendering tests prove status datasets are present on buttons.
- CSS tests prove all four calendar status selectors exist and due markers retain red text.
- The complete test, coverage, lint, and production build gates must pass.
- The built plugin is installed into the local Vault and verified in the real Obsidian calendar before the README screenshot is produced.

## README screenshot

The final calendar screenshot must come from the corrected real plugin state. A generated edit may improve crop, spacing, and text safety but must not invent functionality or contradict the implemented layout.

Sanitization uses these replacements:

- `Smarthub` and `smarthub` become `test`.
- The standalone task-title prefix `AP-` becomes `CC-`; `APP` remains unchanged.
- The word `机库` is removed.

The final asset is stored in the repository and referenced from `README.md` alongside the task-matrix screenshot.
