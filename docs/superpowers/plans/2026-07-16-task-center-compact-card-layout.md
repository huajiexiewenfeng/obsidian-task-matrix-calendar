# Task Center Compact Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the selected compact task-center visual: primary create action before import, strongly differentiated task states, compact progressive-disclosure cards, and four independently scrolling quadrants that remain in a stable 2 × 2 grid.

**Architecture:** Keep the existing `TaskWorkspaceView` and Markdown-backed services intact. Add a dedicated scrollable list container inside each quadrant, reorganize `renderTaskCard` into a compact title/status/summary/metadata layout with a contextual action menu, and express all visual state through existing Obsidian CSS variables and stable semantic classes.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 API, DOM APIs, CSS container queries, Vitest 4 + jsdom, ESLint, esbuild.

## Global Constraints

- The selected visual target is the user-provided scheme 3 screenshot at `C:/Users/admin/.codex-clean-20260710/attachments/607cd592-59ab-4c72-ba21-45041e283dc1/image-1.png`.
- Keep Markdown task format, import format, status machine, four-quadrant rules, filters, calendar linkage, repository services, and delete entry unchanged.
- Visible import copy is exactly `导入任务`; internal command ID and `data-action="import-legacy"` stay unchanged.
- Wide panes retain a stable 2 × 2 matrix; every classified quadrant has the same bounded height and an independently scrolling task list.
- Status and quadrant colors remain separate semantics and use only Obsidian CSS variables.
- Task cards keep editing and state transitions available without permanent action buttons consuming card height.
- Use TDD for each behavior change and commit each independently testable unit.

---

## File Map

- Modify `src/ui/task-workspace-header.ts`: user-visible action copy and action ordering.
- Modify `src/main.ts`: command-palette display name only.
- Modify `src/ui/task-card.ts`: compact card information hierarchy, stable status dataset, and contextual action menu.
- Modify `src/ui/task-workspace-view.ts`: section header/list split and independent scroll container.
- Modify `styles.css`: bounded matrix layout, compact cards, status tokens, risk chips, and action popover.
- Modify `tests/ui/task-workspace-header.test.ts`: exact copy/order contract.
- Modify `tests/plugin-lifecycle.test.ts`: command label contract.
- Modify `tests/ui/task-card.test.ts`: compact information, status classes, hidden contextual menu, and action wiring.
- Modify `tests/ui/task-workspace-view.test.ts`: list-container and action-menu integration contracts.
- Modify `tests/scaffold.test.ts`: CSS structure and Obsidian-variable contract.
- Create `design-qa.md`: visual comparison evidence and final pass/block status.

---

### Task 1: Create-first header and import naming

**Files:**
- Modify: `tests/ui/task-workspace-header.test.ts`
- Modify: `tests/plugin-lifecycle.test.ts`
- Modify: `src/ui/task-workspace-header.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: existing `renderTaskWorkspaceHeader(options)` and `COMMANDS.migrate` registration.
- Produces: visible button order `new-task`, `import-legacy`; button text `+ 新任务`, `导入任务`; command display name `导入任务`.

- [ ] **Step 1: Write the failing header and command tests**

Add these assertions to the existing tests:

```ts
const actionButtons = Array.from(
  header.querySelectorAll<HTMLButtonElement>('[data-role="workspace-primary"] button'),
);
expect(actionButtons.map((button) => button.dataset.action)).toEqual([
  'new-task',
  'import-legacy',
]);
expect(actionButtons.map((button) => button.textContent)).toEqual([
  '+ 新任务',
  '导入任务',
]);
```

```ts
expect(migrate.name).toBe('导入任务');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- tests/ui/task-workspace-header.test.ts tests/plugin-lifecycle.test.ts
```

Expected: failures showing the old import-first order and `导入旧任务` copy.

- [ ] **Step 3: Implement the minimal copy and order change**

In `renderTaskWorkspaceHeader`, create and append actions in this order:

```ts
const createButton = action('+ 新任务', 'new-task', options.onCreate);
createButton.classList.add('mod-cta');
const importButton = action('导入任务', 'import-legacy', options.onImport);
importButton.disabled = options.importing;
actions.append(createButton, importButton);
```

In `src/main.ts`, keep `COMMANDS.migrate` unchanged and set only its display name:

```ts
name: '导入任务',
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused test command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/task-workspace-header.ts src/main.ts tests/ui/task-workspace-header.test.ts tests/plugin-lifecycle.test.ts
git commit -m "fix: prioritize task creation in workspace header"
```

---

### Task 2: Compact task-card semantics and contextual actions

**Files:**
- Modify: `tests/ui/task-card.test.ts`
- Modify: `src/ui/task-card.ts`

**Interfaces:**
- Consumes: `IndexedTask`, `DateRisk`, progress counts, and the existing `TaskCardActions` callbacks.
- Produces: `.tmc-task-card[data-status]`, `.tmc-task-card-top`, `.tmc-task-badges`, `.tmc-task-description`, `.tmc-task-details`, `.tmc-task-menu-shell`, and hidden `.tmc-task-actions[role="menu"]`.

- [ ] **Step 1: Replace the old verbose-card assertions with compact-card assertions**

The test must prove:

```ts
expect(card.dataset.status).toBe('in-progress');
expect(card.querySelector('.tmc-status-in-progress')?.textContent).toBe('进行中');
expect(card.querySelector('.tmc-risk-due-today')?.textContent).toBe('今天截止');
expect(card.querySelector('.tmc-progress')?.textContent).toBe('2/4');
expect(card.querySelector('.tmc-task-description')?.textContent)
  .toBe('第一行详情\n第二行详情');
