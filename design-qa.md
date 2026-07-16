# Design QA: compact task matrix

## Evidence

- Reference image: `C:\Users\admin\.codex-clean-20260710\attachments\607cd592-59ab-4c72-ba21-45041e283dc1\image-1.png`
- Implementation capture: Computer Use capture `screenshot-0` from the real Obsidian desktop runtime. The runtime did not expose a filesystem path for this capture.
- Viewport: 2048 × 1104
- Environment: Obsidian 1.12.7, light theme, `Obsidian Vault`, task mode, active-task filter
- Data: the user's current Vault task data; no fixture tasks were written for this review

## Interaction checks

- `+ 新任务` opens the task form modal and closes without saving.
- `导入任务` opens the three-step import wizard and closes without selecting or writing files.
- Task overflow menu opens and exposes the context-appropriate edit and status actions.
- Task/calendar switching works, and the July 2026 calendar shows linked task dates.
- The second quadrant scrolls internally while the surrounding 2 × 2 matrix remains fixed.
- Status filtering works for active, paused, and completed filters; the view was restored to active tasks.

## Visual comparison

### Full view

- Header hierarchy, button order, labels, search/filter area, unclassified inbox, and the 2 × 2 matrix match the selected direction.
- All four quadrants remain visible in a stable grid at the captured viewport.
- The populated quadrant scrolls within its own bounded task list; it does not push lower quadrants below the workspace.
- No horizontal overflow or clipped card actions were visible.

### Cards and controls

- Cards use the compact three-line hierarchy: title/status, one-line details, and project/deadline metadata.
- Status is visible through both a colored left edge and a status pill.
- Risk and quadrant chips remain visually distinct from status.
- The overflow menu keeps secondary actions out of the permanent card layout.
- Primary and secondary header actions follow the approved order: `+ 新任务`, then `导入任务`.

## Fidelity surfaces

- Typography: uses Obsidian's native typography and text variables; weight and hierarchy match the reference intent.
- Spacing and layout: compact card density, bounded quadrants, and internal scrolling match the selected scheme.
- Colors and tokens: uses Obsidian theme variables plus explicit semantic status/risk colors; light and dark themes remain supported.
- Image quality: not applicable; the reference contains no image assets.
- Copy and content: user-facing import naming is consistently `导入任务`; real Vault titles and metadata are intentionally preserved.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: the current real Vault contains no paused or completed task in the captured active state, so those two live colors are covered by DOM/CSS tests rather than the final screenshot.
- P3: task titles and detail lengths differ from the reference because the implementation was reviewed with real Vault data.

## Comparison history

- Pass 1: compared the selected reference with the real Obsidian task center at the same working state. No P0, P1, or P2 mismatch remained, so no visual fix was required after this capture.

final result: passed

---

# Design QA: adaptive calendar

## Evidence

- Source visual truth: `assets/calendar-overview.png`
- Implementation capture: Computer Use capture `screenshot-0` from live Obsidian window `24062876`. The runtime did not expose a filesystem path for this capture.
- Viewport: 2048 × 1104; the source is a 1536 × 1024 content-only crop.
- State: Obsidian 1.12.7, light theme, July 2026, active-task filter, June 30 selected.
- Data: the user's current Vault data; the README source intentionally uses sanitized titles.

## Full-view comparison evidence

The source and live implementation were opened in the same comparison input. The live capture includes Obsidian chrome and the Vault sidebar, while the source intentionally crops to the plugin surface. Within the plugin surface, both views share the same header hierarchy, filter bar, month toolbar, seven-column calendar, five required week rows, selected-date panel, and unscheduled panel.

The earlier implementation always rendered 42 dates and showed an unnecessary sixth row for August 2–8. The current July implementation renders only the 35 dates it needs, while months that genuinely require six rows retain 42 dates.

## Focused-region comparison evidence

The task-dense July 15–25 region was checked separately. Task entries now use the same semantic status treatment as the matrix: a four-pixel status-colored leading edge, subtle matching background, compact padding, and small elevation shadow. Deadline entries preserve red text while retaining their task status edge and tint.

## Fidelity surfaces

- Fonts and typography: the implementation uses Obsidian UI font tokens, weights, and sizes. Heading, control, date, and task-label hierarchy matches the source intent; long labels truncate instead of crossing cell boundaries.
- Spacing and layout rhythm: header, filter, month toolbar, grid, and side-panel spacing match the selected design. The dynamic five/six-week model removes the extra July row and keeps the calendar bottom inside the workspace.
- Colors and visual tokens: surfaces, borders, text, accent, status, and error colors come from Obsidian theme variables. Todo, in-progress, paused, and done remain gray, accent-purple, orange, and green; deadline text remains red.
- Image quality and asset fidelity: the target is a UI screenshot and has no independent logos, illustrations, or raster assets to reproduce. The README image remains sharp at its native resolution.
- Copy and content: control labels and plugin copy match the product. Sanitized README task names intentionally differ from the user's live Markdown data.
- Responsiveness and accessibility: the calendar keeps native controls, visible focus states, theme contrast, ellipsis for dense entries, and single-column container-query fallbacks at narrow widths.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: the source's content-only crop and sanitized task names are intentional documentation differences.
- P3: the blue mouse-focus halo visible in the live automation capture is a capture artifact, not plugin UI.

## Comparison history

- Pass 1: blocked because the live July view contained a sixth week row absent from the selected design and status edges were too subtle.
- Fix: month rendering now uses 35 or 42 cells based on the required weeks; entries use a stronger four-pixel status edge, compact height, tint, and shadow.
- Pass 2: after a full Obsidian process restart, the live July view ended at August 1, matched the five-row source structure, preserved the bottom boundary, and displayed distinct todo/in-progress colors plus red deadline text.

final result: passed
