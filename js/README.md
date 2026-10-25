# js/ — 文件索引

12 个文件，全部是 IIFE，只往 `window.*` 挂一个对象。
设计理由见 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)；本目录规则见 [AGENTS.md](AGENTS.md)。

加载顺序固定：`assets → anim-data → background → char-rig → enemies-assets → fx → guide → rumble → touch → ui-shell → audio → intro-video`。
`guide` 必须在 `ui-shell` 之前：说明抽屉靠 `Guide.renderInto()` 画操作图。
`rumble` 必须在 `guide` 之后：手柄列表现读 `Guide.pads()`（与 `readPad` 同源），缺席 Guide 就全部 no-op。
`touch` 必须在 `guide` 之后：设备档判定要读 `Guide.padCount()`（插了手柄就不显示虚拟键）。
`audio` 必须最后，它要被内联脚本的音效壳捕获成 `window.SND`。
`audio.js` 排在最后是有意的：它只被 `index.html` 的 `sfx*()` 包装层读取，缺席时那层自动退回老的单振荡器实现。

---

## assets.js

- 职责：清单式预加载 **41 个键 / 40 条不同路径** 的静态图到 `window.IMG`，失败不阻塞启动。
- 关键导出：`window.Assets = { load, MANIFEST }`，`load()` 返回 `Promise<{loaded, failed}>`。
- 依赖谁：只用浏览器 `Image`，不依赖任何本地模块。
- 被谁依赖：`background.js`、`fx.js`、`enemies-assets.js` 读 `window.IMG`；`char-rig.js` 降级读 `IMG.pose0`；`index.html` 读图标键、宝箱 / 机关 / 拾取物键，启动时调 `load()` 并只打印结果。
- 关键约束：`MANIFEST` 只收静态图；逐帧动画的帧图由 `anim-data.js` 自己列，不在这里。
- **同一路径只建一个 `Image`**：`load()` 先按路径归并（`waiters`），`wpShort` / `wpDagger` 都指向 `wp-dagger.webp` 时共用同一个实例，`pending` 计的是**不同路径数**而不是键数。新增重复路径的键不会再多读一次盘。
- 键名规则（新增键必须照此归族，否则查不到也删不干净）：
  - `wp*` — 武器图标，`assets/icons/wp-*.webp`，画布 256（`wpShort` 与 `wpDagger` 共用 `wp-dagger.webp`）。
  - `it*` — 物品图标，`assets/icons/it-*.webp`，画布 192（只剩 `itJade` / `itBell` / `itJar`）。
  - `pickup*` — 世界里的拾取物实体，`assets/interact/pickup-*.webp`。
  - `chest*` / `mechanism*` — 宝箱与机关的双态图，`assets/interact/`。
  - `hudCard` / `portraitP1` / `titleScene` / `winScene` — **没有 `IMG.*` 读取点，但必须留着**：它们是给 `index.html` 的 CSS 背景与头像预热浏览器缓存用的，删了会多一次首帧请求。
- **2026-10-25 删掉的 11 个键**（省 293 KB 启动白加载，均无消费方）：`pose1` / `charFront` / `charSide` / `charBack`（260 KB）、`itCowrie` / `itEye` / `iconEye` / `iconMask` / `iconLeiwen` / `iconTree`（33 KB）、`itRock`（与 `wpRock` 同路径且无人读）。`pose0` 保留 —— 它是 `ANIM` 缺失时的降级底图。
- 改后必测：新增键必须同时确认消费方读得到；删键前 grep 全仓确认无人引用（`IMG.<键名>`）。删完还要同步封掉会重新生成它的脚本（`prep_icons.py` 的 `DEAD_ITEMS` / `WRITE_UI_ICONS`）。

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

- 职责：多层视差背景（远景 / 天光 / 雾 / 中景 / 道具 / 地面 / 地面线 / 暗角）。
- 关键导出：`window.Background = { draw(ctx, camX, W, H, groundY, worldW) → bool, ready() → bool }`。
  `draw()` 返回 `false` = 一像素都没画，调用方必须补 `drawBG()`；`ready()` 对 `CORE_KEYS`（远景 / 中景 / 地面）判 `complete && naturalWidth > 0`，加载失败与加载中都为假。
