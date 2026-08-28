# Skill Router

> **让你的编码 agent 不再无视已安装的技能。**
> 一个本地运行、零依赖的 [OpenAI Codex](https://developers.openai.com/codex) 插件：在 agent 开始干活之前，把每条用户请求路由到最相关的已安装 Skill。

**语言 / Language**: [简体中文](#为什么需要) · [English](README.md)

---

## 为什么需要

Agent Skills（开放的 `SKILL.md` 标准）是沉淀可复用工作流的好方式——但 Codex 在启动时只加载每个技能的**元数据**（name + description），隐式激活完全依赖模型"恰好注意到"匹配。实践中会以两种可预测的方式失败：

1. **agent 从不使用**明显适用于当前任务的已安装技能；
2. **agent 宣布了技能或计划，然后就停了**，并不真正执行。

Skill Router 用一个 `UserPromptSubmit` 钩子堵住这个缺口：在每条实质性 prompt 之前，本地检索全部已安装 Skill 的元数据，把最强的候选注入上下文——更关键的是，注入"采用纪律"，迫使 agent 真正读取所选技能的完整 `SKILL.md`，并在**同一轮内继续执行**。

## 工作方式

```text
用户 prompt ──▶ UserPromptSubmit 钩子（本地 Node.js，通常 <1s）
                 │  1. 扫描所有技能根目录下的 SKILL.md frontmatter
                 │  2. 排序：IDF 加权词法匹配 + 名称短语加权
                 │     + Levenshtein 模糊（相似度 ≥0.8）+ 负面上下文惩罚
                 │     + 查询覆盖率加分 → 高于分数线的取前 5
                 ▼
              向本轮注入 additionalContext：
              - 候选列表（名称 | 得分 | 路径 | 描述）
              - 采用契约：动手前先读完所选技能的完整 SKILL.md、
                同轮继续执行、弱匹配不许硬凑
              - 零命中时提供一条重试路径（补充 3–8 个中英别名）
```

捆绑的 `skill-router` Skill 把同一套检索暴露为命令行，用于手动查询或跨语言重试：

```bash
node <插件根目录>/skills/skill-router/scripts/search-skills.js --query "..." --limit 5
```

## 功能特性

- **零依赖** —— 纯 Node.js 标准库，无需 `npm install`。
- **完全本地、隐私优先** —— 无网络请求、无遥测；只读取 `SKILL.md` 的 frontmatter（`name` / `description`）。
- **失败不阻塞** —— 路由出错时注入降级提示，绝不拦下用户的请求。
- **同轮执行契约** —— 注入的上下文明确禁止"宣布技能后就停"。
- **负面上下文感知排序** —— 描述中含有 `不适用于 / not for` 的句子会被惩罚降权，而不是被匹配命中。
- **Monorepo 友好** —— 从工作目录向上到 git 根的每一层 `.agents/skills` 都会扫描，另加用户级、`$CODEX_HOME`、插件缓存和系统级目录。
- **大仓库安全** —— 符号链接防环、5000 个文件的扫描上限，以及构建产物跳过清单（`Binaries`、`Intermediate`、`Saved`、`DerivedDataCache`、`node_modules`、`target` 等）。
- **跨语言** —— 中日韩 n-gram 分词 + 显式的中英别名重试路径。
- **防重复安装** —— 检测旧的手动安装和遗留的全局 `AGENTS.md` 路由规则，避免每条 prompt 被路由两次。

## 环境要求

- [OpenAI Codex CLI](https://developers.openai.com/codex)（需支持插件与 hooks）
- Node.js 18+（任意近期 LTS 版本）
- Windows / macOS / Linux 均可

## 安装

在本发行包根目录（即本文件所在目录）执行：

```bash
codex plugin marketplace add "<发行包根目录>"
codex plugin add skill-router@skill-router-community
codex plugin list --marketplace skill-router-community --available --json
```

然后：

1. 在 Codex 中打开 `/hooks`，**信任** Skill Router 的 `UserPromptSubmit` 钩子（必需，一次性的——每次更新插件后需重新信任）。
2. **新开一个任务**，用一个与已安装测试技能相关的 prompt 验证路由是否生效。

> 让 AI 代装：把你的 agent 指向 [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md)——它会转到 [`AGENT_RUNBOOK.md`](AGENT_RUNBOOK.md)，即 canonical 的安装 / 验证 / 维护 / 排障契约文档。

## 扫描的技能根目录

| 根目录 | 范围 |
|------|------|
| `<当前目录>/…/.agents/skills`（向上到 git 根） | 仓库级 / monorepo 各层级 |
| `~/.agents/skills` | 用户全局 |
| `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | Codex 用户技能 |
| `$CODEX_HOME/plugins/cache` | 已安装插件的技能 |
| `/etc/codex/skills`（非 Windows） | 系统级 / 管理员级 |

## 隐私

- **无网络访问。无遥测。** 钩子与检索脚本均为纯本地文件扫描。
- 只解析技能*元数据*；完整 `SKILL.md` 正文只在技能被真正选中时才由 Codex 加载。
- 你的 prompt 与技能信息不会离开本机——配合 `codex --oss` 接本地模型，可实现全内网离线。

## 文档

| 文件 | 受众 |
|------|------|
| [`README.zh-CN.md`](README.zh-CN.md) | 人类读者——中文概览与快速上手 |
| [`README.md`](README.md) | 人类读者——英文概览与快速上手 |
| [`AGENT_RUNBOOK.md`](AGENT_RUNBOOK.md) | Codex agent——canonical 安装 / 验证 / 维护 / 排障契约 |
| [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md) | agent 入口重定向 |

## 参与贡献

欢迎 Issue 与 PR。修改插件行为时，请遵循 `AGENT_RUNBOOK.md` 中的维护协议（语法检查 → 插件校验 → 更新清单 cachebuster → 重装 → 新任务中行为验证）。

## 许可证

[MIT](LICENSE) © Skill Router Contributors
