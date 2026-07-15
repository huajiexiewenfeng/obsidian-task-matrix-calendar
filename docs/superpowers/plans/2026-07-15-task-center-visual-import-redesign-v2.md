# Task Center Visual and Legacy Import Redesign V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visually flat task workspace and form with the approved calm Obsidian-native experience, and replace broad automatic legacy scanning with a source-explicit three-step import wizard.

**Architecture:** Keep the existing Markdown schema, repository, task state machine, calendar, conflict protection, and migration writer. Extract workspace chrome into focused DOM renderers, regroup the shared task form, move legacy candidate recognition into a pure evidence-producing extractor, narrow `MigrationService.preview()` to user-selected files, and replace the one-page migration modal with a stateful three-step wizard.

**Tech Stack:** TypeScript, Obsidian desktop API 1.12.7, DOM APIs, Vitest 4 with jsdom, ESLint, esbuild, Markdown persistence.

## Global Constraints

- Markdown remains the only task source of truth; do not add a database, cache file, telemetry, or network service.
- Preserve the current canonical task Markdown schema and task IDs.
- Preserve statuses `todo`, `in-progress`, `paused`, and `done`; every non-`todo` task must remain in one of the four classified quadrants.
- New tasks default to `todo`, `unclassified`, and today's planned date.
- Date inputs accept exactly `YYYYMMDD` or `YYYY-MM-DD` and persist as `YYYY-MM-DD`.
- Existing task/calendar linkage, fingerprint conflict protection, backup-before-write, post-write verification, and rollback remain mandatory.
- Legacy import reads only files explicitly selected by the user from configured scan roots.
- Checkbox candidates are selected by default; ordinary list candidates are not selected by default.
- Priority and status words enrich list candidates but never turn ordinary prose into candidates.
- All foreground and background CSS declarations use Obsidian theme variables; no fixed black or white text/background declarations.
- Tests and fixtures must be privacy-safe and may not contain absolute user paths or copied private Vault content.
- Run Windows package scripts with `npm.cmd`, not `npm`, because PowerShell script execution blocks `npm.ps1` in this environment.

---

## File Structure

### Create

- `src/ui/task-workspace-header.ts` — title, primary/secondary actions, and task/calendar segmented navigation.
- `src/ui/task-filter-bar.ts` — search, pill-like select controls, active state, and clear-all behavior.
- `tests/ui/task-workspace-header.test.ts` — workspace header semantics and callbacks.
- `tests/ui/task-filter-bar.test.ts` — filter rendering, updates, active styling, clear behavior, and search focus metadata.
- `src/services/legacy-task-candidates.ts` — pure legacy list recognition and evidence generation.
- `tests/services/legacy-task-candidates.test.ts` — strict recognition rules using a sanitized mixed-format fixture.
- `tests/fixtures/legacy-mixed-tasks.md` — sanitized dated headings, checkboxes, lists, prose, priority, and status markers.
- `src/ui/legacy-import-candidate-editor.ts` — one editable candidate row with source evidence and field bindings.
- `src/ui/legacy-import-wizard.ts` — select/review/confirm state machine and final apply action.
- `tests/ui/legacy-import-wizard.test.ts` — all wizard steps, state preservation, validation, cancellation, and pending lock.

### Modify

- `src/ui/task-filter-state.ts` — add a single default-state predicate used by the clear button and active styling.
- `src/ui/task-workspace-view.ts` — compose the new header/filter renderers while preserving task and calendar behavior.
- `tests/ui/task-workspace-view.test.ts` — integration coverage for the extracted chrome and clear-filter behavior.
- `src/ui/task-form-modal.ts` — render grouped sections, collapsed metadata, cancellation, and sticky actions.
- `tests/ui/task-form-modal.test.ts` — grouped structure, defaults, clearable edit fields, cancellation, and submit locking.
- `src/services/migration-service.ts` — list eligible files and preview only explicit paths using the pure extractor.
- `tests/services/migration-service.test.ts` — selected-file boundaries, invalid sources, evidence preservation, and existing write safety.
- `src/main.ts` — construct one wizard instance and route both command and workspace actions through `openWizard()`.
- `tests/plugin-lifecycle.test.ts` — verify command/workspace reuse the same wizard.
- `styles.css` — calm workspace, pill filters, grouped form, sticky actions, and responsive three-step wizard.
- `tests/scaffold.test.ts` — assert new emitted selectors and updated public documentation.
- `README.md` — explain manual file selection, recognition reasons, default selection, backup, and no-write-until-confirm.

### Remove after replacement is wired

- `src/ui/migration-modal.ts`
- `tests/ui/migration-modal.test.ts`

---

### Task 1: Calm Workspace Header and Filter Bar

**Files:**
- Create: `src/ui/task-workspace-header.ts`
- Create: `src/ui/task-filter-bar.ts`
- Create: `tests/ui/task-workspace-header.test.ts`
- Create: `tests/ui/task-filter-bar.test.ts`
- Modify: `src/ui/task-filter-state.ts`
- Modify: `src/ui/task-workspace-view.ts`
- Modify: `tests/ui/task-workspace-view.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `TaskWorkspaceMode`, `TaskWorkspaceFilterState`, `deriveFilterOptions()`, and `DEFAULT_FILTER_STATE`.
- Produces: `renderTaskWorkspaceHeader(options): HTMLElement`, `renderTaskFilterBar(options): HTMLElement`, `SearchChange`, `FilterName`, and `hasActiveFilters(state): boolean`.

- [ ] **Step 1: Write failing header and filter component tests**

Create `tests/ui/task-workspace-header.test.ts` with these behaviors:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderTaskWorkspaceHeader } from '../../src/ui/task-workspace-header';

describe('renderTaskWorkspaceHeader', () => {
  it('renders one primary action, one secondary action, and segmented modes', () => {
    const onCreate = vi.fn();
    const onImport = vi.fn();
    const onModeChange = vi.fn();
    const header = renderTaskWorkspaceHeader({
      mode: 'tasks',
      importing: false,
      onCreate,
      onImport,
      onModeChange,
    });

    expect(header.querySelector('h2')?.textContent).toBe('今天要推进什么？');
    expect(header.querySelector('[data-action="new-task"]')?.classList)
      .toContain('mod-cta');
    expect(header.querySelector('[data-action="import-legacy"]')?.classList)
      .not.toContain('mod-cta');
    expect(header.querySelector('[data-mode="tasks"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(header.querySelector('[data-mode="calendar"]')?.getAttribute('aria-pressed')).toBe('false');

    header.querySelector<HTMLButtonElement>('[data-action="new-task"]')!.click();
    header.querySelector<HTMLButtonElement>('[data-action="import-legacy"]')!.click();
    header.querySelector<HTMLButtonElement>('[data-mode="calendar"]')!.click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith('calendar');
  });
});
```

