# Task Deletion Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe “删除任务” action to the edit modal that confirms the operation and moves the complete parent task block to the existing Markdown trash.

**Architecture:** Keep persistence in the existing `TrashService`. Add a focused confirmation modal that owns confirmation, pending, retry, and error states; inject it and a `moveToTrash()` adapter into `TaskFormModal`. The edit form exposes the action while create mode remains unchanged.

**Tech Stack:** TypeScript 5.8, Obsidian Plugin API, Vitest 4, jsdom, CSS backed by Obsidian theme variables.

## Global Constraints

- Only edit mode shows “删除任务”; create mode never shows it.
- Confirmed deletion calls `TrashService.moveToTrash(taskId, deletedAt)` and never removes Markdown directly from UI code.
- A parent and its one-level children move as one block; child tasks remain non-deletable independently.
- Cancellation performs no write; confirmation errors keep the edit form available and show a specific message.
- `deletedAt` is generated when the user confirms, in ISO format.
- Do not change the canonical task Markdown format, trash format, restore behavior, or task-card action layout.
- Use Obsidian classes and theme variables; do not add hard-coded light/dark colors.
- Follow TDD: every production change starts with an observed failing test.

---

### Task 1: Delete Confirmation Modal

**Files:**
- Create: `src/ui/task-delete-confirmation-modal.ts`
- Create: `tests/ui/task-delete-confirmation-modal.test.ts`
- Modify: `tests/mocks/obsidian.ts`

**Interfaces:**
- Produces: `TaskDeletePromptPort.confirm(taskTitle: string, action: () => Promise<void>): Promise<boolean>`.
- Produces: `TaskDeleteConfirmationModal` implementing that port.
- Returns `true` only after `action()` succeeds; returns `false` on cancel or close before success.

- [ ] **Step 1: Write failing confirmation, cancellation, and pending tests**

Create `tests/ui/task-delete-confirmation-modal.test.ts` with tests equivalent to:

```ts
const modal = new TaskDeleteConfirmationModal({} as App);
const action = vi.fn().mockResolvedValue(undefined);
const result = modal.confirm('发布开源插件', action);

expect(modal.contentEl.textContent).toContain('发布开源插件');
expect(modal.contentEl.querySelector('[data-action="confirm-delete"]')).toBeInstanceOf(HTMLButtonElement);
modal.contentEl.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!.click();
await expect(result).resolves.toBe(false);
expect(action).not.toHaveBeenCalled();
```

Add a deferred-promise case that clicks confirm twice and asserts `action` is called once while both buttons are disabled; resolve the deferred action and expect `true`.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/ui/task-delete-confirmation-modal.test.ts
```

Expected: FAIL because `src/ui/task-delete-confirmation-modal.ts` does not exist.

- [ ] **Step 3: Implement the modal and prompt interface**

Implement:

```ts
export interface TaskDeletePromptPort {
  confirm(taskTitle: string, action: () => Promise<void>): Promise<boolean>;
}

export class TaskDeleteConfirmationModal extends Modal implements TaskDeletePromptPort {
  private resolveResult?: (confirmed: boolean) => void;
  private action?: () => Promise<void>;
  private pending = false;
  private completed = false;

