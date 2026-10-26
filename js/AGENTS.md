# js/ — 规则层

继承根规则，见 [../AGENTS.md](../AGENTS.md)；文件职责与改哪儿波及谁见 [README.md](README.md)。

本目录特有约束：
- 只写 IIFE + `window.*`，禁 `import` / `export` / `type="module"`，`file://` 下会被 CORS 拦。
- 每个模块必须自带纯代码降级；`draw()` 热路径禁 `new Image()`、禁建 canvas。
- 契约（导出名、参数序、字段名）改动，同一次改动内更新 [README.md](README.md) 与 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
- 动 `enemies-assets.js` 后必跑 `node tools/selftest_enemies.mjs`；动任何 js 后必跑 `node tools/check-inline.mjs`。
- 改了本目录任何文件 → `index.html` 里 script 标签的 `?v=` 版本号 +1（文件名不带 hash，缓存不认内容）。

## 帧动画与尺寸

- **`anchorX` 是「逐帧身体轴」，`scaleFix` 是「整段一个身高」，两者别混谈。**
  `scaleFix` 一变是整个人忽大忽小；`anchorX` 一变是人左右横跳。
  实测屏幕位移 = `(max(anchorX) - min(anchorX)) × 画布宽 × scaleFix × 252/画布高`。
- **出招序列的 `scaleFix` 是一把武器一个数**（四帧共用同一画布），**`anchorX` 是逐帧数组**。
  前者写成逐帧会让连击里忽大忽小，后者写成一个数会让挥砍时整个人左右漂。
- **行走帧号跟 `p.walk`（累计位移）**，常量 `WALK_CYCLE` 是「一个 4 帧循环覆盖多少引导位移」。
  与出招相反：出招跟判定（`swingT`）、行走跟位移。按时间自由播会在减速时变滑步。
- **`WALK_CYCLE` 按「4 帧一轮」校准**（3.6 单位位移）。序列只有 3 帧时（斧头）照搬会让步频慢 25%，
  正确写法 `cycle = WALK_CYCLE * n / 4` —— 每帧固定覆盖相同位移，与帧数无关。
  `drawWalkFrames` 与 `stateFrame` 两条路径必须同一口径，否则换状态会跳帧。
- **`stateFrame` 的 walk 分支必须取模**：`p.walk` 只增不减，而 `cycle` 只有 3.6 个单位 ——
  走约 0.32 秒帧号就越过末帧。原来只夹不取模，于是第一轮播完后**永久停在最后一帧**：
  画面读成「滑步 + 僵直」，素材其实是齐的。
- 敌人走路动画按 `e.walk` 累计位移推进，不跟真实时间；改步频调 `enemies-assets.js` 的 `STRIDE`。
- **敌人走路相位种子必须用 `e.__seed`，不能用 `e.x`**：`e.x` 每帧都在变，用它算相位等于每前进 1px
  就把相位重新随机一次，腿会疯狂抽搐（实测每秒换帧 32 次，应 2.93 次）。

## 刀光（`fx.js`）

- **刀光朝向是一处契约**：源画凸背朝左（实测弧心 `cx/w` 全 > 0.5），要求「凸背朝人面向的方向」，
  所以面朝右镜像、面朝左原样 —— 与常规写法相反。判据只在 `ART_CONVEX` + `slashMirror()`，
  两条绘制路径共用。改回 `facing < 0` 会让 `selftest_weapons` 的 5b 当场 14 项失败（已实测）。
- **月牙素材左右不对称，不能按包围盒居中**：刃口高光的圆心必须取实测弧心（`ARC`，
  由 `tools/measure_slash.py` 生成），半径取脊线半径。在原点画近似半径的弧，高光会整根悬在图外（实测偏 40px 以上）。

## 声音（`audio.js`）

- 打击音实时合成、不读音频文件；BGM 读 `assets/audio/bgm-main.mp3`，用 `<audio>` 元素播放
  （`file://` 下 `decodeAudioData` 取不到字节，媒体元素能播）。换 BGM 只改 `MEDIA_SRC` 与那份文件；
  `assets/audio/` 缺席或被拦时自动退回程序化 BGM。
- **提音量只动 `VOL`（总线）与 `MASTER`（总增益），别动配方表里的 `gain`** ——
  那些是「相对轻重」语义，改了毁配比。`sfx` 总线上限 1，越过压缩器就压不住峰值。
- **BGM 旋律层是 `PHRASE` 表里的定好动机，不是随机拨弦**。随机音高听起来像素材铺底；
  每档一条五声乐句，32 步（16 拍）一轮，改旋律只改那张表。