expect(card.querySelector('.tmc-task-details')?.textContent)
  .toBe('项目：开源插件 · 截止：2026-07-15');
expect(card.textContent).not.toContain('来源：');
expect(card.textContent).not.toContain('标签：');
```

Add menu behavior assertions:

```ts
const trigger = card.querySelector<HTMLButtonElement>('[data-action="menu"]')!;
const menu = card.querySelector<HTMLElement>('.tmc-task-actions')!;
expect(menu.hidden).toBe(true);
trigger.click();
expect(menu.hidden).toBe(false);
expect(trigger.getAttribute('aria-expanded')).toBe('true');
menu.querySelector<HTMLButtonElement>('[data-action="pause"]')!.click();
expect(actions.pause).toHaveBeenCalledWith('task-P1');
expect(menu.hidden).toBe(true);
```

Add a table-driven test over `todo`, `in-progress`, `paused`, and `done` proving each card has the expected `data-status`, status class, and Chinese label.

- [ ] **Step 2: Run the card tests and verify RED**

```powershell
npm test -- tests/ui/task-card.test.ts
```

Expected: missing `data-status`, verbose source/tag metadata, and no contextual action menu.

- [ ] **Step 3: Implement the compact DOM hierarchy**

In `renderTaskCard`:

```ts
card.dataset.status = task.status;

const cardTop = document.createElement('div');
cardTop.className = 'tmc-task-card-top';
const main = document.createElement('div');
main.className = 'tmc-task-card-main';
main.append(textElement('h4', 'tmc-task-title', task.title));

const badges = document.createElement('div');
badges.className = 'tmc-task-badges';
badges.append(textElement('span', `tmc-status tmc-status-${task.status}`, STATUS_LABELS[task.status]));
if (progress.total > 0) badges.append(textElement('span', 'tmc-progress', `${progress.done}/${progress.total}`));
if (risk !== 'none') badges.append(textElement('span', `tmc-risk tmc-risk-${risk}`, RISK_LABELS[risk]));
```

Append the description after the top row only when non-empty. Limit permanent metadata to:

```ts
const details = [
  task.project && `项目：${task.project}`,
  task.dueDate
    ? `截止：${task.dueDate}`
    : task.plannedDate && `计划：${task.plannedDate}`,
].filter((item): item is string => Boolean(item));
if (details.length > 0) {
  card.append(textElement('p', 'tmc-task-details', details.join(' · ')));
}
```

- [ ] **Step 4: Move state actions into a menu without changing callbacks**

Create a trigger with the existing Obsidian icon API:

```ts
const menuShell = document.createElement('div');
menuShell.className = 'tmc-task-menu-shell';
const trigger = actionButton('', 'menu', () => undefined, actionsDisabled);
trigger.setAttribute('aria-label', '任务操作');
trigger.setAttribute('aria-haspopup', 'menu');
trigger.setAttribute('aria-expanded', 'false');
setIcon(trigger, 'ellipsis');

const menu = document.createElement('div');
menu.className = 'tmc-task-actions';
menu.setAttribute('role', 'menu');
menu.hidden = true;
```

Replace the trigger's generated click behavior with a stop-propagating toggle. Add `编辑`, the valid state transition for the current status, and `完成` when the task is not already done. Every menu action must close the menu before invoking the existing callback. Close on `Escape` and on focus leaving `menuShell`. Card click/Enter/Space must continue to open the existing edit modal.

- [ ] **Step 5: Run card tests and verify GREEN**

Run the focused card test. Expected: all card tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/task-card.ts tests/ui/task-card.test.ts
git commit -m "feat: compact task cards with contextual actions"
```

---