- 依赖谁：`window.IMG` 的 3 张核心背景 + 7 个道具键。
- 被谁依赖：`index.html` 的 `render()`；`ready()` 为假或 `draw()` 返回 `false` 时回落到内联 `drawBG()`。
- 关键约束：只在屏幕坐标系算偏移，不做世界坐标平移；道具世界坐标写在模块内 `PROPS`；`save/restore` 必须成对；道具加载失败不阻塞背景整体，逐张回落纯代码。
- **没有前景遮挡层**：`drawFront()` / `occluders()` 已于 2026-10-25 删除。原来那 3 座高大遮挡物画在角色之上，人走过去被完全盖住，只好给角色加一条 52% 硬淡出；那条淡出进出无过渡、判定只看 x 不看高度，走过道具旁边就闪一下半透明，读起来像 bug，整套删掉。遮挡物素材仍留在中景 `PROPS`（`maskRelief` / `brazier` / `sacredTree`）。
- 改后必测：三档视差系数、道具底部是否贴 `GROUND`、`ready()` 对新键的判定、核心图任一失败时是否整层让位给 `drawBG()`。

## char-rig.js

- 职责：玩家逐帧播放器 + 武器专属姿态（站立 / 行走 / 出招） + 两级降级。
- 关键导出：`window.CharArt = { draw(ctx, p, t), ready(), HEIGHT: 252 }`。
- 依赖谁：`window.ANIM`、`window.WEAPON_CLIP`（每把武器 5 状态，**出招主通道**）、`window.ANIM_HOLD`（站立持械）、`window.WEAPON_WALK_CLIP`（行走四帧序列）、`window.IMG.pose0`（降级）。`window.WEAPON_ATTACK` / `window.WEAPON_ATTACK_CLIP` 两个旧通道的数据块已于 2026-10-25 删除，渲染函数仍保留作挂点（自带 `if (!C) return null`）。
- 被谁依赖：`index.html` 的 `drawPlayer()`；`ready()` 为假则回落到内联 `drawFighter()`。
- 关键约束：绘制优先级固定为 **出招序列 → 出招单帧 → 持械行走序列 → 持械站立 → 动画 clip → 降级精灵**。出招那两档必须盖在 attack 族之前，否则换武器时手上仍是老模型；行走那一档必须盖在通用 `walk` clip 之前，否则「站着有武器、一走就空手」。
- 关键约束：走路的三级落回是 **`WEAPON_WALK_CLIP` → `ANIM_HOLD` 静帧（叠位移浮沉）→ 通用 `walk` clip**。缺一级就落下一级，任何一级缺失都不许变成空手。跳跃**不**接管 —— 离地时腿是收起来的，站姿会穿帮。
- 关键约束：行走帧号由 `p.walk`（累计位移）推导，常量是 `WALK_CYCLE`（一个 4 帧循环覆盖的引导位移）。`p.walk` 在 `index.html` 里按 `+= |vx| * dt * 0.024` 累加，所以 1 单位 ≈ 41.7px；站着不动不会换帧，减速步频自然降。改步频只改 `WALK_CYCLE` 一个数，别在代码里插帧。
- 关键约束：序列的 `scaleFix` 是**一个数**（四帧共用同一画布），`anchorX` 是**逐帧数组**。前者写错会让连击里忽大忽小，后者写成单个数会让挥砍时人左右漂。
- 关键约束：帧号由 `attackFrame(p, n)` 推导，与 attack 族同一套算法 —— 有几帧不影响判定时机，改帧数只改动画密度。
- 关键约束：`pickClip()` 的状态优先级不能乱（`dead → whirl → bow/throw → hurt → pickup → jump → attack 族 → walk → idle`）；出招姿态与持械站立都只在「不属于更高优先级状态」时才接管 —— 旋风 / 投掷 / 受击 / 拾取 / 死亡一律走动画。
- 关键约束：攻击族三个 clip 的帧号都由 `swingT / swingDur` 推导，不按 fps 自由播放；`WEAPON_CLIP.attack`（每把武器 4 帧）同样走「判定推着画面走」而不是按 fps 放。单帧姿态没有帧序列，靠 `swingT` 做前冲与旋转。
- 关键约束：`CLIPS` 预热名单是 12 个 clip，新增动作必须同时加进这份名单，否则首帧会闪一下降级画面。`warmHold()` / `warmAtk()` 各自独立预热，`ANIM` 缺席时也照建。
- 关键约束：可选字段 `p.pickupT`（缺省 0）大于 0 时播 `pickup`，调用方置 0.3 秒后自己倒数。
- 关键约束：可选字段 `p.__forceClip`（缺省 `null`）是攻击态里的替代 clip 名，只在 `swingT > 0` 时读；且只认 `ANIM` 里真实存在的 clip，不存在则回落 `attack`。调用方收招即清空，别让下一次非攻击状态读到旧值。**该武器有 `WEAPON_CLIP.attack`（当前 11 把全有）就优先用武器自己的图，`__forceClip` 只在它缺席时兜底。**
- 关键约束：可选字段 `p.__alphaMul`（缺省 1）是前景遮挡淡出的通道 —— 本模块会绝对赋值 `globalAlpha`，外层包一层无效，因子必须在这里乘进 `alpha`；`index.html` 的 `drawPlayer()` 设置后要立刻复位成 1。
- 改后必测：`pickClip` 十二种状态的映射、三个攻击 clip 与判定同步、`WEAPON_CLIP.attack` 缺席时是否逐级落回（旧两档已无素材，直接落到公共 `attack` 族）、走路三级（行走序列 → 持械静帧 → 通用 walk）是否都拿得到武器、行走帧号是否随 `p.walk` 变化、帧图缺失时是否落到 `pose0` 再到纯代码、`__alphaMul` 在四条路径上都生效、各 clip 屏幕身高是否仍落在 178~181px。

