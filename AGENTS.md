# 双刃战士 · 纵目 — 维护索引

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
| 玩法 | `docs/GAMEPLAY.md` | 机制、数值、六阵、文物对照、青铜病知识（唯一口径）、艺术处理边界 | [docs/GAMEPLAY.md](docs/GAMEPLAY.md) |
| 游戏本体 | `index.html` | 玩法逻辑、状态机、HUD | 直接读，无子手册 |
| 渲染层 | `js/` | 素材加载、视差、帧动画、特效、UI、声音、触屏 | [js/README.md](js/README.md) · [js/AGENTS.md](js/AGENTS.md) |
| 素材流水线 | `tools/` | 生图后处理、切片、自检、访问日志查询 | [tools/README.md](tools/README.md) · [tools/AGENTS.md](tools/AGENTS.md) |
| 素材契约 | `docs/ASSETS.md` | 画布、锚点、朝向、`scaleFix` 的唯一口径 | [docs/ASSETS.md](docs/ASSETS.md) |
| 素材产物 | `assets/` | 生成物，只读，不手改 | [tools/README.md](tools/README.md) |
| 素材展示页 | `showcase.html` + `.css` + `.js` | 录屏用的素材总览（只读 `js/anim-data.js` 与 `assets/`） | 本文件「素材展示页」一节 |
| 部署与手机 | `docs/DEPLOY.md` · `docs/MOBILE.md` | 上线要求、`?v=` 缓存版本号、访问统计、移动端实现与验收 | 同左 |
| 修复记录 | `docs/HISTORY.md` + `docs/audit/` | 审计问题状态总表；三份审计原文归档 | [docs/HISTORY.md](docs/HISTORY.md) |

## 验证命令（每次收工全跑，全绿才算完）

```powershell
node tools/check-inline.mjs          # index.html 内联脚本语法
node tools/selftest_enemies.mjs      # 敌人绘制自检（mock canvas，不开浏览器）
node tools/selftest_audio.mjs        # 声音自检（mock Web Audio，不开浏览器）
node tools/selftest_weapons.mjs      # 武器视觉自检（三件套覆盖 / 绘制分流 / 降级）
node tools/bump-version.mjs --check  # 四页 27 处 ?v= 是否同一个令牌
Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }
python <maintenance-flow>/check-markdown-links.py . --fragments
```

改了 `js/` 或素材，跑 `node tools/bump-version.mjs --note "说明"` 让脚本写 `?v=`，别手改。
格式与理由见 [docs/DEPLOY.md](docs/DEPLOY.md) 的「四、缓存版本号」。

## 重新生成素材（覆盖 `assets/` 与 `js/anim-data.js`，先提交再跑）

| 命令 | 产物 |
|---|---|
| `python tools/slice_anim.py` | 角色 9 动作 → `assets/anim/`（重写 `window.ANIM`） |
| `python tools/slice_anim_extra.py` | 新增 3 动作 → `assets/anim/`（就地替换 / 追加三个 clip） |
| `python tools/slice_weapon_assets.py` | 武器站立帧 / 专属特效 → `assets/anim/hold-*`、`assets/fx/`（就地写 `ANIM_HOLD` / `WEAPON_FX` / `HIT_MATERIAL` 三块）**加 `--with-atk` 才产出已废弃的 `atk-*`** |
| `python tools/slice_weapon_seq.py` | **默认不写任何文件**（旧 `WEAPON_ATTACK_CLIP` 通道已废弃）；`--with-atk` 才切 `atk-<key>-<0..3>` |
| `python tools/slice_weapon_walk.py --src <目录>` | 武器持械行走四帧 → `assets/anim/walk-<key>-<0..3>`（写 `WEAPON_WALK_CLIP`） |
| `python tools/prep_interact.py` | 宝箱 / 机关 / 拾取物 → `assets/interact/` |
| `python tools/prep_touch.py` | 手机虚拟键的青铜盘 / 金线纹样 → `assets/touch/` 10 张（**不写 `js/`**） |
| `python tools/prep_icon_alpha.py` | 站点图标：洋红源图 → 透明底 → `assets/icon/` 全套 + favicon |
| `python tools/prep_icons.py` | 武器 / 物品 / 界面图标 → `assets/icons/` |
| `python tools/prep_fx.py` | 刀光 / 火花 / 旋风环 / 石块 |
| `python tools/prep_assets.py` | 背景 / 道具 / 角色底图 |
| `python tools/slice_enemy_anim.py` | 敌人 4 类 → `assets/anim/enemy-*` |

