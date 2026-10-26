# 手机端 — 实现说明与验收

单页横版清版动作游戏在手机 / 平板上的运行方式。桌面行为一个字都没改，这一层只在
真设备有触摸硬件、且玩家真的用手指之后才生效。

> **本页是唯一 home**：触屏输入通道、`?touch=` 参数、虚拟键布局约束、真机验收清单。
> **改这里之后要同步**：`js/touch.js` 与 `js/guide.js` 的 `TOUCH_LEGEND`（说明对侧）· [OPERATIONS.md](OPERATIONS.md) 触屏一节。
> **本页被引用**：[../AGENTS.md](../AGENTS.md) 分层索引 · [README.md](README.md) 事实路由表 · [DEPLOY.md](DEPLOY.md) 手机端一节。

---

## 零、入口在哪

| 入口 | 给谁 | 行为 |
|---|---|---|
| `index.html` | 桌面 | 键盘 / 手柄界面。有触摸硬件的设备自动切触屏档 |
| `mobile.html` | 手机 | 跳到 `index.html?touch=1`，**强制**触屏档 |

`mobile.html` 存在的理由：从主屏图标启动时没有「第一次手指落下」这个事件，
自动判断会等不到，虚拟键永远不出现。强制开关解决这个。

| URL 参数 | 效果 |
|---|---|
| `?touch=1` | 强制触屏档（虚拟键 + 触屏图例 + 竖屏提示） |
| `?touch=0` | 强制桌面档（触摸屏笔记本上想用鼠标玩时用） |

**判「有没有触屏」只看触摸硬件**（`navigator.maxTouchPoints > 0` 或 `ontouchstart`），
**不看 `PointerEvent`** —— 桌面 Chrome / Edge / Firefox 全都支持 PointerEvent，
拿它当判据会让鼠标点一下页面就切进手机版，玩家看到一圈虚拟键凭空冒出来。
`PointerEvent` 的正确用途只是「选哪种事件 API」。

**鼠标与手指靠 `pointerType` 区分**：`mouse` 不算手指（触摸屏笔记本上用鼠标玩
就保持桌面界面），`touch` / `pen` 算。`everTouched` 只有真的来过一个手指事件才置位。

---

## 一、这一层加在哪

| 文件 | 改动 | 职责 |
|---|---|---|
| `js/touch.js` | **新增** | 触屏虚拟按键：布局、按下/抬起、指针回收、竖屏遮罩、安卓振动、设备判定 |
| `mobile.html` | **新增** | 手机版入口（薄壳，只做一次跳转） |
| `index.html` | CSS 安全区 + `fit()` 重写 + 输入合并 + `Touch.init/tick` + 脚本版本号 | 画面缩放、把触屏状态并进 `in1/in2`、驱动显示状态 |
| `js/guide.js` | 加 `touch` 设备档 + `TOUCH_LEGEND` + 手机示意图 + `forcedTouch()` 口 | 键位说明按「谁在动」切三套（键盘 / 手柄 / 触屏） |

**没有改的**：`js/char-rig.js`（除后来审计修的行走取模）、`js/enemies-assets.js`、
`js/fx.js`、`js/background.js`、`js/audio.js`、`js/intro-video.js`、`js/rumble.js`、
`js/ui-shell.js`、`js/anim-data.js`。
渲染层一行没动 —— 手机端复用同一套绘制代码，所以画面与桌面逐像素一致（只是缩放）。

### 脚本版本号

`index.html` 的 script 标签带 `?v=` 版本号。文件名不带 hash，浏览器与 CDN 会
长期缓存 `js/*.js`；玩家拿到旧版 `touch.js` 就会在桌面上看到手机虚拟键（旧版
`available()` 把「支持 PointerEvent」当成「有触屏」），而且刷新几次都改不掉。
**改了 `js/` 下任何文件就把版本号 +1。**

---

## 二、为什么不用「模拟键盘事件」