## enemies-assets.js

- 职责：四类敌人的帧图绘制 + 完整纯代码降级实现（面具、陶罐、青铜戈、青铜钺、光环）。
- 关键导出：`window.EnemyArt = { draw(ctx, e, t), ready() }`。
- 依赖谁：`window.ENEMY_ANIM`、`window.IMG`（`maskRelief / potteryJar / brazier / jadeTablet / bellCluster / ivoryTusk`）。
- 被谁依赖：`index.html` 的 `render()`；`ready()` 为假则回落内联 `drawEnemy()`（仅第一版遗留路径）。
- 关键约束：BOSS 血条 `artTop` 用帧图时要抬到 `1.6 × h`；`hurt / dead` 定格用「上一帧」；`boss` 目标高是 `1.6 × e.h`，其余是 `e.h`。
- 改后必测：`node tools/selftest_enemies.mjs`，它会校验对齐、帧号、血条位置、缓存有界、降级不抛异常。

## fx.js

- 职责：刀光（通用三档 + 每把武器专属）、打击火花（通用三档 + 四种材质）、弹道痕、旋风环、HUD 底板、受伤渐晕。
- 关键导出：`window.FX = { drawSlash, drawHit, drawWhirl, drawProjFx, drawHudPanel, drawHurtVignette, weaponFxReady, matHitReady, ready, artConvex, mirrors, arcOf }`。后三个是只读契约访问器，专给 `tools/selftest_weapons.mjs` 读朝向判据与实测锚定表。
- 关键约束：**刀光朝向是 `ART_CONVEX` + `slashMirror()` 一处定义**。源画凸背朝左（实测，见 [../.agents/notes/依据-半月斩素材左右不对称.md](../.agents/notes/依据-半月斩素材左右不对称.md)），玩法要求「凸背朝人面向的方向」，所以**面朝右镜像、面朝左原样** —— 与「素材朝右、朝左才镜像」的常规写法相反。改回 `facing < 0` 会让自检 5b 当场 14 项失败。
- 关键约束：`ARC` 是实测锚定表（脊线弧心与半径），`tools/measure_slash.py` 生成。刃口高光与材质刃光**必须**用它，不能在原点画近似半径的弧 —— 旧代码那样会让高光整根悬在月牙外。换素材要同时更新 `ARC` 与自检里的 `ARC_FIXTURE`。
- 依赖谁：`window.IMG`（`slash1..3`、`hit1..3`、`whirlRing`、`jadeTablet`），以及**不在清单里、自建 Image 缓存**的 `window.WEAPON_FX`（武器 key → `{file, scale, r, arc}`）与 `window.HIT_MATERIAL`（`jade / bronze / blunt / airy` → 图路径）。
- 被谁依赖：`index.html` 的刀光、火花、投掷物弹道、渐晕四处；`drawWhirl` 由 `drawWhirlAsset` 调；`drawHudPanel` 目前无调用方。
- 关键约束：`ready()` 只判 `slash1..3` 与 `jadeTablet`，**武器专属特效不进这个名单** —— 它们靠 `weaponFxReady()` / `matHitReady()` 逐把判，缺图时 `drawSlash` / `drawHit` 自动落回通用三档，再落回纯代码弧形光。
- 关键约束：`fxImg(file)` 是唯一的建图入口，**只在首次用到时 new Image 一次**，`draw` 热路径只读缓存；不得在绘制里建图或建 canvas。
- 关键约束：`NO_ARC`（`bow / rock / blade / jar / bell`）不出手上弧光 —— 它们的特效走弹道（`drawProjFx`），在手里凭空炸一道月牙是错的。
- 关键约束：`drawSlash(s)` 的 `s.wkey` 决定用哪张专属弧光；`drawHit(s)` 的 `s.mat` 决定用哪张材质火花。两个字段都缺省，缺省即回到老行为。
- 改后必测：`ready()` 名单与图形依赖一致；三段刀光 / 三档火花的档位映射（`seg` / `big` / `mid`）；`WEAPON_FX` 缺某个键时是否落回通用档而不报错；`node tools/selftest_weapons.mjs` 的 5b（朝向 + 镜像对称）与 5c（高光锚定）两节必须全绿。