  confirm(taskTitle: string, action: () => Promise<void>): Promise<boolean> {
    if (this.resolveResult) return Promise.resolve(false);
    this.action = action;
    this.taskTitle = taskTitle;
    this.open();
    return new Promise((resolve) => { this.resolveResult = resolve; });
  }
}
```

`onOpen()` renders a title, the task title, the parent/children trash warning, an alert host, cancel, and a `mod-warning` confirm button. Confirm disables both buttons, awaits `action()`, closes and resolves `true` on success; rejection renders `[data-delete-error]`, re-enables both buttons, and permits retry. `onClose()` resolves `false` unless success already resolved, then clears all session state.

- [ ] **Step 4: Add a failing error-and-retry test, then implement the error path**

Test that the first action rejects with `new Error('回收站不可写')`, the modal remains open, `[data-delete-error]` contains that text, buttons are enabled, and a second confirm succeeds without creating another confirmation session.

Run:

```powershell
npx.cmd vitest run tests/ui/task-delete-confirmation-modal.test.ts
```

Expected before error handling: FAIL on the alert and enabled controls. Implement the minimal retry path, rerun, and expect all tests PASS.

- [ ] **Step 5: Commit the focused modal**

```powershell
git add src/ui/task-delete-confirmation-modal.ts tests/ui/task-delete-confirmation-modal.test.ts tests/mocks/obsidian.ts
git commit -m "feat: add task deletion confirmation modal"
```

---

### Task 2: Edit Modal Delete Action and Trash Adapter

**Files:**
- Modify: `src/ui/task-form-modal.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/task-form-modal.test.ts`
- Modify: `tests/plugin-lifecycle.test.ts`

**Interfaces:**
- Consumes: `TaskDeletePromptPort.confirm(taskTitle, action)` from Task 1.
- Extends: `TaskFormServicePort` with `moveToTrash(id: string, deletedAt: string): Promise<void>`.
- `TaskFormModal` constructor receives `deletePrompt: TaskDeletePromptPort` and `now: () => string` after the existing `today` dependency.

- [ ] **Step 1: Write failing create/edit visibility tests**

Extend `tests/ui/task-form-modal.test.ts`:

```ts
modal.openCreate();
expect(modal.contentEl.querySelector('[data-action="delete"]')).toBeNull();

modal.close();
modal.openEdit(indexedTask());
const remove = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="delete"]');
expect(remove?.textContent).toBe('删除任务');
expect(remove?.classList.contains('mod-warning')).toBe(true);
```

Update the setup service with `moveToTrash: vi.fn()` and inject a prompt mock plus `() => '2026-07-16T07:00:00.000Z'`.

- [ ] **Step 2: Run the form test and verify RED**

```powershell
npx.cmd vitest run tests/ui/task-form-modal.test.ts
```

Expected: FAIL because the delete action and new service method are absent.

- [ ] **Step 3: Render the edit-only action without changing save behavior**

Add `moveToTrash()` to `TaskFormServicePort`. In edit mode, prepend this button to the existing fixed footer:

```ts
const remove = document.createElement('button');
remove.type = 'button';
remove.dataset.action = 'delete';
remove.classList.add('mod-warning');
remove.textContent = '删除任务';
remove.addEventListener('click', () => {
  if (!this.deleting) void this.deleteCurrentTask(remove, cancel, save);
});
actions.append(remove);
```

Keep cancel and save in a `.tmc-form-actions-primary` wrapper on the right. Create mode renders only that right wrapper.

- [ ] **Step 4: Write failing cancellation, success, duplicate, and failure tests**

Add cases that prove:

```ts
expect(deletePrompt.confirm).toHaveBeenCalledWith('现有任务', expect.any(Function));
const action = vi.mocked(deletePrompt.confirm).mock.calls[0][1];
await action();
expect(service.moveToTrash).toHaveBeenCalledWith(
  'task-existing',
  '2026-07-16T07:00:00.000Z',
);
```

The cancellation case returns `false` and expects the form to stay open. The success case returns `true` and expects the form to close. A pending prompt case double-clicks delete and expects one prompt call. A rejected prompt promise expects the form to remain open, controls to re-enable, and `[data-form-error]` to show the message.

- [ ] **Step 5: Implement delete orchestration and verify GREEN**

Implement a `deleting` guard. Disable delete, cancel, and save before awaiting the prompt. Pass an action callback that calls `moveToTrash(task.id, this.now())`. On `true`, close the form; on `false`, restore controls. Catch prompt-level failures with the existing `formErrorMessage()` and keep the form open. Always clear the guard in `finally`.

Run:

```powershell
npx.cmd vitest run tests/ui/task-form-modal.test.ts tests/services/trash-service.test.ts
```

Expected: all tests PASS; trash service still moves full parent/child blocks and protects conflicts.

- [ ] **Step 6: Wire the real services in the plugin lifecycle**

In `src/main.ts`, construct `TaskDeleteConfirmationModal` and provide a form adapter:

```ts
const taskDeletePrompt = new TaskDeleteConfirmationModal(this.app);
const taskFormService: TaskFormServicePort = {
  create: (input) => taskService.create(input),
  update: (id, patch) => taskService.update(id, patch),
  moveToTrash: (id, deletedAt) => trashService.moveToTrash(id, deletedAt),
};
const taskFormModal = new TaskFormModal(
  this.app,
  taskFormService,
  today,
  taskDeletePrompt,
  () => new Date().toISOString(),
);
```

Update `tests/plugin-lifecycle.test.ts` only as required by the new Obsidian modal import and verify all commands/views still register once.

- [ ] **Step 7: Run focused tests and commit**

```powershell
npx.cmd vitest run tests/ui/task-form-modal.test.ts tests/ui/task-delete-confirmation-modal.test.ts tests/plugin-lifecycle.test.ts tests/services/trash-service.test.ts
npm.cmd run lint
git add src/ui/task-form-modal.ts src/main.ts tests/ui/task-form-modal.test.ts tests/plugin-lifecycle.test.ts
git commit -m "feat: delete tasks from the edit modal"
```

Expected: focused tests PASS and ESLint exits 0.

---

### Task 3: Visual Contract, Documentation, Installation, and Verification

**Files:**
- Modify: `styles.css`
- Modify: `tests/scaffold.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `[data-action="delete"]`, `.tmc-form-actions-primary`, and `.tmc-delete-confirmation-modal` emitted by Tasks 1-2.
- Produces: theme-safe footer alignment and confirmation layout only; no domain or persistence changes.