- `slice_anim.py` 默认只切角色；敌人用 `--only enemy`。它会重写整份 `window.ANIM`，跑完必须补 `slice_anim_extra.py`。
- 会清空 `assets/anim/` 全部 `.webp`，跑之前先确认敌人帧可重出。

## 素材展示页（录屏用）

与游戏本体完全解耦：只读 `js/anim-data.js` 与 `assets/`，不改游戏、不改素材。

| 文件 | 职责 |
|---|---|
| `showcase.html` | 页面骨架 + 顶栏统计 + 青铜病按语（俗称青铜癌） |
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

**改素材 / 删素材时必须回头查这批手写清单**：`showcase.js` 的 `BG` / `PROPS` / `INTERACT` /
`ICONS` / `UIS` / `TOUCH` / `APPS` / `CHARSHEET` / `GENERIC_FX` 都是手写的（浏览器不能列目录），
删了图不删行就是 404 空框；三处**算式**（顶栏统计、武器表页脚、全集页脚）原本是硬编常数，
现在都从数据表实时算。`WSTATES` 会按 `WEAPON_ATTACK` / `WEAPON_ATTACK_CLIP` 是否存在动态增删，
列数写进 CSS 变量 `--wcols` —— **`.wt` 的 `repeat(8, …)` 不许改回常数**，
否则状态列一变就整张表行行错位（已实测）。
`TOUCH` 是手机虚拟键那 10 张（`assets/touch/`），**单独一张表**而不是并进 `UIS` ——
`UIS` 的渲染路径是 `assets/ui/ + name`，并进去会拼出 `assets/ui/plate.webp` 这种 404 路径。

## 验证快照

- **2026-10-26（合并键位重排 + 透明图标 + 入口收敛后）**：`index.html` 4797 行，`assets/` 281 文件 19.59 MB。
  键位重排（一个动作一个键、玩家二改方向键 + 小键盘）、透明底图标全套、启动器绕开 IE、
  `tools` 全部去硬编码。**同时修掉 `#31`/`#32` 合并时 12 个 script 标签各写两次的问题**（`guide.js` 双份轮询会重复绑监听）。
  版本号 `20261026c` → `d`。