最省事的做法是往 `KEYS` 里塞假按键，但那样会顺手把 `Guide` 的设备判定切成键盘 ——
手机玩家会看到「按 F 挥刀」的提示，而屏幕上一个键盘都没有。

所以走**独立输入通道**：`Touch.state(tag)` 返回与 `readPad()` 同形的对象
（`left/right` 是持续量，其余六个是一次性边沿），`update()` 里用 `||` 并进去：

```js
var tch1 = (window.Touch && Touch.state) ? Touch.state("p1") : null;
var in1 = {
  left:  keyDown(...) || pad1.left || (tch1 && tch1.left),
  jump:  keyPressed(...) || pad1.jump || (tch1 && tch1.jump),
  ...
};
```

模块缺席时 `tch1` 是 `null`，`(null && x)` 恒为 `null`，`a || null` 不改变结果 ——
桌面那条路径的表达式结果与改动前完全相同。

---

## 三、按键布局

### 单人（`mode === "solo"`）

```
   ┌──────────────────────────────────────────────┐
   │                    ❚❚  ?                     │  ← 顶栏（暂停 / 键位）
   │                                              │
   │              游戏画面（#stage 缩放）           │
   │                                              │
   │                     跳        拾              │
   │  ◀  ▶                        刀   技         │
   │                             丢               │
   │                             递               │
   └──────────────────────────────────────────────┘
     左半屏 = 移动簇          右半屏 = 动作簇
```

### 双人（`mode === "duo"`）

每人独占一半。**动作簇不镜像**、移动簇镜像：

- p1 左半屏：`◀ ▶` 贴屏幕左边缘，`刀` 靠外、`技` 更靠外
- p2 右半屏：`◀ ▶` 贴屏幕右边缘（左右方向反转），`刀` 同样靠外

这样两个玩家「刀」都在自己那一半的外侧、「技」都在更外侧 —— 手感镜像、
功能顺序一致，拇指不用学两套动作。

### 坐标口径（踩过的坑）

| 轴 | 单位 | 为什么 |
|---|---|---|
| x | 相对**本半屏宽度**的百分比 | 半屏是固定的一半视口，百分比在任何屏幕上都是同一比例 |
| y | **按钮直径**的倍数（0.5 = 半个直径） | 用 `vmin` 百分比会让纵向间距跟屏幕高度成比例 |

**y 轴不能用 `vmin`。** 第一版用 `vmin`，在 844×390 的横屏手机上实测：`跳` 飘到
左上角、`拾` 压在角色脸上、`技` 盖住游戏画面正中。改用直径作单位后，
按钮多大间距就多大，任何屏幕密度都是同一套手感。

---

## 四、画面缩放

`fit()` 重写，三件事桌面不用管：

1. **优先读 `visualViewport`**。手机地址栏收起 / 展开会改 `innerHeight`，
   用 `innerHeight` 会在地址栏收起时算出过大的 scale，画面下缘被切掉。
2. **扣掉安全区**。横屏时刘海在左右，不扣的话血条压在刘海里。
   `#wrap` 的 `padding` 用 `env(safe-area-inset-*)`，`fit()` 读它的计算值。
3. **加 `translateZ(0)`**。把 `#stage` 提到独立合成层 —— 1600×900 的图层
   重排在中端安卓上是 5~10ms，够掉一半帧。

**canvas 内部分辨率永远是 1600×900**。缩放只改 `transform`，不改
`canvas.width/height` —— 所有绘制坐标、碰撞盒、判定半径都以它为单位写，
改内部分辨率等于把整个坐标系缩掉，那是重写不是适配。

---

## 五、竖屏与「默认横屏」

竖屏时 1600×900 被压成一条窄带（scale ≈ 0.24），角色只有 43px 高。
这种情况由整屏遮罩接管：

- 遮罩**独立于按键层**（`#tch-layer.tch-portrait` 强制 `display:block`），
  标题页、结算页竖着进来也会提示
