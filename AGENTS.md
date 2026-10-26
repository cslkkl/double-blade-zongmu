# 三星堆·双刃战士 — 维护索引

单页横版双人清版动作游戏。零依赖，`file://` 双击可跑。

## 硬约束（改任何代码前先确认不破坏这五条）

- 禁 CDN / npm / 外部字体 / ES module —— `file://` 下会被 CORS 拦，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 位图只管好看，判定只用数字 —— 改绘制不许动碰撞盒，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 每层素材必须有纯代码降级 —— 任何缺图都不许白屏，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 帧数据与绘制解耦 —— 改动作只改 [js/anim-data.js](js/anim-data.js)，不碰绘制模块。
- 一个动作一个键，键位表在 [docs/OPERATIONS.md](docs/OPERATIONS.md) —— 改键位要同步六处。

## 分层索引（每层职责互斥，改之前先看自己那一层）

| 层 | 位置 | 职责 | 手册 |
|---|---|---|---|
| 门面 | `README.md` | 对外介绍，面向玩家，不写实现 | [README.md](README.md) |
| 设计 | `docs/ARCHITECTURE.md` | 不变的决策与防错清单 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 操作 | `docs/OPERATIONS.md` | 键位唯一口径 + 各页面输入 | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| 玩法 | `docs/GAMEPLAY.md` | 机制、数值、六阵、文物对照 | [docs/GAMEPLAY.md](docs/GAMEPLAY.md) |
| 游戏本体 | `index.html` | 玩法逻辑、状态机、HUD | 直接读，无子手册 |
| 渲染层 | `js/` | 素材加载、视差、帧动画、特效、UI、声音、触屏 | [js/README.md](js/README.md) · [js/AGENTS.md](js/AGENTS.md) |
| 素材流水线 | `tools/` | 生图后处理、切片、自检 | [tools/README.md](tools/README.md) · [tools/AGENTS.md](tools/AGENTS.md) |
| 素材契约 | `docs/ASSETS.md` | 画布、锚点、朝向、`scaleFix` 的唯一口径 | [docs/ASSETS.md](docs/ASSETS.md) |
| 素材产物 | `assets/` | 生成物，只读，不手改 | [tools/README.md](tools/README.md) |
| 素材展示页 | `showcase.html` + `.css` + `.js` | 录屏用的素材总览（只读 `js/anim-data.js` 与 `assets/`） | 本文件「素材展示页」一节 |
| 部署与手机 | `docs/DEPLOY.md` · `docs/MOBILE.md` | 上线要求、移动端实现与验收 | 同左 |
| 修复记录 | `docs/HISTORY.md` + `docs/audit/` | 审计问题状态总表；三份审计原文归档 | [docs/HISTORY.md](docs/HISTORY.md) |

## 验证命令（每次收工全跑，全绿才算完）

```powershell
node tools/check-inline.mjs          # index.html 内联脚本语法
node tools/selftest_enemies.mjs      # 敌人绘制自检（mock canvas，不开浏览器）
node tools/selftest_audio.mjs        # 声音自检（mock Web Audio，不开浏览器）
node tools/selftest_weapons.mjs      # 武器视觉自检（三件套覆盖 / 绘制分流 / 降级）
Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }
python <maintenance-flow>/check-markdown-links.py . --fragments
```

改了 `js/` 下任何文件，记得把 `index.html` 里 script 标签的 `?v=` 版本号 +1。

## 重新生成素材（覆盖 `assets/` 与 `js/anim-data.js`，先提交再跑）

十个切片 / 后处理脚本的输入输出与幂等性列在 [tools/README.md](tools/README.md)。
两条最容易踩的：

- `slice_anim.py` 默认只切角色；敌人用 `--only enemy`。它会重写整份 `window.ANIM`，跑完必须补 `slice_anim_extra.py`。
- 会清空 `assets/anim/` 全部 `.webp`，跑之前先确认敌人帧可重出。

## 素材展示页（录屏用）

与游戏本体完全解耦：只读 `js/anim-data.js` 与 `assets/`，不改游戏、不改素材。

| 文件 | 职责 |
|---|---|
| `showcase.html` | 页面骨架 + 顶栏统计 + 青铜癌按语 |
| `showcase.css` | 纯白底、1px 细线、青铜绿单一强调色 |
| `showcase.js` | 从 5 张数据表生成 7 个 tab 的全部格子与播放器 |
| `serve-showcase.mjs` | 本地静态服务（零依赖，默认 8801） |
| `启动展示页.bat` | 双击 = 起服务 + 开浏览器 |

