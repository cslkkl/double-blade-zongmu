# docs/ — 说明文档索引

每一页只回答一个问题，不重复别人的答案。键位与机制的**唯一口径**分别是
[OPERATIONS.md](OPERATIONS.md) 与 [GAMEPLAY.md](GAMEPLAY.md)。

## 事实路由表（哪条事实归谁）

改一条事实前先查表：**在 home 里改，然后只改表里列出的抄本**；表外的文件不该出现这条事实，
出现即视为该删的重复。

| 事实 | 唯一 home | 允许的抄本（只引用 / 只速查） |
|---|---|---|
| 键位、各页面输入、改键位要同步哪六处 | [OPERATIONS.md](OPERATIONS.md) | `README.md` 最小键位表、`操作与录屏说明.md` 现场速查表、`js/guide.js` 图例文案 |
| 武器表（伤害 / 耐久 / 范围 / 出手）、投掷弹数 | [GAMEPLAY.md](GAMEPLAY.md) | `index.html` `WEAPONS`（实现对侧）、`showcase.js` `WEAPONS` 中文名 |
| 六阵阵名 / 副题 / 体数 / 机关、BOSS 血量与硬直 | [GAMEPLAY.md](GAMEPLAY.md) | `index.html` `buildWaves()`、`文案包.md` 六问、`操作与录屏说明.md` 分镜表 |
| 敌人与武器的中文名 | [GAMEPLAY.md](GAMEPLAY.md) | `showcase.js` `ENEMIES` / `WEAPONS`、`文案包.md` |
| 文物称谓（本体 / 角色） | [GAMEPLAY.md](GAMEPLAY.md) 第五节 | `README.md` 一张脸、`文案包.md`、`操作与录屏说明.md` 话术、`showcase.html` 资料栏 |
| 青铜病措辞与三条区分 | [GAMEPLAY.md](GAMEPLAY.md) 第六节 | `README.md`、`showcase.html` 按语、`文案包.md` 4.2 / 4.6、`操作与录屏说明.md` 已知边界 |
| 素材契约（朝向 / 画布 / 锚点 / `scaleFix`） | [ASSETS.md](ASSETS.md) | `tools/README.md`、`js/AGENTS.md` 提醒行 |
| 上线要传什么、缓存头、`?v=` 缓存版本号、访问统计 | [DEPLOY.md](DEPLOY.md) | `README.md` 无（门面不写部署）；其余文档只留指针；查询工具 `tools/visits.py` |
| 设计决策与防错清单 | [ARCHITECTURE.md](ARCHITECTURE.md) | 各处「详见架构文档」指针 |

**为什么留着抄本而不全删**：抄本的读者条件不同 ——
`文案包.md` 要粘到官网表单、`操作与录屏说明.md` 是现场速查，读者都不在文件页里，纯指针点不到。
这类抄本开头必须有一句「口径以 X 为准」，且只保留**要念出来或写给评委看**的那个数，
不复制整张表。

## 反向路由（改哪 → 要同步哪）

正向表回答「这条事实归谁」，这张表回答「我动了这个文件，还要去改哪里」。
只列会被改动、且牵动别处的入口。