- [ ] **Step 1: Write a failing stylesheet contract test**

Extend `tests/scaffold.test.ts` to require:

```ts
expect(styles).toContain('.tmc-form-actions-primary');
expect(styles).toContain('.tmc-delete-confirmation-modal');
expect(styles).toMatch(
  /\.tmc-task-form-modal \[data-action="delete"\]\s*\{[^}]*margin-right:\s*auto;[^}]*color:\s*var\(--text-error\);/s,
);
```

- [ ] **Step 2: Run the scaffold test and verify RED**

```powershell
npx.cmd vitest run tests/scaffold.test.ts
```

Expected: FAIL because deletion styles do not exist.

- [ ] **Step 3: Add Obsidian-native styles and README behavior**

Add only variable-backed styles:

```css
.tmc-task-form-modal [data-action="delete"] {
  margin-right: auto;
  color: var(--text-error);
}

.tmc-form-actions-primary {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.tmc-delete-confirmation-modal {
  display: grid;
  gap: 12px;
}
```

Document that edit mode can move a parent and its children to the visible Markdown trash after explicit confirmation; cancellation does not write.

- [ ] **Step 4: Run full local gates**

```powershell
npm.cmd test
npm.cmd run coverage
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: zero failed tests; coverage thresholds pass; lint/build exit 0; diff check is clean.

- [ ] **Step 5: Commit the visual and documentation contract**

```powershell
git add styles.css tests/scaffold.test.ts README.md
git commit -m "docs: expose recoverable task deletion"
```

- [ ] **Step 6: Install and verify artifacts without UI control**

```powershell
$env:ALLOW_PRODUCTION_VAULT='YES'
npm.cmd run install:vault -- --vault 'C:\Users\admin\Documents\Obsidian Vault'
```

Compare SHA-256 hashes for `main.js`, `manifest.json`, and `styles.css` between the repository and installed plugin. Confirm the installed directory contains exactly those three release files and the worktree is clean.

- [ ] **Step 7: Run real Obsidian smoke checks after Computer Use is returned**

Verify create mode has no delete action, edit mode has a left-aligned danger action, cancellation performs no write, the confirmation modal remains readable in light and dark themes, and the footer does not clip at the current viewport. Do not confirm a real deletion unless the user explicitly provides a disposable task.

---

## Plan Self-Review Results

- **Spec coverage:** Tasks 1-3 cover entry visibility, confirmation, cancellation, success, retry, service wiring, full-parent trash semantics, theme-safe layout, documentation, installation, and real-app verification.
- **Placeholder scan:** Every code-changing step names exact files, interfaces, commands, expected failures, and expected passing evidence; no unresolved placeholders remain.
- **Type consistency:** `TaskDeletePromptPort.confirm()`, `TaskFormServicePort.moveToTrash()`, `TaskFormModal` dependencies, and the main adapter use identical signatures throughout.
- **Scope check:** The plan adds one edit-modal lifecycle action and reuses existing persistence. It does not add a trash browser, batch deletion, permanent deletion, or child-only deletion.
- **Execution choice:** Inline execution is selected because the user requested continued development in the current session and did not request subagent delegation.

