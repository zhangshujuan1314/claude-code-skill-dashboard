# Skill Dashboard — Claude Code 技能可视化管理面板

本地只读的 Claude Code 技能清单仪表盘。一键扫描所有已安装 skill，生成自包含 HTML 面板，支持搜索、筛选、详情查看、一键复制启用/禁用命令。

## 快速开始

```bash
# 扫描所有技能 → 生成 data.json + skills.generated.html
node scan.mjs

# 双击打开仪表盘
start skills.generated.html   # Windows
open skills.generated.html    # macOS

# 可选：本地开发服务器（stdib only，无依赖）
node serve.mjs
# → http://localhost:3000/skills.generated.html
```

## 功能

- **技能清单** — 扫描 `~/.claude/skills/`（含符号链接）+ 插件 skills，69 个技能一目了然
- **搜索筛选** — 按名称 / 描述 / 标签搜索，按来源、可见性、诊断信息筛选，多种排序
- **详情面板** — 点击卡片查看完整描述、frontmatter 字段、路径、诊断信息
- **一键操作** — 生成 `claude plugin enable/disable` 命令或 `skillOverrides` JSON 补丁，复制即用
- **隐私保护** — 本地模式路径显示为 `~`，分享模式 `--privacy share` 隐去绝对路径
- **完全离线** — 零外部依赖，Node.js 标准库即可运行，HTML 内嵌数据可离线打开

## 命令参考

```bash
# 基础扫描（隐私模式：本地）
node scan.mjs

# 分享模式（隐藏绝对路径）
node scan.mjs --privacy share

# 扫描指定项目
node scan.mjs --project /path/to/your/repo

# 运行全部测试
node test/run-all.mjs
```

## 架构

```
scan.mjs                  # 主入口，协调扫描流程
lib/
├── parse-frontmatter.mjs # 约束 YAML 解析器
├── scan-personal.mjs     # 扫描 ~/.claude/skills/
├── scan-plugins.mjs      # 插件扫描（CLI 优先 + 文件系统回退）
├── resolve-visibility.mjs# 读取 skillOverrides 解析可见性
└── generate-html.mjs     # 将 data.json 嵌入 HTML 模板
template.html             # 仪表盘 UI 模板（纯 CSS + JS）
serve.mjs                 # 开发服务器（Node 标准库）
```

## 设计原则

- **只读** — 绝不自动修改 settings.json 或技能文件，所有操作仅生成命令/补丁供用户手动执行
- **零依赖** — 仅用 Node.js `fs` / `path` / `child_process` / `crypto` 标准库
- **容错** — 损坏的符号链接、格式错误的 frontmatter、超大文件等均不导致崩溃，产生诊断信息
- **自包含** — 生成的 HTML 内嵌全部数据，双击即可打开，不依赖 `file://` 下的网络请求

## 协议

MIT