## guide.js

- 职责：操作指南 —— 手柄图（内联 SVG）、键盘键帽图、图例，以及**输入设备感知**。
- 关键导出：`window.Guide = { mount, renderInto(el[,kind]), onChange(fn), setDevice(d), device(), pads(), padCount(), hintHtml(), refreshHints, PAD_LEGEND, KBD_LEGEND }`。
- 依赖谁：只用 `document`、`navigator.getGamepads()`、`requestAnimationFrame`。**不加载任何图片** —— 手柄图是内联 SVG，`file://` 下零请求。
- 被谁依赖：`index.html` 的 `scanPads()`（只取 `Guide.pads()`）、底部 `#keys` / `#pad` 文案、`ui-shell.js` 的说明抽屉（`Guide.renderInto`）。
- **这是全项目唯一一份「按键 → 动作」的展示数据**。`PAD_LEGEND` / `KBD_LEGEND` / `HINT_KBD` / `HINT_PAD` 都在这里；增删键位只改这四张表，不要在别处再抄一份文案（历史上前一种做法漏了三处）。
- 关键约束：设备按「谁在动」判定，不是「谁插着」。键盘一敲切键盘图，手柄一按切手柄图，`body` 挂 `dev-kbd` / `dev-pad` 互斥；**两套永不同时出现**。
- 关键约束：轮询（`tick`）是独立 rAF 循环，不占用游戏主循环 —— 暂停时手柄仍要能操作菜单。轮询只读 `getGamepads()`，不消费输入。
- 关键约束：`renderInto` 会把自己登记进 `mounted`，用于「按下哪个键、图上哪个键亮」；重绘时先摘旧实例再登记，避免重复。
- 关键约束：暂停页与说明抽屉都调 `renderInto`，同一时刻最多两处挂载；`onChange` 会挨个重绘，所以设备切换时两处同步换图。
- 关键约束：任何 DOM 缺失都不抛异常；`Guide` 缺席时 `ui-shell` 的说明抽屉退化为只有玩法要点，`index.html` 的 `scanPads()` 退化为空列表。
- 图例支持放大显示：380px 手柄图 / 15px 图例字 / 32px 键帽（等比加大，`viewBox` 不变），hover 高亮、实按闪烁、`mounted` 重绘、`onChange` 行为不变。导出契约没变。
- 改后必测：切设备后抽屉里只剩一套图（不能两套并存）；`#keys` 文案跟着换；`body` class 只有 `dev-kbd` 或 `dev-pad` 之一；手柄按下时对应 `data-pin` 亮起。

