# 通途（ChainAI）

> 学海无涯，大道通途 —— 树状对话 AI 桌面应用

把「一问一答」组织成一棵**对话树**：任意节点可以**分叉**出多条分支、从**新开始**、或**综合合并**多条父链。每次对话都沉淀为结构化知识树，而不是一条滚不到头的聊天记录。

## ✨ 功能特性

- **树状对话**：节点 = 一问一答；分支 = 新会话（可继承全部 / 最近 N 条 / 不继承上下文）；合并 = 多父节点（DAG）
- **多棵树**：每棵树是一个独立对话项目，互不干扰
- **Git 风格树状图**：确定性布局、节点分组（虚线框）、折叠展开、拖拽合并、全屏、PNG 导出
- **多提供商 AI**：OpenAI 兼容（DeepSeek / Kimi / 智谱等）、Anthropic Claude、Ollama 本地；多套配置、流式输出、连接测试
- **智能上下文**：时间权重压缩（旧消息 AI 摘要）+ token 估算提醒，长对话不爆上下文
- **重新生成与版本历史**：同一回答可重新生成并保留多版本，随时切换
- **便签板**：Markdown 便签（文件存储 + 目录树 + 颜色标签），从任意消息一键创建
- **收藏分组**：按主题组织收藏的对话节点
- **数据安全**：JSON 全量备份（手动 / 自动）、Markdown 导入导出、回收站 + 不活跃分支自动清理
- **桌面体验**：无边框标题栏、系统托盘、专注模式、全局搜索（Ctrl+P）、全局快捷键、自定义右键菜单

## 🧰 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | [Tauri 2](https://tauri.app)（Rust） |
| 前端 | React 19 · TypeScript · Vite 6 · Tailwind CSS 4 |
| 状态 | Zustand |
| 可视化 | @xyflow/react（树状图）· ECharts · Mermaid（点击懒加载） |
| 存储 | SQLite（`tauri-plugin-sql`，测试用 better-sqlite3，共享 `SqlBackend` 抽象） |

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式（需 Rust 工具链：https://tauri.app/start/prerequisites/）
npm run tauri dev

# 仅前端调试（数据库初始化会提示需完整环境）
npm run dev

# 生产构建（生成安装包）
npm run tauri build
```

## 🧪 测试

```bash
npm test          # vitest 全量运行（107 个用例）
npm run build     # tsc 类型检查 + vite 生产构建
```

测试使用内存 SQLite（better-sqlite3），与生产共用同一套仓储层，无需 Tauri 环境。

## 📁 项目结构

```
src/
├── core/                    # 纯业务逻辑（不依赖 UI，可独立测试）
│   ├── ai/                  # AI 多提供商适配层（openai 兼容 / anthropic / ollama）
│   ├── db/                  # SQLite：SqlBackend 抽象 + 仓库层 + schema + 迁移
│   ├── tree/                # TreeService：分支 / 新开始 / 合并业务逻辑
│   ├── context/             # 上下文构建 + 时间权重压缩 + token 估算
│   ├── graph/               # 树状图布局算法（Git 风格）
│   ├── importExport/        # JSON 备份 / Markdown 导入导出
│   ├── cleanup/             # 不活跃分支清理 + 回收站过期清理
│   ├── notes/               # 便签服务（Markdown 文件 + 元数据）
│   └── typing/              # 流式打字机效果
├── store/                   # Zustand 状态（chatStore 核心 / uiStore / graphStore / dialogStore）
├── components/
│   ├── chat/                # 消息流 / 输入卡片 / Markdown / ECharts / Mermaid 渲染
│   ├── graph/               # 树状图画布 / 节点 / 分组
│   ├── layout/              # 标题栏 / 侧栏 / 便签板 / 收藏夹
│   └── modals/              # 设置 / 搜索 / 分支 / 合并 / 回收站等对话框
└── main.tsx
```

## ⌨️ 全局快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+B` | 展开 / 收起树状图 |
| `Ctrl+N` | 新建便签 |
| `Ctrl+Shift+N` | 展开 / 收起右侧便签板 |
| `Ctrl+P` | 全局搜索 |
| `Ctrl+E` / `Ctrl+I` | 导出 / 导入 JSON 备份 |
| `Ctrl+Shift+F` / `Esc` | 树状图全屏 / 退出全屏 |

## 💾 数据存储

**数据随程序走**：所有用户数据都存在应用所在目录下（安装版安装到哪里，数据就在哪里；卸载/重装/升级不丢数据）。

| 类型 | 安装版（release） | 开发版（debug） |
| --- | --- | --- |
| 数据库 `chainai.db` | 安装目录下 | `%APPDATA%\com.16576.chainai\` |
| 便签（Markdown） | 安装目录 `notes/` | `文档/AITreeNotes/` |
| 自动备份（JSON） | 安装目录 `backups/` | `文档/AITreeBackups/` |
| 错误日志 | 安装目录 `chainai-error.log` | `文档/chainai-error.log` |

- 安装版首次启动会自动把旧位置（`%APPDATA%\com.16576.chainai\`）的数据库迁移到安装目录（一次性，幂等）
- 便签目录可在「设置 → 便签存储」中自定义
- 安装模式为 `currentUser`：默认安装到 `%LOCALAPPDATA%\tongtu`（无需管理员权限，目录可写）

## 📄 更多

- 版本历史见 [CHANGELOG.md](./CHANGELOG.md)
- 素材出处见 [CREDITS.md](./CREDITS.md)（应用图标：juicy_fish）
