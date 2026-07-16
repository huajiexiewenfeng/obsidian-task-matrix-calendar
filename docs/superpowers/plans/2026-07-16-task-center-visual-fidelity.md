# Task Center Visual Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed Obsidian plugin match the user-approved calm-workbench visual baseline across the task center, filters, task cards, shared task form, calendar, and legacy-import wizard.

**Architecture:** Preserve the current Markdown schema, task services, filter state, calendar data flow, migration safety boundary, and shared index. Change only focused UI renderers and the plugin stylesheet, adding small DOM contracts that make the approved hierarchy testable; the import review renderer is the only structural refactor because the approved fixed left-list/right-editor workspace cannot be expressed by the current repeated disclosure rows.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 DOM API and CSS variables, Vitest 4 + jsdom, ESLint, esbuild.

## Global Constraints

- Markdown remains the only task source of truth; do not add a database or browser storage.
- Preserve task statuses `todo`, `in-progress`, `paused`, and `done`, and all five quadrant values including `unclassified`.
- Preserve “execution requires classification” behavior and task/calendar shared index behavior.
- Preserve explicit file selection, preview-before-write, backup, conflict detection, verification, rollback, and no-write-on-cancel migration behavior.
- Follow the active Obsidian theme. Use Obsidian CSS variables for every foreground/background declaration; do not introduce a plugin theme selector.
- Use Obsidian/Lucide icons through `setIcon`; do not use text glyphs as menu, close, dropdown, or navigation icons.
- Desktop-first target: the approved reference is a wide Obsidian workspace. Narrow panes must reflow without horizontal scrolling.
- Keep all existing public commands and the installed plugin id `task-matrix-calendar` unchanged.

---

## File Structure

### Modify

- `src/ui/task-workspace-header.ts` — render title, activity summary, mode switch, and primary actions as one hierarchy.
- `src/ui/task-filter-bar.ts` — render a control row and a separate active-filter summary row.
- `src/ui/task-workspace-view.ts` — supply summary counts and structured section headings.
- `src/ui/task-card.ts` — separate title, metadata, progress, and low-emphasis actions.
- `src/ui/task-form-modal.ts` — render the approved grouped form and paired field grids.
- `src/ui/legacy-import-wizard.ts` — own active-candidate state and compose the fixed review workspace.
- `src/ui/legacy-import-candidate-editor.ts` — split candidate list-item rendering from the full editor panel.
- `src/ui/calendar-view.ts` — add stable visual hooks for month navigation and calendar side panels.
- `styles.css` — implement the shared visual tokens, workspace, modal, import, calendar, and responsive layout.
- `tests/ui/task-workspace-header.test.ts` — verify header hierarchy and summary.
- `tests/ui/task-filter-bar.test.ts` — verify visible labels and active-filter summary.
- `tests/ui/task-workspace-view.test.ts` — verify section header/count DOM contracts.
- `tests/ui/task-card.test.ts` — verify card content hierarchy and icon/action accessibility.
- `tests/ui/task-form-modal.test.ts` — verify grouped form and paired-grid markup.
- `tests/ui/legacy-import-wizard.test.ts` — verify fixed list/editor review behavior and preserved edits.
- `tests/ui/calendar-view.test.ts` — verify calendar visual hooks without changing data behavior.
- `tests/scaffold.test.ts` — assert the released stylesheet contains the approved visual contracts and no hard-coded foreground/background colors.

### No domain or persistence changes

- `src/domain/**`, `src/markdown/**`, `src/persistence/**`, and migration write services are out of scope unless an existing regression test proves the UI refactor broke their contract.

---

### Task 1: Workspace Header and Query Panel

**Files:**
- Modify: `src/ui/task-workspace-header.ts`
- Modify: `src/ui/task-filter-bar.ts`
- Modify: `src/ui/task-workspace-view.ts`
- Modify: `tests/ui/task-workspace-header.test.ts`
- Modify: `tests/ui/task-filter-bar.test.ts`

**Interfaces:**
- Produces: `TaskWorkspaceSummary` and `TaskWorkspaceHeaderOptions.summary`.
- Produces: `.tmc-filter-controls`, `.tmc-filter-active`, and `[data-active-filter]` DOM contracts used by Task 5 CSS.
- Consumes: existing `TaskWorkspaceFilterState`, `deriveFilterOptions()`, and callbacks; filter semantics do not change.

- [ ] **Step 1: Write failing header hierarchy tests**