- **新加的音频节点必须带降级分支**：music 支路的延时混响用 `AC.createDelay` 特性探测，老浏览器没有就整段跳过。
- 打击音的材质靠 `startSwing(wp.key)` 传入的武器 key。新增武器必须同时在 `MATERIAL` 里给材质，否则一律听成玉器。
- BGM 的喘息压音只认 `bgm.breathe` 标志（在 `bgmTick` 里统一结算）。直接改 `bus.music` 增益会被下一帧覆盖回满。

## 触屏（`touch.js`）

- **判「有没有触屏」不能看 `PointerEvent`**：桌面 Chrome / Edge / Firefox 全都支持它，拿它当判据，
  鼠标点一下页面就切进手机版。正确判据是触摸硬件（`navigator.maxTouchPoints > 0` 或 `ontouchstart`）。
  `PointerEvent` 只用来选事件 API。鼠标与手指靠 `pointerType` 区分（`mouse` 不算手指，`touch` / `pen` 算）。
- **按键层不能放进 `#stage`**：`#stage` 是 1600×900 逻辑坐标、被 `transform:scale(0.43)` 缩过，
  100px 的按钮到屏幕上只剩 43px，低于 44px 规范下限。必须 `position:fixed` 贴视口，尺寸用 `vmin` 夹在 `[48, 84]`。
- **纵向间距不能用 `vmin` 百分比**：那会让间距跟屏幕高度成比例，在 390px 高的横屏手机上
  「跳」能飘到左上角、「拾」压在角色脸上。要用「按钮直径」作单位（`var(--tch-d) * 倍数`）。
- **`big` 键（1.22 倍直径）的纵向间距必须留够**：与相邻键的 y 差要 ≥ 1.26 倍直径，卡在 1.2 会在按钮变大的视口上相交。
  `checkOverlap()` 会在布局重建时两两求交并 `console.warn` —— 这是这类布局 bug 的唯一自动化防线，别删。
- **手机上的 `pointerup` 会丢**（手指滑出屏幕、来电、系统通知、切 App、锁屏）。丢了那枚键就永远「按着」，
  玩家看到「角色自己一直往前跑，松手也不停」。三道兜底缺一不可：一次性键 8 秒超时回收（`reapStale`）、
  `pointercancel`、`blur`/`pagehide`/`visibilitychange` 三清。
- **「双击放大」只能靠 JS 掐，不能只靠 CSS / meta**：`touch-action:none` 与 `user-scalable=no` 是**建议**，
  老 WebView 与部分国产 ROM 浏览器不认。三层各管一段，缺一层就有机型漏：`<meta viewport>`（标准浏览器）、
  `touchend` 双击守卫（单指 + ≤320ms + 落点漂移 ≤30px 的第二次抬手）、`gesturestart/gesturechange`（iOS 整页捏合）。
- **双击守卫绝对不能改成在 `touchstart` 上 `preventDefault`**：那会连带把 `pointerdown` 一起吞掉，
  而虚拟键全挂在 pointer 事件上 —— 双人同屏两只拇指同时按方向与刀时，按键会当场失灵。
  多指（`changedTouches.length !== 1` 或 `touches.length > 0`）必须原样放过。
- **从主屏图标启动时没有「第一次手指落下」事件**：自动判断等不到，虚拟键永远不出现。
  所以有 `mobile.html` 强制入口（`?touch=1`）。
- 默认横屏是三条腿（私有 meta / `screen.orientation.lock` / 竖屏遮罩），
  `.tch-rotate` 里不许加 `pointer-events:none` —— 详见 [../docs/MOBILE.md](../docs/MOBILE.md)。

## 其它

- **`p.inv > 0` 不等于「在受伤闪烁」**：旋风斩也给了 1.5 秒无敌（与 `whirlT` 同寿）。
  `char-rig.js` 里统一走 `hurtFlicker(p)`，`whirlT > 0` 时跳过。
- **手柄震动入口只有 `rumble.js` 一处**：全部调用点经 `Rumble.player(tag, preset)` / `Rumble.play("all", preset)`
  走预设表，别在 `index.html` 直接摸 `vibrationActuator`；不支持 dual-rumble 的浏览器（Firefox/Safari）整条链路静默 no-op。
- **「素材就绪」不等于「帧图就绪」**：`Assets.load()` 只管 MANIFEST 里的静态图，
  动画帧是 `char-rig.warm()` 与 `enemies-assets.warmKind()` 自己建的。两个模块的 `progress()`
  只数已建的 Image、不新建 —— 自己再 `new` 一遍会让解码内存翻倍。
