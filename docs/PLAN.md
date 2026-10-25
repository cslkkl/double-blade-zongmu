# 三星堆 · 双刃战士 — 进行中计划与移交

状态：生效（跨会话延续）

## 一句话现状

工作区干净、与 `origin/main` 同步（`ec6a1ae` 开场短片之后）。**2026-10-25 的「清死素材 + 封生成入口」一批已完成但尚未提交**，其余只剩两条待决策与一条人眼对齐工作。

## 上一批已完成（2026-10-25，未提交）

### A. 删无消费方的素材与键（省 293 KB 启动白加载）

| 动作 | 依据 |
|---|---|
| `js/assets.js` 删 `pose1` / `charFront` / `charSide` / `charBack` | 全仓 `IMG.*` 命中 0；`pose0` 是降级底图，保留 |
| 删 `itCowrie` / `itEye` / `iconEye` / `iconMask` / `iconLeiwen` / `iconTree` | 命中 0；`index.html` 的 ICON 表只用 `itJade` / `itBell` / `itJar` / `wpRock` |
| 删 `itRock` | 与 `wpRock` 同路径且命中 0 |
| 删对应 10 个文件（`assets/icons/` 6 张 + `assets/char/` 4 张） | 连图一起删，否则只是「不加载」不是「不占体积」 |
| `Assets.load()` 加同路径去重 | `wpShort` / `wpDagger` 共用同一个 `Image`；`pending` 计不同路径数 |

结果：`MANIFEST` **52 键 / 50 路径 → 41 键 / 40 路径**。

### B. 删 `atk-*` 50 张（1.78 MB）+ 封住会复活的生成入口

`WEAPON_CLIP` 现在 11 把武器全部带 `attack`，`char-rig.js` 的 `draw()` 第一档直接 `return`，旧的 `WEAPON_ATTACK` / `WEAPON_ATTACK_CLIP` 两条通道**永远轮不到** —— 是纯冗余的二重位图降级（项目要求的纯代码降级在 `drawLegacy`，不缺这层）。

| 动作 | 位置 |
|---|---|
| 删 50 张 `assets/anim/atk-*.webp` | — |
| 删 `window.WEAPON_ATTACK` 数据块 | `js/anim-data.js` |
| 删 `window.WEAPON_ATTACK_CLIP` 数据块 | `js/anim-data.js` |
| **渲染函数保留**作挂点 | `char-rig.js` 的 `drawWeaponAtk` / `drawWeaponAtkFrames` 自带 `if (!C) return null`，素材补回来即生效 |
| `slice_weapon_assets.py` 加 `--with-atk`（默认关） | 正常跑会**清掉** `WEAPON_ATTACK` 块且不重建 |
| `slice_weapon_seq.py` 默认整段跳过 | 本脚本只为这条废弃通道存在 |
| `selftest_weapons.mjs` 断言改为「按渠道判定」 | 并新增一条「不许画出 `atk-*` 悬空路径」的防线 |

⚠️ **这是本批最重要的设计**：两个脚本如果照旧跑，1.78 MB 会静默长回来，数据块也复活。所以入口必须默认关，需要显式 `--with-atk`。

### C. `slice_anim_extra.py` 的 `scaleFix` 不再被覆盖

脚本**算不出**正确值 —— 弯腰（`pickup`）与蹲低（`attack-thrust`）的内容高天然更矮，按包围盒反算会把弯腰的人放大到站立高度（踩过的坑：宽高比 2.19 → 1.19）。所以：

- 已存在的 clip：`_existing_scale_fix()` 从文件里**沿用旧值**，手改过的校准不会被重跑冲掉；
- 新增的 clip：写 `1.0` 占位 + 打印醒目警告，必须人眼实测后手改；
- 无论哪种，都打印「按包围盒反算」的数字（`estimate_scale_fix`）供对照，**不落盘**。

手改过的三个值（0.914 / 0.867 / 0.754）现在重跑也保得住。

### D. 文档同步

`AGENTS.md`（待办划掉 4 条、素材预算与规模重算、新增验证快照）、`tools/README.md`（三个脚本条目 + 影响面路由表）、`js/README.md`（assets.js 与 char-rig 契约）、`docs/PLAN.md`（本文）。

## 验证快照（本批实测）