- 遮罩亮着时虚拟按键全部藏起来（窄带里没有意义，还会误触）
- 图标是一台竖着的手机，自己转 90 度 —— 用图形演示比文字快

### 默认横屏：三条腿

竖屏遮罩只是兜底。真正让手机**进游戏就横过来**的是三条腿，
少一条就有一整片机型转不过来：

| # | 手段 | 管谁 | 说明 |
|---|---|---|---|
| 1 | `<meta name="x5-orientation" content="landscape">`<br>`<meta name="screen-orientation" content="landscape">` | 微信 / QQ / UC 的 X5 内核、部分国产 ROM 浏览器 | 这两条是**私有 meta**，标准里没有，但国产内核只认它们 —— 标准 API 在那些内核里不可用 |
| 2 | `js/touch.js` 的 `lockLandscape()` | 安卓 Chrome / Edge 等标准浏览器 | `requestFullscreen()` 之后 `screen.orientation.lock("landscape")` |
| 3 | 竖屏遮罩 + 「横屏进入」按钮 | iOS Safari、以及上面两条都失败的场合 | iOS **完全没有** `screen.orientation.lock`，只能玩家手动转屏 |

`requestFullscreen()` **必须在用户手势的同步调用栈里**，所以 `lockLandscape()`
挂在两处：

- 「第一根手指落下」（`armFirstTouch` 的 `kick`，全页最早的可靠手势）
- 遮罩里的「横屏进入」按钮（明确的用户意图，且 `force` 绕过「只试一次」的闸）

脚本加载时直接调 100% 被浏览器拒，还会刷一屏 `Uncaught (in promise)`；
所以全部 `.catch` 静默 —— 锁不了方向是正常结果，不是错误，更不能白屏。

`index.html` 与 `mobile.html` 都带这四条 meta（`x5-fullscreen` / `full-screen`
一起给，X5 内核下全屏也要它才生效）。

### 双击放大：只能靠 JS 掐

玩家报告「有些浏览器双击会放大」。这是三件互不覆盖的事，一层都不能省：

| 层 | 手段 | 覆盖谁 | 为什么可能不够 |
|---|---|---|---|
| meta | `maximum-scale=1, user-scalable=no` | 安卓 Chrome、Safari、大部分国产浏览器 | 老 WebView 与部分 ROM 浏览器直接忽略 |
| CSS | `html,body{touch-action:none}` | 支持 CSS `touch-action` 的内核 | iOS 因为可达性原因曾长期不完整支持；且它对「整页捏合」无效 |
| JS | `touchend` 双击守卫 + `gesturestart` | **所有内核** | —— 这是唯一吃得下的那一道 |

双击守卫的判定：**单指 + 两次抬手间隔 ≤320ms + 落点漂移 ≤30px**，
命中时对第二次抬手 `preventDefault()`，顺带吞掉它合成的那一下 `click`
（否则一个双击会把按钮激活两次）。

**为什么不在 `touchstart` 上拦**：一局里同时两根手指是**正常玩法**
（双人同屏、单人两只拇指同时按方向与刀）。在 `touchstart` 上
`preventDefault()` 会连带把 `pointerdown` 一起吞掉，而虚拟键全挂在
pointer 事件上 —— 按键会当场失灵。所以多指一律原样放过：

```js
if (!e.changedTouches || e.changedTouches.length !== 1) { lastAt = 0; return; }
if (e.touches && e.touches.length > 0) { lastAt = 0; return; }
```

iOS 的「整页」双指缩放走的是 `gesturestart` / `gesturechange` / `gestureend`，
不吃 `touch-action`，单独吞掉。

---

## 六、按键层为什么挂在 `#stage` 外面

`#stage` 是 1600×900 逻辑坐标，手机上被 `transform:scale(0.43)` 缩过。
按键如果放进 `#stage`，100px 的按钮到屏幕上只剩 43px，手指按不准。
而 44px 是 Apple HIG 与 Material 都写进规范的最小触摸目标。

