# js/ — 文件索引

7 个文件，全部是 IIFE，只往 `window.*` 挂一个对象。
设计理由见 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)；本目录规则见 [AGENTS.md](AGENTS.md)。

加载顺序固定：`assets → anim-data → background → char-rig → enemies-assets → fx`，`ui-shell` 随后。
顺序写死在 `index.html` 底部，改顺序会破坏依赖方向。

---

## assets.js

- 职责：清单式预加载 24 张静态图到 `window.IMG`，失败不阻塞启动。
- 关键导出：`window.Assets = { load, MANIFEST }`，`load()` 返回 `Promise<{loaded, failed}>`。
- 依赖谁：只用浏览器 `Image`，不依赖任何本地模块。
- 被谁依赖：`background.js`、`fx.js`、`enemies-assets.js` 读 `window.IMG`；`char-rig.js` 降级读 `IMG.pose0`；`index.html` 启动时调 `load()` 并只打印结果。
- 关键约束：`MANIFEST` 只收静态图；逐帧动画的帧图由 `anim-data.js` 自己列，不在这里。
- 关键约束：`bgFg`（`assets/bg-fg.webp`，16:9 整图前景）已从清单移除，前景遮挡改由 `background.js` 的 `drawFront()` 用道具素材在世界坐标排布；该 webp 文件保留在 `assets/` 里备回滚，不参与加载。
- 改后必测：新增键必须同时确认消费方读得到；删键前 grep 全仓确认无人引用。

## anim-data.js

- 职责：纯数据。`window.ANIM`（玩家 9 动作 32 帧）+ `window.ENEMY_ANIM`（敌人 4 类 14 帧）。
- 关键字段：`frames / fps / loop / w / h / anchorX / footY / scaleFix / files`。
- 依赖谁：无。
- 被谁依赖：`char-rig.js` 读 `ANIM`，`enemies-assets.js` 读 `ENEMY_ANIM`。
- 关键约束：这是生成物。手改会被下次跑脚本覆盖；`scaleFix` 是校正值不是设计值。
- 改后必测：`node --check js/anim-data.js`，再跑 `node tools/selftest_enemies.mjs`。

## background.js

- 职责：多层视差背景（远景 / 天光 / 雾 / 中景 / 道具 / 地面 / 地面线 / 前景 / 暗角）。
- 关键导出：`window.Background = { draw(ctx, camX, W, H, groundY, worldW) → bool, drawFront(...) → bool, occluders() → [{x,w,top}], ready() → bool }`。
  `draw()` / `drawFront()` 返回 `false` = 一像素都没画，调用方必须补 `drawBG()`；`ready()` 对 `CORE_KEYS`（远景 / 中景 / 地面）判 `complete && naturalWidth > 0`，加载失败与加载中都为假。
- 依赖谁：`window.IMG` 的 3 张核心背景 + 7 个道具键 + 前景遮挡素材。
- 被谁依赖：`index.html` 的 `render()`；`ready()` 为假或 `draw()` 返回 `false` 时回落到内联 `drawBG()`。
- 关键约束：只在屏幕坐标系算偏移，不做世界坐标平移；道具世界坐标写在模块内 `PROPS`；`save/restore` 必须成对；道具与前景遮挡物加载失败不阻塞背景整体，各自逐张回落纯代码。
- 改后必测：四档视差系数、道具底部是否贴 `GROUND`、`ready()` 对新键的判定、核心图任一失败时是否整层让位给 `drawBG()`。

## char-rig.js

- 职责：玩家逐帧播放器 + 两级降级。
- 关键导出：`window.CharArt = { draw(ctx, p, t), ready(), HEIGHT: 252 }`。
- 依赖谁：`window.ANIM`、`window.IMG.pose0`（降级）。
- 被谁依赖：`index.html` 的 `drawPlayer()`；`ready()` 为假则回落到内联 `drawFighter()`。
- 关键约束：`pickClip()` 的状态优先级不能乱；`attack` 帧号必须由 `swingT / swingDur` 推导；`tint` 与 `frameCache` 只在预热与首次用时建。
- 关键约束：可选字段 `p.__alphaMul`（缺省 1）是前景遮挡淡出的通道 —— 本模块会绝对赋值 `globalAlpha`，外层包一层无效，因子必须在这里乘进 `alpha`；`index.html` 的 `drawPlayer()` 设置后要立刻复位成 1。
- 改后必测：`pickClip` 九种状态的映射、`attack` 与判定同步、帧图缺失时是否落到 `pose0` 再到纯代码、`__alphaMul` 在帧图与降级两条路径上都生效。