Add assertions equivalent to:

```ts
const header = renderTaskWorkspaceHeader({
  mode: 'tasks',
  importing: false,
  summary: { active: 14, dueRisk: 3, unclassified: 2 },
  onCreate: vi.fn(),
  onImport: vi.fn(),
  onModeChange: vi.fn(),
});

expect(header.querySelector('h2')?.textContent).toBe('任务中心');
expect(header.querySelector('[data-role="workspace-summary"]')?.textContent)
  .toBe('14 个活动任务 · 3 个临近截止 · 2 个待分类');
expect(header.querySelector('[data-role="workspace-primary"] [data-action="new-task"]'))
  .toBeInstanceOf(HTMLButtonElement);
expect(header.querySelector('[data-role="workspace-modes"] [aria-pressed="true"]')?.textContent)
  .toBe('任务');
```

- [ ] **Step 2: Write failing query-panel tests**

```ts
const bar = renderTaskFilterBar({
  state: { query: '', project: 'smarthub', status: 'active', risk: 'overdue', sourcePath: '*' },
  choices: { projects: ['smarthub'], sourcePaths: ['任务/任务收件箱.md'] },
  onSearch: vi.fn(),
  onFilterChange: vi.fn(),
  onClear: vi.fn(),
});

expect(bar.querySelector('.tmc-filter-controls')).not.toBeNull();
expect(Array.from(bar.querySelectorAll('[data-filter-caption]'), (node) => node.textContent))
  .toEqual(['项目', '状态', '截止', '来源']);
expect(Array.from(bar.querySelectorAll('[data-active-filter]'), (node) => node.textContent))
  .toEqual(['项目：smarthub', '截止：已逾期']);
expect(bar.querySelector('[data-action="clear-filters"]')).not.toBeNull();
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npx vitest run tests/ui/task-workspace-header.test.ts tests/ui/task-filter-bar.test.ts
```

Expected: FAIL because `summary`, `.tmc-filter-controls`, and `[data-active-filter]` do not exist.

- [ ] **Step 4: Implement the header summary contract**

Add:

```ts
export interface TaskWorkspaceSummary {
  active: number;
  dueRisk: number;
  unclassified: number;
}

export interface TaskWorkspaceHeaderOptions {
  mode: TaskWorkspaceMode;
  importing: boolean;
  summary: TaskWorkspaceSummary;
  onCreate(): void;
  onImport(): void;
  onModeChange(mode: TaskWorkspaceMode): void;
}
```

Render `任务中心`, the summary sentence, a `任务 / 日历` segmented group, and a right-aligned action group. Keep the existing `data-action` and `data-mode` attributes.

In `TaskWorkspaceView.render()`, derive the summary from the current index snapshot, using active statuses for `active`, `classifyDateRisk(...) !== 'none'` for `dueRisk`, and active unclassified top-level tasks for `unclassified`.

- [ ] **Step 5: Implement visible filter labels and active-filter tags**

Keep native `<select>` controls, but render a visible caption before each select:

```ts
const captionEl = document.createElement('span');
captionEl.dataset.filterCaption = '';
captionEl.textContent = caption;
chip.append(captionEl, select);
```

Use value-only option labels (`全部`, `活动`, `已逾期`) and build a second row only when filters are active:

```ts
const active = document.createElement('div');
active.className = 'tmc-filter-active';
for (const label of activeFilterLabels(options.state)) {
  const chip = document.createElement('span');
  chip.dataset.activeFilter = '';
  chip.textContent = label;
  active.append(chip);
}
active.append(clearButton);
```

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npx vitest run tests/ui/task-workspace-header.test.ts tests/ui/task-filter-bar.test.ts tests/ui/task-workspace-view.test.ts
npm run lint
```

Expected: focused tests PASS and ESLint exits 0.

Commit:

```powershell
git add src/ui/task-workspace-header.ts src/ui/task-filter-bar.ts src/ui/task-workspace-view.ts tests/ui/task-workspace-header.test.ts tests/ui/task-filter-bar.test.ts tests/ui/task-workspace-view.test.ts
git commit -m "feat: align workspace header and filters with visual baseline"
```

---

### Task 2: Matrix Sections and Compact Task Cards

**Files:**
- Modify: `src/ui/task-workspace-view.ts`
- Modify: `src/ui/task-card.ts`
- Modify: `tests/ui/task-workspace-view.test.ts`
- Modify: `tests/ui/task-card.test.ts`
- Modify: `tests/mocks/obsidian.ts`

**Interfaces:**
- Produces: `.tmc-task-section-header`, `[data-role="section-count"]`, `.tmc-task-card-main`, `.tmc-task-card-meta`, and `.tmc-task-progress-bar`.
- Consumes: existing `TaskCardActions`; no task transition semantics change.

- [ ] **Step 1: Add failing section and card hierarchy tests**

```ts
expect(view.containerEl.querySelector('[data-quadrant="important-urgent"] .tmc-task-section-header h3')?.textContent)
  .toBe('重要且紧急');
