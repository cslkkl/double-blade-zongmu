# 三星堆 · 双刃战士 — 进行中计划与移交

状态：生效（跨会话延续）

## 一句话现状

本次代码改动已全部落盘、四项自检全绿、文档已全部同步（含链接校验）；**工作区未提交**。
两条线并行：主线（背包改单手 / 去阴影 / 启动器）可提交，乙线（半月斩朝向）待决策、无工作区改动。

## 本次改动范围（已完成，未提交）

### 主题一：背包四格 → 单手一把（本次主线）

| 文件 | 内容 |
|---|---|
| `index.html` | 删 4 格背包全部实现：`BAG_SIZE` / `buildBags` / `syncBag` / `bagCycle` / `bagFirstEmpty` / `bagHasKey` / `stowWeapon` / `equipBagSlot` / `bagSigOf` / `drawBagSlot` / `bagDuraRatio` / `bagDom` / `BAG_CV_S` / `.bag` 与 `.slot` CSS / `#bag1` `#bag2` DOM |
| `index.html` | `Player` 删 `this.bag` / `this.bagIdx`，只留 `this.weapon` |
| `index.html` | `tryPickup()` 改换手：手上有武器时旧那把落回 `p.x - p.facing*96`（与 80px 判定半径错开，避免刚放下又抢回）；飘字分「上手 ·」/「换手 ·」 |
| `index.html` | `pickResidue()` 同步改换手；`bagDrop()` 只丢手上（空手只飘字）；`bagGive()` 改两人对换 |
| `index.html` | 新增 `holdsWeapon(p)`；`hasWeaponKey()` 收窄为「手上就是同款」 |
| `index.html` | `readPad()` 删 `bagPrev` / `bagNext`（LB/RB 不再读）；`updatePlayer()` 背包动作段重写为只处理 `drop` / `give`；`update()` 的 `in1` / `in2` 删 `bagNext` / `bagPrev` |
| `index.html` | `startGame()` 键位表删 `bag:["KeyQ"]` / `bagPrev:["Tab"]`（P1）与 `bag:[","]` / `bagPrev:["\\"]`（P2） |
| `index.html` | `KEY_LABEL` / `PAD_LABEL` 删 `bag` / `bagPrev` 两项 |
| `index.html` | 界面文案四处同步：标题页键盘两列、标题页手柄列、`#keysKbd`、`#keysPad`、`#pad`、手柄连接提示条 —— 全部由「拾取/开箱 + 换格」改为「拾取/换手」，删 `Q` / `Tab` / `,` / `\` / `LB/RB` |
| `index.html` | 底部调用删 `buildBags()` |
| `js/ui-shell.js` | `KEY_ROWS` 删「换武器格 →」与「换武器格 ←」两行；`PAD_ROWS` 删「换武器格」行；`TIPS` 首条改单手 |
| `js/char-rig.js` | `drawHold` 注释里的 `equipBagSlot / stowWeapon` 改为现存换手入口 |
| `tools/selftest_weapons.mjs` | `player()` 夹具删 `bag: []` / `bagIdx: 0` |

### 主题二：去阴影与前景遮挡精简（上一轮，同样未提交）

| 文件 | 内容 |
|---|---|
| `js/background.js` | 删 `shadowSprite()` 整套离屏阴影；`drawProps()` 与 `drawOccluder()` 不再画落地阴影；`drawOccluder()` 去掉底部压暗渐变 |
| `js/background.js` | `OCCLUDERS` 由 5 座降到 3 座（`maskRelief` / `brazier` / `sacredTree`），祭旗 `banner` 与编钟 `bellCluster` 只留中景 `PROPS` |
| `启动游戏.bat` | 重写为双击走系统默认浏览器；存 GBK，第二行 `chcp 936` |

`js/fx.js` 的刀光弧心改动**已回滚到 HEAD**，工作区无该文件改动；该线单独记在 [移交-半月斩朝向.md](移交-半月斩朝向.md)。

### 主题三：文档同步（本次已完成）

| 文件 | 改动 |
|---|---|
| `README.md` | 键盘表：删「切换背包格」行，「拾取 / 开箱」改「拾取 / 换手」，「丢弃当前格」改「丢弃手上武器」 |
| `README.md` | 手柄表：删「换武器格 LB/RB」行，「拾取 / 开箱」改「拾取 / 换手」 |
| `README.md` | 机制段「四格背包」整段改写为「单手一把」，含换手 / 丢弃 / 递队友 / 同款不叠四条 |
| `docs/ARCHITECTURE.md` | 等比缩清单删「背包格 26px」 |
| `docs/ARCHITECTURE.md` | 整节 `## 背包与武器分离` 改写为 `## 武器持有是单手一把`，含不设背包的理由 |
| `docs/ARCHITECTURE.md` | 「拾取即上手」一条按换手语义重写 |
| `docs/ARCHITECTURE.md` | 输入集合删 `bag / bagPrev`，并把「背包与拾取」改为「拾取与武器动作」 |
| `js/README.md` | 键位表缺口说明：背包 `Q / E / R` → 拾取 `G / ;` 与武器动作 `E / R` 已补齐 |
| `操作与录屏说明.md` | 手柄表删「换武器格 LB/RB」行，「拾取 / 开箱」改「拾取 / 换手」 |
| `README.md` | 前景遮挡「五处高物」改「三处高物」，补祭旗 / 编钟只作中景一句 |

