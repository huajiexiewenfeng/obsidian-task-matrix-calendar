# Task Workspace Interaction and Import Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one Obsidian task workspace with working task/calendar tabs, shared create/edit modal, real filters, multiline Markdown details, and a safe automatic legacy-task import preview.

**Architecture:** Keep Markdown and `TaskIndex` as the only persistent/query state. Extend the canonical task block first, then build small UI units (`TaskFormModal`, filter-state mapper, calendar panel) and compose them in one `TaskWorkspaceView`; migration reuses the same managed-path predicate and passes corrected task values explicitly into the existing backup/verify/rollback write path.

**Tech Stack:** TypeScript 5.8, Obsidian API 1.13, DOM APIs, Vitest 4 + jsdom, minimatch 10, esbuild, ESLint.

## Global Constraints

- Markdown remains the only task source of truth; `data.json` stores settings only.
- New tasks default to `todo` and `unclassified`; start/complete still requires a four-quadrant choice.
- Supported statuses remain exactly `todo`, `in-progress`, `paused`, and `done`; cancel/reopen returns to `todo`.
- Support exactly one child-task level; do not add recurrence, hourly scheduling, reminders, mobile support, notifications, telemetry, network calls, or another database.
- Date inputs accept exactly `YYYYMMDD` and `YYYY-MM-DD`, then persist as `YYYY-MM-DD`.
- The UI label is `开始日期`; the Markdown field remains `计划日期::` for compatibility.
- The plugin follows Obsidian light/dark variables and does not introduce a plugin-local theme selector.
- Legacy import scans configured `scanRoots`, always excludes trash and backup paths, applies `excludeGlobs`, previews before writes, backs up before each file write, verifies afterward, and restores on failure.
- Keep fingerprint-based conflict rejection for every normal task edit.
- Do not add runtime dependencies.

---

## File Structure

- `src/domain/task.ts`: add `details` to the canonical domain model.
- `src/domain/dates.ts`: normalize compact and dashed form dates without weakening stored-date validation.
- `src/markdown/task-parser.ts`: parse indented `详情::` blockquote continuations.
- `src/markdown/task-serializer.ts`: serialize details in canonical field order.
- `src/services/task-service.ts`: accept and normalize details on create/update.
- `src/ui/task-form-modal.ts`: own create/edit form DOM, validation, pending state, and error presentation.
- `src/ui/task-filter-state.ts`: pure UI-filter state, option derivation, and `TaskFilters` mapping.
- `src/ui/calendar-view.ts`: retain the month model and compatibility `ItemView` while adding a reusable calendar-panel renderer; Task 9 removes the wrapper after plugin routing changes.
- `src/ui/task-workspace-view.ts`: compose header, tabs, filters, matrix, calendar panel, shared modal, and import action.
- `src/ui/task-card.ts`: include a short details preview while retaining status actions.
- `src/index/managed-path.ts`: one path-eligibility predicate shared by indexing and migration.
- `src/index/task-scanner.ts`: delegate path decisions to `managed-path.ts`.
- `src/persistence/vault-port.ts`: expose Markdown path enumeration to migration.
- `src/services/migration-service.ts`: automatic discovery, canonical-range exclusion, read-failure reporting, corrected-value apply, and duplicate avoidance.
- `src/ui/migration-modal.ts`: default high-confidence selection, per-file selection, editable candidate fields, pending/result states.
- `src/main.ts`: register one workspace view and route both commands into its internal mode.
- `tests/**`: focused unit/jsdom regression tests matching each production responsibility.
- `styles.css`: shared workspace, modal, calendar sidebar, migration preview, focus, and theme-variable styles.
- `README.md`: document the unified workspace, details format, date entry, and import preview.

---

### Task 1: Multiline Details Markdown Contract

**Files:**
- Modify: `src/domain/task.ts:13-64`
- Modify: `src/markdown/task-parser.ts:133-304`
- Modify: `src/markdown/task-serializer.ts:24-50`
- Modify: `tests/fixtures/canonical-tasks.md`
- Modify: `tests/markdown/task-parser.test.ts`
- Modify: `tests/markdown/task-serializer.test.ts`
- Modify: `tests/markdown/task-patch.test.ts`

**Interfaces:**
- Produces: `TaskNode.details?: string` using `\n` internally.
- Produces: canonical Markdown `  - 详情::` followed by `    > ...` continuation lines.
- Preserves: task-block indentation, child-task boundary, source EOL, and fingerprints.

- [ ] **Step 1: Write failing parser/serializer/patch tests**

Add assertions equivalent to:

```ts
const details = '第一行\n\n  保留前导空格';
const task = makeTask({ id: 'task-DETAIL1', title: '多行任务', details });
const block = serializeTaskBlock(task, [], 0, '\r\n');

expect(block).toContain(
  ['  - 详情::', '    > 第一行', '    >', '    >   保留前导空格'].join('\r\n'),
);
const parsed = parseTaskFile('任务/详情.md', block);
expect(parsed.issues).toEqual([]);
expect(parsed.tasks[0].task.details).toBe(details);
expect(parsed.tasks[0].location.eol).toBe('\r\n');
```