| 改这里 | 同步这几处 | 校验 |
|---|---|---|
| `index.html` `WEAPONS` 表 | [GAMEPLAY.md](GAMEPLAY.md) 武器两表 + `showcase.js` `WEAPONS` 中文名 + `文案包.md` 武器列表 + `操作与录屏说明.md` 武器速查 | `node tools/selftest_weapons.mjs` |
| `index.html` `buildWaves()` / `Enemy` 构造 | [GAMEPLAY.md](GAMEPLAY.md) 六阵表与敌人行 + `文案包.md` 六问 + `showcase.js` `ENEMIES` | `node tools/selftest_enemies.mjs` |
| `index.html` `startGame()` / `readPad()` / `KEY_LABEL` | [OPERATIONS.md](OPERATIONS.md) 两表 + `README.md` 最小键位表 + `操作与录屏说明.md` 键位表（共六处，见 OPERATIONS.md 第六节） | `node tools/check-inline.mjs` |
| `js/guide.js` 四张图例表 | [OPERATIONS.md](OPERATIONS.md) + 界面文案一致性 | `node tools/check-inline.mjs` |
| `js/anim-data.js`（重跑切片） | [ASSETS.md](ASSETS.md) 的 `scaleFix` / 锚点口径 + [AGENTS.md](../AGENTS.md) 验证快照里的帧数 | `node tools/selftest_weapons.mjs` |
| 角色头部绘制（五官参数） | [GAMEPLAY.md](GAMEPLAY.md) 第五节「原文 → 实现」对照表 | 人工比对馆方原文 |
| `assets/` 任何重出 | [ASSETS.md](ASSETS.md) + `showcase.js` 统计数字（帧数 / 文件数 / 比例） | `node serve-showcase.mjs` |
| `showcase.js` 三张数据表 | [GAMEPLAY.md](GAMEPLAY.md) 中文名 + `index.html` 构造函数比例 | `node --check showcase.js` |
| 事实措辞（文物称谓 / 青铜病 / 作品名） | [GAMEPLAY.md](GAMEPLAY.md) 第五、六节为准，抄本见上一张表 | `python check-markdown-links.py . --fragments` |
| `js/` 或 `assets/` 任何改动 | 版本号走 `node tools/bump-version.mjs --note "说明"`（格式见 [DEPLOY.md](DEPLOY.md) 第四节），别手改 | `node tools/bump-version.mjs --check` |
| 键位、数值、体数这类漂移事实 | 只改 home 一处，其余抄本按上表跟改 | 同上 |

**代码侧回指**：`index.html` 与 `js/` 目前只有文档指过去、没有注释指回来 ——
`WEAPONS`、`buildWaves()`、`Enemy` 构造、`js/guide.js` 的表头都该加一行「口径 → 本文档」。
这条已记在 [../AGENTS.md](../AGENTS.md) 的待办里，属代码 owner 的范围。

| 文件 | 回答什么 | 读者 |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 为什么这么设计、有哪些不能破的约束 | 开发者 |
| [OPERATIONS.md](OPERATIONS.md) | 键位、各页面输入、改键位要同步哪六处 | 开发者 / 测试 |
| [GAMEPLAY.md](GAMEPLAY.md) | 机制、数值、六阵、文物称谓与对照、青铜病知识（唯一口径）、艺术处理边界 | 玩家 / 评审 |
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
- **文物称谓与青铜病措辞以 [GAMEPLAY.md](GAMEPLAY.md) 为唯一口径**，别处只引用不复制：
  文物本体叫「三星堆祭司青铜头像」，游戏角色叫「纵目祭司」或「双刃战士」，
  病害正文一律写「青铜病」（首次标注俗称青铜癌），不混用「青铜癌 / 粉状锈 / 绿锈病」。

## 每篇自带的门牌

| 文件 | 顶部写了「本页是唯一 home」 | 顶部写了「改这里之后要同步」 | 顶部写了「本页被引用」 |
|---|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | ✓ | ✓ | ✓ |
| [OPERATIONS.md](OPERATIONS.md) | ✓ | ✓ | ✓ |
| [GAMEPLAY.md](GAMEPLAY.md) | ✓ | ✓ | ✓ |
| [ASSETS.md](ASSETS.md) | ✓ | ✓ | ✓ |
| [DEPLOY.md](DEPLOY.md) | ✓ | ✓ | ✓ |
| [MOBILE.md](MOBILE.md) | ✓ | ✓ | ✓ |
| [HISTORY.md](HISTORY.md) | ✓（声明「不是 home」） | ✓ | ✓ |
| [PLAN.md](PLAN.md) | ✓（声明「不是 home」） | ✓ | ✓ |
| [ORIGINAL-GAME.md](ORIGINAL-GAME.md) | ✓（声明「不是本作设定」） | —（参考页，无下游） | ✓ |

新建文档时照这三行写门牌再动笔：不写门牌，这个网络就断在它这里。

**不写门牌的三类，是刻意例外，不是漏了**：

- 根 `README.md`（门面）：读者是外部访客，塞维护者布告会毁掉第一屏；它的「去向」只有一行，
  放在「想再往下看」表的最后一行（动手改代码 → `AGENTS.md` ＋本表）。
- `文案包.md` / `操作与录屏说明.md`（对外文案）：要整段粘到站外，门牌会被一起粘走；
  它们改成开头一段「口径以 X 为准 ＋ 本页唯一不是抄本的是哪部分」。
- `showcase.css`（纯样式）：没有可改的事实，只在文件头注明「口径在 `docs/ASSETS.md`」。