## rumble.js

- 职责：手柄震动总入口。管取手柄、管 actuator、管波形；不管时机（事件驱动，不轮询）。
- 关键导出：`window.Rumble = { init, play, player }`。`play(padIndex, what, arg)` 是底层 + 预设统一入口（`"all"` 两只 / `0` `1` 单只 / 预设名字符串 / 裸波形对象）；`player(tag, name, arg)` 按玩家 tag 路由（`"p1"→0` / `"p2"→1`，不认识的落 0 号）。预设 18 个：`swing / hit / hurt / die / bossDie / pickup / swap / drop / give / breakWeapon / chest / mechanism / whirl / throwProj / wave / win / lose / ui`。
- 依赖谁：`Guide.pads()`（每拍现读，与 `readPad` 同源）与 `GamepadHapticActuator.playEffect("dual-rumble", ...)`。不持 rAF、不读音频、不碰网络。
- 被谁依赖：`index.html` 十几个调用点（挥刀 / 命中 / 受击 / 阵亡 / BOSS 击杀 / 拾取 / 换手 / 丢弃 / 递队友 / 碎武器 / 开箱 / 机关 / 旋风斩 / 投掷 / 破阵 / 通关 / 失败 / 暂停）经 `Rumble.player(p.padTag, ...)` 或 `Rumble.play("all", ...)` 进入本模块。
- 关键约束：**静默降级**——缺 Guide、缺手柄、无 `vibrationActuator`、`playEffect` 抛异常（Firefox/Safari 不支持 dual-rumble），一律静默 no-op，任何一条路断了都不许把游戏搞崩。
- 关键约束：`player()` 的 tag→pad 映射必须与 `index.html` 的 `readPad()` 取源一致（`G.p1` 永远 `PADS[0]`、`G.p2` 永远 `PADS[1]`），否则震到别人手上。
- 关键约束：加载序在 `guide` 之后（要读 `Guide.pads()`）、`ui-shell` 之前（`ui-shell` 不依赖它，纯排保险位）。
- 改后必测：拔插手柄即时生效（play 每次现读）；无手柄环境下全流程跑通无报错；`hit(big)` 与 `swap` 等相近波形实际手感区分是否明显。

## touch.js

- 职责：触屏虚拟按键层。布局、按下 / 抬起、指针回收、竖屏遮罩、安卓振动、**设备判定**。
- 关键导出：`window.Touch = { available, active, state, setMode, show, hide, tick, clearAll, skipHeld, takeTap, anyHeld, buzz, init, forcedTouch, debug, overlaps }`。
- 依赖谁：只用 `document`、`window`、`navigator`、PointerEvent / TouchEvent。**不加载任何图片**（按钮是纯 CSS 圆钮 + 文字），`file://` 下零请求。
- 被谁依赖：`index.html` 的 `update()`（把 `Touch.state(tag)` 并进 `in1/in2`）、`loop()`（`Touch.tick()`）、`js/guide.js`（`touchActive()` 判设备档）。
- 关键约束：**判「有没有触屏」只看触摸硬件**（`navigator.maxTouchPoints > 0` 或 `ontouchstart` in window），**不看 `PointerEvent`**。桌面 Chrome / Edge / Firefox 全都支持 PointerEvent，拿它当判据会让鼠标点一下就切进手机版，玩家看到一圈虚拟键凭空冒出来。`PointerEvent` 只用来选事件 API。
- 关键约束：**鼠标与手指靠 `pointerType` 区分**：`mouse` 不算手指（触摸屏笔记本上用鼠标玩要保持桌面界面），`touch` / `pen` 算。判在 `armFirstTouch()` 的 kick 里。
- 关键约束：URL 强制开关 `?touch=1` / `?touch=0`。`?touch=1` 时 `everTouched` 直接置真 —— 从主屏图标启动时没有「第一次手指落下」事件，自动判断会等不到，虚拟键永远不出现。
- 关键约束：按键层 `position:fixed` 贴视口，**不能放进 `#stage`** —— 那是 1600×900 逻辑坐标、被 `transform:scale(0.43)` 缩过，100px 的按钮到屏幕上只剩 43px，低于 44px 规范下限。
- 关键约束：纵向间距用「按钮直径」作单位（`var(--tch-d) * 倍数`），**不能用 `vmin` 百分比** —— 那会让间距跟屏幕高度成比例，390px 高的横屏手机上「跳」能飘到左上角、「拾」压在角色脸上。
- 关键约束：`big` 键（1.22 倍直径）与相邻键的 y 差要 ≥ 1.26 倍直径。`checkOverlap()` 在布局重建时两两求交并 `console.warn` —— 这是这类布局 bug 的唯一自动化防线，别删。
- 关键约束：手机上 `pointerup` 会丢（手指滑出屏幕 / 来电 / 系统通知 / 切 App / 锁屏）。三道兜底缺一不可：一次性键 8 秒超时回收（`reapStale`）、`pointercancel`、`blur` / `pagehide` / `visibilitychange` 三清。方向键不参与超时回收（按住往前跑是正常玩法）。
- 关键约束：`state()` 要求层上带 `tch-on` 类才返回值。`tick()` 里 `want !== lastShown` 时会 `clearAll()` —— 一次抖动就清空全部按键，所以 `active()` 的判据（无手柄 / `phase === "play"` / 未暂停）必须稳定。
- 改后必测：桌面端 `available()` 为 false、无虚拟键层、鼠标点击后图例仍是键盘版；`?touch=1` 下 10 个键可见且 0 重叠；`pointerdown → state.right = true`、`pointerup → 归零`；竖屏时整屏「请横过来」遮罩且按键隐藏。