Also patch an indexed task containing details and assert unrelated surrounding Markdown is byte-for-byte unchanged.

- [ ] **Step 2: Run focused tests and verify the red state**

Run:

```powershell
npx vitest run tests/markdown/task-parser.test.ts tests/markdown/task-serializer.test.ts tests/markdown/task-patch.test.ts
```

Expected: FAIL because `TaskNode` and the canonical parser/serializer do not support `details`.

- [ ] **Step 3: Add the domain field and canonical serializer**

Add the field and propagation:

```ts
export interface TaskNode {
  id: string;
  title: string;
  details?: string;
  status: TaskStatus;
  // existing fields stay unchanged
}

// inside makeTask
details: input.details,
```

Serialize after classification and before project:

```ts
if (task.details) {
  lines.push(`${fieldPrefix}- 详情::`);
  const quotePrefix = ' '.repeat(indent + 4);
  for (const detailLine of task.details.split('\n')) {
    lines.push(`${quotePrefix}>${detailLine ? ` ${detailLine}` : ''}`);
  }
}
```

- [ ] **Step 4: Parse only structurally valid details continuations**

In the `详情` property branch, require an empty inline value and consume consecutive quote lines at `taskLine.indent + 4`:

```ts
case '详情': {
  if (value) {
    addIssue('unknown-task-content', cursor, '详情字段必须使用下一行的引用块。', taskLine.id);
    break;
  }
  const detailLines: string[] = [];
  let detailCursor = cursor + 1;
  const prefix = `${' '.repeat(taskLine.indent + 4)}>`;
  while (detailCursor < lines.length && lines[detailCursor].startsWith(prefix)) {
    const raw = lines[detailCursor].slice(prefix.length);
    detailLines.push(raw.startsWith(' ') ? raw.slice(1) : raw);
    if (!sawChild) ownLines.push(lines[detailCursor]);
    detailCursor += 1;
  }
  details = detailLines.length > 0 ? detailLines.join('\n') : undefined;
  cursor = detailCursor;
  continue;
}
```

Pass `details` to `makeTask`. Ensure continuation lines are included in `endLine`, `fingerprint`, and `ownFingerprint`.

- [ ] **Step 5: Run focused tests and commit**

Run the Step 2 command; expected: all selected tests PASS.

```powershell
git add src/domain/task.ts src/markdown/task-parser.ts src/markdown/task-serializer.ts tests/fixtures/canonical-tasks.md tests/markdown/task-parser.test.ts tests/markdown/task-serializer.test.ts tests/markdown/task-patch.test.ts
git commit -m "feat: support multiline task details"
```

---

### Task 2: Form Date Normalization and Service Inputs

**Files:**
- Modify: `src/domain/dates.ts`
- Modify: `src/services/task-service.ts:34-137`
- Modify: `tests/domain/dates.test.ts`
- Modify: `tests/services/task-service.test.ts`

**Interfaces:**
- Produces: `normalizeDateInput(value: string): string | undefined`.
- Produces: `CreateTaskInput.details?: string`.
- Preserves: repository methods receive stored ISO dates only.

- [ ] **Step 1: Write failing normalization and service tests**

```ts
expect(normalizeDateInput('20260715')).toBe('2026-07-15');
expect(normalizeDateInput(' 2026-07-15 ')).toBe('2026-07-15');
expect(normalizeDateInput('')).toBeUndefined();
expect(() => normalizeDateInput('20260230')).toThrowError(/有效日期/);

const created = await service.create({
  title: '含详情',
  details: '第一行\r\n第二行',
  plannedDate: '2026-07-15',
});
expect(created.details).toBe('第一行\n第二行');
```

- [ ] **Step 2: Run tests and verify failure**

```powershell
npx vitest run tests/domain/dates.test.ts tests/services/task-service.test.ts
```

Expected: FAIL because `normalizeDateInput` and `CreateTaskInput.details` do not exist.

- [ ] **Step 3: Implement strict form normalization**