expect(view.containerEl.querySelector('[data-quadrant="important-urgent"] [data-role="section-count"]')?.textContent)
  .toBe('2');

const card = renderTaskCard(host, indexed, { done: 2, total: 4 }, 'due-today', actions);
expect(card.querySelector('.tmc-task-card-main .tmc-task-title')).not.toBeNull();
expect(card.querySelector('.tmc-task-card-meta')).not.toBeNull();
expect(card.querySelector('.tmc-task-progress-bar')?.getAttribute('aria-valuenow')).toBe('2');
expect(card.querySelector('[data-action="open"]')?.getAttribute('aria-label')).toBe('编辑任务');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx vitest run tests/ui/task-workspace-view.test.ts tests/ui/task-card.test.ts
```

Expected: FAIL on the new hierarchy selectors.

- [ ] **Step 3: Render section title, count, and inbox guidance separately**

Replace the single `h3` with:

```ts
const sectionHeader = document.createElement('header');
sectionHeader.className = 'tmc-task-section-header';
const heading = document.createElement('h3');
heading.textContent = title;
const count = document.createElement('span');
count.dataset.role = 'section-count';
count.textContent = String(tasks.length);
sectionHeader.append(heading, count);
if (quadrant === 'unclassified') {
  const guidance = document.createElement('span');
  guidance.className = 'tmc-task-section-guidance';
  guidance.textContent = '执行前必须分类';
  sectionHeader.append(guidance);
}
```

- [ ] **Step 4: Render compact card regions and accessible icon action**

Import `setIcon` from `obsidian` and update the test mock with:

```ts
export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.dataset.icon = iconId;
}
```

Render title/details inside `.tmc-task-card-main`, badges and source/date facts inside `.tmc-task-card-meta`, a semantic progress bar when children exist, and an edit icon button:

```ts
const edit = actionButton('', 'open', () => actions.open(task.id), actionsDisabled);
edit.setAttribute('aria-label', '编辑任务');
setIcon(edit, 'ellipsis');

const progressBar = document.createElement('div');
progressBar.className = 'tmc-task-progress-bar';
progressBar.setAttribute('role', 'progressbar');
progressBar.setAttribute('aria-valuemin', '0');
progressBar.setAttribute('aria-valuemax', String(progress.total));
progressBar.setAttribute('aria-valuenow', String(progress.done));
```

Keep start/pause/resume/complete buttons in `.tmc-task-actions`; CSS will visually subordinate them until hover/focus without hiding them from keyboard users.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npx vitest run tests/ui/task-workspace-view.test.ts tests/ui/task-card.test.ts
npm run lint
```

Expected: PASS and exit 0.

Commit:

```powershell
git add src/ui/task-workspace-view.ts src/ui/task-card.ts tests/ui/task-workspace-view.test.ts tests/ui/task-card.test.ts tests/mocks/obsidian.ts
git commit -m "feat: add compact matrix and task card hierarchy"
```

---

### Task 3: Shared Create/Edit Modal Fidelity

**Files:**
- Modify: `src/ui/task-form-modal.ts`
- Modify: `tests/ui/task-form-modal.test.ts`

**Interfaces:**
- Produces: `.tmc-form-body`, `.tmc-form-grid`, `.tmc-form-field-wide`, and fixed `[data-role="form-actions"]` hooks.
- Consumes: existing `TaskFormModal.openCreate()`, `openEdit()`, date normalization, validation, and service calls.

- [ ] **Step 1: Add failing grouped-layout tests**