## ui-shell.js

- 职责：DOM 覆盖层三块 —— 单双人模式选择、按键说明抽屉、拾取气泡。
- 关键导出：`mountModeSelect / showModeSelect / hideModeSelect / mountKeyHelp / toggleKeyHelp / isKeyHelpOpen / showPickupHint / clearPickupHint`。
- 依赖谁：`document` 与 `#stage`（存在则挂进 stage，用设计像素；否则挂 body 用视口像素）；说明抽屉的操作图来自 `window.Guide`。
- 被谁依赖：`index.html` 的 `openModeSelect()`、`mountKeyHelp()`、`showPickupHint()`、`clearPickupHint()`。
- 关键约束：键盘监听只读，不 `preventDefault`、不抢焦点；自己处理 `1 / 2 / H / Esc`；`solo` 模式 HUD 靠 `body.solo` 隐藏玩家二血条。
- 关键约束：键位数据只在 `guide.js` 的 `KBD_LEGEND / PAD_LEGEND` 一份；ui-shell 本地只剩 `TIPS`（玩法要点）。新增按键只需改 guide.js 的两张表，本模块不用动。
- 关键约束：`Guide.onChange` 只注册在 `installKeyHook()` 里，设备一变就重绘抽屉，避免抽屉开着时图不跟着换。
- 关键约束：`guide.js` 的 `PAD_LEGEND` / `KBD_LEGEND` 里都登记了「暂停」一行，值分别是 `Start` 与 `Esc`。改暂停键位要同时改三处：`index.html` 的 `togglePause` 入口、`guide.js` 的两张表、本模块的 Esc 归属判断。
- 关键约束：**Esc 的归属权在捕获阶段解决**。本模块的 `keydown` 监听用 `true` 注册，抽屉开着时按 Esc 会 `preventDefault` + `stopPropagation` 并只关抽屉；抽屉没开时原样放行，交给游戏的 `togglePause`。不这样做的话两个监听都会收到同一个 Esc，变成「收抽屉 + 暂停」两层一起动（这个 bug 真的出现过）。
- 关键约束：模式页 / 抽屉的手柄输入在 `padFrame()` 里轮询，有**启用闸** `S.padArmed`：界面刚开时必须先见到一次全部面键松开才接受输入。「按任意键进模式页」的那一下还按在手上，不设闸会当场锁定默认项，玩家看不到选择页。
- 关键约束：模式页底部那行提示按 `hasPad()` 切换文案（手柄版 / 键盘版），不要写死成「按 1 / 按 2」。
- 改后必测：模式选择回调是否把 `solo / duo` 传进 `startGame`；气泡坐标是否夹在画面内；`H` 开关不吞游戏按键；抽屉开着按 Esc 只收抽屉不解冻；抽屉关着按 Esc 只暂停；手柄 `A` 进选择页后是否**停留**在选择页（不跳选）。