所以按键层 `position:fixed` 贴视口，尺寸用 `vmin` 算并夹在 `[48px, 84px]`。

---

## 七、指针卡死的三道兜底

手机上和桌面最大的不同：`pointerup` 会**丢**。手指滑出屏幕边缘、来电、
系统通知、切 App、锁屏 —— 都会让 up 收不到。一旦丢了，那枚键就永远「按着」，
玩家看到的是「角色自己一直往前跑，松手也不停」。

三道防线：

1. **`reapStale()`** —— 一次性键（跳 / 刀 / 技 / 拾 / 丢 / 递）按住超过 8 秒
   强制释放。方向键不做这个，因为「按住往前跑」是正常玩法。
2. **`pointercancel` / `pointerleave`** —— 浏览器主动通知时立刻松手。
3. **`blur` / `pagehide` / `visibilitychange`** —— 失焦、切后台、锁屏时 `clearAll()`。

---

## 八、验收记录

以下为 CDP 驱动本机 Chrome、视口 844×390（iPhone 14 横屏）与 390×844（竖屏）的实测。

| 项目 | 结果 |
|---|---|
| 触屏层建立 | ✅ 10 枚键（8 个动作 + 2 个系统键） |
| 首次手指落下前 | 不显示（桌面用键盘玩不会突然长按钮） |
| 手指落下后 | `Guide` 切到 `touch` 档，底部文案换成触屏版 |
| 右移 500ms | x 560 → 781，vx = 470，`walk` 累计 5.31（走路动画推进） |
| 攻击 | `swingT` 0.158 / `swingDur` 0.2，`swingIdx` 0 → 1（第二段） |
| 跳跃 | vy = -637，y 706 → 604，落地回 706 |
| 双人双拇指同时 | p1 +189 / p2 -189，互不干扰 |
| 双人各自攻击 | p1 swingT 0.15 时 p2 swingT 仍为 0 |
| 指针残留 | 全部操作后 0 条 |
| 标题页 / 失败页 | 按键自动收起（`G.phase !== "play"`） |
| 失败页点「重来」 | 可点，重开后按键自动展开 |
| 竖屏 | 遮罩生效，按键隐藏，背景全黑 |
| 按钮最小尺寸 | 57px（> 44px 规范下限），攻击键 70px |
| 按钮重叠 | 0 对（双人 16 枚全查） |
| 跨半屏串位 | 0 个（p1 全在左、p2 全在右） |
| 性能（7 敌 + 400 粒子） | render 0.84ms + update 0.08ms = 16ms 预算的 **6%** |

---

## 九、还没做的（留给下一轮）

- [ ] **真机实测**。以上全是 Chrome 桌面模拟视口，不是真手机。
      需要真机验证：iOS Safari 的 `visualViewport` 行为、安卓地址栏收展、
      刘海安全区实际值、多点触控精度。
- [ ] **iOS 无振动**。`navigator.vibrate` 只有安卓有，iOS 上 `Touch.buzz()` 静默
      no-op。iOS 要走 `Rumble` 那套（需要手柄）或者干脆放弃触觉反馈。
- [ ] **横竖屏锁定提示的替代方案**。现在竖屏是「请横过来」的硬遮罩，
      没有「竖屏也能玩」的降级版（比如把画面旋转 90°）。
- [ ] **按键自定义**。现在布局写死在 `moveCluster` / `actCluster`，
      手机屏幕尺寸差异大（小屏机 5.5" vs 平板 11"），理想情况应允许玩家拖拽调整。
- [ ] **首次进入的引导**。玩家第一次看到虚拟键不知道该按哪个 ——
      目前只靠顶部 `?` 主动查。可以在第一次进对局时给一个 3 秒的手势提示。

---

本页是触屏实现的唯一 home；改完同步 [OPERATIONS.md](OPERATIONS.md) 的触屏一节与
`js/guide.js` 的 `TOUCH_LEGEND`。上线要求去 [DEPLOY.md](DEPLOY.md)，文件索引去 [README.md](README.md)。