```ts
modal.openCreate();
expect(modal.contentEl.querySelector('.tmc-form-body')).not.toBeNull();
expect(modal.contentEl.querySelector('[data-section="content"] .tmc-form-field-wide [name="details"]'))
  .toBeInstanceOf(HTMLTextAreaElement);
expect(modal.contentEl.querySelector('[data-section="schedule"] .tmc-form-grid'))
  .not.toBeNull();
expect(modal.contentEl.querySelector('[data-section="metadata"]')).toBeInstanceOf(HTMLElement);
expect(modal.contentEl.querySelector('[data-section="metadata"]')?.tagName).toBe('SECTION');
expect(modal.contentEl.querySelector('[data-role="form-actions"] [data-action="save"]'))
  .toBeInstanceOf(HTMLButtonElement);
```

- [ ] **Step 2: Run the form test and verify RED**

Run:

```powershell
npx vitest run tests/ui/task-form-modal.test.ts
```

Expected: FAIL because the current metadata group is a disclosure and the new grid hooks do not exist.

- [ ] **Step 3: Implement one grouped form body with paired grids**

Use a field wrapper helper:

```ts
function field(labelText: string, control: HTMLElement, wide = false): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = wide ? 'tmc-form-field tmc-form-field-wide' : 'tmc-form-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}
```

Render three `<section class="tmc-form-section">` blocks. Content contains title and multiline details as wide fields. Schedule contains status/quadrant and planned/due dates in `.tmc-form-grid`. Metadata is a normal visible section with project/tags in `.tmc-form-grid`. Keep validation attributes and event handlers on the existing controls.

- [ ] **Step 4: Preserve write and cancellation regressions**

Run:

```powershell
npx vitest run tests/ui/task-form-modal.test.ts tests/services/task-service.test.ts tests/markdown/task-serializer.test.ts
```

Expected: all PASS; create/update still execute exactly once and cancel performs no write.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/task-form-modal.ts tests/ui/task-form-modal.test.ts
git commit -m "feat: align shared task modal with visual baseline"
```

---

### Task 4: Fixed Left-List/Right-Editor Import Workspace

**Files:**
- Modify: `src/ui/legacy-import-wizard.ts`
- Modify: `src/ui/legacy-import-candidate-editor.ts`
- Modify: `tests/ui/legacy-import-wizard.test.ts`

**Interfaces:**
- Produces: `renderLegacyCandidateListItem(options): HTMLElement`.
- Produces: `renderLegacyCandidateEditorPanel(options): HTMLElement`.
- Produces: `.tmc-import-review-workspace`, `.tmc-import-candidate-list`, `.tmc-import-editor-panel`, and `data-active-candidate`.
- Consumes: existing `corrections`, `selectedCandidates`, `candidateErrors`, and `MigrationCandidate` evidence.

- [ ] **Step 1: Add failing fixed-workspace tests**

```ts
await openReview(wizard);
const workspace = wizard.contentEl.querySelector('.tmc-import-review-workspace');
expect(workspace).not.toBeNull();
expect(workspace?.querySelector('.tmc-import-candidate-list')).not.toBeNull();
expect(workspace?.querySelector('.tmc-import-editor-panel')).not.toBeNull();
expect(workspace?.querySelectorAll('.tmc-import-editor-panel')).toHaveLength(1);
expect(workspace?.querySelector('[data-active-candidate="checkbox"]')).not.toBeNull();

candidateRow(wizard, 'list').click();
expect(wizard.contentEl.querySelector('[data-active-candidate="list"]')).not.toBeNull();
expect(field(wizard, 'list', 'title').value).toBe('普通列表候选');
expect(field(wizard, 'checkbox', 'title')).toBeUndefined();
```

Add a regression that edits candidate A, switches to B, then back to A and verifies the correction and checkbox selection remain unchanged.

- [ ] **Step 2: Run the wizard test and verify RED**

Run:

```powershell
npx vitest run tests/ui/legacy-import-wizard.test.ts
```

Expected: FAIL because review currently repeats one disclosure form per candidate.

- [ ] **Step 3: Split list-item and editor-panel renderers**

Define shared editor callbacks:

```ts
export interface LegacyCandidateEditorOptions {
  candidate: MigrationCandidate;
  corrected: TaskNode;
  selected: boolean;
  disabled: boolean;
  active?: boolean;
  error?: { field: string; message: string };
  onActivate?(): void;
  onSelected(selected: boolean): void;
  onChanged(task: TaskNode): void;
}
```

`renderLegacyCandidateListItem()` renders the checkbox, title, source path/line, original Markdown, and recognition reason. `renderLegacyCandidateEditorPanel()` renders exactly one full correction form using the same title/details/status/quadrant/date/project/tag grouping as the shared task form.

- [ ] **Step 4: Add active-candidate state to the wizard**

Add:

```ts
private activeCandidateId?: string;