## enemies-assets.js

- 职责：四类敌人的帧图绘制 + 完整纯代码降级实现（面具、陶罐、青铜戈、青铜钺、光环）。
- 关键导出：`window.EnemyArt = { draw(ctx, e, t), ready() }`。
- 依赖谁：`window.ENEMY_ANIM`、`window.IMG`（`maskRelief / potteryJar / brazier / jadeTablet / bellCluster / ivoryTusk`）。
- 被谁依赖：`index.html` 的 `render()`；`ready()` 为假则回落内联 `drawEnemy()`（仅第一版遗留路径）。
- 关键约束：BOSS 血条 `artTop` 用帧图时要抬到 `1.6 × h`；`hurt / dead` 定格用「上一帧」；`boss` 目标高是 `1.6 × e.h`，其余是 `e.h`。
- 改后必测：`node tools/selftest_enemies.mjs`，它会校验对齐、帧号、血条位置、缓存有界、降级不抛异常。

## fx.js

- 职责：刀光、打击火花、旋风环、HUD 底板、受伤渐晕。
- 关键导出：`window.FX = { drawSlash, drawHit, drawWhirl, drawHudPanel, drawHurtVignette, ready }`。
- 依赖谁：`window.IMG`（`slash1..3`、`hit1..3`、`whirlRing`、`jadeTablet`）。
- 被谁依赖：`index.html` 的刀光、火花、渐晕三处；`drawWhirl` 与 `drawHudPanel` 目前无调用方。
- 关键约束：`ready()` 只判 `slash1..3` 与 `jadeTablet`，新增依赖要同步；图没就绪必须走纯代码弧形光。
- 改后必测：`ready()` 名单与图形依赖一致；三段刀光/三档火花的档位映射（`seg` / `big` / `mid`）。

## ui-shell.js

- 职责：DOM 覆盖层三块 —— 单双人模式选择、按键说明抽屉、拾取气泡。
- 关键导出：`mountModeSelect / showModeSelect / hideModeSelect / mountKeyHelp / toggleKeyHelp / isKeyHelpOpen / showPickupHint / clearPickupHint`。
- 依赖谁：`document` 与 `#stage`（存在则挂进 stage，用设计像素；否则挂 body 用视口像素）。
- 被谁依赖：`index.html` 的 `openModeSelect()`、`mountKeyHelp()`、`showPickupHint()`、`clearPickupHint()`。
- 关键约束：键盘监听只读，不 `preventDefault`、不抢焦点；自己处理 `1 / 2 / H / Esc`；`solo` 模式 HUD 靠 `body.solo` 隐藏玩家二血条。
- 改后必测：模式选择回调是否把 `solo / duo` 传进 `startGame`；气泡坐标是否夹在画面内；`H` `Esc` 开关不吞游戏按键。

---

## 变更影响路由

| 改动位置 | 必须同步检查 |
|---|---|
| `anim-data.js` | `char-rig` 的 `CLIPS`、`enemies-assets` 的 `KINDS`、`scaleFix` 是否仍需校正 |
| `assets.js` | `background` 的 `PROPS`/`CORE_KEYS`/`PROP_KEYS`、`fx` 的 `ready()` 名单、`char-rig` 的 `pose0` 降级 |
| `background.js` | `index.html` 的 `Background.ready()` 守卫、`drawFront()` 的调用位置（必须在角色之后）、内联 `drawBG()` 兜底常量、`OCCLUDERS` 的 `w/h` 是否仍与素材比例配准 |
| `char-rig.js` | `index.html` 的 `drawPlayer()` 守卫、`__alphaMul` 是否仍被乘进 `alpha`、`Player` 字段（`swingT / swingDur / throwT / whirlT / hurtT / onGround`）是否改名 |
| `enemies-assets.js` | 跑 `selftest_enemies.mjs`；`Enemy` 的 `kind / scale / w / h / maxHp / state` 字段是否改名 |
| `fx.js` | `index.html` 三处 `FX.*` 调用与 `FX.ready()` 守卫 |
| `ui-shell.js` | `index.html` 四个调用点、`body.solo` 样式、`UIShell` 未加载时的降级分支 |
| 任意模块 | 跑 `node tools/check-inline.mjs` 与 `node tools/selftest_enemies.mjs` |

契约变更（导出签名、字段名、`window.*` 名字）必须同一次改动内更新本页与 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
