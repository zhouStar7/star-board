# Star Board `v1.0.0`

面向研发与个人效率场景的 **GitHub + Linear + Notion** 三端双向同步实时看板，专为 **Claude Cowork Live Artifact** 与 **MCP（Model Context Protocol）** 设计。

## 核心特性

- **三端实时聚合**：并行同步 GitHub Pull Request / 仓库、Linear Issue / 项目 / 团队，以及 Notion 任务数据库，打开即看最新状态。
- **多视图自由切换**：提供「表格」「看板」「项目与仓库」三个视图，支持顶部指标条一键筛选、多维组合过滤、表头排序，并自动记住筛选偏好。
- **看板拖拽与双向回写**：在看板中拖拽卡片跨列，或在表格与详情抽屉中直接修改状态，立即乐观更新并同步写回原工具（失败自动回滚）。拖拽时会自动高亮当前来源支持的目标状态列。
- **新建任务 + AI 一句话速记**：支持右上角新建（快捷键 `N`）、看板列底快捷新建和项目卡片新建；弹窗支持按当前筛选上下文预填，也支持输入一句自然语言由 AI 自动识别归属平台（Linear / Notion）、项目或分类、优先级与相对日期后一键落库。
- **AI 今日重点与本机备注**：每次同步后自动结合三端活跃数据生成今日优先建议；详情抽屉支持记录保存在 `localStorage` 的个人跟进备注。
- **零依赖单文件打包**：源码按配置、样式与功能模块清晰拆分，运行 `npm run build` 即可输出单文件 `dist/star-board.html`。

## 目录结构

```text
star-board/
├── src/
│   ├── config.js          # 个人配置区（GitHub 用户名、Notion Data Source ID 等）
│   ├── index.html         # 页面结构与弹窗/抽屉模板
│   ├── styles.css         # 完整界面样式与响应式布局
│   └── js/
│       ├── state.js       # 常量映射、全局状态、Toast 与 MCP 解析工具
│       ├── sync.js        # 三端数据标准化、并行拉取、双向写回与 AI 摘要
│       ├── views.js       # 表格、拖拽看板、项目与仓库总览及详情抽屉渲染
│       └── create-modal.js# 新建任务表单、上下文预填与 AI 一句话解析
├── scripts/
│   └── build.mjs          # 零依赖单文件打包脚本（输出 dist/star-board.html）
├── package.json
├── CHANGELOG.md
└── LICENSE
```

## 快速开始

### 1. 修改配置

打开 `src/config.js`，将占位符替换为你自己的信息：

```js
const STAR_BOARD_CONFIG = {
  version: "1.0.0",
  githubLogin: "YOUR_GITHUB_USERNAME",
  linearWorkspaceUrl: "https://linear.app",
  linearDefaultTeam: "Engineering",
  linearDefaultAssignee: "Me",
  notionDataSourceId: "YOUR_NOTION_DATA_SOURCE_ID",
  notionDatabaseUrl: "https://www.notion.so",
  notionDatabaseName: "任务数据库",
  notionDefaultAssignee: "Me",
  notionCategories: ["工作", "AI工程", "学习", "生活"]
};
```

> 提示：Notion 任务数据库默认读取属性名为 `任务`（标题）、`状态`（待办 / 进行中 / 暂缓 / 已完成 / 已关闭）、`分类`、`重要性`（紧急 / 重要 / 中 / 不重要）、`能量`（高 / 中 / 低）、`到期` 与 `发送到归档`。如果你的数据库列名不同，可在 `src/js/sync.js` 与 `src/js/create-modal.js` 中对应调整。

### 2. 打包为 Cowork 实时 Artifact

需要 Node.js 18+，无需安装任何第三方依赖：

```bash
npm run build
```

构建完成后会在 `dist/star-board.html` 生成自包含单文件 HTML。在 Claude Desktop（Cowork）中连接 GitHub、Linear 与 Notion MCP 后，将该文件创建为 Live Artifact 并声明以下 MCP 工具权限即可使用。

## 所需 MCP 工具清单

- **GitHub**：`mcp__GitHub__search_pull_requests`、`mcp__GitHub__search_repositories`、`mcp__GitHub__update_pull_request`
- **Linear**：`mcp__Linear__list_issues`、`mcp__Linear__list_projects`、`mcp__Linear__list_teams`、`mcp__Linear__save_issue`
- **Notion**：`mcp__Notion__notion-query-data-sources`、`mcp__Notion__notion-update-page`、`mcp__Notion__notion-create-pages`

## 版本记录

当前版本：`v1.0.0`，详见 [CHANGELOG.md](./CHANGELOG.md)。

## License

[MIT](./LICENSE)