## 验证快照（本次实测，2026-10-24）

- `node tools/check-inline.mjs`：通过，内联脚本 117352 字符。
- `node tools/selftest_enemies.mjs`：0 失败。
- `node tools/selftest_audio.mjs`：0 失败。
- `node tools/selftest_weapons.mjs`：0 失败。
- `Get-ChildItem js -Filter *.js | node --check`：8/8 通过。
- 残留检索：`bagCycle` / `bagFirstEmpty` / `stowWeapon` / `equipBagSlot` / `BAG_SIZE` / `bagHasKey` / `buildBags` / `bagDom` / `bagNext` / `bagPrev` / `bagIdx` / `p.bag` 在 `index.html` 与 `js/*.js` 全零命中。
- 规模：`index.html` 3701 行 / 147762 字节（改动前 3919 行 / 156693 字节）。
- `check-markdown-links.py . --fragments`：23 个文件 / 70 链接 / 0 错误 / 0 警告。

## 待办：无文档欠账

文档网络已与代码一致。剩余只有「待决策项」与「提交」。

## 待决策项（不要自己拍）

1. **阴影口径** —— 道具与遮挡物已全去掉落地阴影，角色 `drawShadow()`（`js/char-rig.js`）仍在。要不要统一？角色是唯一还在投阴影的实体，会与背景读起来不一致。
2. **祭旗 / 编钟的位置** —— 现只在 `PROPS` 里按 `h: 196/144` 这类小尺寸排布。若想要「高大前景物」的观感，得换素材或调 `h`，不是改代码。
3. **换手落点** —— 现用 `p.x - p.facing*96` 硬编码。是否要与 `dropWeapon()` 的落点公式统一、或给「落地时轻微弹一下」，需拍板。
4. **单手一把是否要保底** —— 现在换手是「新的上手、旧的落地」，玩家可能捡到更差的武器而不自知。是否要在拾取前比 `dmg × dur` 提示「更差 / 更好」，需拍板。

## 边界条件与异常处理

- **`slice_anim.py` 会清空 `assets/anim/` 全部 `.webp`** —— 本次未动帧数据，但下次跑切片脚本前必须先提交，否则丢帧。
- **`启动游戏.bat` 必须存 GBK** —— 任何编辑器重存成 UTF-8 会让 `if` 块崩掉（曾表现为 `'宽到' is not recognized`）。改完必须按 936 解码验一遍。
- **`drawFront()` 调用位置不可动** —— 必须在角色、刀光、粒子全部落屏之后，否则遮挡变成垫背。
- **改 `enemies-assets.js` 必跑 `selftest_enemies`**；改任何 `js/` 必跑 `check-inline`。
- **不要用非方形 `size` 生图** —— 会被硬拉变形；横竖版只用 `ratio`。
- **换手落点与拾取半径的关系不能随手调** —— 96 > 80 是刻意错开的；改成 ≤ 80 会导致刚放下的旧武器被同一帧抢回。

## 下一步

1. 提交，建议拆三个 commit：
   - `fix(render): 去掉道具与遮挡物的落地阴影，前景遮挡降到三座`
   - `feat(pickup): 背包四格改单手换手`
   - `chore(launcher): 启动器改默认浏览器`
2. 待决策项拍板后再动手。

## 移交文本（可原样转发给新 agent）

```
项目：C:\Users\11965\Desktop\三星堆 —— 单页横版双人清版动作游戏，零依赖，file:// 双击可跑。

当前状态：主线代码改动（背包改单手 / 去阴影 / 启动器）已全部落盘，四项自检全绿；
文档已同步到 README / ARCHITECTURE / js README / 操作与录屏说明，链接校验 0 错误；
工作区未提交（11 个已改文件 + 3 个新增文件）。
乙线（半月斩朝向）卡在待决策，js/fx.js 已回滚到 HEAD，工作区无该线改动。
详细清单与行号见 docs\PLAN.md。

维护者的核心要求（三条，缺一条就算没做完）：
1. 禁 CDN / npm / 外部字体 / ES module —— file:// 下会被 CORS 拦，所有模块必须是 IIFE + window.*。
2. 位图只管好看，判定只用数字 —— 改绘制不许动碰撞盒。
3. 每层素材必须有纯代码降级 —— 任何缺图都不许白屏。

边界条件（三条硬约束）：
1. 启动游戏.bat 必须存 ANSI/GBK 且第二行 chcp 936；存 UTF-8 会被 cmd 按 936 误解码、if 块崩掉。
2. 跑 tools/slice_anim.py 前必须先提交 —— 它会清空 assets/anim/ 全部 .webp。
3. 换手落点 p.x - p.facing*96 必须大于拾取判定半径 80，否则刚放下就被抢回。

动手前先读：AGENTS.md（仪表盘与活跃坑）、docs/ARCHITECTURE.md（不变的设计决策）、
js/AGENTS.md 与 tools/AGENTS.md（子目录规则）。
不确定的事停下来问维护者，不要猜。
```

## 并行的另一条线

- 半月斩朝左时特效反了的修复，单独记在 [移交-半月斩朝向.md](移交-半月斩朝向.md)。
- 该线只碰 `js/fx.js`，与本文各节的提交批次分开挑文件，不要 `git add -A`。
- 该线当前未解决、卡在待决策项，`js/fx.js` 已回滚到 HEAD，工作区无该线改动。

