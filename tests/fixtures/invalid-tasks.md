<!-- obsidian-task-schema: 1 -->

- [ ] 重复任务一 #task ^task-D0P1
  - 状态:: 待办
  - 分类:: 重要且紧急

- [ ] 重复任务二 #task ^task-D0P1
  - 状态:: 待办
  - 分类:: 重要不紧急

- [x] checkbox 状态冲突 #task ^task-C0NFC7
  - 状态:: 待办
  - 分类:: 不重要但紧急

- [ ] 非法日期 #task ^task-BADDATE
  - 状态:: 待办
  - 分类:: 不重要不紧急
  - 截止日期:: 2026-13-40

- [ ] 边界异常父任务 #task ^task-PARENT
  - 状态:: 待办
  - 分类:: 重要不紧急
  - [ ] 第一层子任务 #task ^task-CH7D
    - 状态:: 待办
    - 分类:: 重要不紧急
    - [ ] 不允许的第三层 #task ^task-GRANDCH7D
      - 状态:: 待办
      - 分类:: 重要不紧急
  - 项目:: 子任务后不允许再出现父属性

- [ ] 缺少分类 #task ^task-MSSNG
  - 状态:: 待办