private activateCandidate(candidateId: string): void {
  this.activeCandidateId = candidateId;
  this.render();
}
```

When preview completes, choose the first selected candidate, otherwise the first candidate. During review, render all list items in the left panel and exactly the active candidate editor in the right panel. Preserve `corrections` and `selectedCandidates` maps across activation, back/continue, validation failures, and reentry.

- [ ] **Step 5: Preserve migration safety regressions**

Run:

```powershell
npx vitest run tests/ui/legacy-import-wizard.test.ts tests/services/migration-service.test.ts tests/services/legacy-task-candidates.test.ts
```

Expected: all PASS, including no writes before final confirmation, backups, conflict rejection, rollback, and one apply call.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/legacy-import-wizard.ts src/ui/legacy-import-candidate-editor.ts tests/ui/legacy-import-wizard.test.ts
git commit -m "feat: add fixed import review workspace"
```

---

### Task 5: Unified Visual Styles, Calendar, and Responsive Layout

**Files:**
- Modify: `src/ui/calendar-view.ts`
- Modify: `styles.css`
- Modify: `tests/ui/calendar-view.test.ts`
- Modify: `tests/scaffold.test.ts`

**Interfaces:**
- Consumes all DOM contracts from Tasks 1-4.
- Produces only CSS and stable calendar hooks; no service interface changes.

- [ ] **Step 1: Add failing stylesheet contract tests**

Extend `tests/scaffold.test.ts`:

```ts
for (const selector of [
  '.tmc-filter-controls',
  '.tmc-filter-active',
  '.tmc-task-section-header',
  '.tmc-task-card-main',
  '.tmc-form-grid',
  '.tmc-import-review-workspace',
  '.tmc-import-candidate-list',
  '.tmc-import-editor-panel',
  '.tmc-calendar-panels',
]) expect(styles).toContain(selector);

expect(styles).toMatch(/\.tmc-import-wizard\s*\{[^}]*width:\s*min\(1240px,\s*calc\(100vw - 48px\)\)/s);
expect(styles).toMatch(/\.tmc-import-review-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(320px,\s*38%\)\s+minmax\(0,\s*62%\)/s);
expect(styles).toContain('overflow-x: hidden');
```

Retain the existing check that every `color` and `background` declaration contains `var(--...)`.

- [ ] **Step 2: Add calendar hook tests**

```ts
expect(host.querySelector('.tmc-calendar-toolbar [data-action="previous-month"]')).not.toBeNull();
expect(host.querySelector('.tmc-calendar-panels [data-role="selected-day"]')).not.toBeNull();
expect(host.querySelector('.tmc-calendar-panels [data-role="unscheduled"]')).not.toBeNull();
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npx vitest run tests/scaffold.test.ts tests/ui/calendar-view.test.ts
```

Expected: FAIL on the new selectors and CSS geometry.

- [ ] **Step 4: Implement the shared Obsidian-native visual tokens**

At `.task-matrix-calendar`, define only aliases backed by Obsidian variables:

```css
.task-matrix-calendar {
  --tmc-surface: var(--background-primary);
  --tmc-surface-muted: var(--background-secondary);
  --tmc-surface-hover: var(--background-modifier-hover);
  --tmc-border: var(--background-modifier-border);
  --tmc-text: var(--text-normal);
  --tmc-muted: var(--text-muted);
  --tmc-accent: var(--interactive-accent);
  --tmc-shadow: var(--background-modifier-box-shadow);
}
```

Use these aliases for the header, query panel, inbox, quadrant sections, compact cards, form sections, calendar, and import wizard. Use `--color-red`, `--color-orange`, `--color-blue`, and `--color-green` only for narrow quadrant markers and risk text.

- [ ] **Step 5: Implement approved desktop geometry**

Required geometry:

```css
.tmc-filter-controls {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) repeat(4, minmax(124px, auto));
}

.tmc-quadrant-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tmc-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tmc-import-wizard {
  width: min(1240px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 48px));
  overflow-x: hidden;
}

.tmc-import-review-workspace {
  display: grid;
  grid-template-columns: minmax(320px, 38%) minmax(0, 62%);
  min-height: 0;
}
```

Keep import steps and footer fixed inside the modal grid. Give left list and right editor separate `overflow-y: auto`; do not place `overflow-x: auto` on the modal, form, candidate, or footer.

- [ ] **Step 6: Implement narrow-pane reflow**