## audio.js

- 职责：全部声音。总线（`sfx / music / amb` → 压缩器 → 主增益）、材质打击音、BGM（外部音轨 `assets/audio/bgm-main.mp3` 优先，缺席时退回 drone 低频床 / 鼓组 / 旋律动机三层程序化合成）。
- 关键导出：`window.SND = { ctx, voice, tone, noise, swing, hit, impact, jump, hurt, die, pickup, chest, breakWeapon, explode, wave, win, lose, matOf, setMaterial, bgm{start,stop,setWave,breathe,tier,isOn,isBreathe,isTrack,isTrackDead,track}, mute, isMuted, volume, suspend, resume }`。`volume("master", v)` 是整场响度总闸，允许超过 1（压缩器已把峰值摁住）；`volume("sfx"|"music"|"amb", v)` 是总线音量，上限 1。
- 依赖谁：只依赖浏览器 `AudioContext` 与 `Audio` 构造器（后者可选）。**打击音不读任何音频文件**；BGM 读一份 `assets/audio/bgm-main.mp3`，用 `<audio>` 元素播放 —— 媒体元素是文档子资源，`file://` 直开能播，而 `decodeAudioData` 那条路在 `file://` 下连字节都取不到（`fetch` / `XHR` 被 CORS 拦）。元素建不出来 / 报错 / 文件缺失 → `media.dead`，整条退回程序化 BGM。
- 被谁依赖：`index.html` 的音效转发壳（`tone / noise / sfx*` 共 9 个出口）。全文件几十个调用点经由这些壳进入本模块，改本模块等于改全场声音。
- 关键约束：打击音分三层（瞬态 + 材质主体 + 低频尾），低频尾长度由 `G.hitstop` 驱动，让「顿帧多久、尾巴多久」对齐。
- 关键约束：**必须有复音节流与随机化**。同帧十来个敌人受击若线性叠加必削波；同频同相叠加会让响度忽大忽小。`gate()` 管节流，`jit()` 管音高/时长抖动。
- 关键约束：材质映射在 `MATERIAL` 表（武器 key → `metal / jade / heavy / clay / bell / flesh / string`）。青铜靠**非整数泛音比**（1 : 2.37 : 3.71）才有金属感，整数比会听成音叉；玉与骨不共振，要钝而干。
- 关键约束：BGM 的喘息压音必须走 `bgm.breathe` 标志，在 `bgmTick` 里统一结算。直接改总线增益会被下一帧 tick 覆盖回满。
- 关键约束：**音轨绕开了 WebAudio 总线**，所以它的音量只有一个出口 `mediaLevel()`（静音闸 → 喘息 / 低血 / BOSS 硬直压音 → `VOL.music × MASTER`）。别在别处直接写 `el.volume`：140ms 的看护定时器下一拍就按媒体电平覆盖回去。`bgmBreathe` / `bgmSetWave` / `mute` / `volume` 四处都显式调了 `mediaApply()`，就是为了别等那一拍。
- 关键约束：**音轨接管后程序化那三层整条不跑**（`media.on` 为真时 `bgmStart` 直接返回）。两套同时响只会互相打架，玩家听到的是噪声。
- 关键约束：音轨被自动播放策略拒掉**不算失败** —— `media.want` 留着，`armFirstGesture` 的手势回调与看护定时器都会重试；文件 404 / 解码失败才 `media.dead`，那时退回程序化 BGM。
- 关键约束：**旋律层是定好的动机（`PHRASE` / `MEL` 表），不是随机拨弦**。随机音高听起来像素材铺底，不像音乐。每档一条五声动机，32 步（16 拍）一轮；改旋律只改 `PHRASE` 表，别在 `bgmTick` 里散写音高。
- 关键约束：**提音量只能动总线（`VOL`）与主增益（`MASTER`），不要去改配方表里的 gain 字段** —— 那些数字是「这一条声音相对别条多重」的语义，改了会毁掉配比。`sfx` 总线上限是 1，越过压缩器就压不住了。
- 关键约束：music 支路上挂了一根带回授的延时线当混响（`musicDelay / musicWet / musicFb`）。老浏览器没有 `createDelay` 就整段跳过，音效与 BGM 不受影响 —— 新增节点一律要带这个降级分支。
- 关键约束：`file://` 自动播放策略要求一次用户手势，`armFirstGesture()` 负责解锁；`M` 键静音；`visibilitychange` 切后台自动挂起。
- 改后必测：`node tools/selftest_audio.mjs`（mock Web Audio，不开浏览器），覆盖材质发声、复音节流、BGM 起停与档位、音轨接管与让位（9 节）、音轨判死后退回程序化、无 `AudioContext` 时安全空转。
---

