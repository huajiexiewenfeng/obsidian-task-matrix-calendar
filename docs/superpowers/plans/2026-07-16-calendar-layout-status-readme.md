# Calendar Layout, Status Colors, and README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the month calendar inside the Obsidian workspace, render calendar tasks with the same four status colors as task cards, and publish a sanitized corrected calendar screenshot in the GitHub README.

**Architecture:** Preserve the existing Markdown model and calendar interactions. Reset the nested calendar host's inherited minimum height, propagate `TaskStatus` into each transient `CalendarEntry`, expose it through `data-status`, and reuse the existing status color custom property in calendar CSS. Validate in the real installed plugin before generating a sanitized README asset.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 API, CSS, Vitest 4 + jsdom, ESLint, esbuild, built-in image generation/editing, GitHub CLI.

## Global Constraints

- Do not change Markdown persistence, task IDs, filters, calendar drag/drop, date selection, or edit behavior.
- Status colors are exactly: todo muted gray, in-progress interactive accent purple, paused orange, done green.
- Due markers retain red text while their border/background still show task status.
- The nested calendar host must override the shared `min-height: 100%` with `min-height: 0`.
- The README image must be based on the corrected real plugin state.
- Sanitization is exact: `Smarthub/smarthub` becomes `test`, standalone title prefix `AP-` becomes `CC-`, `APP` remains unchanged, and `机库` is removed.
- Use TDD and preserve the existing Obsidian light/dark theme variables.

---

## File Map

- Modify `styles.css`: reset nested calendar height and add calendar status visuals.
- Modify `src/ui/calendar-view.ts`: propagate task status into calendar entries and rendered buttons.
- Modify `tests/scaffold.test.ts`: assert height reset and four status selectors.
- Modify `tests/ui/calendar-view.test.ts`: assert model and DOM status propagation.
- Create `assets/calendar-overview.png`: sanitized corrected calendar screenshot.
- Modify `README.md`: add the calendar screenshot beside the existing task-center overview.

### Task 1: Lock and commit the calendar height fix

**Files:**
- Modify: `tests/scaffold.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `.task-matrix-calendar { min-height: 100%; }` and nested `.tmc-calendar-view`.
- Produces: `.tmc-calendar-view { min-height: 0; }`.

- [ ] **Step 1: Verify the regression test fails without the reset**

The test is:

```ts
it('resets the nested calendar minimum height so it does not exceed the workspace', () => {
  const styles = readFileSync('styles.css', 'utf8');
  expect(styles).toMatch(/\.tmc-calendar-view\s*\{[^}]*min-height:\s*0;/s);
});
```

Run:

```powershell
npm.cmd test -- tests/scaffold.test.ts
```

Expected before the CSS change: one failure because `.tmc-calendar-view` does not reset `min-height`.

- [ ] **Step 2: Implement the minimal CSS reset**

```css
.tmc-calendar-view {
  /* existing declarations */
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
}
```

- [ ] **Step 3: Verify the focused test passes**

Run the same command. Expected: 9 scaffold tests pass.

- [ ] **Step 4: Commit**

```powershell
git add styles.css tests/scaffold.test.ts
git commit -m "fix: keep calendar within workspace height"
```

### Task 2: Propagate task status into calendar entries

**Files:**
- Modify: `tests/ui/calendar-view.test.ts`
- Modify: `src/ui/calendar-view.ts`

**Interfaces:**
- Consumes: `TaskNode.status: TaskStatus`.
- Produces: `CalendarEntry.status: TaskStatus` and `button.dataset.status`.

- [ ] **Step 1: Write failing model and DOM tests**

Add model assertions for planned and due-marker entries:

```ts
expect(model.find((cell) => cell.date === '2026-07-15')?.entries)
  .toMatchObject([{ taskId: 'task-A4', kind: 'due-marker', status: 'paused' }]);
expect(model.find((cell) => cell.date === '2026-07-20')?.entries)
  .toMatchObject([{ taskId: 'task-A1', kind: 'card', status: 'in-progress' }]);
```

After rendering, assert:

```ts
expect(
  host.querySelector<HTMLElement>('[data-calendar-task-id="task-A1"]')?.dataset.status,
).toBe('in-progress');
```

- [ ] **Step 2: Run the calendar test and verify RED**

```powershell
npm.cmd test -- tests/ui/calendar-view.test.ts
```

Expected: failures because `CalendarEntry` and rendered buttons do not expose status.

- [ ] **Step 3: Add status to the transient calendar model**

```ts
import type { TaskNode, TaskStatus } from '../domain/task';

export interface CalendarEntry {
  taskId: string;
  title: string;
  kind: 'card' | 'due-marker';
  deadline: boolean;
  status: TaskStatus;
}
```

Every `entries.push(...)` call must include `status: task.status`.

- [ ] **Step 4: Emit the status dataset**

Change the button helper to receive status:

```ts
function createTaskButton(
  taskId: string,
  label: string,
  status: TaskStatus,
  onEdit: (taskId: string) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.dataset.status = status;
  // existing click and drag behavior remains unchanged
  return button;
}
```

Pass `entry.status` for grid entries and `task.status` for selected-day and unscheduled panel entries.

- [ ] **Step 5: Run the calendar test and verify GREEN**

Run the focused calendar test. Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/calendar-view.ts tests/ui/calendar-view.test.ts
git commit -m "feat: expose task status in calendar entries"
```

