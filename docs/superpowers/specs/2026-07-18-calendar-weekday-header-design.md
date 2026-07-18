# Calendar Weekday Header Design

## Goal

Make the month calendar immediately readable by adding a visible weekday header in the order `周一、周二、周三、周四、周五、周六、周日`, with every label aligned to its date column.

## Scope

- Add a seven-column weekday header above the month grid.
- Change the month model from Sunday-first to Monday-first so the labels and dates agree.
- Preserve the existing adaptive five- or six-week month height, task entries, status colors, date selection, drag-and-drop, filters, and side panels.

The completed-task entry is explicitly out of scope because the existing status filter already provides access and the user chose not to change it.

## Approaches considered

1. **Semantic weekday row plus Monday-first model (selected).** Render a dedicated seven-column header and update the date offset calculation. This is explicit, accessible, testable, and keeps labels aligned with actual dates.
2. **CSS pseudo-elements above the existing grid.** This would minimize DOM changes, but the labels would not be semantic or easy to test and could drift under responsive layouts.
3. **Weekday text inside the first seven date cells.** This saves one row, but mixes column labels with date content and makes the first week visually inconsistent.

## Rendering design

`renderCalendarPanel` will create a calendar-month container in the left column. The container owns:

1. `.tmc-calendar-weekdays`, containing seven weekday labels with column-header semantics.
2. `.tmc-calendar-grid`, containing the existing 35 or 42 date cells.

The existing selected-day and unscheduled panels remain in the right column. On narrow panes, the calendar-month container and side panels continue to stack vertically.

The weekday row uses the same seven equal-width columns as the date grid. Weekends may use the muted text color, but no new business meaning or status color is introduced.

## Calendar model

The Monday-based offset is `(getUTCDay() + 6) % 7`:

- Monday maps to column 0.
- Tuesday through Saturday map to columns 1 through 5.
- Sunday maps to column 6.

The visible cell count remains `max(35, ceil((offset + daysInMonth) / 7) * 7)`, so months still render only the five or six weeks they require.

## Accessibility

- The weekday container uses row semantics.
- Each weekday label uses column-header semantics.
- Visible text is the full Chinese form `周一` through `周日`, not a single-character abbreviation.

## Verification

- A model test proves July 2026 begins at Monday, 2026-06-29, and retains 35 cells.
- A model test proves a six-week month remains 42 cells under Monday-first calculation.
- A rendering test proves exactly seven weekday headers appear in the required order.
- Existing calendar interaction tests continue to pass.
- The complete test, coverage, lint, and production build gates must pass before installation into the local Obsidian Vault.
