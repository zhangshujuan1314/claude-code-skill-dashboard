# Skill Dashboard — Claude Code 技能可视化管理面板

本地只读的 Claude Code 技能清单仪表盘。一键扫描已安装 skill，生成自包含 HTML 面板 + 一键安装脚本，支持换电脑便携迁移、开机自启自动更新。

## 快速开始

```bash
# 扫描所有技能
node scan.mjs

# 打开仪表盘（双击也可）
start skills.generated.html   # Windows
open skills.generated.html    # macOS

# 监听模式 — 技能目录变动时自动重扫
node scan.mjs --watch

# 开发服务器（Node 标准库，无依赖）
node serve.mjs                # → http://localhost:3000/skills.generated.html
```

## 便携迁移

换到新电脑？一行命令恢复全部技能 + 开机自启：

```bash
git clone https://github.com/zhangshujuan1314/claude-code-skill-dashboard
cd claude-code-skill-dashboard
bash install.sh
```

自动完成：
- **3 个插件** → `claude plugins install` 全局安装
- **36 个符号链接技能** → 克隆 karpathy 仓库 + 建立链接
- **13 个独立技能** → 从 `standalone-skills/` 便携包恢复（女娲、卡兹克等）
- **开机自启** → 自动配置 `--watch` 守护进程（Win/Mac/Linux）

| 系统 | 自启方式 |
|------|---------|
| Windows | Startup 文件夹 `.vbs` 隐藏启动 |
| macOS | LaunchAgent (`launchd` 守护) |
| Linux | systemd user service |

## 功能

- **三栏布局** — 左侧紧凑列表 + 右侧详情面板，东方极简风格，全中文界面
- **全中文描述** — 63 条技能描述中译覆盖
- **安装溯源** — 每个技能的 GitHub 仓库链接 + 触发条件说明
- **搜索筛选** — 按名称 / 描述搜索，按来源、可见性筛选，多种排序
- **详情面板** — 点击查看完整描述、基本信息、安装方式、触发条件、frontmatter、诊断
- **一键操作** — 生成 `claude plugin enable/disable` 命令或 `skillOverrides` JSON 补丁，复制即用
- **自动更新** — `--watch` 模式监听技能目录，安装新 skill 自动重扫
- **便携导出** — `standalone-skills/` 自动打包独立技能目录，`install.sh` 一键恢复
- **隐私保护** — 本地模式路径显示为 `~`，分享模式 `--privacy share` 隐去绝对路径
- **完全离线** — 零外部依赖，Node.js 标准库即可运行，HTML 内嵌数据
- **响应式** — 768px 以下自动切换单栏

## 命令参考

```bash
# 基础扫描
node scan.mjs

# 监听模式（装新 skill 自动更新）
node scan.mjs --watch

# 分享模式（隐藏绝对路径）
node scan.mjs --privacy share

# 扫描指定项目
node scan.mjs --project /path/to/your/repo

# 运行全部测试（54 个用例）
node test/run-all.mjs
```

## 产出文件

```
skills.generated.html   # 自包含仪表盘，双击打开
data.json               # 机器可读的技能数据
scan-report.json        # 诊断与警告报告
install.sh              # 一键安装脚本（含开机自启）
standalone-skills/      # 独立技能便携包（13 个目录）
```

## 架构

```
scan.mjs                  # 主入口，协调扫描、导出、安装脚本
lib/
├── parse-frontmatter.mjs # 约束 YAML 解析器
├── scan-personal.mjs     # 扫描 ~/.claude/skills/
├── scan-plugins.mjs      # 插件扫描（CLI 优先 + 文件系统回退）
├── resolve-visibility.mjs# 读取 skillOverrides 解析可见性
└── generate-html.mjs     # 将 data.json 嵌入 HTML 模板
template.html             # 仪表盘 UI 模板（东方极简·纯 CSS + JS）
serve.mjs                 # 开发服务器（Node 标准库）
```

## 设计原则

- **只读** — 绝不自动修改配置文件，仅生成命令/补丁供手动执行
- **零依赖** — 仅用 Node.js 标准库
- **容错** — 损坏的符号链接、格式错误的 frontmatter、超大文件均不崩溃
- **自包含** — 生成的 HTML 内嵌全部数据，双击即可打开

## 协议

MIT