### Task 3: Stable quadrant list containers

**Files:**
- Modify: `tests/ui/task-workspace-view.test.ts`
- Modify: `src/ui/task-workspace-view.ts`

**Interfaces:**
- Consumes: the existing `renderSection(title, quadrant, tasks)` loop and `renderTaskCard`.
- Produces: one `.tmc-task-list[data-role="task-list"]` per section; cards and empty state live inside that list while drag/drop remains bound to the section.

- [ ] **Step 1: Write the failing section-structure test**

After `view.onOpen()`, assert:

```ts
const sections = view.containerEl.querySelectorAll<HTMLElement>('.tmc-task-section');
expect(sections).toHaveLength(5);
for (const section of sections) {
  const list = section.querySelector<HTMLElement>(':scope > [data-role="task-list"]');
  expect(list).not.toBeNull();
  expect(list?.querySelectorAll(':scope > .tmc-task-card').length).toBe(
    Number(section.querySelector('[data-role="section-count"]')?.textContent),
  );
}
```

For an empty section, assert `.tmc-empty` is inside the list, not a direct child of the section.

- [ ] **Step 2: Run the workspace-view tests and verify RED**

```powershell
npm test -- tests/ui/task-workspace-view.test.ts
```

Expected: no direct task-list container exists.

- [ ] **Step 3: Add the list boundary**

Immediately after `section.append(sectionHeader)`:

```ts
const taskList = document.createElement('div');
taskList.className = 'tmc-task-list';
taskList.dataset.role = 'task-list';
section.append(taskList);
```

Pass `taskList` to `renderTaskCard`, and append the empty state to `taskList`. Keep drag/drop listeners on `section` so the full quadrant remains a valid target.

- [ ] **Step 4: Run workspace-view tests and verify GREEN**

Run the focused workspace test. Expected: all tests pass, including pending transition guards through the contextual menu.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/task-workspace-view.ts tests/ui/task-workspace-view.test.ts
git commit -m "feat: isolate quadrant task scrolling"
```

---

### Task 4: Match the selected visual with Obsidian-native CSS

**Files:**
- Modify: `tests/scaffold.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: status datasets/classes and `.tmc-task-list` emitted by Tasks 2–3.
- Produces: bounded 2 × 2 grid, compact cards, semantic status/risk chips, and zero-layout-cost contextual actions.

- [ ] **Step 1: Write failing CSS contract tests**

Add assertions that prove the selected behavior rather than selector existence alone:

```ts
expect(styles).toMatch(/\.tmc-quadrant-grid\s*\{[^}]*align-items:\s*start;/s);
expect(styles).toMatch(
  /\.tmc-task-section\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);[^}]*height:\s*clamp\(240px,\s*30vh,\s*380px\);[^}]*overflow:\s*hidden;/s,
);
expect(styles).toMatch(
  /\.tmc-task-list\s*\{[^}]*min-height:\s*0;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
);
for (const status of ['todo', 'in-progress', 'paused', 'done']) {
  expect(styles).toContain(`.tmc-task-card[data-status="${status}"]`);
  expect(styles).toContain(`.tmc-status-${status}`);
}
expect(styles).toMatch(/\.tmc-task-actions\s*\{[^}]*position:\s*absolute;/s);
```

- [ ] **Step 2: Run the scaffold test and verify RED**

```powershell
npm test -- tests/scaffold.test.ts
```

Expected: bounded height, list scrolling, status selectors, and positioned menu contracts are absent.

- [ ] **Step 3: Implement bounded matrix and task-list scrolling**

Use these structural declarations:

```css
.tmc-quadrant-grid {
  align-items: start;
}

.tmc-task-section {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: clamp(240px, 30vh, 380px);
  overflow: hidden;
}

.tmc-quadrant-unclassified {
  height: auto;
  min-height: 96px;
}

.tmc-task-list {
  min-height: 0;
  padding-right: 4px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
```

- [ ] **Step 4: Implement compact cards and status tokens**

Set a task-level status color custom property and map states:

```css
.tmc-task-card {
  --tmc-status-color: var(--text-muted);
  gap: 4px;
  min-height: 72px;
  padding: 9px 10px;
  margin-top: 6px;
  border-left: 4px solid var(--tmc-status-color);
}

.tmc-task-card[data-status="todo"] { --tmc-status-color: var(--text-muted); }
.tmc-task-card[data-status="in-progress"] { --tmc-status-color: var(--interactive-accent); }
.tmc-task-card[data-status="paused"] { --tmc-status-color: var(--color-orange); }
.tmc-task-card[data-status="done"] { --tmc-status-color: var(--color-green); }
```

