# Calendar Weekday Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible `周一` through `周日` header to the month calendar and make the calendar model Monday-first.

**Architecture:** Keep date calculation in `buildMonthModel`, but replace the Sunday offset with a Monday-based offset. Wrap the weekday row and existing date grid in a focused month container so the left calendar column remains aligned while the existing side panels and responsive stacking remain unchanged.

**Tech Stack:** TypeScript 5.8, Obsidian DOM APIs, CSS Grid, Vitest 4 with jsdom.

## Global Constraints

- Weekday order is exactly `周一、周二、周三、周四、周五、周六、周日`.
- The date model starts every rendered week on Monday and ends it on Sunday.
- Five- and six-week adaptive month rendering remains unchanged.
- Task entries, status colors, selection, drag-and-drop, filters, and side panels retain their current behavior.
- Completed-task navigation is out of scope.

---

### Task 1: Make the calendar model Monday-first

**Files:**
- Modify: `tests/ui/calendar-view.test.ts`
- Modify: `src/ui/calendar-view.ts`

**Interfaces:**
- Consumes: `buildMonthModel(year: number, month: number, tasks: readonly TaskNode[], today: string): CalendarDayCell[]`
- Produces: The same interface, with cells ordered Monday through Sunday.

- [ ] **Step 1: Write the failing model expectations**

Update the July and August assertions in `tests/ui/calendar-view.test.ts`:

```ts
expect(model).toHaveLength(35);
expect(model[0]?.date).toBe('2026-06-29');
expect(model.at(-1)?.date).toBe('2026-08-02');
```

```ts
expect(model).toHaveLength(42);
expect(model[0]?.date).toBe('2026-07-27');
expect(model.at(-1)?.date).toBe('2026-09-06');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/ui/calendar-view.test.ts
```

Expected: FAIL because the current model starts on Sunday (`2026-06-28` and `2026-07-26`).

- [ ] **Step 3: Implement the Monday-based offset**

Replace the Sunday-based offset in `buildMonthModel` with:

```ts
const firstDayOffset = (first.getUTCDay() + 6) % 7;
const start = new Date(first);
start.setUTCDate(first.getUTCDate() - firstDayOffset);
const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const requiredCells = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run tests/ui/calendar-view.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the model change**

```bash
git add tests/ui/calendar-view.test.ts src/ui/calendar-view.ts
git commit -m "feat: make calendar weeks start on Monday"
```

### Task 2: Render and style the weekday header

**Files:**
- Modify: `tests/ui/calendar-view.test.ts`
- Modify: `tests/scaffold.test.ts`
- Modify: `src/ui/calendar-view.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `renderCalendarPanel(host: HTMLElement, options: CalendarPanelOptions): void`
- Produces: `.tmc-calendar-month`, `.tmc-calendar-weekdays`, seven `[role="columnheader"]` labels, and the existing `.tmc-calendar-grid`.

- [ ] **Step 1: Write the failing DOM and CSS tests**

Add to the main render assertion in `tests/ui/calendar-view.test.ts`:

```ts
expect(Array.from(
  host.querySelectorAll<HTMLElement>('.tmc-calendar-weekdays [role="columnheader"]'),
  (header) => header.textContent,
)).toEqual(['周一', '周二', '周三', '周四', '周五', '周六', '周日']);
expect(host.querySelector('.tmc-calendar-month > .tmc-calendar-grid')).not.toBeNull();
```

Add a scaffold assertion:

```ts
expect(styles).toMatch(
  /\.tmc-calendar-weekdays\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\);/s,
);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/ui/calendar-view.test.ts tests/scaffold.test.ts
```

Expected: FAIL because the weekday header and month wrapper do not exist.

- [ ] **Step 3: Render the semantic weekday row**

In `renderCalendarPanel`, create the wrapper and header before appending the existing grid:

```ts
const month = document.createElement('div');
month.className = 'tmc-calendar-month';
const weekdays = document.createElement('div');
weekdays.className = 'tmc-calendar-weekdays';
weekdays.setAttribute('role', 'row');
for (const weekday of ['周一', '周二', '周三', '周四', '周五', '周六', '周日']) {
  const label = document.createElement('span');
  label.className = 'tmc-calendar-weekday';
  label.setAttribute('role', 'columnheader');
  label.textContent = weekday;
  weekdays.append(label);
}
```

After date cells are rendered, replace `host.append(grid)` with:

```ts
month.append(weekdays, grid);
host.append(month);
```

- [ ] **Step 4: Style the wrapper and weekday row**

Add the calendar-month layout and remove the top-level grid placement from `.tmc-calendar-grid`:

```css
.tmc-calendar-month {
  display: grid;
  grid-column: 1;
  grid-row: 2;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
}

.tmc-calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-width: 0;
}

.tmc-calendar-weekday {
  min-width: 0;
  color: var(--tmc-muted);
  font-size: var(--font-ui-smaller);
  font-weight: var(--font-semibold);
  text-align: center;
}
```

In both viewport and container responsive rules, replace `.tmc-calendar-grid` in the top-level stacking selector with `.tmc-calendar-month` so the complete month block stacks with `.tmc-calendar-panels`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/ui/calendar-view.test.ts tests/scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the rendering change**

```bash
git add tests/ui/calendar-view.test.ts tests/scaffold.test.ts src/ui/calendar-view.ts styles.css
git commit -m "feat: label calendar weekdays"
```

### Task 3: Run release-quality verification and install locally

**Files:**
- Generated: `main.js`
- Installed: local Vault plugin `main.js`, `manifest.json`, `styles.css`

**Interfaces:**
- Consumes: the complete repository and `scripts/install-to-vault.mjs`
- Produces: verified production artifacts installed into the configured local Obsidian Vault.

- [ ] **Step 1: Run all automated gates**

```bash
npm test
npm run coverage
npm run lint
npm run build
```

Expected: all commands exit 0; the test output reports zero failures.

- [ ] **Step 2: Install the production build into the local Vault**

```bash
npm run install:vault
```

Expected: the script copies `main.js`, `manifest.json`, and `styles.css` into the configured Task Matrix Calendar plugin directory.

- [ ] **Step 3: Verify installed artifacts match the repository build**

Compare SHA-256 hashes for the repository and installed `main.js`, `manifest.json`, and `styles.css`. Expected: each source/destination pair has the same hash.

- [ ] **Step 4: Commit any remaining tracked changes**

```bash
git status --short
```

Expected: no uncommitted source, test, style, or documentation changes remain.
