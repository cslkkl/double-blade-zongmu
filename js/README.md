# js/ — 文件索引

8 个文件，全部是 IIFE，只往 `window.*` 挂一个对象。
设计理由见 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)；本目录规则见 [AGENTS.md](AGENTS.md)。

加载顺序固定：`assets → anim-data → background → char-rig → enemies-assets → fx`，`ui-shell` 随后，`audio` 最后（它要被内联脚本的音效壳捕获成 `window.SND`）。
顺序写死在 `index.html` 底部，改顺序会破坏依赖方向。

---

## assets.js

- 职责：清单式预加载 48 个键的静态图到 `window.IMG`，失败不阻塞启动。
- 关键导出：`window.Assets = { load, MANIFEST }`，`load()` 返回 `Promise<{loaded, failed}>`。
- 依赖谁：只用浏览器 `Image`，不依赖任何本地模块。
- 被谁依赖：`background.js`、`fx.js`、`enemies-assets.js` 读 `window.IMG`；`char-rig.js` 降级读 `IMG.pose0`；`index.html` 读图标键、宝箱 / 机关 / 拾取物键，启动时调 `load()` 并只打印结果。
- 关键约束：`MANIFEST` 只收静态图；逐帧动画的帧图由 `anim-data.js` 自己列，不在这里。
- 关键约束：`bgFg`（`assets/bg-fg.webp`，16:9 整图前景）已从清单移除，前景遮挡改由 `background.js` 的 `drawFront()` 用道具素材在世界坐标排布；该 webp 文件保留在 `assets/` 里备回滚，不参与加载。
- 键名规则（新增键必须照此归族，否则查不到也删不干净）：
  - `wp*` — 武器图标，`assets/icons/wp-*.webp`，画布 256。
  - `it*` — 物品图标，`assets/icons/it-*.webp`，画布 192。
  - `icon*` — 界面图标，`assets/icons/icon-*.webp`，画布 128。
  - `pickup*` — 世界里的拾取物实体，`assets/interact/pickup-*.webp`。
  - `chest*` / `mechanism*` — 宝箱与机关的双态图，`assets/interact/`。
- 改后必测：新增键必须同时确认消费方读得到；删键前 grep 全仓确认无人引用。

## anim-data.js

- 职责：纯数据。`window.ANIM`（玩家 12 动作 43 帧）+ `window.ENEMY_ANIM`（敌人 4 类 14 帧）。
- 关键字段：`frames / fps / loop / w / h / anchorX / footY / scaleFix / files`。
- 依赖谁：无。
- 被谁依赖：`char-rig.js` 读 `ANIM`，`enemies-assets.js` 读 `ENEMY_ANIM`。
- 关键约束：这是生成物。手改会被下次跑脚本覆盖；`scaleFix` 是校正值不是设计值，必须按内容高反算，不能填 1.0。
- 改后必测：`node --check js/anim-data.js`，再跑 `node tools/selftest_enemies.mjs`。

### 12 个角色 clip

| clip | 帧数 | fps | 循环 | 画布 | scaleFix | 触发 |
|---|---|---|---|---|---|---|
| `idle` | 4 | 6 | 是 | 560×498 | 1.00 | 站立 |
| `walk` | 6 | 12 | 是 | 560×498 | 1.49 | `\|vx\| > 60` |
| `attack` | 4 | 16 | 否 | 560×498 | 1.16 | 剑 / 空手挥砍 |
| `attack-heavy` | 4 | 14 | 否 | 421×560 | 0.867 | 斧 / 锤 |
| `attack-thrust` | 4 | 16 | 否 | 498×403 | 0.754 | 叉 / 匕 / 璋 |
| `jump` | 3 | 10 | 否 | 560×498 | 0.96 | 离地 |
| `hurt` | 2 | 14 | 否 | 560×498 | 0.78 | 受击 |
| `whirl` | 4 | 18 | 是 | 560×498 | 1.27 | 旋风斩 |
| `throw` | 3 | 14 | 否 | 560×498 | 0.94 | 投掷物出手 |
| `bow` | 3 | 12 | 否 | 560×498 | 0.85 | 拉弓 |
| `pickup` | 3 | 10 | 否 | 459×560 | 0.914 | `pickupT > 0` |
| `dead` | 3 | 8 | 否 | 560×498 | 1.04 | 阵亡 |