- 2026-10-24（武器视觉 + 出招序列 + 暂停 + 指南模块化 + 攻击/拾取分家后）：`check-inline` 通过；`selftest_enemies` 0 失败；`selftest_audio` 0 失败；`selftest_weapons` 0 失败；`node --check` 9/9 通过。
- 2026-10-24（背包改单手 + 去遮挡物阴影 + 并入 main 暂停/Guide 模块化）：check-inline 通过（内联脚本 120422 字符）；selftest_enemies / selftest_audio / selftest_weapons 0 失败；node --check 9/9 通过。
- 2026-10-25（手柄震动 js/rumble.js + 键位指南放大）：check-inline 通过（内联脚本 127304 字符）；selftest_enemies / selftest_audio / selftest_weapons 0 失败；node --check 10/10 通过。
- 暂停链路由 CDP 驱动本机 `file://` 页面实测：Esc 暂停 / 解冻、抽屉开着时 Esc 只收抽屉、暂停中切设备换图、R 重开、暂停页点击、非 play 阶段不响应，逐条断言通过。
- **2026-10-25（手机端适配 + 三份审计修复后）**：`check-inline` 通过（内联脚本 139378 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12 通过。浏览器端 12 项端到端断言全绿（0 报错 / 对局正常 / 敌人峰值 7 / 粒子不超 600 / `readPad` 有 `pause` / 拾取半径与提示半径都是 90 / `short` dur=55 / axe walk 3 帧 / `Touch` 已加载 / 粒子兜底 900→600 / `syncHUD` 60 帧 0 次 `getElementById`）。
- **2026-10-25（提音量 + 重做 BGM 编曲后）**：`check-inline` 通过（内联脚本 139514 字符）；`selftest_enemies` / `selftest_audio`（29 项）/ `selftest_weapons` 全 0 失败；`node --check` 12/12 通过；链接检查 31 文件 75 链接 0 错。浏览器实测：`file://` 直开、进单人模式、开局 BGM 起、挥砍与跳跃出声、控制台 0 报错 0 警告。离线渲染 A/B：同场景 RMS +2.8 dB、峰值 +2.6 dB、**0 个削波样本**（峰值 -19.3 dB，离满量程还差 19 dB）。动机核验：档 0 走 D–G–F–A，档 3 走 D5–C5–A4–G4–A–G–F–D，低音线 D3/A2，档 3 drone 顶到 Eb3。
- **2026-10-25（刀光朝向定案 + 刃口高光锚定后）**：`check-inline` 通过（内联脚本 140318 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons`（新增 5b/5c 两节）全 0 失败；`node --check` 12/12 通过；链接检查 30 文件 75 链接 0 错。朝向回归防线实测有效：把 `slashMirror` 临时改回 `facing < 0` 当场 14 项失败。像素探针（900×460，两朝向并排）：`facing=+1` 质心 `mass_x=+4.61`、`facing=-1` 为 `-5.32`（都在锚点身前），互为镜像偏差 `dx=0.71 / dy=0.03`。版本号 `20261025d` → `e`。
- **2026-10-25（BGM 换成外部音轨后）**：`check-inline` 通过（内联脚本 138516 字符）；`selftest_enemies` / `selftest_audio`（43 项，新增第 9 节音轨断言 16 项）/ `selftest_weapons` 全 0 失败；`node --check` 12/12 通过。BGM 改为 `assets/audio/bgm-main.mp3`（256 kbps / 48 kHz 立体声 / 222 秒 / 6.8 MB，`<audio>` 元素循环播放），音轨缺席或被拦时退回原程序化 BGM。人耳实测：`file://` 直开、进单人模式即出声。
- **2026-10-25（清死键 + 删 atk-* + 封住会复活的生成入口后）**：`check-inline` 通过（内联脚本 142602 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12 通过；链接检查 30 文件 78 链接 0 错。素材：`assets/` 330 文件 21.55 MB → **270 文件 19.48 MB**，剔音视频 10.24 → **8.17 MB**。`MANIFEST` 52 键 / 50 路径 → **41 键 / 40 路径**（`Assets.load()` 加同路径去重）。浏览器实测 `file://` 直开：**41/41 图全部 ready、控制台 0 报错 0 警告**；运行时逐帧抓 `drawImage` 确认挥砍走 `attack-short-0..3`、走路 `walk-short-*`、跳跃 `jump-short-*`、受击 `hurt-short`、拾取 `pickup-short`，**`atk-*` 命中 0 次**（无悬空引用）。版本号 `20261025j` → `k`。
- **2026-10-26（合上游 `l` + 素材总览页对齐后）**：`check-inline` 通过（内联脚本 146336 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12 + `showcase.js` 通过；链接检查 30 文件 75 链接 0 错。合并时 3 处冲突逐条按语义解（版本号取 `m`、`Assets.load()` 同时保 `onProgress` 与同路径去重、`js/README.md` 取并集）。`file://` 实测载入链：**41/41 静态图 ready + `CharArt.progress` 185/185 + `EnemyArt.progress` 14/14**，载入条走满才放行，控制台 0 报错 0 警告。展示页（`node serve-showcase.mjs`，http）7 个 tab 全查：**0 张 404、0 报错**，顶栏统计 **199 帧 / 268 文件 / 49 组 / 11 武器**。运行时引用的 248 条路径 0 缺失。
- **2026-10-26（手机端逻辑视口加宽，填满屏幕）**：`check-inline` 通过；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12；链接检查 0 错。`W` 改为可变量：桌面恒 1600，触屏按 `H × 视口宽高比` 加宽、上限 2100、量化 8px。**高度恒 900，所以缩放与角色尺寸一个像素都不变**（844×390 实测仍是 0.4339）。填充率：iPhone SE 100% / iPhone 13 99.8% / 安卓 20:9 99.9% / 21:9 99.9%（加宽前 17.9~20% 是黑边）；iPad 4:3 与竖屏不加宽、行为不变；桌面超宽屏仍留白、零回归。浏览器 `file://` 实测多种视口：0 报错 0 警告，双人 HUD 两侧血条各自贴边（右边距 13px = `right:28px` × 0.458），竖屏遮罩正常。
- **2026-10-26（手机虚拟键美术：青铜盘 + 金线纹样 + 攻击键跟随武器）**：素材：`tools/prep_touch.py` 出 `assets/touch/` **10 张 144 KB**（2 张青铜盘 256² + 8 张金线纹样 256²、长边 179）。三层：盘（`plate` 正圆 / `plate-sq` 圆角方，占画布 0.96）→ 暗刻纹样（`opacity .52`）→ 原有文字；**攻击键持械时键面直接显示当前武器图标**（复用 `assets/icons/` 既有 10 张 + `index.html` 的 `WP_ICON`，路径从 `Assets.MANIFEST` 取，零新增图）。浏览器 `file://` 实测 844×390 `?touch=1`：**盘 2/2、纹样 8/8 全 ready**；11 把武器逐个切过去 `atk` 全 `armed` 且图标名正确（`rock→wpRock` 按 0.411 单独缩放、`blade/jar/bell` 走物品族），空手退回 `bare`；10 枚键 0 重叠；控制台 0 报错 0 警告；桌面档 `?touch=0` **对 `assets/touch/` 零请求**、无按键层。展示页（`node serve-showcase.mjs`，http）实测：界面 tab 的「手机虚拟键」组 10 格全部加载、**78 个请求 0 张 404**，顶栏统计 199 帧 / **278 文件**（268 → +10）/ 49 组 / 11 武器。参数是截图调出来的：纹样 `.44` 看不见 → `.52`；武器图标 `0.72` 会让近方形的眼形石压住盘沿金纹 → `0.62`；按下态金雾会盖住武器图标 → `.tch-wp{z-index:1}`。
- **2026-10-26（两条手机特性合并后，`#31` + `#32`）**：`check-inline` 通过（内联脚本 148293 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12 + `showcase.js` 通过；链接检查 31 文件 92 链接 **0 错 / 13 警告**（与 `main` 基线同数，未新增）；换行检查 78 文件 0 混行。合并时 4 个文件冲突逐条按语义解：版本号两条线各自占 `20261026b` 与 `20261025n`，合并后统一取 **`20261026c`**；[js/README.md](js/README.md) 与 [docs/MOBILE.md](docs/MOBILE.md) 的触屏段两处都在描述同一套美术，取随代码进来的定稿（`.52` / `0.62` / `z-index` / 实测包围盒），丢弃分支侧的初稿；`AGENTS.md` 两条快照都保留、统计按合并后实测重写。**规格：`W` 只在触屏档加宽、高度恒 900，所以 `scaleFix` 与所有判定盒不受影响**。
- 素材分布：`anim/` 199、`fx/` 13、`icons/` 10、`icon/` 10、`ui/` 10、`touch/` 10、`interact/` 6、`props/` 8、`char/` 1、`audio/` 1、`video/` 1、根 11。
- 素材预算：单帧 ≤ 60 KB（实测最大 55.4 KB）、总量 ≤ 8 MB（上调依据见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的「素材流水线」）。**8 MB 只算游戏素材**：含 `audio/`（6.78 MB）+ `video/`（4.53 MB）时总量 20.11 MB，**剔除音视频后 279 文件 8.79 MB，超预算 0.79 MB**（2026-10-26 实测；其中 `assets/touch/` 10 张 0.14 MB、`assets/exhibition/手柄键位.png` 0.48 MB）。剩下的都是运行时真加载的，再压只能整批降采样重出。
- 帧数：角色 12 个 clip 共 43 帧；敌人 4 类共 14 帧；武器站立帧 11、持械行走 11 把（其中斧头 3 帧，见活跃坑）。**出招只剩一套**：`WEAPON_CLIP.attack` 每把 4 帧（11 把 = 44 帧），旧的 `atk-<key>` 单帧与 `atk-<key>-<i>` 序列已删。
- 关卡：6 阵共 85 体。
- 无 CI，以上为本机手工结果；改完代码重跑一遍再写结论。