## 变更影响路由

| 改动位置 | 必须同步检查 |
|---|---|
| `anim-data.js` | `char-rig` 的 `CLIPS` / `ANIM_HOLD` / `WEAPON_WALK_CLIP` / `WEAPON_CLIP` 键集合、`enemies-assets` 的 `KINDS`、`fx` 的 `WEAPON_FX` / `HIT_MATERIAL`、`scaleFix` 是否仍按内容高反算、各 clip 屏幕身高是否仍在 178~181px |
| `assets.js` | `background` 的 `PROPS`/`CORE_KEYS`/`PROP_KEYS`、`fx` 的 `ready()` 名单、`char-rig` 的 `pose0` 降级、`index.html` 的 `WP_ICON` 与宝箱 / 机关 / 拾取物键名 |
| `background.js` | `index.html` 的 `Background.ready()` 守卫、内联 `drawBG()` 兜底常量、`PROPS` 的世界坐标与 `PROP_KEYS` 名单是否与 `assets.js` 对得上（`drawFront()` / `occluders()` 已删除，别再往回调） |
| `char-rig.js` | `index.html` 的 `drawPlayer()` 守卫、`__alphaMul` 是否仍被乘进 `alpha`（通用钩子，当前无调用方）、`__forceClip` 是否仍在收招时清空、`Player` 字段（`swingT / swingDur / throwT / whirlT / hurtT / pickupT / onGround`）是否改名 |
| `enemies-assets.js` | 跑 `selftest_enemies.mjs`；`Enemy` 的 `kind / scale / w / h / maxHp / state` 字段是否改名 |
| `fx.js` | `index.html` 四处 `FX.*` 调用与 `FX.ready()` 守卫；`drawSlash` 的 `wkey`、`drawHit` 的 `mat`、`drawProjFx` 的 `kind` 是否都有人传；新增武器要在 `WEAPON_FX` 与 `HIT_MATERIAL` 的表里都有落点 |
| `guide.js` | `index.html` 的 `scanPads()` 与 `#keys`/`#pad`、`ui-shell` 的 `.uis-help-body` 与 `Guide.onChange`；改键位只改这里的四张表，别再往 `ui-shell` 抄文案 |
| `rumble.js` | `index.html` 的十几个 `Rumble.player / Rumble.play` 调用点是否还指向本页列出的预设名；`Guide.pads()` 结构变化时 `padAt()` 是否仍取得到；`player()` 的 tag→pad 映射与 `readPad()` 取源是否仍一致 |
| `touch.js` | `index.html` 的 `Touch.state / tick / init / takeTap / anyHeld / setMode` 调用点；`guide.js` 的 `touchActive()` 与 `forcedTouch()`；`index.html` 的 script 版本号（改了 `js/` 就要 +1）；`available()` 的触摸硬件判据（别改回看 `PointerEvent`） |
| `ui-shell.js` | `index.html` 四个调用点、`body.solo` 样式、`UIShell` 未加载时的降级分支、`Guide` 缺席时抽屉仍要能开、`padFrame` 的启用闸、模式页底部文案 |
| `audio.js` | 跑 `selftest_audio.mjs`；`index.html` 的 `sfx*()` 包装层是否仍能退回旧实现；新增武器要在 `MATERIAL` 表里给材质，否则一律落到 `jade`；`SND.bgm.*` 的调用点（开局 `start` / 换阵 `setWave` / 通关 `stop`） |

契约变更（导出签名、字段名、`window.*` 名字）必须同一次改动内更新本页与 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