At `max-width: 900px`, put search on its own row, keep filters wrapping, make quadrant and form grids one column, and stack calendar panels. At `max-width: 760px`, make import review one column with the candidate list above the active editor; all controls remain reachable without horizontal scrolling.

- [ ] **Step 7: Run visual-contract tests and full local gates**

Run:

```powershell
npx vitest run tests/scaffold.test.ts tests/ui/calendar-view.test.ts
npm test
npm run coverage
npm run lint
npm run build
git diff --check
```

Expected: 0 failed tests, coverage thresholds satisfied, lint/build exit 0, and no diff-check errors.

- [ ] **Step 8: Commit**

```powershell
git add src/ui/calendar-view.ts styles.css tests/ui/calendar-view.test.ts tests/scaffold.test.ts
git commit -m "feat: apply unified task center visual system"
```

---

### Task 6: Install and Real-Obsidian Visual Verification

**Files:**
- Modify only if evidence requires: `README.md`
- Generated and ignored: `main.js`
- Install target: `C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar`

**Interfaces:**
- Consumes the production build artifacts `main.js`, `manifest.json`, and `styles.css`.
- Produces a verified local Vault installation; no repository API changes.

- [ ] **Step 1: Verify repository state and production artifacts**

Run:

```powershell
npm test
npm run coverage
npm run lint
npm run build
Get-FileHash main.js,manifest.json,styles.css -Algorithm SHA256
git status --short
```

Expected: all gates pass; only intended source/docs changes are tracked; artifact hashes are recorded before installation.

- [ ] **Step 2: Install with the repository installer**

Run the existing `scripts/install-to-vault.mjs` through the configured package command or its documented direct invocation, targeting:

```text
C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar
```

Expected: the previous plugin is backed up outside `.obsidian/plugins`, and the target contains exactly `main.js`, `manifest.json`, and `styles.css` plus intentional plugin data.

- [ ] **Step 3: Verify installed hashes**

```powershell
Get-FileHash `
  'C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar\main.js', `
  'C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar\manifest.json', `
  'C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar\styles.css' `
  -Algorithm SHA256
```

Expected: all three hashes equal the repository build artifacts.

- [ ] **Step 4: Run real Obsidian smoke checks**

Reload the plugin, then verify:

1. Task center opens with the approved title/summary/mode/action hierarchy.
2. Search and all four filters work; active tags and clear action update immediately.
3. Matrix shows inbox and four quadrants with compact cards and working actions.
4. New and edit use the shared grouped modal; details accept multiple lines; save and cancel work.
5. Task/calendar switching stays in one workspace and edits appear in both modes.
6. Import step 2 uses a wide left-list/right-editor workspace with no horizontal scrollbar or clipped footer button.
7. Light and dark Obsidian themes both remain readable.

Do not confirm the final import write during this visual smoke test unless the selected files and backup destination are intentionally prepared.

- [ ] **Step 5: Compare against the approved reference and fix visible mismatches**

Use the same wide viewport and representative data shown in the approved reference. Compare task center, form, and import review states for hierarchy, spacing, width, clipping, button visibility, font weight, border radius, and contrast. Any visible mismatch is an implementation defect even when unit tests pass; fix it in the owning task and rerun its focused test plus the full gates.

- [ ] **Step 6: Final verification commit**

If README or source changes were required during real-app verification:

```powershell
git add README.md src tests styles.css
git commit -m "fix: close real vault visual fidelity gaps"
```

Then rerun:

```powershell
npm test
npm run coverage
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all gates pass and the worktree is clean.

---

## Plan Self-Review Results

- **Spec coverage:** Tasks 1-5 map to visual-spec sections 12.1-12.5; Task 6 maps to 12.6 and the local-Vault delivery requirement. Migration safety and task/calendar data invariants remain covered by existing regression suites.
- **Placeholder scan:** Every step contains concrete files, code, commands, expected evidence, and commit scope; no unresolved placeholders remain.
- **Type consistency:** `TaskWorkspaceSummary`, `LegacyCandidateEditorOptions`, `renderLegacyCandidateListItem()`, and `renderLegacyCandidateEditorPanel()` are defined before their consumers.
- **Scope check:** This is one visual-fidelity delivery with one structural import renderer refactor. No domain, Markdown, persistence, or migration-writer redesign is included.
- **Execution choice:** Inline execution is required in this session because the user asked for direct development and no subagent delegation was requested.