## 待办

- [ ] **代码侧没有回指文档**：`index.html` 的 `WEAPONS` / `buildWaves()` / `Enemy` 构造与 `js/guide.js` 四张图例表，
  表头都该加一行「口径 → docs/GAMEPLAY.md（或 OPERATIONS.md）」。现在只有文档指代码、没有注释指回来，
  改数值时从代码这一侧查不到同步点。清单见 [docs/README.md](docs/README.md) 的反向路由表。
- [ ] `FX.drawHudPanel` 无调用方（`FX.drawWhirl` 已接进 `drawWhirlAsset`）。
- [ ] `slice_anim_extra.py` 写 `scaleFix: 1.0` 只是占位，需按内容高反算后手改（当前三个 clip 已是 0.914 / 0.867 / 0.754）。
- [ ] 武器出招帧号由 `swingT` 推导、不跟 fps：想更顺就重出 `seq-<key>.png` 再跑 `slice_weapon_seq.py`，别在代码里插帧。
- [ ] 持械行走（`WEAPON_WALK_CLIP`）的画风与原画有差距：要统一得连 `hold-*` / `atk-*` 一起重出。
- [ ] **武器帧的 `anchorX` 还是脚本猜的，31 个状态有逐帧差**（最大跨度 0.61 ≈ 屏幕 97px）。
  工具已就位（`tools/align_weapon_frames.html` 人眼拖 → 导出 JSON → `tools/align_apply.py` 回填）。
  `python tools/align_apply.py --report` 查现状。

