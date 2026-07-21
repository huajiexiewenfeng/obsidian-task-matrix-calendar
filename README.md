# Task Matrix Calendar

> An offline-first Obsidian desktop plugin that manages human-readable Markdown tasks with an Eisenhower matrix and a month calendar.

Task Matrix Calendar（任务矩阵日历）把任务保留在普通 Markdown 文档中，同时提供更直观的任务中心：未分类收件箱、四象限、父子任务进度、截止风险、月历、可恢复回收站和旧任务迁移。

![Task Matrix Calendar 任务中心（脱敏演示数据）](assets/task-center-overview-sanitized.png)

![Task Matrix Calendar 日历视图（脱敏演示数据）](assets/calendar-overview-sanitized.png)

## 特点

- Markdown 是唯一任务数据源；插件 `data.json` 只保存设置。
- 新任务默认“待办 + 未分类”；开始执行或完成前必须选择四象限。
- 支持待办、进行中、暂停、已完成；“取消执行”回到待办。
- 支持一层父任务 + 子任务，父任务完成前检查所有子任务。
- 月历区分计划日期和截止日期，任务条目沿用待办、进行中、暂停、已完成的状态配色；拖动只改变计划日期。
- 原生 Markdown checkbox 变化会安全协调；存在其他同时编辑时拒绝覆盖。
- 删除进入 Vault 内可见回收站；迁移先预览、先备份、写后验证。
- 同时适配 Obsidian 亮色与暗色主题，不使用固定黑色正文。
- “任务矩阵 / 日历”在同一个任务工作区内切换并共享筛选状态。
- 搜索与项目、状态、截止风险、来源筛选可以一键清除。
- “+ 新任务”和“编辑”使用同一个分组弹窗；详情支持多行。
- 编辑模式可在二次确认后把父任务及其子任务整体移入可见 Markdown 回收站；取消不会写入。
- 开始日期可输入 `YYYYMMDD` 或 `YYYY-MM-DD`，保存为 `计划日期:: YYYY-MM-DD`。
- 旧任务导入先选择 Markdown 文件，再核对候选，最后确认备份与写入。
- 复选框候选默认选中；普通列表候选默认不选中。

## 任务工作区

任务中心采用克制、低干扰的单一工作区。顶部的分段导航在“任务矩阵”和“日历”之间切换，两种视图共享搜索词与全部筛选状态，不会因为切换视图丢失当前上下文。

搜索框与项目、状态、截止风险、来源筛选以紧凑筛选项排列；“清除筛选”会同时恢复默认的活动任务范围。创建与编辑共用单列分组表单，基础信息、时间安排和补充信息保持一致，详情字段可输入多行文本。

## Markdown 格式

```markdown
<!-- obsidian-task-schema: 1 -->

- [ ] 发布开源插件 #task ^task-01JZA1
  - 状态:: 进行中
  - 分类:: 重要不紧急
  - 项目:: task-matrix-calendar
  - 标签:: Obsidian, 开源
  - 详情::
    > 第一行
    >
    > 第二行
  - 计划日期:: 2026-07-15
  - 截止日期:: 2026-07-31
  - [x] 完成设计 #task ^task-01JZA2
    - 状态:: 已完成
    - 分类:: 重要不紧急
```

`标签::` 是插件自己的结构化字段，不等同于 Obsidian 原生 `#tag`，插件不会静默创建或改写原生标签。

## 状态与 checkbox

- 未分类任务可以留在待办，但不能开始执行。
- 已分类待办可直接完成；未分类任务点击完成时先选择象限。
- 进行中可暂停、完成或取消回待办；暂停可继续、完成或取消回待办；已完成可重新打开为待办。
- 在 Markdown 中仅切换 checkbox 时，插件同步 `状态::`；如果标题、字段、缩进或子任务同时变化，该块进入只读保护，等待人工处理。
- 分类弹窗取消或父任务完成门槛未满足时，checkbox 会恢复到原状态。

## 安装

### 从 GitHub Release 手动安装

前往 [最新版本下载页面](https://github.com/huajiexiewenfeng/obsidian-task-matrix-calendar/releases/latest)，下载同一版本的 `main.js`、`manifest.json` 和 `styles.css`，放入：

```text
<Vault>/.obsidian/plugins/task-matrix-calendar/
```

然后在 Obsidian → 设置 → 第三方插件中启用 **Task Matrix Calendar**。

### 从源码安装到本地 Vault

需要 Node.js 22：

```powershell
npm ci
npm run build
node scripts/install-to-vault.mjs --vault "D:\path\to\Development Vault"
```

脚本只复制三个发布文件；已有插件目录会先备份为 `task-matrix-calendar.backup-<UTC 时间>`。当 Vault 最终目录名恰好是 `Obsidian Vault` 时，还必须显式设置：

```powershell
$env:ALLOW_PRODUCTION_VAULT='YES'
```

请先使用独立开发 Vault 验证，不要直接对主 Vault 做迁移实验。

## 开发

```powershell
npm ci
npm test
npm run coverage
npm run lint
npm run build
```

开发分支遵循 TDD。测试 fixture 必须是脱敏内容，不得提交真实 Vault 任务、绝对用户路径、截图中的私人信息、密钥或本地 `data.json`。

## 设置

- 扫描目录：一个或多个 Vault 相对目录。
- 排除规则：支持 glob；回收站文件和备份目录始终被排除，不能通过设置取消。
- 默认收件箱：“+ 新任务”写入的 Markdown 文件。
- 回收站文件：默认 `任务/任务回收站.md`。
- 迁移备份目录：默认可见目录 `任务/任务备份`。
- 即将截止天数：控制风险提示窗口。

## 回收与迁移

删除父任务会把完整父子块连同原路径、原 ID 和删除时间写入回收站。恢复时优先回到原文件；原文件不存在则进入收件箱。回收站超过 5 MiB 时显示警告，不会自动清理；永久删除和清空都需要精确确认令牌。

旧任务导入采用三步向导：

1. **选择文件**：只列出设置中扫描目录内、且未被排除规则命中的 Markdown 文件。插件不会读取未选中的文件。
2. **核对候选**：逐项显示 Vault 相对来源路径、原始行号、原始 Markdown 和识别原因，并允许直接编辑建议的标题、状态、象限、项目、日期与详情。复选框候选默认选中；普通列表只是待确认线索，默认不选中，避免把一般说明文字误当成任务。
3. **确认写入**：汇总来源文件、选中候选数量与备份位置，最后一次确认后才开始写入。

预览、编辑建议或取消向导都不会修改 Markdown。最终确认时，插件会先为每个来源创建时间戳备份，再在写入事务中检查来源是否变化；过期计划会被拒绝且不会改动源文档。写入后插件会重新读取并验证结果；任何写入或验证失败都会触发回滚，恢复已备份的原文件，重复点击应用也不会重复执行同一计划。

## 第一版不包含

移动端、循环任务、小时级时间块、系统通知、弹窗提醒、多人同步服务、云数据库和深层子任务。

## 隐私

插件不包含网络服务、遥测或账户系统。任务和设置均保留在本地 Vault 中。

## 许可证

[MIT](LICENSE)