```ts
export function normalizeDateInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = /^\d{8}$/.test(trimmed)
    ? `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
    : trimmed;
  if (!isValidIsoDate(normalized)) {
    throw new Error(`请输入有效日期（YYYYMMDD 或 YYYY-MM-DD）：${value}`);
  }
  return normalized;
}
```

Add service normalization without collapsing detail-line whitespace:

```ts
function normalizeDetails(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\r\n?/g, '\n');
  return normalized.trim().length > 0 ? normalized : undefined;
}
```

Use it in create and update; add `details?: string` to `CreateTaskInput`.

- [ ] **Step 4: Run focused tests and commit**

Run the Step 2 command; expected: PASS.

```powershell
git add src/domain/dates.ts src/services/task-service.ts tests/domain/dates.test.ts tests/services/task-service.test.ts
git commit -m "feat: normalize task form dates and details"
```

---

### Task 3: Shared Create/Edit Task Modal

**Files:**
- Create: `src/ui/task-form-modal.ts`
- Create: `tests/ui/task-form-modal.test.ts`
- Modify: `tests/mocks/obsidian.ts:68-88`

**Interfaces:**
- Consumes: `TaskService.create(input)` and `TaskService.update(id, patch)`.
- Produces: `TaskFormModal.openCreate()` and `TaskFormModal.openEdit(indexed)`.
- Produces fields named `title`, `details`, `status`, `quadrant`, `plannedDate`, `dueDate`, `project`, and `tags`.

- [ ] **Step 1: Write failing jsdom tests**

Cover create defaults, edit population, compact dates, validation, one-call submission, pending disable, success close, and failure stay-open:

```ts
const modal = new TaskFormModal(app, service, () => '2026-07-15');
modal.openCreate();
expect(input('plannedDate').value).toBe('2026-07-15');
input('title').value = '新任务';
input('details').value = '第一行\n第二行';
input('plannedDate').value = '20260716';
click('save');
await flushPromises();
expect(service.create).toHaveBeenCalledTimes(1);
expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
  title: '新任务', details: '第一行\n第二行', plannedDate: '2026-07-16', quadrant: 'unclassified',
}));
```

For rejection, mock `create` with `new TaskCommandError('invalid-title', '任务标题不能为空。')`, then assert `[data-form-error]` is visible and the modal remains open.

- [ ] **Step 2: Run the modal test and verify failure**

```powershell
npx vitest run tests/ui/task-form-modal.test.ts
```

Expected: FAIL because `TaskFormModal` is missing.

- [ ] **Step 3: Implement one modal for both modes**

Use one submit path and normalize dates before calling the service:

```ts
export interface TaskFormServicePort {
  create(input: CreateTaskInput): Promise<TaskNode>;
  update(id: string, patch: Partial<Omit<TaskNode, 'id' | 'childrenIds'>>): Promise<void>;
}

type FormMode = { kind: 'create' } | { kind: 'edit'; indexed: IndexedTask };

function formErrorMessage(error: unknown): string {
  if (error instanceof TaskWriteError) {
    return `${error.message}（${error.path} · ${error.taskId}）`;
  }
  return error instanceof Error ? error.message : String(error);
}