## 已结清（上一轮清死素材）

- [x] ~~`js/assets.js` 里 `pose1` / `charFront` / `charSide` / `charBack` 四个键无消费方~~ —— 2026-10-25 已删（连文件，省 260 KB）。
- [x] ~~`itCowrie` / `itEye` 与 `iconEye` / `iconMask` / `iconLeiwen` / `iconTree` 六个图标键无消费方~~ —— 2026-10-25 已删（连文件，省 33 KB）；`prep_icons.py` 加了 `DEAD_ITEMS` / `WRITE_UI_ICONS` 开关，防止重跑复活。
- [x] ~~`wpShort` 与 `wpDagger` 同路径、`wpRock` 与 `itRock` 同路径~~ —— 2026-10-25 删掉 `itRock`（无人读），并在 `Assets.load()` 加同路径去重：现在 41 键 / 40 条路径，`wpShort`/`wpDagger` 共用同一个 `Image`。
- [x] ~~`atk-*` 50 张（1.78 MB）是纯冗余的二重位图降级~~ —— 2026-10-25 已删图 + 删 `WEAPON_ATTACK` / `WEAPON_ATTACK_CLIP` 数据块；两个生成脚本加了 `--with-atk` 默认关。

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
- **手机加宽逻辑视口后，背景各层不能一刀切**（2026-10-26）。`W` 是变量，
  但三层各有各的正确做法，用错就是「填满了但很怪」：
  - **远景必须等比缩放**：图里有个**正圆太阳**，拉伸到 1944 宽（+22%）当场变椭圆。
    做法是按宽度算统一系数、把图内地平线对齐 `GROUND`、溢出向上裁；
    `drawSunGlow()` 的圆心与半径也要乘同一个系数，否则光晕和太阳错开。
  - **中景必须保持素材原尺寸平铺**：等比放大到视图宽会让高度从 641 涨到 779，
    贴地面线后顶到画外 —— **天空整块被吃掉、柱子变粗 21%、编钟横梁被裁断**
    （已截图对比，明显变闷）。原尺寸 + 交替镜像平铺才对。
  - 地面本来就等比平铺，不用动。