Style `.tmc-status` with `color`, a lightly mixed background, and a matching border based on `--tmc-status-color`. Clamp `.tmc-task-description` to one line. Keep `.tmc-task-details` on one ellipsized line. Dim and strike the completed title. Give due-today/overdue chips a restrained red foreground/background/border and upcoming risk an orange treatment.

- [ ] **Step 5: Implement contextual menu styling**

Position `.tmc-task-actions` absolutely below the ellipsis trigger, hide it with `[hidden]`, and style it as a compact Obsidian surface with border and shadow. Menu buttons must fill the menu width and have a visible hover/focus state. Remove all old flex-row action styles that reserve card height.

- [ ] **Step 6: Preserve responsive behavior**

At the existing 900px media/container breakpoints, retain the single-column matrix while keeping each quadrant bounded and internally scrollable. At 760px, reduce task padding and allow the title row to wrap without horizontal overflow. Do not change the form, import wizard, or calendar breakpoints.

- [ ] **Step 7: Run CSS and UI tests and verify GREEN**

```powershell
npm test -- tests/scaffold.test.ts tests/ui/task-card.test.ts tests/ui/task-workspace-view.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```powershell
git add styles.css tests/scaffold.test.ts
git commit -m "style: match compact task matrix design"
```

---

### Task 5: Full verification, installation, and visual QA

**Files:**
- Create: `design-qa.md`
- Modify if required by QA: `styles.css`, `src/ui/task-card.ts`, `src/ui/task-workspace-view.ts`, and their tests.

**Interfaces:**
- Consumes: built `main.js`, `manifest.json`, and `styles.css`; the real Vault plugin directory.
- Produces: passing quality gates, backed-up and hash-verified local installation, real Obsidian screenshots, and `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Run the complete automated quality gates**

```powershell
npm test
npm run coverage
npm run lint
npm run build
```

Expected: all tests pass, coverage meets the repository threshold, lint exits 0, and production build exits 0.

- [ ] **Step 2: Verify the worktree and review the complete diff**

```powershell
git status --short
git diff --check HEAD~4..HEAD
git diff --stat HEAD~4..HEAD
```

Expected: no whitespace errors; only planned source, tests, styles, plan/spec, and QA evidence are changed.

- [ ] **Step 3: Back up and install the built plugin**

Use the existing installer with the real Vault path:

```powershell
npm run install:vault -- --vault "C:\Users\admin\Documents\Obsidian Vault"
```

Expected: installer reports the backup location and installs `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/task-matrix-calendar`.

- [ ] **Step 4: Verify installed artifact hashes**

```powershell
Get-FileHash main.js,manifest.json,styles.css -Algorithm SHA256
Get-FileHash "C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar\main.js","C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar\manifest.json","C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar\styles.css" -Algorithm SHA256
```

Expected: source and installed hashes match file by file.

- [ ] **Step 5: Capture the real Obsidian implementation**

Reload the plugin in Obsidian, open Task Center, and capture the same wide light-theme state as the selected reference. Use existing tasks without changing their content. Verify:

- header order and copy;
- all four status treatments;
- one busy quadrant with at least 8 visible/scrollable tasks;
- all four quadrants remain a stable 2 × 2 grid;
- task and calendar toggle, create, import, card edit, and contextual state action work.

- [ ] **Step 6: Run the visual comparison gate**

Open both the selected reference image and the real Obsidian screenshot at the same viewport. Record findings in `design-qa.md` with severity P0–P3. Fix every P0/P1/P2, rerun targeted tests/build/install, recapture, and repeat until the last line is exactly:

```md
final result: passed
```

- [ ] **Step 7: Run the final regression suite after QA fixes**

```powershell
npm test
npm run coverage
npm run lint
npm run build
```

Expected: every command exits 0 after the final visual changes.

- [ ] **Step 8: Commit QA evidence and any final polish**

```powershell
git add design-qa.md styles.css src/ui/task-card.ts src/ui/task-workspace-view.ts tests
git commit -m "test: verify compact task matrix in Obsidian"
```

---

## Self-Review

- Spec coverage: header naming/order, four status styles, compact hierarchy, contextual actions, independent scroll, responsive fallback, automated tests, installation, and real Obsidian comparison each map to a task above.
- Placeholder scan: the plan contains no TBD/TODO or unspecified implementation steps.
- Type consistency: `TaskCardActions`, `renderTaskCard`, `data-status`, `data-role="task-list"`, and the existing `import-legacy` action/command ID remain consistent across source, tests, and CSS.
- Scope control: Markdown persistence, migration parsing/writing, filters, calendar behavior, deletion, and service rules are explicitly preserved.