private async submit(form: HTMLFormElement, save: HTMLButtonElement): Promise<void> {
  this.clearErrors();
  const values = new FormData(form);
  const title = String(values.get('title') ?? '').trim();
  if (!title) return this.showError('任务标题不能为空。', 'title');
  let plannedDate: string | undefined;
  let dueDate: string | undefined;
  try {
    plannedDate = normalizeDateInput(String(values.get('plannedDate') ?? ''));
    dueDate = normalizeDateInput(String(values.get('dueDate') ?? ''));
  } catch (error) {
    return this.showError(error instanceof Error ? error.message : String(error), 'plannedDate');
  }
  const patch = {
    title,
    details: String(values.get('details') ?? ''),
    status: String(values.get('status')) as TaskStatus,
    quadrant: String(values.get('quadrant')) as TaskQuadrant,
    plannedDate,
    dueDate,
    project: String(values.get('project') ?? ''),
    tags: String(values.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
  };
  save.disabled = true;
  try {
    if (this.mode.kind === 'create') await this.service.create(patch);
    else await this.service.update(this.mode.indexed.task.id, patch);
    this.close();
  } catch (error) {
    this.showError(formErrorMessage(error));
  } finally {
    save.disabled = false;
  }
}
```

Render `details` as `<textarea rows="6">`, render date fields as text inputs with `inputMode="numeric"` and placeholder `YYYYMMDD 或 YYYY-MM-DD`, and set `aria-invalid` on the field owning an inline error.

- [ ] **Step 4: Keep the compatibility drawer until the unified view replaces it, and run tests**

The existing matrix view still imports the drawer, so keep both drawer files unchanged in this task. Task 6 deletes the drawer and old matrix view together, preserving a compilable/testable branch after every task.

```powershell
npx vitest run tests/ui/task-form-modal.test.ts
```

Expected: modal tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/task-form-modal.ts tests/ui/task-form-modal.test.ts tests/mocks/obsidian.ts
git commit -m "feat: add shared task form modal"
```

---

### Task 4: Real Filter State and Searchable Details

**Files:**
- Create: `src/ui/task-filter-state.ts`
- Create: `tests/ui/task-filter-state.test.ts`
- Modify: `src/index/task-index.ts:48-73`
- Modify: `tests/index/task-index.test.ts`

**Interfaces:**
- Produces: `TaskWorkspaceFilterState`.
- Produces: `toTaskFilters(state): TaskFilters`.
- Produces: `deriveFilterOptions(tasks): { projects: string[]; sourcePaths: string[] }`.

- [ ] **Step 1: Write failing pure-state and index tests**

```ts
expect(toTaskFilters({ query: '', project: '*', status: 'active', risk: '*', sourcePath: '*' }))
  .toEqual({ statuses: ['todo', 'in-progress', 'paused'] });
expect(toTaskFilters({ query: '第二行', project: '开源', status: 'done', risk: 'overdue', sourcePath: '任务/a.md' }))
  .toEqual({ query: '第二行', projects: ['开源'], statuses: ['done'], risks: ['overdue'], sourcePaths: ['任务/a.md'] });
```

Add an indexed task whose title lacks the query but whose `details` contains it; assert `TaskIndex.query()` returns that task.

- [ ] **Step 2: Run tests and verify failure**

```powershell
npx vitest run tests/ui/task-filter-state.test.ts tests/index/task-index.test.ts
```

Expected: FAIL because filter-state mapping is missing and details are not searchable.

- [ ] **Step 3: Implement the pure mapping**

```ts
export type StatusFilter = '*' | 'active' | TaskStatus;
export type RiskFilter = '*' | DateRisk;

export interface TaskWorkspaceFilterState {
  query: string;
  project: '*' | string;
  status: StatusFilter;
  risk: RiskFilter;
  sourcePath: '*' | string;
}

export const DEFAULT_FILTER_STATE: TaskWorkspaceFilterState = {
  query: '', project: '*', status: 'active', risk: '*', sourcePath: '*',
};

export function toTaskFilters(state: TaskWorkspaceFilterState): TaskFilters {
  return {
    ...(state.query.trim() ? { query: state.query } : {}),
    ...(state.project !== '*' ? { projects: [state.project] } : {}),
    ...(state.status === 'active' ? { statuses: ['todo', 'in-progress', 'paused'] }
      : state.status !== '*' ? { statuses: [state.status] } : {}),
    ...(state.risk !== '*' ? { risks: [state.risk] } : {}),
    ...(state.sourcePath !== '*' ? { sourcePaths: [state.sourcePath] } : {}),
  };
}
```

Include `task.details ?? ''` in the `TaskIndex` searchable array. Sort derived project/source options with `localeCompare('zh-CN')` and deduplicate them.

- [ ] **Step 4: Run tests and commit**

Run the Step 2 command; expected: PASS.

```powershell
git add src/ui/task-filter-state.ts tests/ui/task-filter-state.test.ts src/index/task-index.ts tests/index/task-index.test.ts
git commit -m "feat: add functional task filters"
```

---

### Task 5: Reusable Calendar Panel

**Files:**
- Modify: `src/ui/calendar-view.ts`
- Modify: `tests/ui/calendar-view.test.ts`

**Interfaces:**
- Preserves: `buildMonthModel(year, month, tasks, today): CalendarDayCell[]`.
- Produces: `renderCalendarPanel(host, options): void`.
- Consumes callbacks: `onEdit(taskId)`, `onMove(taskId, plannedDate)`, `onSelectDate(date)`.

- [ ] **Step 1: Write failing calendar interaction tests**

Assert 42 cells, month navigation, selected-day panel, unscheduled panel, click-to-edit, draggable unscheduled cards, and planned-date-only drop:

```ts
renderCalendarPanel(host, {
  cursor: new Date(Date.UTC(2026, 6, 1)),
  selectedDate: '2026-07-15',
  tasks,
  today: '2026-07-15',
  onMove,
  onEdit,
  onChangeMonth,
  onSelectDate,
});
expect(host.querySelectorAll('[data-date]')).toHaveLength(42);
expect(host.querySelector('[data-role="unscheduled"]')?.textContent).toContain('无日期');
host.querySelector<HTMLButtonElement>('[data-calendar-task-id="task-A1"]')!.click();
expect(onEdit).toHaveBeenCalledWith('task-A1');
```

- [ ] **Step 2: Run the test and verify failure**

```powershell
npx vitest run tests/ui/calendar-view.test.ts
```

Expected: FAIL because the current calendar is a standalone `ItemView` and lacks selected/unscheduled panels.

- [ ] **Step 3: Add a panel renderer while preserving the compatibility `CalendarView`**

Keep the month model. Add:

```ts
export interface CalendarPanelOptions {
  cursor: Date;
  selectedDate: string;
  tasks: readonly TaskNode[];
  today: string;
  onChangeMonth(delta: number): void;
  onSelectDate(date: string): void;
  onEdit(taskId: string): void;
  onMove(taskId: string, plannedDate: string): void;
}
```

Every task button sets `data-calendar-task-id`, calls `onEdit`, and is draggable. The unscheduled list is exactly `tasks.filter(task => !task.plannedDate && !task.dueDate)`. A drop target calls only `onMove(taskId, day.date)`; it has no due-date callback.

Keep the existing exported `CalendarView` as a thin compatibility wrapper around `renderCalendarPanel` until Task 9 changes `main.ts`. It must retain the current constructor and view type so the branch compiles and the installed plugin remains loadable after this task.

- [ ] **Step 4: Run tests and commit**

Run the Step 2 command; expected: PASS.

```powershell
git add src/ui/calendar-view.ts tests/ui/calendar-view.test.ts
git commit -m "feat: render linked calendar panel"
```

---

### Task 6: Unified Task Workspace

**Files:**
- Create: `src/ui/task-workspace-view.ts`
- Create: `tests/ui/task-workspace-view.test.ts`
- Modify: `src/ui/task-card.ts`
- Modify: `tests/ui/task-card.test.ts`

**Interfaces:**
- Produces: `TASK_WORKSPACE_VIEW_TYPE = 'task-matrix-calendar-task-workspace'`.
- Produces: `TaskWorkspaceMode = 'tasks' | 'calendar'` and public `setMode(mode): void`.
- Consumes: `TaskIndex`, task service, classification prompt, form modal, import callback, and calendar renderer.

- [ ] **Step 1: Write failing workspace tests**

Test that one view:

```ts
expect(view.getViewType()).toBe(TASK_WORKSPACE_VIEW_TYPE);
expect(view.containerEl.querySelector('[data-mode="tasks"]')).not.toBeNull();
view.containerEl.querySelector<HTMLButtonElement>('[data-action="new-task"]')!.click();
expect(form.openCreate).toHaveBeenCalledTimes(1);
view.containerEl.querySelector<HTMLButtonElement>('[data-action="open"]')!.click();
expect(form.openEdit).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ id: 'task-A1' }) }));
```

Change every select (`project`, `status`, `risk`, `source`) and assert visible task IDs change. Switch to calendar and back; assert the selected filter values survive and no second view/leaf is constructed. Assert `导入旧任务` calls the import callback once.

- [ ] **Step 2: Run the workspace test and verify failure**

```powershell
npx vitest run tests/ui/task-workspace-view.test.ts tests/ui/task-card.test.ts
```

Expected: FAIL because the unified view does not exist.

- [ ] **Step 3: Compose the header, controls, matrix, and calendar**

Use persistent instance fields:

```ts
private mode: TaskWorkspaceMode = 'tasks';
private filters: TaskWorkspaceFilterState = { ...DEFAULT_FILTER_STATE };
private calendarCursor: Date;
private selectedDate: string;

setMode(mode: TaskWorkspaceMode): void {
  if (this.mode === mode) return;
  this.mode = mode;
  this.render();
}

private filteredTasks(): IndexedTask[] {
  return this.index
    .query(toTaskFilters(this.filters), this.today(), this.dueSoonDays)
    .filter((item) => !item.task.parentId);
}
```

Use `<select data-filter="project|status|risk|source">` controls, not inert buttons. `+ 新任务` calls `form.openCreate()`. Task-card and calendar entry clicks call `form.openEdit(index.get(id)!)`. Calendar drops call `service.changePlannedDate` through the existing error-wrapping `run()` method. The import button calls the injected async import action and disables itself while pending.

- [ ] **Step 4: Preserve task workflow actions and add details preview**

Retain start/complete classification gates, pause, resume, and drag-to-quadrant. In `task-card.ts`, add at most two lines of details without using it as a button label:

```ts
if (task.details) {
  card.append(textElement('p', 'tmc-task-description', task.details));
}
```

Use CSS line clamping later; keep full text in the DOM for accessibility and search.

- [ ] **Step 5: Keep old registered views until plugin routing changes, run tests, and commit**

```powershell
npx vitest run tests/ui/task-workspace-view.test.ts tests/ui/task-card.test.ts tests/ui/calendar-view.test.ts
```

Expected: tests PASS. The old matrix view, drawer, and calendar wrapper remain unchanged until Task 9 switches `main.ts` to the unified workspace.

```powershell
git add src/ui/task-workspace-view.ts tests/ui/task-workspace-view.test.ts src/ui/task-card.ts tests/ui/task-card.test.ts
git commit -m "feat: unify task and calendar workspace"
```

---

### Task 7: Automatic and Correctable Legacy Discovery

**Files:**
- Create: `src/index/managed-path.ts`
- Create: `tests/index/managed-path.test.ts`
- Modify: `src/index/task-scanner.ts`
- Modify: `tests/index/task-scanner.test.ts`
- Modify: `src/persistence/vault-port.ts`
- Modify: `src/services/migration-service.ts`
- Modify: `tests/services/migration-service.test.ts`

**Interfaces:**
- Produces: `isManagedMarkdownPath(path, settings): boolean`.
- Changes: `VaultProcessPort.listMarkdownPaths(): string[]`.
- Produces: primary `MigrationService.preview(): Promise<MigrationPlan>` automatic discovery path; keep a temporary optional path argument so the old modal/main wiring compiles until Tasks 8-9.
- Produces: primary `MigrationService.apply(plan, selections: ReadonlyMap<string, TaskNode>): Promise<void>`; keep a temporary `Set<string>` compatibility branch for the old modal until Task 8.
- Adds: `MigrationPlan.failures: Map<string, string>`.

- [ ] **Step 1: Write failing managed-path and migration tests**

Cover case-insensitive roots, excludes, trash, backup, automatic path enumeration, continuation after a read failure, canonical-block exclusion, corrected values, unselected-text preservation, stale-plan preservation, verification rollback, and second-preview duplicate avoidance.

```ts
const plan = await service.preview();
expect([...plan.files.keys()]).toEqual(['任务/旧日记.md']);
expect(plan.failures.get('任务/读失败.md')).toMatch(/无法读取/);

const candidate = plan.files.get(path)![0];
const corrected = makeTask({
  ...candidate.proposed,
  title: '修正标题',
  details: '补充一\n补充二',
  quadrant: 'important-not-urgent',
  dueDate: '2026-07-31',
});
await service.apply(plan, new Map([[candidate.candidateId, corrected]]));
expect(await vault.read(path)).toContain('  - 详情::\n    > 补充一\n    > 补充二');
expect((await service.preview()).files.get(path) ?? []).not.toContainEqual(
  expect.objectContaining({ originalText: expect.stringContaining(`^${corrected.id}`) }),
);
```

- [ ] **Step 2: Run tests and verify failure**

```powershell
npx vitest run tests/index/managed-path.test.ts tests/index/task-scanner.test.ts tests/services/migration-service.test.ts
```

Expected: FAIL because path logic is private, preview requires paths, and apply cannot receive corrections.

- [ ] **Step 3: Extract and reuse path eligibility**

```ts
export function isManagedMarkdownPath(
  path: string,
  settings: TaskMatrixCalendarSettings,
): boolean {
  const normalized = normalizeVaultPath(path);
  if (!/\.md$/i.test(normalized)) return false;
  if (!settings.scanRoots.some((root) => isWithin(normalized, root))) return false;
  if (samePath(normalized, settings.trashPath)) return false;
  if (isWithin(normalized, settings.backupRoot)) return false;
  return !settings.excludeGlobs.some((glob) => minimatch(normalized, glob, { dot: true, nocase: true }));
}
```

Make `TaskScanner.shouldScan()` call this function and use it in migration discovery.

- [ ] **Step 4: Make preview automatic and isolate canonical ranges**

For every eligible path, read inside its own `try/catch`. Parse canonical tasks first and skip candidate lines falling inside any `[startLine, endLine]` range:

```ts
const canonical = parseTaskFile(path, source);
const managedLines = new Set<number>();
for (const indexed of canonical.tasks) {
  for (let line = indexed.location.startLine; line <= indexed.location.endLine; line += 1) {
    managedLines.add(line);
  }
}
if (managedLines.has(line)) continue;
```

Store read failures in `plan.failures` and continue scanning remaining files.

During this intermediate task, an explicitly supplied legacy path list may still be accepted for the unchanged old modal/main call chain, but zero-argument preview must be the tested primary behavior and must enumerate/filter `vault.listMarkdownPaths()` itself.

- [ ] **Step 5: Apply selected corrected values safely**

Select by candidate ID, but preserve the candidate-generated ID regardless of edited input:

```ts
const selected = candidates.flatMap((candidate) => {
  const correction = selections.get(candidate.candidateId);
  return correction ? [{ candidate, proposed: { ...correction, id: candidate.proposed.id } }] : [];
});
```

Before mutation, create the existing timestamped backup. During `process`, compare latest source slices with `candidate.originalText`; replace bottom-up. Reparse after write and require every selected ID, every unselected original string, and zero new parse issues. On any failure, restore the exact pre-write source and throw `MigrationError`.

- [ ] **Step 6: Run tests and commit**

Run the Step 2 command; expected: PASS.

```powershell
git add src/index/managed-path.ts tests/index/managed-path.test.ts src/index/task-scanner.ts tests/index/task-scanner.test.ts src/persistence/vault-port.ts src/services/migration-service.ts tests/services/migration-service.test.ts
git commit -m "feat: discover and safely correct legacy tasks"
```

---

### Task 8: Import Preview Modal

**Files:**
- Modify: `src/ui/migration-modal.ts`
- Modify: `tests/ui/migration-modal.test.ts`

**Interfaces:**
- Consumes: zero-argument `preview()` and corrected-value `apply()` from Task 7.
- Produces: `MigrationModal.preview(): Promise<void>` for the workspace header.

- [ ] **Step 1: Write failing preview UI tests**

Assert high-confidence rows start checked, medium/low rows start unchecked, file-level toggle works, read errors render, all proposed fields are editable, confirmation sends exactly selected corrected values, and pending/error/success states are visible.

```ts
await modal.preview();
expect(service.preview).toHaveBeenCalledWith();
expect(row('high').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
expect(row('medium').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
field('c-high', 'details').value = '第一行\n第二行';
click('confirm');
await flushPromises();
expect(service.apply).toHaveBeenCalledWith(plan, new Map([
  ['c-high', expect.objectContaining({ details: '第一行\n第二行' })],
]));
```

- [ ] **Step 2: Run the modal test and verify failure**

```powershell
npx vitest run tests/ui/migration-modal.test.ts
```

Expected: FAIL because defaults, full corrections, and result states are missing.

- [ ] **Step 3: Render grouped editable candidates**

Maintain `selected: Set<string>` and `corrections: Map<string, TaskNode>`. Initialize selection with only `confidence === 'high'`. Render title, details textarea, status, start date, due date, quadrant, and legacy priority inputs. Every input updates a copied `TaskNode` in `corrections`; do not mutate `MigrationPlan`.

Before building `selectedCorrections`, normalize both editable date fields with `normalizeDateInput`. If either value is invalid, set `aria-invalid="true"`, render an inline error for that candidate, and return without calling `apply()`.

After this modal uses the corrected-value `Map`, remove the temporary `Set<string>` compatibility branch from `MigrationService.apply`. Keep an optional ignored argument on `MigrationModal.preview(_legacyPaths?: string[])` only until Task 9 updates the existing command callback; zero-argument preview remains the real behavior.

The confirm handler must be:

```ts
const selectedCorrections = new Map<string, TaskNode>();
for (const id of this.selected) {
  const corrected = this.corrections.get(id);
  if (corrected) selectedCorrections.set(id, corrected);
}
confirm.disabled = true;
try {
  await this.service.apply(this.plan, selectedCorrections);
  new Notice(`已导入 ${selectedCorrections.size} 个旧任务。`);
  this.close();
} catch (error) {
  this.showError(error instanceof Error ? error.message : String(error));
} finally {
  confirm.disabled = false;
}
```

- [ ] **Step 4: Run tests and commit**

Run the Step 2 command; expected: PASS.

```powershell
git add src/ui/migration-modal.ts tests/ui/migration-modal.test.ts
git commit -m "feat: add editable legacy import preview"
```

---

### Task 9: Plugin Wiring and Single-Leaf Commands

**Files:**
- Modify: `src/main.ts:25-195`
- Modify: `tests/plugin-lifecycle.test.ts`
- Modify: `tests/mocks/obsidian.ts`
- Modify: `src/ui/calendar-view.ts`
- Modify: `tests/ui/calendar-view.test.ts`
- Delete: `src/ui/task-matrix-view.ts`
- Delete: `tests/ui/task-matrix-view.test.ts`
- Delete: `src/ui/task-editor-drawer.ts`
- Delete: `tests/ui/task-editor-drawer.test.ts`

**Interfaces:**
- Consumes: `TASK_WORKSPACE_VIEW_TYPE`, `TaskWorkspaceView`, `TaskWorkspaceMode`.
- Produces: `activateTaskWorkspace(mode: TaskWorkspaceMode): Promise<void>`.
- Preserves command IDs: `open-task-matrix`, `open-task-calendar`, `migrate-legacy-tasks`.

- [ ] **Step 1: Write failing lifecycle and command-routing tests**

Capture the registered view creator and make a fake leaf whose `view` is the created workspace. Execute both command callbacks and assert:

```ts
expect(recorded.registeredViews.map((item) => item.type)).toEqual([TASK_WORKSPACE_VIEW_TYPE]);
await openTasks.callback?.();
expect(workspace.setMode).toHaveBeenCalledWith('tasks');
await openCalendar.callback?.();
expect(workspace.setMode).toHaveBeenCalledWith('calendar');
expect(app.workspace.getLeaf).toHaveBeenCalledTimes(1);
```

Assert the migration command and workspace button both invoke the same `MigrationModal.preview()`.

- [ ] **Step 2: Run the lifecycle test and verify failure**

```powershell
npx vitest run tests/plugin-lifecycle.test.ts
```

Expected: FAIL because two independent ItemViews are registered and commands activate by view type.

- [ ] **Step 3: Register and activate one workspace**

Register only `TASK_WORKSPACE_VIEW_TYPE`. Construct one `TaskFormModal` and one `MigrationModal`, inject them into the view, and route commands:

```ts
this.addCommand({
  id: COMMANDS.openTasks,
  name: '打开任务中心',
  callback: () => void this.activateTaskWorkspace('tasks'),
});
this.addCommand({
  id: COMMANDS.openCalendar,
  name: '打开任务日历',
  callback: () => void this.activateTaskWorkspace('calendar'),
});

async activateTaskWorkspace(mode: TaskWorkspaceMode): Promise<void> {
  let leaf = this.app.workspace.getLeavesOfType(TASK_WORKSPACE_VIEW_TYPE)[0];
  if (!leaf) {
    leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: TASK_WORKSPACE_VIEW_TYPE, active: true });
  }
  const view = leaf.view;
  if (view instanceof TaskWorkspaceView) view.setMode(mode);
  await this.app.workspace.revealLeaf(leaf);
}
```

Ribbon opens task mode. The command-palette migration action calls zero-argument `migrationModal.preview()`.

Remove the remaining optional legacy preview argument from `MigrationModal.preview` and `MigrationService.preview` after the command callback is switched, so the final public API is strictly zero-argument.

After `main.ts` no longer imports the old views, remove the compatibility `CalendarView`/`CALENDAR_VIEW_TYPE` wrapper while retaining `buildMonthModel` and `renderCalendarPanel`. Delete the old matrix view, editor drawer, and their tests in the same commit. Verify no production references remain:

```powershell
rg -n "TaskMatrixView|TASK_MATRIX_VIEW_TYPE|TaskEditorDrawer|task-editor-drawer|CALENDAR_VIEW_TYPE|new CalendarView" src tests
```

Expected: no matches.

- [ ] **Step 4: Run lifecycle and all UI tests, then commit**

```powershell
npx vitest run tests/plugin-lifecycle.test.ts tests/ui
```

Expected: PASS.

```powershell
git add src/main.ts tests/plugin-lifecycle.test.ts tests/mocks/obsidian.ts src/ui/calendar-view.ts tests/ui/calendar-view.test.ts src/ui/task-matrix-view.ts tests/ui/task-matrix-view.test.ts src/ui/task-editor-drawer.ts tests/ui/task-editor-drawer.test.ts
git commit -m "feat: route task commands through one workspace"
```

---

### Task 10: Theme Styling, Documentation, Full Verification, and Local Installation

**Files:**
- Modify: `styles.css`
- Modify: `README.md`
- Modify: `tests/scaffold.test.ts`
- Modify: `tests/install-script.test.ts` only if the documented artifact assertions need the new workspace copy.

**Interfaces:**
- Preserves release artifacts: `main.js`, `manifest.json`, `styles.css` only.
- Preserves backup-first installation behavior.

- [ ] **Step 1: Add failing structural style/documentation assertions**

Assert the CSS contains workspace tabs, modal textarea, selected calendar day, unscheduled panel, migration error, disabled state, and focus selectors, while all foreground/background declarations use Obsidian variables:

```ts
for (const selector of [
  '.tmc-mode-switch', '.tmc-task-form', '.tmc-calendar-sidebar',
  '.tmc-unscheduled-tasks', '.tmc-migration-errors', ':focus-visible',
]) {
  expect(styles).toContain(selector);
}
expect(styles).toContain('var(--text-normal)');
expect(styles).toContain('var(--background-primary)');
```

- [ ] **Step 2: Run structural tests and verify failure**

```powershell
npx vitest run tests/scaffold.test.ts tests/install-script.test.ts
```

Expected: FAIL until the new selectors/documentation are present.

- [ ] **Step 3: Replace drawer styles with responsive workspace/modal styles**

Use Obsidian variables for every surface and include textarea in control/focus rules:

```css
.task-matrix-calendar button,
.task-matrix-calendar input,
.task-matrix-calendar select,
.task-matrix-calendar textarea {
  color: var(--text-normal);
  background: var(--background-modifier-form-field);
  border: 1px solid var(--background-modifier-border);
}

.tmc-mode-switch { display: inline-flex; gap: 4px; }
.tmc-mode-switch [aria-selected="true"] { color: var(--text-on-accent); background: var(--interactive-accent); }
.tmc-task-form { display: grid; gap: 10px; }
.tmc-task-form label { display: grid; gap: 4px; }
.tmc-task-description { white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tmc-calendar-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 28%); gap: 12px; }
.tmc-calendar-sidebar, .tmc-unscheduled-tasks { background: var(--background-secondary); border: 1px solid var(--background-modifier-border); }
.tmc-calendar-day.is-selected { box-shadow: inset 0 0 0 2px var(--interactive-accent); }
.tmc-migration-errors, .tmc-form-error { color: var(--text-error); }
```

At narrow widths, collapse matrix and calendar sidebar to one column. Remove `.tmc-drawer-*` rules.

- [ ] **Step 4: Update README with the released behavior**

Document:

```markdown
- “任务 / 日历”在同一个任务工作区内切换并共享筛选状态。
- “+ 新任务”和“编辑”使用同一个弹窗；详情支持多行。
- 开始日期可输入 `YYYYMMDD` 或 `YYYY-MM-DD`，保存为 `计划日期:: YYYY-MM-DD`。
- “导入旧任务”自动扫描设置中的任务目录；默认只勾选高置信度候选，确认前可修改识别结果。
```

Add the `详情::` blockquote example to the Markdown format section and remove references to quick create.

- [ ] **Step 5: Run complete quality gates**

```powershell
npm test
npm run coverage
npm run lint
npm run build
git diff --check
```

Expected:

- All tests PASS.
- Coverage command exits 0 and does not reduce overall statements below 85%, branches below 75%, functions below 79%, or lines below 89%.
- ESLint exits 0.
- TypeScript/esbuild production build exits 0 and emits `main.js`.
- `git diff --check` emits no errors.

- [ ] **Step 6: Commit release-facing changes**

```powershell
git add styles.css README.md tests/scaffold.test.ts tests/install-script.test.ts
git commit -m "docs: finish task workspace redesign"
```

- [ ] **Step 7: Install verified artifacts into the local Vault**

With explicit approval for the main Vault write, run:

```powershell
$env:ALLOW_PRODUCTION_VAULT='YES'
node scripts/install-to-vault.mjs --vault "C:\Users\admin\Documents\Obsidian Vault"
```

Expected: `Installed task-matrix-calendar to C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar` and a timestamped backup of the previous plugin directory.

Compare SHA-256 for repository and installed `main.js`, `manifest.json`, and `styles.css`; all three pairs must match.

- [ ] **Step 8: Perform user-visible smoke verification**

Reload Obsidian/plugin and verify:

1. Task workspace opens in the active Obsidian theme and text remains readable.
2. `+ 新任务` opens the modal; multiline details and `20260715` save correctly.
3. Editing the created task reopens populated values and persists one update.
4. Project/status/risk/source filters visibly change results.
5. `任务 / 日历` switches inside the same leaf; filters persist.
6. Calendar shows scheduled and unscheduled tasks; a test drop changes only `计划日期`.
7. `导入旧任务` scans configured roots and opens a preview with high-confidence defaults.
8. Close the import preview without applying anything to the main Vault during smoke verification.

Record the final test count, coverage summary, build result, installed hashes, backup path, and smoke result in the implementation handoff.