- **加宽时高度恒定是唯一的保命绳**：只加宽不改高，`scaleFix`、角色身高、
  拾取半径、攻击够到距离、`GROUND` 全部不用重算。一旦动高度，
  178~181px 那条验收线、所有碰撞盒、`WORLD_W` 的关卡节奏全要重来。
- **改 `W` 必然重设 `canvas.width`，那会清空画布并复位 ctx**，所以必须量化
  （现在是 8px 一档）且只在真的变了才调 —— 地址栏收展会高频触发 `fit()`，
  逐像素抖动就是逐帧闪一下。
- **`W` 只在触屏档加宽**（`isTouchUI()`，与 `js/touch.js` 的 `available()` 同口径，
  只看触摸硬件不看 `PointerEvent`）。桌面恒 1600：16:9 刚好铺满、超宽屏保持原来的留白。

- **虚拟键的美术层有三条「只能截图调」的参数**（2026-10-26 实测，改之前先看依据）：
  - **纹样不透明度 `.52`**：`.44` 在青绿盘面上几乎看不见（等于白做一层素材），`1.0` 又跟文字抢读。
  - **攻击键武器图标长边 `0.62`**：盘内面只有按钮的约 `0.78`，`0.72` 会让「眼形石」这类**近方形**图标吃满内面、压住盘沿金纹；长条形的刀斧在 `0.72` 下本来更好，但两者只能共用一个数 —— 取小的。
  - **按下态金雾会盖住武器图标**：`.tch-b.art.on::after` 生成在所有子元素之后，`::after` 不显式抬 `.tch-wp` 的 `z-index` 就会把刀斧糊成一片金。文字 `.tch-lab` 是 `z-index:2`，图标 `1`，金雾 `auto`。
  三条都是**先在 1× 真实尺寸、再在 2× 放大各看一次**定的 —— 只看放大图会高估可读性。

## 文档地图

- 想改玩法 → `index.html`；想改画面 → [js/README.md](js/README.md)。
- 想知道为什么这么设计 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 想键位、各页面怎么操作 → [docs/OPERATIONS.md](docs/OPERATIONS.md)。
- 想查某条事实归谁管（改之前先查路由表）→ [docs/README.md](docs/README.md) 的「事实路由表」。
- 想查机制数值、六阵、文物依据、青铜病知识 → [docs/GAMEPLAY.md](docs/GAMEPLAY.md)。
- 想重新出素材 → [tools/README.md](tools/README.md)；素材契约 → [docs/ASSETS.md](docs/ASSETS.md)。
- 想查某次决策与调查的来龙去脉 → [.agents/notes/](.agents/notes/)。
- 想部署 / 手机端怎么用 → [docs/DEPLOY.md](docs/DEPLOY.md) · [docs/MOBILE.md](docs/MOBILE.md)。
- 想看访问量 / 谁来过 → `python tools/visits.py`；口径与 Caddy 侧配置在 [docs/DEPLOY.md](docs/DEPLOY.md) 「五、访问统计」。
- 想知道这轮修了什么 → [docs/HISTORY.md](docs/HISTORY.md)；审计原文在 `docs/audit/`。
- 想投稿 / 录屏 → [文案包.md](文案包.md) · [操作与录屏说明.md](操作与录屏说明.md)。
- 想查原作机制 → [docs/ORIGINAL-GAME.md](docs/ORIGINAL-GAME.md)。
- 已归档的计划与快照 → `docs/archive/`；进行中的计划 → [docs/PLAN.md](docs/PLAN.md)。