```powershell
node serve-showcase.mjs            # 打开 http://127.0.0.1:8801/showcase.html
node serve-showcase.mjs --no-open  # 只起服务
```

**为什么这里要走 http 而不像游戏那样 `file://` 直开**：展示页要扫 alpha 通道算内容框（`getImageData`），
`file://` 下 canvas 被跨源图片污染，一读就 `SecurityError`。这是全仓唯一的例外。

尺寸口径只有一条：**裁到 alpha 并集框，画布高 = 内容在游戏里的身高 × k**。
归一化的分子三族共用：角色 / 武器用 `252 × scaleFix`，敌人用 `index.html` 构造函数里的 `scale`。
武器组取 **90 分位**而不是最大值 —— 举钺/举锤那一帧尖端高过头顶，按最大值归一会把整行压小一圈。

```js
/* 同步点：数据表改名了，这三处要一起改 */
WEAPONS  // 武器中文名 ← index.html 的 WEAPONS 表
ENEMIES  // 敌人中文名 ← GAMEPLAY.md；第 4 列比例 ← index.html 的构造函数
CHAR     // 12 个动作的中文名 / 英文名
```

`node --check showcase.js` 是唯一自动化检查；页面没有列入上面的收工验证链。

## 验证快照

- **2026-10-26（键位重排：一个动作一个键 + 玩家二改小键盘 + 文档结构重排后）**：
  `check-inline` 通过（内联脚本 143720 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；
  `node --check` 12/12 通过。
- 规模（`git ls-files` 实测）：`index.html` 4385 行；`js/` 12 个模块；`assets/` 330 个文件 21.55 MB；仓库 412 个跟踪文件 22.81 MB。
- 帧数：角色 12 个 clip 共 43 帧；敌人 4 类共 14 帧；武器站立 11、出招单帧 10、出招序列 10 把 × 4 帧、持械行走 11 把（其中斧头 3 帧）。
- 关卡：6 阵共 85 体。静态素材 48 张，动画帧 249 张。
- 素材预算：单帧 ≤ 60 KB（实测最大 55.4 KB）、总量 ≤ 8 MB（上调依据见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)）。
  **当前 21.55 MB 超预算**，剩下的都是运行时真加载的；要降只能先删素材或换压缩率。
- 无 CI，以上为本机手工结果；改完代码重跑一遍再写结论。

## 待办

- [ ] `js/assets.js` 里 `pose1` / `charFront` / `charSide` / `charBack` 四个键无消费方，每次启动白加载约 265 KB。
- [ ] `js/assets.js` 里 `itCowrie` / `itEye` 与 `iconEye` / `iconMask` / `iconLeiwen` / `iconTree` 六个图标键无消费方。
- [ ] `js/assets.js` 里 `wpShort` 与 `wpDagger` 指向同一张 `wp-dagger.webp`，`wpRock` 与 `itRock` 指向同一张 `it-rock.webp`。
- [ ] `FX.drawHudPanel` 无调用方（`FX.drawWhirl` 已接进 `drawWhirlAsset`）。
- [ ] 物品族图标长边占比 0.41~0.65，与 `prep_icons.py` 设定的 0.84 不符；重跑后要人眼确认六个物品的相对大小。
- [ ] `slice_anim_extra.py` 写 `scaleFix: 1.0` 只是占位，需按内容高反算后手改（当前三个 clip 已是 0.914 / 0.867 / 0.754）。
- [ ] 武器出招帧号由 `swingT` 推导、不跟 fps：想更顺就重出 `seq-<key>.png` 再跑 `slice_weapon_seq.py`，别在代码里插帧。
- [ ] 持械行走（`WEAPON_WALK_CLIP`）的画风与原画有差距：要统一得连 `hold-*` / `atk-*` 一起重出。
- [ ] **武器帧的 `anchorX` 还是脚本猜的，31 个状态有逐帧差**（最大跨度 0.61 ≈ 屏幕 97px）。
  工具已就位（`tools/align_weapon_frames.html` 人眼拖 → 导出 JSON → `tools/align_apply.py` 回填）。
  `python tools/align_apply.py --report` 查现状。

## 活跃坑

按作用域分流：只在某个目录踩的坑写进那个目录的 `AGENTS.md`（进入即自动注入）。
本文件只留跨模块、会伤到玩法的那几条。

### 输入与覆盖层

- **新增任何覆盖层 / 可交互界面，必须同时想手柄怎么过这一页。** `readPad()` 只在 `play` 阶段被调用，
  离开对局就没人读手柄 —— 失败页与通关页曾因此只能鼠标点。