- 前 9 个由 `tools/slice_anim.py` 重建，后 3 个由 `tools/slice_anim_extra.py` 插入同一份数据文件。

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
- 关键约束：`pickClip()` 的状态优先级不能乱（`dead → whirl → bow/throw → hurt → pickup → jump → attack 族 → walk → idle`）；攻击族三个 clip 的帧号都由 `swingT / swingDur` 推导，不按 fps 自由播放；`tint` 与 `frameCache` 只在预热与首次用时建。
- 关键约束：`CLIPS` 预热名单是 12 个 clip，新增动作必须同时加进这份名单，否则首帧会闪一下降级画面。
- 关键约束：可选字段 `p.pickupT`（缺省 0）大于 0 时播 `pickup`，调用方置 0.3 秒后自己倒数。
- 关键约束：可选字段 `p.__forceClip`（缺省 `null`）是攻击态里的替代 clip 名，只在 `swingT > 0` 时读；且只认 `ANIM` 里真实存在的 clip，不存在则回落 `attack`。调用方收招即清空，别让下一次非攻击状态读到旧值。
- 关键约束：可选字段 `p.__alphaMul`（缺省 1）是前景遮挡淡出的通道 —— 本模块会绝对赋值 `globalAlpha`，外层包一层无效，因子必须在这里乘进 `alpha`；`index.html` 的 `drawPlayer()` 设置后要立刻复位成 1。
- 改后必测：`pickClip` 十二种状态的映射、三个攻击 clip 与判定同步、帧图缺失时是否落到 `pose0` 再到纯代码、`__alphaMul` 在帧图与降级两条路径上都生效、各 clip 屏幕身高是否仍落在 178~181px。

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

## audio.js

- 职责：全部声音。总线（`sfx / music / amb` → 压缩器 → 主增益）、材质打击音、程序化 BGM 三层（drone / 节奏 / 氛围）。
- 关键导出：`window.SND = { ctx, voice, tone, noise, swing, hit, impact, jump, hurt, die, pickup, chest, breakWeapon, explode, wave, win, lose, matOf, setMaterial, bgm{start,stop,setWave,breathe,tier,isOn,isBreathe}, mute, isMuted, volume, suspend, resume }`。
- 依赖谁：只依赖浏览器 `AudioContext`。**不读任何音频文件** —— `file://` 下 `fetch` / `XHR` 会被 CORS 拦，所以全部实时合成，也因此天然不含版权素材。
- 被谁依赖：`index.html` 的音效转发壳（`tone / noise / sfx*` 共 9 个出口）。全文件几十个调用点经由这些壳进入本模块，改本模块等于改全场声音。
- 关键约束：打击音分三层（瞬态 + 材质主体 + 低频尾），低频尾长度由 `G.hitstop` 驱动，让「顿帧多久、尾巴多久」对齐。
- 关键约束：**必须有复音节流与随机化**。同帧十来个敌人受击若线性叠加必削波；同频同相叠加会让响度忽大忽小。`gate()` 管节流，`jit()` 管音高/时长抖动。
- 关键约束：材质映射在 `MATERIAL` 表（武器 key → `metal / jade / heavy / clay / bell / flesh / string`）。青铜靠**非整数泛音比**（1 : 2.37 : 3.71）才有金属感，整数比会听成音叉；玉与骨不共振，要钝而干。
- 关键约束：BGM 的喘息压音必须走 `bgm.breathe` 标志，在 `bgmTick` 里统一结算。直接改总线增益会被下一帧 tick 覆盖回满。
- 关键约束：`file://` 自动播放策略要求一次用户手势，`armFirstGesture()` 负责解锁；`M` 键静音；`visibilitychange` 切后台自动挂起。
- 改后必测：`node tools/selftest_audio.mjs`（mock Web Audio，不开浏览器），覆盖材质发声、复音节流、BGM 起停与档位、无 `AudioContext` 时安全空转。

---

## 变更影响路由

| 改动位置 | 必须同步检查 |
|---|---|
| `anim-data.js` | `char-rig` 的 `CLIPS`、`enemies-assets` 的 `KINDS`、`scaleFix` 是否仍按内容高反算、各 clip 屏幕身高是否仍在 178~181px |
| `assets.js` | `background` 的 `PROPS`/`CORE_KEYS`/`PROP_KEYS`、`fx` 的 `ready()` 名单、`char-rig` 的 `pose0` 降级、`index.html` 的 `WP_ICON` 与宝箱 / 机关 / 拾取物键名 |
| `background.js` | `index.html` 的 `Background.ready()` 守卫、`drawFront()` 的调用位置（必须在角色之后）、内联 `drawBG()` 兜底常量、`OCCLUDERS` 的 `w/h` 是否仍与素材比例配准 |
| `char-rig.js` | `index.html` 的 `drawPlayer()` 守卫、`__alphaMul` 是否仍被乘进 `alpha`、`__forceClip` 是否仍在收招时清空、`Player` 字段（`swingT / swingDur / throwT / whirlT / hurtT / pickupT / onGround`）是否改名 |
| `enemies-assets.js` | 跑 `selftest_enemies.mjs`；`Enemy` 的 `kind / scale / w / h / maxHp / state` 字段是否改名 |
| `fx.js` | `index.html` 三处 `FX.*` 调用与 `FX.ready()` 守卫 |
| `ui-shell.js` | `index.html` 四个调用点、`body.solo` 样式、`UIShell` 未加载时的降级分支 |
| `audio.js` | `index.html` 的 9 个转发壳是否仍一一对应；新增武器要在 `MATERIAL` 表里给材质，否则一律落到 `jade`；跑 `selftest_audio.mjs` |
| 任意模块 | 跑 `node tools/check-inline.mjs` 与 `node tools/selftest_enemies.mjs` |

契约变更（导出签名、字段名、`window.*` 名字）必须同一次改动内更新本页与 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
