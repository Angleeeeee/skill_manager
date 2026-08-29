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
                 │
                 └─▶ 每次决策同时追加写入本地 routing.jsonl
```

捆绑的 `skill-router` Skill 把同一套检索暴露为命令行，用于手动查询或跨语言重试：

```bash
node <插件根目录>/skills/skill-router/scripts/search-skills.js --query "..." --limit 5
```

## 功能特性

- **零依赖** —— 纯 Node.js 标准库，无需 `npm install`。
- **完全本地、隐私优先** —— 无网络请求、无遥测；只读取 `SKILL.md` 的 frontmatter（`name` / `description`）。
- **失败不阻塞** —— 路由出错时注入降级提示，绝不拦下用户的请求。
- **路由日志** —— 每一次决策（`routed` / `skip` / 零候选 / `search_error`）都追加写入本地 JSONL，让过去静默发生的漏路由和被吞掉的异常变得可见。
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

仓库根目录**就是**发行包根目录——`.agents/plugins/marketplace.json` 与 `plugins/skill-router/` 直接位于其下。克隆仓库（或解压 [Releases](https://github.com/Angleeeeee/skill_manager/releases) 中的 zip）后，把该目录指给 Codex：

```bash
git clone https://github.com/Angleeeeee/skill_manager.git
cd skill_manager

codex plugin marketplace add "$(pwd)"          # Windows PowerShell：codex plugin marketplace add (Get-Location)
codex plugin add skill-router@skill-router-community
codex plugin list --marketplace skill-router-community --available --json
```

如果你的源码另有存放位置，改用 `codex plugin marketplace add "<发行包根目录>"`——`<发行包根目录>` 指任何包含 `.agents/plugins/marketplace.json` 的目录。

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

## 路由日志

过去路由失败是静默的：零候选、被吞掉的异常、直接跳过的 prompt 都不留痕迹，"我的技能为什么没触发"无从回答。现在钩子与命令行的每次决策都会追加写入一个本地 JSONL 文件。

- **默认路径**：`$CODEX_HOME/skill-router/routing.jsonl`（回退到 `~/.codex/skill-router/routing.jsonl`）
- **改路径**：`SKILL_ROUTER_LOG=/path/to/routing.jsonl`
- **关闭**：`SKILL_ROUTER_LOG=off`（也接受 `0`、`false`、`none` 或空值）

| 事件 | 触发时机 | 关键字段 |
|------|----------|----------|
| `routed` | 钩子完成一次检索 | `candidateCount`、`zeroCandidates`、`candidates[]`、`durationMs`、`indexedSkills`、`roots` |
| `skip` | prompt 为空或属于寒暄（`谢谢`、`好的` 等） | `reason`、`query` |
| `search_error` | 检索抛出异常 | `error`、`durationMs` |
| `input_parse_error` | 钩子收到的不是合法 JSON | — |
| `search` | 命令行手动检索 | `source: "cli"`，其余同 `routed` |

query 最多保留 160 个字符，日志只写在本机，不上传。写日志失败会被吞掉——这是刻意设计，日志绝不能反过来拖垮路由。

```bash
# 实际会问的三个问题
tail -n 20 "$CODEX_HOME/skill-router/routing.jsonl"
grep -c '"zeroCandidates":true' "$CODEX_HOME/skill-router/routing.jsonl"
grep '"event":"search_error"' "$CODEX_HOME/skill-router/routing.jsonl"
```

如果中文 prompt 面对英文命名技能出现大量 `zeroCandidates`，这就是词法检索已知的召回上限——信号是该往技能的 `description` 里补中英别名，而不是去调低分数线。

## 目录结构

```text
.
├── .agents/plugins/marketplace.json        # Codex marketplace 清单：名称、插件来源、安装策略
├── .gitignore
├── AGENT_RUNBOOK.md                        # canonical 的安装 / 验证 / 维护 / 排障契约（面向 agent）
├── CHANGELOG.md                            # 更新日志，最新在前
├── INSTALL_WITH_AI.md                      # 一行 agent 入口重定向 → AGENT_RUNBOOK.md
├── LICENSE                                 # MIT
├── README.md                               # 英文概览（人类）
├── README.zh-CN.md                         # 中文概览（人类，即本文件）
└── plugins/skill-router/                   # 插件包本体（marketplace 的 `source` 指向这里）
    ├── .codex-plugin/plugin.json           # 插件清单：名称、版本号 + cachebuster、展示元数据
    ├── hooks/hooks.json                    # 注册 UserPromptSubmit 钩子：超时、上下文长度上限
    ├── hooks/user-prompt-submit.js         # 钩子入口：读 stdin prompt JSON → 检索 → 注入上下文 → 写日志
    └── skills/skill-router/
        ├── SKILL.md                        # 捆绑的路由技能：检索纪律与输出契约
        ├── agents/openai.yaml              # 技能面向 agent 的元数据
        └── scripts/search-skills.js        # 零依赖索引 + 排序引擎，同时是 CLI，路由日志的归属地
```

全部检索逻辑都在 `search-skills.js`（分词、IDF 权重、模糊匹配、负面上下文惩罚、技能根发现、日志写入），`user-prompt-submit.js` 只是一层薄适配器：stdin 进、`additionalContext` 出。新增排序逻辑请写进脚本，钩子与 CLI 才能保持等价。

## 隐私

- **无网络访问。无遥测。** 钩子与检索脚本均为纯本地文件扫描。
- 只解析技能*元数据*；完整 `SKILL.md` 正文只在技能被真正选中时才由 Codex 加载。
- 路由日志只写在你自己的机器上，最多保存 160 个字符的 query 片段，并可用 `SKILL_ROUTER_LOG=off` 完全关闭。
- 你的 prompt 与技能信息不会离开本机——配合 `codex --oss` 接本地模型，可实现全内网离线。

## 文档

| 文件 | 受众 |
|------|------|
| [`README.zh-CN.md`](README.zh-CN.md) | 人类读者——中文概览与快速上手 |
| [`README.md`](README.md) | 人类读者——英文概览与快速上手 |
| [`AGENT_RUNBOOK.md`](AGENT_RUNBOOK.md) | Codex agent——canonical 安装 / 验证 / 维护 / 排障契约 |
| [`CHANGELOG.md`](CHANGELOG.md) | 人类与 agent——更新日志，最新在前 |
| [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md) | agent 入口重定向 |

## 参与贡献

欢迎 Issue 与 PR。修改插件行为时，请遵循 `AGENT_RUNBOOK.md` 中的维护协议（语法检查 → 插件校验 → 更新清单 cachebuster → 重装 → 新任务中行为验证）。

任何用户可见的变更还需要写一条 `CHANGELOG.md` 条目，并在行为变化时提升基版本号（`0.2.0` → `0.3.0`）——`+codex.<UTC 时间戳>` 后缀只用于击穿 Codex 的安装缓存，不能替代版本号本身。

## 许可证

[MIT](LICENSE) © Skill Router Contributors