- `node tools/check-inline.mjs`：通过，内联脚本 142602 字符。
- `node tools/selftest_enemies.mjs` / `selftest_audio.mjs` / `selftest_weapons.mjs`：全 0 失败。
- `Get-ChildItem js | node --check`：12/12 通过；4 个改过的 `.py` 全部 `ast.parse` 通过。
- `check-markdown-links.py . --fragments`：30 文件 / 78 链接 / 0 错 / 0 警告。
- 素材：`assets/` 330 文件 21.55 MB → **270 文件 19.48 MB**；剔音视频 10.24 → **8.17 MB**。
- 浏览器实测（`file://` 直开，Playwright）：**41/41 图 ready、控制台 0 报错 0 警告**；运行时逐帧抓 `drawImage` 确认 —— 挥砍走 `attack-short-0..3`、走路 `walk-short-1/2`、跳跃 `jump-short-0/1`、受击 `hurt-short`、拾取 `pickup-short`，**`atk-*` 命中 0 次**。截图确认画面完整无白屏。
- 换行符：改过的 4 个文件曾写成纯 LF，导致 `git diff` 把 9 增 67 删显示成 316/374 —— 已统一回 CRLF（`core.autocrlf=true`），diff 恢复真实。
- 版本号 `20261025j` → `k`（12 处 script 标签）。

## 待决策项（不要自己拍）

1. **阴影口径** —— 道具与遮挡物已全去掉落地阴影，但**角色**（`js/char-rig.js` 的 `drawShadow`，8 处调用）**和敌人**（`js/enemies-assets.js:144`，1 处）都还在投阴影。要不要统一？（旧记录说「角色是唯一还在投阴影的实体」，那句已经不准了。）
2. **祭旗 / 编钟的位置** —— 现只在 `js/background.js` 的 `PROPS` 里按 `h: 196 / 144` 这类小尺寸排布。若想要「高大前景物」的观感，得换素材或调 `h`，不是改代码。
3. **换手落点** —— 现用 `p.x - p.facing*96` 硬编码（`index.html` 两处）。是否要与 `dropWeapon()` 的落点公式统一、或给「落地时轻微弹一下」，需拍板。
4. **单手一把是否要保底** —— 现在换手是「新的上手、旧的落地」，玩家可能捡到更差的武器而不自知。是否要在拾取前比 `dmg × dur` 提示「更差 / 更好」，需拍板。

## 待办：需要人眼的工作

- **物品图标长边占比 0.41~0.65 ≠ `prep_icons.py` 设定的 0.84**（说明现存 `it-*.webp` 是更早版本脚本的产物，从没按当前参数重跑过）。重跑一次可对齐，但**跑完必须人眼确认四个物品的相对大小**（`it-rock` 只有 79×79，是四张里最小的）。武器（0.86）与界面（0.88）两组本来就是对的。
- **武器帧 `anchorX` 仍有 13 个状态屏幕抖动 > 16px**（最大 92.7px，铃 `attack`）。`python tools/align_apply.py --report` 查现状；改法只有开 `tools/align_weapon_frames.html` 人眼拖 → 导出 JSON → `align_apply.py` 回填。
- **持械行走画风与原画有差距**：新素材是 AI 重出的青铜面具武士，描边更粗、配色更平。要统一就得连 `hold-*` 一起重出。

## 待办：记录在案、暂不动

- `FX.drawHudPanel` 无调用方（`FX.drawWhirl` 已接进 `drawWhirlAsset`）。
- `docs/修改方案汇总.md`「值得做」里还剩：中景与地面的镜像接缝（`WORLD_W` 不是整数倍）、敌人血条锚在头顶、`update()` 每帧 3 次数组分配。
- `docs/部署与手机端.md` 的功能表有两条「❌ 未做」：**「横屏锁定 ❌」是文档过期**（`js/touch.js:677` 的 `lockLandscape()` 早实现了，X5 私有 meta 也在），该改 ✅；「双击连发 ❌」是特性缺口，不是 bug。
- 14 条真机验收清单未勾，本质是「需要真手机」，不是代码待办。

## 边界条件与异常处理