Create `tests/ui/task-filter-bar.test.ts` with these behaviors:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTER_STATE } from '../../src/ui/task-filter-state';
import { renderTaskFilterBar } from '../../src/ui/task-filter-bar';

describe('renderTaskFilterBar', () => {
  it('renders accessible pill filters and clears non-default state', () => {
    const onFilterChange = vi.fn();
    const onClear = vi.fn();
    const bar = renderTaskFilterBar({
      state: { ...DEFAULT_FILTER_STATE, project: 'Smarthub' },
      choices: { projects: ['Smarthub'], sourcePaths: ['任务/任务收件箱.md'] },
      onSearch: vi.fn(),
      onFilterChange,
      onClear,
    });

    expect(bar.querySelector('[data-filter="project"]')?.closest('.tmc-filter-chip')?.classList)
      .toContain('is-active');
    expect(bar.querySelector('[data-action="clear-filters"]')).not.toBeNull();
    expect(bar.querySelector('[data-filter="query"]')?.getAttribute('aria-label')).toBe('搜索任务');

    const project = bar.querySelector<HTMLSelectElement>('[data-filter="project"]')!;
    project.value = '*';
    project.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFilterChange).toHaveBeenCalledWith('project', '*');
    bar.querySelector<HTMLButtonElement>('[data-action="clear-filters"]')!.click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('reports focus and caret data for a search rerender', () => {
    const onSearch = vi.fn();
    const bar = renderTaskFilterBar({
      state: DEFAULT_FILTER_STATE,
      choices: { projects: [], sourcePaths: [] },
      onSearch,
      onFilterChange: vi.fn(),
      onClear: vi.fn(),
    });
    document.body.append(bar);
    const search = bar.querySelector<HTMLInputElement>('[data-filter="query"]')!;
    search.focus();
    search.value = '插件';
    search.setSelectionRange(2, 2);
    search.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(onSearch).toHaveBeenCalledWith({
      query: '插件',
      restoreFocus: true,
      selectionStart: 2,
      selectionEnd: 2,
      selectionDirection: 'none',
    });
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/ui/task-workspace-header.test.ts tests/ui/task-filter-bar.test.ts
```

Expected: FAIL because `task-workspace-header.ts` and `task-filter-bar.ts` do not exist.

- [ ] **Step 3: Add the default-state predicate**

Append to `src/ui/task-filter-state.ts`:

```ts
export function hasActiveFilters(state: TaskWorkspaceFilterState): boolean {
  return state.query.trim() !== ''
    || state.project !== DEFAULT_FILTER_STATE.project
    || state.status !== DEFAULT_FILTER_STATE.status
    || state.risk !== DEFAULT_FILTER_STATE.risk
    || state.sourcePath !== DEFAULT_FILTER_STATE.sourcePath;
}
```

Add a unit assertion to `tests/ui/task-filter-state.test.ts` proving the default is false and every single changed field is true.

- [ ] **Step 4: Implement the workspace header renderer**

Create `src/ui/task-workspace-header.ts` with this public contract and DOM structure:

```ts
import type { TaskWorkspaceMode } from './task-workspace-view';

export interface TaskWorkspaceHeaderOptions {
  mode: TaskWorkspaceMode;
  importing: boolean;
  onCreate(): void;
  onImport(): void;
  onModeChange(mode: TaskWorkspaceMode): void;
}

function action(label: string, name: string, callback: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = name;
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}

export function renderTaskWorkspaceHeader(options: TaskWorkspaceHeaderOptions): HTMLElement {
  const header = document.createElement('header');
  header.className = 'tmc-workspace-header';

  const copy = document.createElement('div');
  copy.className = 'tmc-workspace-heading';
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'WORKSPACE';
  const heading = document.createElement('h2');
  heading.textContent = '今天要推进什么？';
  copy.append(eyebrow, heading);

  const actions = document.createElement('div');
  actions.className = 'tmc-workspace-actions';
  const importButton = action('导入旧任务', 'import-legacy', options.onImport);
  importButton.disabled = options.importing;
  const createButton = action('+ 新任务', 'new-task', options.onCreate);
  createButton.classList.add('mod-cta');
  actions.append(importButton, createButton);

  const modes = document.createElement('div');
  modes.className = 'tmc-workspace-modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '任务中心模式');
  for (const [mode, label] of [['tasks', '任务矩阵'], ['calendar', '日历']] as const) {
    const button = action(label, '', () => options.onModeChange(mode));
    delete button.dataset.action;
    button.dataset.mode = mode;
    button.setAttribute('aria-pressed', String(options.mode === mode));
    modes.append(button);
  }

  header.append(copy, actions, modes);
  return header;
}
```

- [ ] **Step 5: Implement the pill filter renderer**

Create `src/ui/task-filter-bar.ts` with these exact exported types:

```ts
import type { TaskWorkspaceFilterState } from './task-filter-state';
import { hasActiveFilters } from './task-filter-state';

export type FilterName = 'project' | 'status' | 'risk' | 'source';

export interface SearchChange {
  query: string;
  restoreFocus: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none';
}

export interface TaskFilterBarOptions {
  state: TaskWorkspaceFilterState;
  choices: { projects: string[]; sourcePaths: string[] };
  onSearch(change: SearchChange): void;
  onFilterChange(name: FilterName, value: string): void;
  onClear(): void;
}

const STATUS = [
  ['active', '状态：活动'], ['*', '状态：全部'], ['todo', '状态：待办'],
  ['in-progress', '状态：进行中'], ['paused', '状态：暂停'], ['done', '状态：已完成'],
] as const;

const RISK = [
  ['*', '截止：全部'], ['overdue', '截止：已逾期'], ['due-today', '截止：今天'],
  ['upcoming', '截止：即将到期'], ['none', '截止：无风险'],
] as const;
```

The implementation must:

- render one `input[type="search"]` with `data-filter="query"` and `aria-label="搜索任务"`;
- render four `<label class="tmc-filter-chip">` wrappers containing visually hidden captions and `<select data-filter>` controls;
- include current value in every option label (`项目：全部`, `来源：全部`);
- add `is-active` when the individual filter differs from `DEFAULT_FILTER_STATE`;
- render `button[data-action="clear-filters"]` only when `hasActiveFilters(state)` is true;
- emit the complete `SearchChange` object before the parent rerenders.

- [ ] **Step 6: Compose the new renderers in `TaskWorkspaceView`**

Replace `renderHeader()`, `modeButton()`, `renderFilters()`, `filterField()`, and `filterSelect()` with composition calls. Preserve the existing pending import guard and search focus restoration:

```ts
private render(): void {
  this.containerEl.replaceChildren();
  this.containerEl.classList.add('task-matrix-calendar', 'tmc-task-workspace');
  this.containerEl.append(
    renderTaskWorkspaceHeader({
      mode: this.mode,
      importing: this.importing,
      onCreate: () => this.form.openCreate(),
      onImport: () => this.startImport(),
      onModeChange: (mode) => this.setMode(mode),
    }),
    renderTaskFilterBar({
      state: this.filters,
      choices: deriveFilterOptions(this.index.snapshot().tasks),
      onSearch: (change) => this.changeSearch(change),
      onFilterChange: (name, value) => this.changeFilter(name, value),
      onClear: () => {
        this.filters = { ...DEFAULT_FILTER_STATE };
        this.render();
      },
    }),
  );

  const content = document.createElement('main');
  content.dataset.workspaceMode = this.mode;
  if (this.mode === 'tasks') this.renderTaskMatrix(content);
  else this.renderCalendar(content);
  this.containerEl.append(content);
}
```

Add private `startImport()`, `changeSearch(change: SearchChange)`, and `changeFilter(name: FilterName, value: string)` methods. `startImport()` must keep the current single-flight guard. `changeSearch()` must restore focus and the captured selection after `render()`.

- [ ] **Step 7: Add the calm workspace CSS**

Replace the old `.tmc-view-header` and flat `.tmc-filters` rules with theme-variable-only rules for:

```css
.tmc-workspace-header
.tmc-workspace-heading
.tmc-workspace-actions
.tmc-workspace-modes
.tmc-filter-bar
.tmc-search-field
.tmc-filter-chips
.tmc-filter-chip
.tmc-filter-chip.is-active
.tmc-clear-filters
```

Use `var(--background-primary)`, `var(--background-secondary)`, `var(--background-modifier-border)`, `var(--text-normal)`, `var(--text-muted)`, `var(--interactive-accent)`, `var(--text-on-accent)`, and Obsidian radius variables. Do not add literal foreground/background hex values.

- [ ] **Step 8: Run focused tests and build**

Run:

```powershell
npm.cmd test -- tests/ui/task-workspace-header.test.ts tests/ui/task-filter-bar.test.ts tests/ui/task-filter-state.test.ts tests/ui/task-workspace-view.test.ts
npm.cmd run build
```

Expected: all focused tests pass and production build exits `0`.

- [ ] **Step 9: Commit the workspace chrome**

```powershell
git add src/ui/task-workspace-header.ts src/ui/task-filter-bar.ts src/ui/task-filter-state.ts src/ui/task-workspace-view.ts tests/ui/task-workspace-header.test.ts tests/ui/task-filter-bar.test.ts tests/ui/task-filter-state.test.ts tests/ui/task-workspace-view.test.ts styles.css
git commit -m "feat: redesign task workspace chrome"
```

---

### Task 2: Grouped Single-Column Task Form

**Files:**
- Modify: `src/ui/task-form-modal.ts`
- Modify: `tests/ui/task-form-modal.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: existing `TaskFormServicePort`, `normalizeDateInput()`, and create/edit mode values.
- Produces: unchanged public `TaskFormModal.openCreate()` and `TaskFormModal.openEdit(indexed)` behavior with new grouped DOM contracts.

- [ ] **Step 1: Write failing form layout and cancellation tests**

Add tests asserting:

```ts
it('renders grouped content, execution, collapsed metadata, and fixed actions', () => {
  const modal = new TaskFormModal({} as App, service(), () => '2026-07-15');
  modal.openCreate();

  expect(modal.contentEl.querySelector('[data-section="content"]')).not.toBeNull();
  expect(modal.contentEl.querySelector('[data-section="execution"]')).not.toBeNull();
  const metadata = modal.contentEl.querySelector<HTMLDetailsElement>('[data-section="metadata"]')!;
  expect(metadata.open).toBe(false);
  expect(modal.contentEl.querySelector('[data-role="form-actions"]')).not.toBeNull();
  expect(input(modal, 'plannedDate').value).toBe('2026-07-15');
  expect(select(modal, 'status').value).toBe('todo');
  expect(select(modal, 'quadrant').value).toBe('unclassified');
});

it('cancels without writing', () => {
  const taskService = service();
  const modal = new TaskFormModal({} as App, taskService, () => '2026-07-15');
  modal.openCreate();
  modal.contentEl.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
  expect(taskService.create).not.toHaveBeenCalled();
  expect(taskService.update).not.toHaveBeenCalled();
  expect(modal.contentEl.isConnected).toBe(false);
});
```

Keep the existing create/edit/date/error/conflict tests and add an edit assertion proving empty details, planned date, due date, project, and tags are sent as explicit cleared values.

- [ ] **Step 2: Run the form test and verify RED**

```powershell
npm.cmd test -- tests/ui/task-form-modal.test.ts
```

Expected: FAIL because grouped sections, metadata details, cancel action, and fixed action role do not exist.

- [ ] **Step 3: Add a section helper and grouped markup**

Add this helper to `task-form-modal.ts`:

```ts
function section(name: string, title: string, ...children: HTMLElement[]): HTMLElement {
  const container = document.createElement('section');
  container.dataset.section = name;
  container.className = 'tmc-form-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  container.append(heading, ...children);
  return container;
}
```

Build the form in this exact order:

```ts
form.append(
  section('content', '任务内容', field('任务标题', title), field('详情', details)),
  section(
    'execution',
    '执行安排',
    field('状态', status),
    field('四象限', quadrant),
    field('开始日期', plannedDate),
    field('截止日期', dueDate),
  ),
);

const metadata = document.createElement('details');
metadata.dataset.section = 'metadata';
const summary = document.createElement('summary');
summary.textContent = '项目与标签';
metadata.append(summary, field('项目', project), field('标签', tags));
form.append(metadata);

const actions = document.createElement('footer');
actions.dataset.role = 'form-actions';
const cancel = document.createElement('button');
cancel.type = 'button';
cancel.dataset.action = 'cancel';
cancel.textContent = '取消';
cancel.addEventListener('click', () => this.close());
save.classList.add('mod-cta');
actions.append(cancel, save);
form.append(actions);
```

Create mode keeps the status control disabled and visible as `待办`; edit mode keeps it enabled. Preserve all existing submit validation and explicit empty edit values.

- [ ] **Step 4: Add grouped modal CSS**

Add theme-variable rules for `.tmc-task-form-modal`, `.tmc-form-section`, `[data-section="metadata"]`, and `[data-role="form-actions"]`. The actions footer uses `position: sticky; bottom: 0;` and a theme background/border. Keep textarea resize and focus-visible rules.

- [ ] **Step 5: Run focused tests and build**

```powershell
npm.cmd test -- tests/ui/task-form-modal.test.ts tests/services/task-service.test.ts
npm.cmd run build
```

Expected: all focused tests pass and build exits `0`.

- [ ] **Step 6: Commit the grouped form**

```powershell
git add src/ui/task-form-modal.ts tests/ui/task-form-modal.test.ts styles.css
git commit -m "feat: group task form fields"
```

---

### Task 3: Evidence-Producing Legacy Candidate Extractor

**Files:**
- Create: `src/services/legacy-task-candidates.ts`
- Create: `tests/services/legacy-task-candidates.test.ts`
- Create: `tests/fixtures/legacy-mixed-tasks.md`

**Interfaces:**
- Consumes: `parseTaskFile()`, `makeTask()`, `TaskNode`, and an injected ID factory.
- Produces: `MigrationCandidate`, `MigrationRecognition`, and `extractLegacyCandidates(path, source, makeId)`.

- [ ] **Step 1: Add the sanitized mixed legacy fixture**

Create `tests/fixtures/legacy-mixed-tasks.md`:

```markdown
# 旧任务样本

## 2026-7-15

- [ ] 明确待办 P1
- [x] 明确完成（完成）
* 普通列表（进行中） P2
1. 编号列表 P3
普通正文 P0
普通正文（暂停）

<!-- obsidian-task-schema: 1 -->

- [ ] 已受管任务 #task ^task-MANAGED1
  - 状态:: 待办
  - 分类:: 未分类
```

- [ ] **Step 2: Write failing extractor tests**

Create tests asserting the exact four candidates and evidence:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractLegacyCandidates } from '../../src/services/legacy-task-candidates';

const source = readFileSync(
  new URL('../fixtures/legacy-mixed-tasks.md', import.meta.url),
  'utf8',
);

describe('extractLegacyCandidates', () => {
  it('recognizes only checkbox and list syntax and exposes source evidence', () => {
    let next = 0;
    const candidates = extractLegacyCandidates(
      '任务/旧任务.md',
      source,
      () => `task-LEGACY${++next}`,
    );

    expect(candidates.map((item) => item.proposed.title)).toEqual([
      '明确待办', '明确完成', '普通列表', '编号列表',
    ]);
    expect(candidates.map((item) => item.recognition.kind)).toEqual([
      'checkbox', 'checkbox', 'list-item', 'list-item',
    ]);
    expect(candidates.map((item) => item.recognition.defaultSelected)).toEqual([
      true, true, false, false,
    ]);
    expect(candidates[0]).toMatchObject({
      sourcePath: '任务/旧任务.md',
      originalText: '- [ ] 明确待办 P1',
      recognition: { reason: 'Markdown 复选框' },
      proposed: { plannedDate: '2026-07-15', status: 'todo', legacyPriority: 'P1' },
    });
    expect(candidates[1].proposed.status).toBe('done');
    expect(candidates[2].proposed.status).toBe('in-progress');
    expect(candidates.some((item) => item.originalText === '普通正文 P0')).toBe(false);
    expect(candidates.some((item) => item.proposed.id === 'task-MANAGED1')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the extractor test and verify RED**

```powershell
npm.cmd test -- tests/services/legacy-task-candidates.test.ts
```

Expected: FAIL because the extractor module does not exist.

- [ ] **Step 4: Implement the extractor types and rules**

Create `src/services/legacy-task-candidates.ts` with these public types:

```ts
import { createTaskId } from '../domain/id';
import { makeTask, type LegacyPriority, type TaskNode, type TaskStatus } from '../domain/task';
import { parseTaskFile } from '../markdown/task-parser';

export type MigrationRecognitionKind = 'checkbox' | 'list-item';

export interface MigrationRecognition {
  kind: MigrationRecognitionKind;
  reason: 'Markdown 复选框' | '普通列表，仅作为候选';
  defaultSelected: boolean;
}

export interface MigrationCandidate {
  candidateId: string;
  sourcePath: string;
  startLine: number;
  endLine: number;
  originalText: string;
  recognition: MigrationRecognition;
  proposed: TaskNode;
}

type IdFactory = () => string;

const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/;
const LIST_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/;
const STATUS_MARKERS: Array<[RegExp, TaskStatus]> = [
  [/（完成）|\(完成\)/, 'done'],
  [/（进行中）|\(进行中\)/, 'in-progress'],
  [/（暂停）|\(暂停\)/, 'paused'],
];
```

Implement `extractLegacyCandidates()` so it:

- normalizes `## 2026-7-15` and `## 20260715` headings to `2026-07-15`;
- builds a set of line indexes already occupied by `parseTaskFile(path, source).tasks`;
- accepts only `CHECKBOX` or `LIST_ITEM` matches outside managed blocks;
- determines `done` from `[x]`, otherwise uses status markers, otherwise `todo`;
- removes list syntax, status suffixes, and `P0-P4` from the proposed title;
- copies the nearest preceding valid date heading into `plannedDate` when present;
- uses `candidateId: migration:${path}:${line}` with zero-based internal line indexes;
- reports one-based display lines in the UI as `startLine + 1`;
- never treats a plain paragraph as a candidate.

Export this exact signature:

```ts
export function extractLegacyCandidates(
  path: string,
  source: string,
  makeId: IdFactory = createTaskId,
): MigrationCandidate[];
```

- [ ] **Step 5: Run the extractor tests**

```powershell
npm.cmd test -- tests/services/legacy-task-candidates.test.ts tests/markdown/task-parser.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit the pure extractor**

```powershell
git add src/services/legacy-task-candidates.ts tests/services/legacy-task-candidates.test.ts tests/fixtures/legacy-mixed-tasks.md
git commit -m "feat: extract evidence-backed legacy candidates"
```

---

### Task 4: Selected-File Migration Service Boundary

**Files:**
- Modify: `src/services/migration-service.ts`
- Modify: `tests/services/migration-service.test.ts`

**Interfaces:**
- Consumes: `extractLegacyCandidates()` and current safe `apply()` implementation.
- Produces: `listEligibleFiles(): string[]` and `preview(paths?: readonly string[]): Promise<MigrationPlan>`; re-exports `MigrationCandidate` for UI consumers during the transition.

- [ ] **Step 1: Write failing selected-file service tests**

Add this recording fake and helper beside the existing `setup()` function:

```ts
class RecordingVault extends FakeVault {
  readonly readPaths: string[] = [];

  override async read(path: string): Promise<string> {
    this.readPaths.push(path);
    return super.read(path);
  }
}

function setupWithFiles(
  files: Record<string, string>,
  settings: TaskMatrixCalendarSettings = DEFAULT_SETTINGS,
) {
  const vault = new RecordingVault(files);
  const index = new TaskIndex();
  const repository = new ObsidianTaskRepository(vault, index);
  let sequence = 0;
  const service = new MigrationService(
    repository,
    vault,
    settings,
    () => `task-SELECTED${++sequence}`,
    () => '2026-07-15T06:00:00.000Z',
  );
  return { vault, index, repository, service };
}
```

Add tests proving:

```ts
it('lists eligible files and previews only explicitly selected paths', async () => {
  const first = '任务/一.md';
  const second = '任务/二.md';
  const { service, vault } = setupWithFiles({
    [first]: '## 20260715\n- [ ] 第一项',
    [second]: '## 20260715\n- [ ] 第二项',
    '任务/任务回收站.md': '- [ ] 不应出现',
    '任务/任务备份/旧.md': '- [ ] 不应出现',
    '其他/外部.md': '- [ ] 不应出现',
  });

  expect(service.listEligibleFiles()).toEqual([first, second]);
  const plan = await service.preview([second]);
  expect([...plan.files.keys()]).toEqual([second]);
  expect(vault.readPaths).toEqual([second]);
});

it('does not scan when preview receives no paths', async () => {
  const { service, vault } = setupWithFiles({ '任务/一.md': '- [ ] 第一项' });
  const plan = await service.preview();
  expect(plan.files.size).toBe(0);
  expect(vault.readPaths).toEqual([]);
});

it('rejects an out-of-scope source at the service boundary', async () => {
  const { service } = setupWithFiles({ '其他/外部.md': '- [ ] 外部项' });
  await expect(service.preview(['其他/外部.md'])).rejects.toMatchObject({
    code: 'invalid-source',
    path: '其他/外部.md',
  });
});
```

Update every pre-existing service test to pass its intended source path explicitly. Use `service.preview([goodPath, failedPath])` for the read-failure case, `service.preview([mixedPath])` for canonical-block exclusion, `service.preview([correctedPath])` for corrections and duplicate avoidance, and `service.preview([path])` for the shared fixture tests. Replace confidence assertions with:

```ts
expect(candidates.map((item) => item.recognition.kind)).toEqual([
  'checkbox', 'list-item', 'list-item', 'list-item',
]);
expect(candidates.map((item) => item.recognition.defaultSelected)).toEqual([
  true, false, false, false,
]);
```

The duplicate-avoidance re-preview must call `service.preview([correctedPath])`. Do not change production persistence behavior to support the recorder.

- [ ] **Step 2: Run the service test and verify RED**

```powershell
npm.cmd test -- tests/services/migration-service.test.ts
```

Expected: FAIL because `listEligibleFiles()` is missing and `preview()` still scans all paths.

- [ ] **Step 3: Replace confidence scanning with explicit path selection**

In `migration-service.ts`:

```ts
import {
  extractLegacyCandidates,
  type MigrationCandidate,
} from './legacy-task-candidates';

export type { MigrationCandidate } from './legacy-task-candidates';
```

Remove `MigrationConfidence`, heading/list parsing helpers, and `candidateConfidence()` from this file. Add `'invalid-source'` to `MigrationErrorCode`.

Implement:

```ts
listEligibleFiles(): string[] {
  const paths = new Map<string, string>();
  for (const path of this.vault.listMarkdownPaths()) {
    const normalized = normalizeVaultPath(path);
    if (!isManagedMarkdownPath(normalized, this.settings)) continue;
    const key = normalized.toLocaleLowerCase();
    if (!paths.has(key)) paths.set(key, normalized);
  }
  return [...paths.values()].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

async preview(paths: readonly string[] = []): Promise<MigrationPlan> {
  const eligible = new Map(
    this.listEligibleFiles().map((path) => [path.toLocaleLowerCase(), path]),
  );
  const selected = new Map<string, string>();
  for (const requested of paths) {
    const normalized = normalizeVaultPath(requested);
    const actual = eligible.get(normalized.toLocaleLowerCase());
    if (!actual) {
      throw new MigrationError('invalid-source', '所选文件不在任务扫描目录内。', normalized);
    }
    selected.set(actual.toLocaleLowerCase(), actual);
  }

  const files = new Map<string, MigrationCandidate[]>();
  const failures = new Map<string, string>();
  for (const path of selected.values()) {
    try {
      const source = await this.vault.read(path);
      files.set(path, extractLegacyCandidates(path, source, this.makeId));
    } catch (error) {
      failures.set(path, error instanceof Error ? error.message : String(error));
    }
  }
  return { files, failures, createdAt: this.now() };
}
```

Do not change `apply()` except for the imported candidate type. Existing validation, backup, stale-plan checks, exact range replacement, post-write verification, and rollback tests must remain green.

- [ ] **Step 4: Run service and safety regression tests**

```powershell
npm.cmd test -- tests/services/migration-service.test.ts tests/services/obsidian-task-repository.test.ts tests/services/trash-service.test.ts
npm.cmd run build
```

Expected: all focused tests pass and build exits `0`. The old modal may open an empty preview when called without paths, but compilation and all existing non-modal behavior remain valid until Task 5 replaces it.

- [ ] **Step 5: Commit the selected-file boundary**

```powershell
git add src/services/migration-service.ts tests/services/migration-service.test.ts
git commit -m "feat: restrict legacy preview to selected files"
```

---

### Task 5: Three-Step Legacy Import Wizard

**Files:**
- Create: `src/ui/legacy-import-candidate-editor.ts`
- Create: `src/ui/legacy-import-wizard.ts`
- Create: `tests/ui/legacy-import-wizard.test.ts`
- Modify: `src/main.ts`
- Modify: `tests/plugin-lifecycle.test.ts`
- Modify: `styles.css`
- Remove: `src/ui/migration-modal.ts`
- Remove: `tests/ui/migration-modal.test.ts`

**Interfaces:**
- Consumes: `MigrationService.listEligibleFiles()`, `MigrationService.preview(paths)`, `MigrationService.apply(plan, selections)`, `MigrationCandidate`, `validateTaskDraft()`, and `normalizeDateInput()`.
- Produces: `LegacyImportWizard.openWizard(): void` and reusable candidate editor callbacks.

- [ ] **Step 1: Write failing wizard step tests**

Create `tests/ui/legacy-import-wizard.test.ts` covering these exact public behaviors:

```ts
// @vitest-environment jsdom
import { Notice, type App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import type { MigrationPlan } from '../../src/services/migration-service';
import { LegacyImportWizard, type LegacyImportWizardServicePort } from '../../src/ui/legacy-import-wizard';

const plan: MigrationPlan = {
  createdAt: '2026-07-15T00:00:00.000Z',
  failures: new Map(),
  files: new Map([['任务/旧.md', [
    {
      candidateId: 'checkbox', sourcePath: '任务/旧.md', startLine: 4, endLine: 4,
      originalText: '- [ ] 自动候选',
      recognition: { kind: 'checkbox', reason: 'Markdown 复选框', defaultSelected: true },
      proposed: makeTask({ id: 'task-A1', title: '自动候选', plannedDate: '2026-07-15' }),
    },
    {
      candidateId: 'list', sourcePath: '任务/旧.md', startLine: 5, endLine: 5,
      originalText: '- 手动候选',
      recognition: { kind: 'list-item', reason: '普通列表，仅作为候选', defaultSelected: false },
      proposed: makeTask({ id: 'task-A2', title: '手动候选', plannedDate: '2026-07-15' }),
    },
  ]]]),
};

function service(overrides: Partial<LegacyImportWizardServicePort> = {}): LegacyImportWizardServicePort {
  return {
    listEligibleFiles: vi.fn(() => ['任务/旧.md', '任务/另一个.md']),
    preview: vi.fn().mockResolvedValue(plan),
    apply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
```

Required test cases:

1. `openWizard()` starts at `data-step="select"`, shows relative paths, and disables Continue until a file is checked.
2. Continue calls `preview(['任务/旧.md'])` exactly and opens `data-step="review"`.
3. Checkbox candidate is selected; ordinary list candidate is unselected.
4. Every row displays `任务/旧.md`, `第 5 行` or `第 6 行`, exact original text, and recognition reason.
5. Editing title/details/status/dates/quadrant/project/tags, returning to file selection, and continuing again preserves corrections and candidate selection for unchanged selected files.
6. Review cannot continue while a selected draft is invalid.
7. Confirm step summarizes source path, selected count, checkbox count, manually selected list count, and backup root copy.
8. Only final confirm calls `apply(plan, correctedSelections)`.
9. Cancel from every step makes no `apply()` call.
10. Pending apply disables step navigation, selection, editors, cancel, and confirm; a double click calls `apply()` once.

- [ ] **Step 2: Run the wizard test and verify RED**

```powershell
npm.cmd test -- tests/ui/legacy-import-wizard.test.ts
```

Expected: FAIL because the wizard module does not exist.

- [ ] **Step 3: Implement the reusable candidate editor**

Create `src/ui/legacy-import-candidate-editor.ts` with this contract:

```ts
import type { TaskNode } from '../domain/task';
import type { MigrationCandidate } from '../services/migration-service';

export interface LegacyCandidateEditorOptions {
  candidate: MigrationCandidate;
  corrected: TaskNode;
  selected: boolean;
  disabled: boolean;
  error?: { field: string; message: string };
  onSelected(selected: boolean): void;
  onChanged(task: TaskNode): void;
}

export function renderLegacyCandidateEditor(
  options: LegacyCandidateEditorOptions,
): HTMLElement;
```

The row must use `data-candidate-id`, show `sourcePath`, `第 ${startLine + 1} 行`, `originalText`, and `recognition.reason`, then render editable title, multiline details, status, planned date, due date, quadrant, project, and comma-separated tags. Every input/change callback emits a cloned `TaskNode` and never mutates `candidate.proposed`.

- [ ] **Step 4: Implement the wizard state machine**

Create `src/ui/legacy-import-wizard.ts` with these types:

```ts
import { Modal, Notice, type App } from 'obsidian';
import type { TaskNode } from '../domain/task';
import type { MigrationPlan, MigrationService } from '../services/migration-service';

export type LegacyImportWizardServicePort = Pick<
  MigrationService,
  'listEligibleFiles' | 'preview' | 'apply'
>;

type WizardStep = 'select' | 'review' | 'confirm';

export class LegacyImportWizard extends Modal {
  private step: WizardStep = 'select';
  private files: string[] = [];
  private readonly selectedFiles = new Set<string>();
  private plan?: MigrationPlan;
  private readonly selectedCandidates = new Set<string>();
  private readonly corrections = new Map<string, TaskNode>();
  private pending = false;

  constructor(
    app: App,
    private readonly service: LegacyImportWizardServicePort,
    private readonly backupRoot: string,
  ) {
    super(app);
  }

  openWizard(): void {
    this.step = 'select';
    this.files = this.service.listEligibleFiles();
    this.selectedFiles.clear();
    this.selectedCandidates.clear();
    this.corrections.clear();
    this.plan = undefined;
    this.pending = false;
    this.open();
  }
}
```

Implement separate private `renderSelectStep()`, `loadReview()`, `renderReviewStep()`, `renderConfirmStep()`, `validateSelected()`, and `applySelected()` methods. `loadReview()` calls `preview([...selectedFiles])`, initializes new corrections, and selects only candidates with `recognition.defaultSelected === true`. When revisiting a previously loaded candidate ID, keep its existing correction and selection.

The root element must expose `data-step`. Every step has Back/Cancel/Continue actions with stable `data-action` values. `applySelected()` normalizes selected dates, validates drafts, sets `pending` before the first await, locks every interactive control, calls `service.apply()`, shows `Notice('已导入 N 个旧任务。')`, and closes only on success.

- [ ] **Step 5: Wire one wizard instance into the plugin**

In `src/main.ts`, replace `MigrationModal` with:

```ts
const importWizard = new LegacyImportWizard(
  this.app,
  migrationService,
  this.settings.backupRoot,
);
```

Pass `() => Promise.resolve(importWizard.openWizard())` to `TaskWorkspaceView`. Route `COMMANDS.migrate` to `importWizard.openWizard()` and rename the command display text to `导入旧任务`. Update `tests/plugin-lifecycle.test.ts` to spy on `LegacyImportWizard.prototype.openWizard` and prove the command and workspace button use the same instance.

Delete the old modal source and test only after imports and lifecycle tests point to the wizard.

- [ ] **Step 6: Add wizard CSS and responsive behavior**

Replace old `.tmc-migration-modal` and `.tmc-migration-row` rules with theme-variable rules for:

```css
.tmc-import-wizard
.tmc-import-progress
.tmc-import-file-list
.tmc-import-file
.tmc-import-review
.tmc-import-candidate
.tmc-import-evidence
.tmc-import-candidate-fields
.tmc-import-summary
.tmc-import-warning
.tmc-import-actions
```

Use a single column below `650px`; keep evidence before editable fields; use a sticky action footer. No literal foreground/background colors.

- [ ] **Step 7: Run wizard, lifecycle, and service tests**

```powershell
npm.cmd test -- tests/ui/legacy-import-wizard.test.ts tests/services/legacy-task-candidates.test.ts tests/services/migration-service.test.ts tests/plugin-lifecycle.test.ts
npm.cmd run build
```

Expected: all focused tests pass, the deleted modal has no remaining imports, and build exits `0`.

- [ ] **Step 8: Commit the wizard replacement**

```powershell
git add src/ui/legacy-import-candidate-editor.ts src/ui/legacy-import-wizard.ts src/main.ts tests/ui/legacy-import-wizard.test.ts tests/plugin-lifecycle.test.ts styles.css
git rm src/ui/migration-modal.ts tests/ui/migration-modal.test.ts
git commit -m "feat: add guided legacy task import"
```

---

### Task 6: Documentation, Full Verification, and Vault Delivery

**Files:**
- Modify: `README.md`
- Modify: `tests/scaffold.test.ts`
- Modify: `styles.css`
- Verify: all source and test files changed by Tasks 1-5
- Deploy: `main.js`, `manifest.json`, and `styles.css` to the main Vault only after all gates pass

**Interfaces:**
- Consumes: all completed UI and migration behavior.
- Produces: accurate open-source documentation, final responsive polish, a verified production build, and a backed-up local Vault installation.

- [ ] **Step 1: Update scaffold expectations first**

Replace the obsolete automatic-scan README assertion with exact expected copy:

```ts
for (const behavior of [
  '“任务矩阵 / 日历”在同一个任务工作区内切换并共享筛选状态。',
  '搜索与项目、状态、截止风险、来源筛选可以一键清除。',
  '“+ 新任务”和“编辑”使用同一个分组弹窗；详情支持多行。',
  '开始日期可输入 `YYYYMMDD` 或 `YYYY-MM-DD`，保存为 `计划日期:: YYYY-MM-DD`。',
  '旧任务导入先选择 Markdown 文件，再核对候选，最后确认备份与写入。',
  '复选框候选默认选中；普通列表候选默认不选中。',
  '  - 详情::',
  '    > 第一行',
]) {
  expect(readme).toContain(behavior);
}
```

Update selector assertions to require `.tmc-workspace-header`, `.tmc-filter-chip`, `.tmc-form-section`, `.tmc-import-progress`, `.tmc-import-evidence`, and `.tmc-import-actions`, and remove obsolete `.tmc-migration-row` requirements.

- [ ] **Step 2: Run scaffold tests and verify RED**

```powershell
npm.cmd test -- tests/scaffold.test.ts
```

Expected: FAIL until README and final selector cleanup match the shipped implementation.

- [ ] **Step 3: Update README and remove stale CSS**

Document the approved behavior in `README.md`:

- calm task workspace with task matrix/calendar segmented navigation;
- searchable filter pills and clear-all;
- grouped single-column create/edit form;
- import step 1 file selection restricted to configured scan roots;
- import step 2 source path, line number, original Markdown, recognition reason, and editable proposal;
- checkbox default selection and ordinary-list opt-in;
- import step 3 source/count/backup summary;
- no Markdown changes until final confirmation;
- backup, stale-plan refusal, verification, and rollback.

Remove styles that only target deleted modal/header/filter markup. Confirm every remaining foreground/background declaration contains `var(--`.

- [ ] **Step 4: Run the complete local verification gates**

Run each command independently and record the complete output:

```powershell
npm.cmd test
npm.cmd run coverage
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected:

- all test files and tests pass with zero failures;
- coverage remains at or above the repository's pre-change baseline of 91.97% statements, 81.66% branches, 90.00% functions, and 94.08% lines;
- lint exits `0`;
- production build exits `0` and regenerates `main.js`;
- `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Perform a read-only cumulative code review**

Review the complete diff from `d9cceb5` to the implementation head. Reject completion for any Critical, Important, or Minor issue involving:

- theme readability;
- search focus/caret loss;
- default filter behavior;
- create/edit field clearing;
- unselected-file reads;
- prose incorrectly becoming import candidates;
- missing source evidence;
- cancellation causing writes;
- repeated apply actions;
- backup, stale-plan, verification, or rollback regression.

Fix review findings with focused RED/GREEN tests and rerun the full gates before proceeding.

- [ ] **Step 6: Commit documentation and final polish**

```powershell
git add README.md tests/scaffold.test.ts styles.css
git commit -m "docs: explain guided legacy import"
```

- [ ] **Step 7: Install the verified artifacts to the main Vault**

After obtaining filesystem approval for the external Vault write, run:

```powershell
$env:ALLOW_PRODUCTION_VAULT='YES'
node scripts/install-to-vault.mjs --vault "C:\Users\admin\Documents\Obsidian Vault"
```

Expected: the installer reports the target plugin path and creates a timestamped backup of any existing plugin directory before copying only `main.js`, `manifest.json`, and `styles.css`.

- [ ] **Step 8: Verify installed artifact hashes**

Compare SHA-256 for the three repository artifacts and installed artifacts:

```powershell
$repo='D:\ai-discovery\obsidian-task-matrix-calendar'
$installed='C:\Users\admin\Documents\Obsidian Vault\.obsidian\plugins\task-matrix-calendar'
foreach($name in 'main.js','manifest.json','styles.css') {
  $source=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $name)).Hash
  $target=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $installed $name)).Hash
  if($source -ne $target) { throw "Hash mismatch: $name" }
}
```

Expected: command exits `0` with no mismatch.

- [ ] **Step 9: Run a non-destructive Obsidian smoke test**

Reload the plugin by disabling and re-enabling it, then verify:

1. task center opens with calm workspace header and readable current Obsidian theme;
2. task matrix/calendar switch and share filters;
3. search retains focus while typing and clear-all restores active tasks;
4. new task grouped modal opens with today's start date and closes without saving;
5. existing task grouped edit modal opens and closes without saving;
6. import wizard opens at file selection and shows only eligible relative paths;
7. select one known legacy document, review source evidence and default selections, then cancel before final confirmation;
8. no task Markdown file receives a new modification timestamp during the smoke test.

Do not apply a real migration during release smoke testing.

---

## Plan Self-Review Results

- **Spec coverage:** Tasks 1-2 cover the approved workspace and grouped form; Tasks 3-5 cover explicit source selection, strict candidate evidence, three wizard steps, validation, backup, conflicts, and rollback; Task 6 covers public documentation, themes, responsive behavior, verification, installation, and non-destructive smoke testing.
- **Placeholder scan:** No deferred implementation markers or unspecified error-handling steps remain.
- **Type consistency:** `MigrationCandidate.recognition`, `MigrationService.listEligibleFiles()`, `MigrationService.preview(paths?)`, `LegacyImportWizardServicePort`, `SearchChange`, and `FilterName` are introduced before their consumers and retain the same names throughout the plan.
- **Incremental buildability:** Task 4 keeps `preview(paths = [])` temporarily callable by the old modal; Task 5 removes the old modal only after the wizard and plugin wiring compile.