- **手柄按下沿检测必须带「启用闸」**（先见到一次全部松开）。界面刚打开时那一下按键还按在手上，
  不设闸会当场确认掉，玩家看不到界面（模式选择页曾因此被 A 键直接跳过）。
- **界面文案跟输入设备走**：`body` 上的 `dev-pad` / `dev-kbd` / `dev-touch` 由 `js/guide.js` 按「谁在动」切换
  （不是「谁插着」），键位文案与操作图都从它那四张表来，两套永不同时出现。
- **手柄的 `pause` 字段在 `readPad` 里**（`Start`(9) 与 `Back`(8)）。新增手柄键位时，`readPad` 的空返回也要同步补字段。
- **模式选择页打开时必须先把「当前高亮项」画出来**，否则玩家看不出 `Start` 会确认哪一项。
  `openMode()` 里的 `setModePick(S.modePick || "duo")` 就是这道保证。
- **手柄选模式的 `A`/`X`、`B`/`Y` 是「直选」，不是「移光标 + 确认」**：按 `A` 两下（想「开始游戏」）会落到单人。
  页脚提示必须写清，别指望玩家自己猜。
- **测手柄要用 `navigator.getGamepads` 桩 + 关闭后台节流**：注入假 `getGamepads` 后逐帧按，
  同时给 Chrome 加 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion` ——
  否则页面 `hidden` 时 rAF 停摆，测出来就是「手柄识别到 0 个」，会把正常功能误判成坏掉。

### 玩法与状态机

- **连击的 `swingQueued` 在第一分支开头必须清**：置位在 `swingT<=0` 分支，消费只挂在 `if(p.swingT>0)` 块内 ——
  收招期间记的 `true` 当场没人消费，等 `swingCd` 归零后再按，那一刀打完会把残留当成「接第二段」，凭空多出一刀。
- **`PICK_RANGE` 与 `HINT_RANGE` 必须完全相等**：曾经是 80 vs 90，80~90 这一圈里「气泡写着按 L 拾取，按了却捡不起来」。
  判定与提示用同一个常量，别在 `tryPickup` 里写死数字。
- **机关（`G.mechanisms`）每加新的要先清已激活的**：已激活的金光机关一直立着，且避让逻辑每有一个机关就把新落点 +320。
  宝箱同理但要反过来 —— 未开的留着，只清已开的。
- **武器只有手上那一把**（单手一把语义）：捡到好的直接换手，旧的落回原地；HUD 没有背包格。别把 4 格背包加回来。

### 性能

- **`syncHUD` 里的 `getElementById` 要缓存**：节点整局不变，每帧 11 次在 60fps 下是 660 次/秒。用 `hudEl()` 记住。
  同理 `EnemyArt.ready()` 要提到敌人循环外面 —— 它内部遍历整张帧表，满屏 7 敌就是 7 次全表遍历/帧。
- **`burst()` 必须按 `room` 截断，`updateParticles()` 还要兜底夹一次**：粒子来源多（打击、死亡、旋风、宝箱、
  命中火花、武器拖尾），只在 `burst` 里限流挡不住多源叠加。
- **`dt` 被钳在 0.045 秒**（`index.html` 的 loop）。CDP / Playwright 环境下 rAF 常被节流到 1~2 fps，
  于是世界以 16 倍慢放 —— 测步频、测动画循环别用真实时间，要用固定步长复算。

## 文档地图

- 想改玩法 → `index.html`；想改画面 → [js/README.md](js/README.md)。
- 想知道为什么这么设计 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 想键位、各页面怎么操作 → [docs/OPERATIONS.md](docs/OPERATIONS.md)。
- 想查机制数值、六阵、文物依据 → [docs/GAMEPLAY.md](docs/GAMEPLAY.md)。
- 想重新出素材 → [tools/README.md](tools/README.md)；素材契约 → [docs/ASSETS.md](docs/ASSETS.md)。
- 想查某次决策与调查的来龙去脉 → [.agents/notes/](.agents/notes/)。
- 想部署 / 手机端怎么用 → [docs/DEPLOY.md](docs/DEPLOY.md) · [docs/MOBILE.md](docs/MOBILE.md)。
- 想知道这轮修了什么 → [docs/HISTORY.md](docs/HISTORY.md)；审计原文在 `docs/audit/`。
- 想投稿 / 录屏 → [文案包.md](文案包.md) · [操作与录屏说明.md](操作与录屏说明.md)。
- 想查原作机制 → [docs/ORIGINAL-GAME.md](docs/ORIGINAL-GAME.md)。
- 已归档的计划与快照 → `docs/archive/`；进行中的计划 → [docs/PLAN.md](docs/PLAN.md)。