- **`slice_anim.py` 会清空 `assets/anim/` 全部 `.webp`** —— 下次跑切片脚本前必须先提交，否则丢帧。
- **`启动游戏.bat` 必须存 GBK** —— 任何编辑器重存成 UTF-8 会让 `if` 块崩掉（曾表现为 `'宽到' is not recognized`）。改完必须按 936 解码验一遍。
- **`atk-*` 这条通道已废弃，别随手打开** —— `slice_weapon_assets.py --with-atk` 与 `slice_weapon_seq.py --with-atk` 会复活 1.78 MB。要恢复得同时确认 `selftest_weapons.mjs` 里 `ATKC` 相关断言重新生效。
- **删素材必须同时封生成入口** —— 本批踩到两次：`prep_icons.py` 会重出 `it-cowrie` / `it-eye` / `icon-*`，`slice_weapon_*` 会重出 `atk-*`。删了图不改脚本，下次跑流水线就回来了。
- **前景遮挡层已删除，别再往回加** —— 2026-10-25 删掉了 `drawFront()` / `occluders()` 与 52% 硬淡出。要加「角色被挡住」的效果，先解决两个旧毛病：淡出必须有过渡（不能瞬间跳变）、判定必须同时看 x 与高度（不能站旁边就淡）。
- **改 `enemies-assets.js` 必跑 `selftest_enemies`**；改任何 `js/` 必跑 `check-inline`。
- **不要用非方形 `size` 生图** —— 会被硬拉变形；横竖版只用 `ratio`。
- **换手落点与拾取半径的关系不能随手调** —— 96 > 90（`PICK_RANGE.x`）是刻意错开的；改成 ≤ 90 会导致刚放下的旧武器被同一帧抢回。

## 下一步

1. 本批变更先提交（一次提交，含素材删除与脚本开关），再动别的。
2. 待决策项拍板后各自单开一次改动，别合进同一批。
3. 乙线（半月斩朝向）已完成并归档，不要再往 `js/fx.js` 加朝向逻辑 —— 判据只有 `ART_CONVEX` + `slashMirror()` 一处。

## 移交文本（可原样转发给新 agent）

```
项目：C:\Users\11965\Desktop\三星堆 —— 单页横版双人清版动作游戏，零依赖，file:// 双击可跑。

当前状态：主线（背包改单手 / 去阴影 / 启动器）与乙线（半月斩朝向）都已落地并推送。
2026-10-25 又做了「清死素材」一批（未提交）：删 11 个无消费方的键与对应文件、
删 atk-* 50 张 + 两个废弃数据块、封住会复活它们的三个生成脚本入口、
slice_anim_extra.py 的 scaleFix 改为「沿用旧值不覆盖」。
素材 21.55 → 19.48 MB（剔音视频 8.17 MB）；MANIFEST 41 键 / 40 路径。
四项自检全绿，浏览器 file:// 实测 41/41 图 ready、0 报错、atk-* 零命中。

维护者的核心要求（三条，缺一条就算没做完）：
1. 禁 CDN / npm / 外部字体 / ES module —— file:// 下会被 CORS 拦，所有模块必须是 IIFE + window.*。
2. 位图只管好看，判定只用数字 —— 改绘制不许动碰撞盒。
3. 每层素材必须有纯代码降级 —— 任何缺图都不许白屏。

边界条件（关键硬约束）：
1. 启动游戏.bat 必须存 ANSI/GBK 且第二行 chcp 936。
2. 跑 tools/slice_anim.py 前必须先提交 —— 它会清空 assets/anim/ 全部 .webp。
3. 换手落点 p.x - p.facing*96 必须大于拾取判定 PICK_RANGE.x = 90。
4. 删任何素材都要同步封住会重新生成它的脚本，否则下次跑流水线就复活。
5. atk-* 通道已废弃，别随手加 --with-atk。

动手前先读：AGENTS.md（仪表盘与活跃坑）、docs/ARCHITECTURE.md（不变的设计决策）、
docs/PLAN.md（本文）、js/AGENTS.md 与 tools/AGENTS.md（子目录规则）。
不确定的事停下来问维护者，不要猜。
```

## 并行的另一条线

- 半月斩朝左时特效反了的修复：**已完成并归档**，见 [移交-半月斩朝向.md](移交-半月斩朝向.md)。
- 定案是「凸背朝人面向的方向」，落在 `js/fx.js` 的 `ART_CONVEX` + `slashMirror()`；
  回归防线在 `tools/selftest_weapons.mjs` 的 5b / 5c 两节。