### Task 3: Match calendar colors to task-card states

**Files:**
- Modify: `tests/scaffold.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `.tmc-calendar-entry[data-status]` and `--tmc-status-color`.
- Produces: status-colored calendar border/background while `.tmc-calendar-due-marker` remains red.

- [ ] **Step 1: Write the failing CSS contract**

```ts
for (const status of ['todo', 'in-progress', 'paused', 'done']) {
  expect(styles).toContain(`.tmc-calendar-entry[data-status="${status}"]`);
}
expect(styles).toMatch(
  /\.tmc-calendar-entry\s*\{[^}]*border-left:\s*3px\s+solid\s+var\(--tmc-status-color\)/s,
);
expect(styles).toMatch(
  /\.tmc-calendar-due-marker\s*\{[^}]*color:\s*var\(--text-error\)\s*!important;/s,
);
```

- [ ] **Step 2: Run the scaffold test and verify RED**

```powershell
npm.cmd test -- tests/scaffold.test.ts
```

Expected: status selectors and the status border contract are absent.

- [ ] **Step 3: Reuse status mappings for calendar entries**

Extend each existing selector group, for example:

```css
.tmc-task-card[data-status="in-progress"],
.tmc-status-in-progress,
.tmc-calendar-entry[data-status="in-progress"] {
  --tmc-status-color: var(--interactive-accent);
}
```

Repeat for todo, paused, and done.

- [ ] **Step 4: Style calendar entries without hiding deadline risk**

```css
.tmc-calendar-entry {
  --tmc-status-color: var(--text-muted);
  border-color: color-mix(in srgb, var(--tmc-status-color) 32%, var(--tmc-border)) !important;
  border-left: 3px solid var(--tmc-status-color) !important;
  background: color-mix(in srgb, var(--tmc-status-color) 10%, var(--tmc-surface)) !important;
}

.tmc-calendar-due-marker {
  color: var(--text-error) !important;
}
```

- [ ] **Step 5: Verify focused UI and CSS tests**

```powershell
npm.cmd test -- tests/scaffold.test.ts tests/ui/calendar-view.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit**

```powershell
git add styles.css tests/scaffold.test.ts
git commit -m "style: distinguish calendar task statuses"
```

### Task 4: Full verification and local Obsidian installation

**Files:**
- No source changes unless verification finds a defect.

**Interfaces:**
- Consumes: built `main.js`, `manifest.json`, and `styles.css`.
- Produces: hash-matched local plugin installation and real runtime evidence.

- [ ] **Step 1: Run all automated gates**

```powershell
npm.cmd test
npm.cmd run coverage
npm.cmd run lint
npm.cmd run build
```

Expected: zero failures and every command exits 0.

- [ ] **Step 2: Install the built plugin**

```powershell
$env:ALLOW_PRODUCTION_VAULT='YES'
npm.cmd run install:vault -- --vault 'C:\Users\admin\Documents\Obsidian Vault'
```

- [ ] **Step 3: Verify installed hashes**

Compare SHA-256 for `main.js`, `manifest.json`, and `styles.css` between the repository and `.obsidian/plugins/task-matrix-calendar`; every pair must match.

- [ ] **Step 4: Verify the real calendar**

Reload Obsidian, open Task Center → Calendar, and verify:

- the complete six-week month grid remains above the bottom workspace boundary;
- todo, in-progress, paused, and done entries use gray, purple, orange, and green status treatments;
- due markers keep red text;
- switching back to the task matrix still works.

### Task 5: Produce and publish the README calendar screenshot

**Files:**
- Create: `assets/calendar-overview.png`
- Modify: `README.md`

**Interfaces:**
- Consumes: corrected real Obsidian calendar screenshot.
- Produces: sanitized public calendar image referenced from the README.

- [ ] **Step 1: Generate the sanitized visual**

Use the real corrected screenshot as the edit target. Preserve the implemented layout and status colors. Apply only the approved sensitive-text replacements and restrained visual cleanup; do not invent tasks or controls.

- [ ] **Step 2: Copy the selected generated PNG into the repository**

Save as `assets/calendar-overview.png` without overwriting `assets/task-center-overview.png`.

- [ ] **Step 3: Add the image to README**

Insert below the existing task-center screenshot:

```markdown
![Task Matrix Calendar 日历视图](assets/calendar-overview.png)
```

- [ ] **Step 4: Validate and commit**

```powershell
git diff --check
git add README.md assets/calendar-overview.png
git commit -m "docs: add sanitized calendar screenshot"
```

- [ ] **Step 5: Push and verify GitHub**

```powershell
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: both hashes are identical and GitHub contains both README image paths.

## Self-Review

- Spec coverage: height reset, status propagation, four status colors, independent due risk, automated gates, local installation, real runtime verification, sanitization, README, and GitHub publishing are all mapped to tasks.
- Placeholder scan: no TBD, TODO, or deferred implementation remains.
- Type consistency: `TaskStatus`, `CalendarEntry.status`, and `data-status` use the same canonical values across model, renderer, tests, and CSS.
- Scope: no Markdown or service behavior changes are included.
