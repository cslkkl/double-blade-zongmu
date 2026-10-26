# docs/ — 说明文档索引

每一页只回答一个问题，不重复别人的答案。键位与机制的**唯一口径**分别是
[OPERATIONS.md](OPERATIONS.md) 与 [GAMEPLAY.md](GAMEPLAY.md)。

| 文件 | 回答什么 | 读者 |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 为什么这么设计、有哪些不能破的约束 | 开发者 |
| [OPERATIONS.md](OPERATIONS.md) | 键位、各页面输入、改键位要同步哪六处 | 开发者 / 测试 |
| [GAMEPLAY.md](GAMEPLAY.md) | 机制、数值、六阵、文物对照、艺术处理边界 | 玩家 / 评审 |
| [ASSETS.md](ASSETS.md) | 生图 → 切片 → 渲染的契约（朝向 / 画布 / 锚点 / `scaleFix`） | 素材维护 |
| [DEPLOY.md](DEPLOY.md) | 要传什么、三种静态托管、上线必须满足的要求 | 运维 |
| [MOBILE.md](MOBILE.md) | 手机端实现细节、布局约束、真机验收清单 | 移动端维护 |
| [HISTORY.md](HISTORY.md) | 审计问题的处理状态总表（已修 / 已驳回 / 待办） | 维护者 |
| [PLAN.md](PLAN.md) | 跨会话进行中的计划与移交 | 维护者 |
| [ORIGINAL-GAME.md](ORIGINAL-GAME.md) | 原作《Double Edged》的机制，用来对照我们改了什么 | 设计参考 |

## 归档区

`audit/` 与 `archive/` 是**非活文档**：记录当时的证据与决定，不随代码演进，不追改。
正文里的行号、文件路径、键位可能停留在写作当天，需要当前事实时回到上面那几张表。

| 目录 | 收什么 |
|---|---|
| [audit/](audit/) | 三份审计原文（玩法与状态机 / 画面与渲染 / 输入与性能），是 [HISTORY.md](HISTORY.md) 的依据 |
| [archive/](archive/) | 已完成的移交、提交快照、开场短片的原始设计 |

## 写作约定

- 每篇第 3 行为状态行（活文档写「生效」，归档写「已归档 + 一句话理由」）。
- 结论前置；一句话一个物理行；超过 5 行拆成列表。
- 不写行号做锚点（`index.html` 会漂），用函数名与原文片段。
- 引用别的文档只到整篇层级，不写「第 n 节」；确需定位才用锚点。
- 键位、数值、体数这类会漂的事实只写一处，别处给指针。
