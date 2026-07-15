# Contributing

感谢参与 Task Matrix Calendar。

1. 使用 Node.js 22 和 `npm ci` 安装锁定依赖。
2. 先写失败测试，再实现最小改动；修复或功能必须覆盖冲突与失败路径。
3. 运行 `npm test`、`npm run coverage`、`npm run lint`、`npm run build`。
4. fixture 必须脱敏，不得包含真实 Vault 内容、用户绝对路径、密钥或私人截图。
5. Pull Request 请说明用户行为变化、Markdown 兼容性、验证命令和手工测试范围。

Markdown 始终是唯一任务数据源；任何引入第二份持久任务数据库的改动都不在项目方向内。
