# 三星堆·双刃战士 — 维护索引

单页横版双人清版动作游戏。零依赖，`file://` 双击可跑。

## 硬约束（改任何代码前先确认不破坏这四条）

- 禁 CDN / npm / 外部字体 / ES module —— `file://` 下会被 CORS 拦，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 位图只管好看，判定只用数字 —— 改绘制不许动碰撞盒，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 每层素材必须有纯代码降级 —— 任何缺图都不许白屏，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 帧数据与绘制解耦 —— 改动作只改 [js/anim-data.js](js/anim-data.js)，不碰绘制模块。

## 分层索引（每层职责互斥，改之前先看自己那一层）

| 层 | 位置 | 职责 | 手册 |
|---|---|---|---|
| 门面 | `README.md` | 对外介绍、文物依据 | [README.md](README.md) |
| 设计 | `docs/ARCHITECTURE.md` | 不变的决策与防错清单 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 游戏本体 | `index.html` | 玩法逻辑、状态机、HUD | 直接读，无子手册 |
| 渲染层 | `js/` | 素材加载、视差、帧动画、特效、UI、声音 | [js/README.md](js/README.md) · [js/AGENTS.md](js/AGENTS.md) |
| 素材流水线 | `tools/` | 生图后处理、切片、自检 | [tools/README.md](tools/README.md) · [tools/AGENTS.md](tools/AGENTS.md) |
| 素材产物 | `assets/` | 生成物，只读，不手改 | [tools/README.md](tools/README.md) |
| 素材展示页 | `showcase.html` + `showcase.css` + `showcase.js` | 录屏用的素材总览（只读 `js/anim-data.js` 与 `assets/`，不改游戏） | 本文件「素材展示页」一节 |

## 验证命令（每次收工全跑，全绿才算完）

```powershell
node tools/check-inline.mjs          # index.html 内联脚本语法
node tools/selftest_enemies.mjs      # 敌人绘制自检（mock canvas，不开浏览器）
node tools/selftest_audio.mjs        # 声音自检（mock Web Audio，不开浏览器）
node tools/selftest_weapons.mjs      # 武器视觉自检（三件套覆盖 / 绘制分流 / 降级）
Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }
python <maintenance-flow>/check-markdown-links.py . --fragments
```

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
| `python tools/prep_icons.py` | 武器 / 物品 / 界面图标 → `assets/icons/` |
| `python tools/prep_fx.py` | 刀光 / 火花 / 旋风环 / 石块 |
| `python tools/prep_assets.py` | 背景 / 道具 / 角色底图 |
| `python tools/slice_enemy_anim.py` | 敌人 4 类 → `assets/anim/enemy-*` |

`slice_anim.py` 默认只切角色、只删角色帧；敌人用 `--only enemy`。
`slice_anim.py` 重写整份 `window.ANIM`，会丢掉新增的 3 个动作，跑完必须补 `slice_anim_extra.py`。

## 素材展示页（录屏用）

三个文件，与游戏本体完全解耦：只读 `js/anim-data.js` 与 `assets/`，不改游戏、不改素材。

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
不裁的话 560px 画布配 40% 透明边距，主体被压成一半、还容易被 `overflow` 裁到头脚。
归一化的分子三族共用：角色 / 武器用 `252 × scaleFix`，敌人用 `index.html` 构造函数里的 `scale`。
武器组取 **90 分位**而不是最大值 —— 举钺/举锤那一帧尖端高过头顶，按最大值归一会把整行压小一圈。

```js
/* 同步点：数据表改名了，这三处要一起改 */
WEAPONS  // 武器中文名 ← index.html 的 WEAPONS 表
ENEMIES  // 敌人中文名 ← README；第 4 列比例 ← index.html 的构造函数
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
- **2026-10-26（两条手机特性合并后，`#31` + `#32`）**：`check-inline` 通过（内联脚本 148293 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12 + `showcase.js` 通过；链接检查 31 文件 92 链接 **0 错 / 13 警告**（与 `main` 基线同数，未新增）；换行检查 78 文件 0 混行。合并时 4 个文件冲突逐条按语义解：版本号两条线各自占 `20261026b` 与 `20261025n`，合并后统一取 **`20261026c`**；[js/README.md](js/README.md) 与 [docs/手机端适配.md](docs/手机端适配.md) 的触屏段两处都在描述同一套美术，取随代码进来的定稿（`.52` / `0.62` / `z-index` / 实测包围盒），丢弃分支侧的初稿；`AGENTS.md` 两条快照都保留、统计按合并后实测重写。**规格：`W` 只在触屏档加宽、高度恒 900，所以 `scaleFix` 与所有判定盒不受影响**。
- 规模：`index.html` 约 4763 行；`js/` 12 个模块；`assets/` 281 个文件 20.11 MB。
- 素材分布：`anim/` 199、`fx/` 13、`icons/` 10、`icon/` 10、`ui/` 10、`touch/` 10、`interact/` 6、`props/` 8、`char/` 1、`audio/` 1、`video/` 1、根 11。
- 素材预算：单帧 ≤ 60 KB（实测最大 55.4 KB）、总量 ≤ 8 MB（上调依据见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的「素材流水线」）。**8 MB 只算游戏素材**：含 `audio/`（6.78 MB）+ `video/`（4.53 MB）时总量 20.11 MB，**剔除音视频后 279 文件 8.79 MB，超预算 0.79 MB**（2026-10-26 实测；其中 `assets/touch/` 10 张 0.14 MB、`assets/exhibition/手柄键位.png` 0.48 MB）。剩下的都是运行时真加载的，再压只能整批降采样重出。
- 帧数：角色 12 个 clip 共 43 帧；敌人 4 类共 14 帧；武器站立帧 11、持械行走 11 把（其中斧头 3 帧，见活跃坑）。**出招只剩一套**：`WEAPON_CLIP.attack` 每把 4 帧（11 把 = 44 帧），旧的 `atk-<key>` 单帧与 `atk-<key>-<i>` 序列已删。
- 关卡：6 阵共 85 体。
- 无 CI，以上为本机手工结果；改完代码重跑一遍再写结论。

## 待办

- [x] ~~`js/assets.js` 里 `pose1` / `charFront` / `charSide` / `charBack` 四个键无消费方~~ —— 2026-10-25 已删（连文件，省 260 KB）。
- [x] ~~`itCowrie` / `itEye` 与 `iconEye` / `iconMask` / `iconLeiwen` / `iconTree` 六个图标键无消费方~~ —— 2026-10-25 已删（连文件，省 33 KB）；`prep_icons.py` 加了 `DEAD_ITEMS` / `WRITE_UI_ICONS` 开关，防止重跑复活。
- [x] ~~`wpShort` 与 `wpDagger` 同路径、`wpRock` 与 `itRock` 同路径~~ —— 2026-10-25 删掉 `itRock`（无人读），并在 `Assets.load()` 加同路径去重：现在 41 键 / 40 条路径，`wpShort`/`wpDagger` 共用同一个 `Image`。
- [x] ~~`atk-*` 50 张（1.78 MB）是纯冗余的二重位图降级~~ —— 2026-10-25 已删图 + 删 `WEAPON_ATTACK` / `WEAPON_ATTACK_CLIP` 数据块；两个生成脚本加了 `--with-atk` 默认关。
- [ ] `FX.drawHudPanel` 无调用方（`FX.drawWhirl` 已接进 `drawWhirlAsset`）。
- [ ] 物品族图标长边占比 0.41~0.65，与 `prep_icons.py` 设定的 0.84 不符（说明这批是更早版本脚本的产物）。重跑一次可对齐；重跑后要人眼确认四个物品的相对大小（`it-rock` 只有 79×79，是四张里最小的）。
- [ ] 持械行走（`WEAPON_WALK_CLIP`）的画风与原画有差距：新素材是 AI 重出的青铜面具武士，描边更粗、配色更平。要统一就得连 `hold-*` 一起重出，单改行走会更割裂。
- [ ] **武器帧的 `anchorX` 还是脚本猜的**：`python tools/align_apply.py --report` 实测 **13 个状态屏幕抖动 > 16px**，最大 92.7px（铃 `attack`）；其后是锤 `jump` 68.2、石 `jump` 67.4、石 `attack` 62.1、锤 `attack` 60.2、矛 `attack` 54.2、匕首 `attack` 78.3、剑 `attack` 36.9、斧 `jump` 36.8、刃 `attack` 33.5、斧 `attack` 29.4、罐 `attack` 20.6、短剑 `attack` 19.7。工具已就位（`tools/align_weapon_frames.html` 人眼拖 → 导出 JSON → `tools/align_apply.py` 回填），需人眼逐状态对。
- [ ] `slice_anim_extra.py` 的 `scaleFix` 现在**不会被重跑覆盖**（沿用旧值 + 打印包围盒反算值供对照），但它也算不出正确值 —— 弯腰 / 蹲低的 clip 按包围盒归一化会把人放大到站高。新增 clip 时脚本会写 `1.0` 占位并警告，必须人眼实测后手改。

## 活跃坑

- **「素材就绪」不等于「帧图就绪」**。`Assets.load()` 只管 MANIFEST 里那 40 条路径
  （41 个键，`wpShort`/`wpDagger` 同路径只建一个 `Image`）；
  199 张动画帧（角色 185 + 敌人 14）是 `char-rig.warm()` 与 `enemies-assets.warmKind()` 自己建的。
  标题页的载入条因此要**两段合起来算**：静态 + 两个模块的 `progress()`。
  只等静态就放行，玩家会看到「进度走满 → 开打 → 角色是青色降级方块」（已实测）。
  `progress()` 只数已建的 Image、不新建 —— 自己再 new 一遍会让解码内存翻倍。

- 生图条带的角色身高不一致（walk 比 idle 小 33%），靠 `js/anim-data.js` 的 `scaleFix` 校正。
- **`anchorX` 是「逐帧身体轴」，`scaleFix` 是「整段一个身高」，两者别混谈。** 走路左右乱跳只可能是 `anchorX`：
  `scaleFix` 一变是整个人忽大忽小（那是另一个已修的 bug），而 `anchorX` 一变是人左右横跳。
  实测屏幕位移 = `(max(anchorX) - min(anchorX)) × 画布宽 × scaleFix × 252/画布高`。
- **`anchorX` / `footY` 不许再让脚本猜。** 切片脚本用「剪影中线」定身体轴，但举武器时剪影中心被拽走：
  同一把武器四帧能猜出 0.26 和 0.82。这与「朝向只能人眼看鼻子」是同一个根因 ——
  剪影的几何中心不是身体的轴。要改就开 `tools/align_weapon_frames.html` 用眼睛对，
  导出 JSON 后 `python tools/align_apply.py align.json` 回填。
- **`js/anim-data.js` 里 `footY` 与 `anchorX` 挤在同一行**（`footY: 1.0, anchorX: [...]`），
  用 `^\s*anchorX:` 之类的行首锚定正则一个都匹配不到 —— 找字段只能 `\banchorX:`。
  这个坑让 `align_apply.py --report` 一开始静默输出「全部已对齐」（把 31 个未对齐状态全漏掉）。
- **`align_weapon_frames.html` 导出必须是合法 JSON**（键名带引号、带武器名那一层）。
  早先导出的是给人抄的 JS 片段（`walk: {` 无引号 + 武器名只在注释里），
  `align_apply.py` 当场 JSON 解析失败 —— 「导出 → 回填」中间不许有人工改写。
- **`file://` 下 `canvas` 会因跨源图片被污染**，一 `getImageData` 就 `SecurityError`。
  所以对齐工具只画不读像素；别想着在里面加「自动测包围盒」。
- **`.col-c` 这类 `flex-direction:column` 容器里的 `<canvas>` 会被 `align-items:stretch` 拉宽**，
  位图被非等比放大一次（1000 → 1147），拖起来手感发飘。要给 `align-self:flex-start`。
- **`scaleFix` 不是「抄 1.0 就行」**：屏幕身高 = `252 × scaleFix × (内容高 ÷ 画布高)`，画布里的空白不吃像素。
  - 正确算法以 idle 为基准反算：`scaleFix = (idle 内容高 ÷ idle 画布高) ÷ (该 clip 内容高 ÷ 该 clip 画布高)`。
  - 新增动作只填 `1.0` 会让角色切过去时突然变大：`attack-thrust` 曾渲成 240px、`attack-heavy` 208.6px、`pickup` 198px，而 idle 是 181px。
  - 新动作切片后必须实测内容高（alpha > 24 的包围盒），不能凭画布高填 1.0。
  - 验收标准：12 个动作的屏幕身高统一在 178~181px，容差 ±2px。
- **武器与武器的姿态不能按「内容包围盒高」反算 `scaleFix`**：举钺、举锤时武器尖端高过头顶，包围盒会把角色算成小人（实测 atk-axe 按包围盒 269px、按头冠 174.6px，idle 基准 177.1px）。用「头冠顶 → 脚底」；腰带锚也不行 —— 新图腿更长，腰底占比 0.496 vs idle 0.411，会整体缩 10%。
- **`detect_head` 只认金色头冠**（`R>=180 G>=145 B<=160`）。AI 新出的青铜面具素材不满足该条件，`slice_weapon_walk.py` 因此加了 `body_top()` 兜底（肩线以上、轮廓中心 ±0.30 宽的竖带取最上行）。11 把里 8 把走兜底；两套锚都失败时直接跳过该武器，不造假数据。
- 行走帧号跟 **`p.walk`（累计位移）** 走，常量 `WALK_CYCLE` 是「一个 4 帧循环覆盖多少引导位移」。它与出招相反：出招跟判定（`swingT`）、行走跟位移。按时间自由播会在减速时变滑步。
- 出招序列的 `scaleFix` 是**一把武器一个数**（四帧共用同一画布），`anchorX` 是**逐帧数组**。前者写成逐帧会让连击里忽大忽小，后者写成一个数会让挥砍时整个人左右漂。
- **生图条带的朝向只能人眼看「鼻子朝哪」，不许脚本判。** 试过 4 种几何判据（眼白 vs 冠心、下巴 vs 冠心、靴尖 vs 膝、剪影左右延伸），在 11 张参考图上投票误判 7/11，且错误方向系统性偏「左」；根因是高方冠比脸宽太多、鼻子只突出几个像素、眼白常检不出。也不要用「武器在哪只手」判 —— 武器随姿势换手，鼻子不会。依据见 [.agents/notes/依据-生图条带朝向判据与回传原图坑.md](.agents/notes/依据-生图条带朝向判据与回传原图坑.md)。
- **上游会静默回传输入原图**（输出与参考图 sha256 相同，提示词未生效）。这类图构图配色全「对」，只有尺寸与帧数是错的，肉眼极难发现。**生图验收第一步先读尺寸/宽高比，第二步对输出与输入做 sha256 比对**，都过不了别急着看图。
- 图生图的提示词必须显式写 `do NOT mirror or flip`，并把「鼻子/眉/颊/颌都朝右边缘」写进同一句；只写 `side view facing RIGHT` 约有一半会跑偏。四帧也要逐帧文字描述姿势，否则模型倾向四帧同姿（本批 1v4 帧间差最低只有 6.1%，合格线应 ≥ 8%）。
- `ratio: "16:9"` 不保证像素尺寸恒定：同一批同一模型出过 `1774×887` / `1754×896` / `1842×854` 三种。切片按画布反算 `scaleFix` 前必须先读实际尺寸。
- 洋红底必须 despill，否则边缘一圈紫：见 [tools/README.md](tools/README.md)。
- 多个 agent 共享同一个 Playwright 实例会互相抢浏览器；自检一律走 mock canvas。
- **刀光朝向是一处契约**：源画凸背朝左（实测弧心 `cx/w` 全 > 0.5），要求「凸背朝人面向的方向」，所以面朝右镜像、面朝左原样 —— 与常规写法相反。判据只在 `js/fx.js` 的 `ART_CONVEX` + `slashMirror()`，两条绘制路径共用。改回 `facing < 0` 会让 `selftest_weapons` 的 5b 当场 14 项失败（已实测）。
- **月牙素材左右不对称，不能按包围盒居中**：刃口高光的圆心必须取实测弧心（`js/fx.js` 的 `ARC`，由 `tools/measure_slash.py` 生成），半径取脊线半径。在原点画近似半径的弧，高光会整根悬在图外（实测偏 40px 以上）。
- **验刀光的探针页里不许放文字或辅助线**：它们会进像素统计，曾让 `tools/probe_slash_orient.py` 报出 3.4px 的假不对称。另外 `file://` 下 `getImageData` 抛 `SecurityError`，游戏主循环会让 Playwright 截图超时，`<canvas>` 会被全局 CSS 拉成 1600×900 —— 三条都得绕。
- 声音全在 [js/audio.js](js/audio.js)：打击音实时合成、不读音频文件；BGM 读 `assets/audio/bgm-main.mp3`，用 `<audio>` 元素播放（`file://` 下 `decodeAudioData` 取不到字节，媒体元素能播）。换 BGM 只改 `MEDIA_SRC` 与那份文件；`assets/audio/` 缺席或被拦时自动退回程序化 BGM。
- **提音量只动 `VOL`（总线）与 `MASTER`（总增益），别动配方表里的 `gain`** —— 那些是「相对轻重」语义，改了毁配比。`sfx` 总线上限 1，越过压缩器就压不住峰值。
- **BGM 旋律层是 `PHRASE` 表里的定好动机，不是随机拨弦**。随机音高听起来像素材铺底；每档一条五声乐句，32 步（16 拍）一轮，改旋律只改那张表。
- **新加的音频节点必须带降级分支**：music 支路的延时混响用 `AC.createDelay` 特性探测，老浏览器没有就整段跳过。
- 打击音的材质靠 `startSwing(wp.key)` 传入的武器 key。新增武器必须同时在 `audio.js` 的 `MATERIAL` 里给材质，否则一律听成玉器。
- BGM 的喘息压音只认 `bgm.breathe` 标志（在 `bgmTick` 里统一结算）。直接改 `bus.music` 增益会被下一帧覆盖回满。
- **新增任何覆盖层 / 可交互界面，必须同时想手柄怎么过这一页。** `readPad()` 只在 `play` 阶段被调用，离开对局就没人读手柄 —— 失败页与通关页曾因此只能鼠标点。
- 手柄按下沿检测必须带「启用闸」（先见到一次全部松开）。界面刚打开时那一下按键还按在手上，不设闸会当场确认掉，玩家看不到界面（模式选择页曾因此被 A 键直接跳过）。
- 界面文案跟输入设备走：`body` 上的 `dev-pad` / `dev-kbd` 由 `js/guide.js` 按「谁在动」切换（不是「谁插着」），键位文案与操作图都从它那四张表来，两套永不同时出现。
- 手柄震动入口只有 [js/rumble.js](js/rumble.js) 一处：全部调用点经 `Rumble.player(tag, preset)` / `Rumble.play("all", preset)` 走预设表，别在 `index.html` 直接摸 `vibrationActuator`；不支持 dual-rumble 的浏览器（Firefox/Safari）整条链路静默 no-op。
- 手柄键位以 `index.html` 的 `readPad()` 与 `js/guide.js` 的 `PAD_LEGEND` 为准（`A` 挥刀 / `X` 跳 / `B` 技能 / `Y` 拾取）。对外文档曾把 `A`/`X` 写反，改键位要连 README 与《操作与录屏说明》一起改。
- `slice_anim.py` 生成过 `fps: 6, true, loop: true` 这类语法错误，生成后必须 `node --check`。
- `slice_anim_extra.py` 曾写出缺冒号的 `anim-data.js` 行（`"attack-heavy"{ frames: ...`），整份数据文件当场语法错误；现已在脚本内加 `node --check` 门禁，非 0 直接退出。
- 敌人走路动画按 `e.walk` 累计位移推进，不跟真实时间；改步频调 `enemies-assets.js` 的 `STRIDE`。
- 武器只有手上那一把（单手一把语义）：捡到好的直接换手，旧的落回原地；HUD 没有背包格。改拾取/丢弃/递队友时保持这个语义，别把 4 格背包加回来。
- **`hurt-*` 的源画比 `walk-*` 大 6~19%**（10 把武器的 hurt ratio 全在 0.9893~0.9911，而 walk 只有 0.83~0.97）。5 个状态共用同一个 `scaleFix` 时这个差异会 100% 落到屏幕上 —— 玩家每次挨打都闪一下大小。已给 11 把武器的 `hurt` 单独算 `scaleFix`（验收：walk 与 hurt 屏幕身高差 ≤3px）。**但 `pickup` 不能同样处理**：它是弯腰，宽高比从 2.19 掉到 1.19，按包围盒归一化会把弯腰的人放大到站立高度。判断「是姿势还是画错」看宽高比，不看高度。
- **`WALK_CYCLE` 是按「4 帧一轮」校准的**（3.6 单位位移）。序列只有 3 帧时（斧头，因 `walk-axe-3.webp` 曾缺失）照搬会让步频慢 25%，读起来像滑步。正确写法 `cycle = WALK_CYCLE * n / 4` —— 每帧固定覆盖相同位移，与帧数无关。`drawWalkFrames` 与 `stateFrame` 两条路径必须用同一口径，否则换状态会跳帧。
- **`scaleFix` 的「12 动作统一 178~181px」不能只看数字**：`jump`（蹲）、`pickup`（弯腰）本来就更矮，`dead`（倒地）只在结算页出现。真正的判据是「身体主体高 / 画布高」，且要排除武器尖端（举弓/举锤时尖端高过头顶）。用 15% 宽度阈值取「身体顶部」比包围盒顶可靠。
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
- **触屏按键层不能放进 `#stage`**：`#stage` 是 1600×900 逻辑坐标、被 `transform:scale(0.43)` 缩过，100px 的按钮到屏幕上只剩 43px，低于 44px 规范下限。按键层必须 `position:fixed` 贴视口，尺寸用 `vmin` 夹在 `[48, 84]`。
- **虚拟键的美术层有三条「只能截图调」的参数**（2026-10-26 实测，改之前先看依据）：
  - **纹样不透明度 `.52`**：`.44` 在青绿盘面上几乎看不见（等于白做一层素材），`1.0` 又跟文字抢读。
  - **攻击键武器图标长边 `0.62`**：盘内面只有按钮的约 `0.78`，`0.72` 会让「眼形石」这类**近方形**图标吃满内面、压住盘沿金纹；长条形的刀斧在 `0.72` 下本来更好，但两者只能共用一个数 —— 取小的。
  - **按下态金雾会盖住武器图标**：`.tch-b.art.on::after` 生成在所有子元素之后，`::after` 不显式抬 `.tch-wp` 的 `z-index` 就会把刀斧糊成一片金。文字 `.tch-lab` 是 `z-index:2`，图标 `1`，金雾 `auto`。
  三条都是**先在 1× 真实尺寸、再在 2× 放大各看一次**定的 —— 只看放大图会高估可读性。
- **`assets/touch/` 那 10 张不进 `MANIFEST`**（`js/assets.js`），由 `js/touch.js` 自建 Image 缓存、`available()` 为真才建。塞进清单等于让桌面玩家白等 10 次解码；反过来，`showcase.js` 就得手写 `TOUCH` 表（见「素材展示页」一节）。
- **攻击键跟随武器的唯一真源是 `index.html` 的 `WP_ICON` / `wpIconKey()`**：`js/touch.js` 只吃 `iconKey` 再从 `Assets.MANIFEST` 查路径，**不许抄第二份武器 → 图片的表**。新增武器忘了往 `WP_ICON` 加落点不会报错，只是持械时攻击键退回空手表现（少一层反馈）。图标留白各家不同（`wp-*` 0.859、`it-rock` 0.411），同一尺寸塞进去石片与玉器会明显偏小 —— `ICON_ART` 表就是为这件事存在的。
- **触屏按键的纵向间距不能用 `vmin` 百分比**：那会让间距跟屏幕高度成比例，在 390px 高的横屏手机上「跳」能飘到左上角、「拾」压在角色脸上。要用「按钮直径」作单位（`var(--tch-d) * 倍数`），按钮多大间距就多大。
- **`big` 键（1.22 倍直径）的纵向间距必须留够**：与相邻键的 y 差要 ≥ 1.26 倍直径，卡在 1.2 会在按钮变大的视口上相交。`js/touch.js` 的 `checkOverlap()` 会在布局重建时两两求交并 `console.warn` —— 这是这类布局 bug 的唯一自动化防线，别删。
- **手机上的 `pointerup` 会丢**（手指滑出屏幕、来电、系统通知、切 App、锁屏）。丢了那枚键就永远「按着」，玩家看到「角色自己一直往前跑，松手也不停」。三道兜底缺一不可：一次性键 8 秒超时回收（`reapStale`）、`pointercancel`、`blur`/`pagehide`/`visibilitychange` 三清。
- **覆盖层按钮会跟着 `#stage` 一起被 `scale` 缩**：521×1126 竖屏下 `fitScale` 仅 0.325，逻辑 235×108 的按钮到屏幕上只有 76×35。给 `body.dev-touch` 下的 `.pz-act` / `.go` 单独放大（逻辑 100~110px 高），横屏缩完约 52~62px。
- **覆盖层的触屏通道不能读 `Touch.state()`**：那要求 `active()` 为真，而 `active()` 在非 `play` 阶段返回 false（虚拟键已收起）。要用 `Touch.takeTap()`（全局捕获阶段记的一次性标记，读即消费）。
- **敌人走路相位种子必须用 `e.__seed`，不能用 `e.x`**：`e.x` 每帧都在变，用它算 `off` 等于每前进 1px 就把相位重新随机一次，腿会疯狂抽搐（实测每秒换帧 32 次，应 2.93 次，放大 11 倍）。
- **`syncHUD` 里的 `getElementById` 要缓存**：这些节点整局不变，每帧 11 次在 60fps 下是 660 次/秒。用 `hudEl()` 记住。同理 `EnemyArt.ready()` 要提到敌人循环外面 —— 它内部遍历整张帧表，满屏 7 敌就是 7 次全表遍历/帧。
- **`burst()` 必须按 `room` 截断，`updateParticles()` 还要兜底夹一次**：粒子有多个来源（打击、死亡、旋风、宝箱、命中火花、武器拖尾），只在 `burst` 里限流挡不住多源叠加。
- **连击的 `swingQueued` 在第一分支开头必须清**：置位在 `swingT<=0` 分支，消费只挂在 `if(p.swingT>0)` 块内 —— 收招期间记的 `true` 当场没人消费，等 `swingCd` 归零后再按，那一刀打完会把残留当成「接第二段」，凭空多出一刀。原来丢键，修完变多键。
- **`p.inv > 0` 不等于「在受伤闪烁」**：旋风斩也给了 1.5 秒无敌（与 `whirlT` 同寿）。`char-rig.js` 里统一走 `hurtFlicker(p)`，`whirlT > 0` 时跳过。
- **`PICK_RANGE` 与 `HINT_RANGE` 必须完全相等**：曾经是 80 vs 90，80~90 这一圈里「气泡写着按 G 拾取，按了却捡不起来」。判定与提示用同一个常量，别在 `tryPickup` 里写死数字。
- **手柄的 `pause` 字段在 `readPad` 里**：`Start`(9) 与 `Back`(8)。这条以前完全没接 —— `togglePause` 只有 Esc / 按钮 / 触屏三个入口，而指南与暂停页都写着「Start」。新增手柄键位时，`readPad` 的空返回也要同步补字段（保持同形）。
- **机关（`G.mechanisms`）每加新的要先清已激活的**：已激活的金光机关一直立着（用过了还在闪），且避让逻辑每有一个机关就把新落点 +320，会越推越远。宝箱同理但要反过来 —— 未开的留着（玩家还没开），只清已开的。
- **判「有没有触屏」不能看 `PointerEvent`**：桌面 Chrome / Edge / Firefox 全都支持 PointerEvent，拿它当判据，鼠标点一下页面就切进手机版，玩家看到一圈虚拟键凭空冒出来。正确判据是触摸硬件（`navigator.maxTouchPoints > 0` 或 `ontouchstart` in window）。`PointerEvent` 只用来选事件 API。
- **手机端「默认横屏」是三条腿，缺一条就有整片机型转不过来**：
  1. `<meta name="x5-orientation" content="landscape">` + `<meta name="screen-orientation" content="landscape">` —— 国产内核（微信 / QQ / UC 的 X5、部分 ROM 浏览器）**只认这两条私有 meta**，标准 API 在它们里面不可用；
  2. `js/touch.js` 的 `lockLandscape()`：`requestFullscreen()` 然后 `screen.orientation.lock("landscape")`。**`requestFullscreen` 必须在用户手势的同步调用栈里**，所以挂在「第一根手指落下」与「横屏进入」按钮上，脚本加载时调 100% 被拒；
  3. 竖屏遮罩 `请横过来玩` 兜底 —— iOS Safari 压根没有 `screen.orientation.lock`，只能靠玩家手动转屏。
  全部失败都静默（`.catch` 吞掉），绝不能因为锁不了方向就白屏或弹错误。
- **不要给 `.tch-rotate` 里加 `pointer-events:none`**：遮罩自带 `pointer-events:auto` 是为了盖死底下的一切，而「横屏进入」按钮就在它里面 —— 一改就点不动。
- **「双击放大」只能靠 JS 掐，不能只靠 CSS / meta**：`touch-action:none` 与 `user-scalable=no` 是**建议**，老 WebView 与部分国产 ROM 浏览器不认，玩家看到的就是「双击一下画面放大」。`index.html` 里那个 IIFE 才是所有内核都吃得下的那一道。三层各管一段，缺一层就有机型漏：
  - `<meta name="viewport" ... maximum-scale=1,user-scalable=no>` —— 标准浏览器；
  - `touchend` 上的双击守卫 —— 只掐「单指 + ≤320ms + 落点漂移 ≤30px」的**第二次抬手**；
  - `gesturestart/gesturechange` —— iOS 的整页捏合，不吃 `touch-action`。
- **双击守卫绝对不能改成在 `touchstart` 上 `preventDefault`**：那会连带把 `pointerdown` 一起吞掉，而虚拟键全挂在 pointer 事件上 —— 双人同屏、两只拇指同时按方向与刀时，按键会当场失灵。所以多指（`changedTouches.length !== 1` 或 `touches.length > 0`）必须原样放过。
- **测这类时序要用忙等（`while(performance.now()-t0 < ms){}`），不能用 `setTimeout`**：后台标签页的定时器会被节流到几百毫秒，测出来「60ms 后双击」实际隔了 700ms，守卫自然不触发 —— 会误判成「守卫失效」。同理 CDP 的 `Input.dispatchTouchEvent` 在模拟触摸没启用时会一直挂住。
- **模式选择页打开时必须先把「当前高亮项」画出来**：`S.modePick` 默认是 `duo`，
  但 `.uis-pick` 以前只在按过十字之后才挂上 —— 页面刚开时一个高亮都没有，
  玩家看不出 `Start` 会确认哪一项，于是报「选了双人却只出单人」。
  `openMode()` 里补了 `setModePick(S.modePick || "duo")`：默认高亮与实际确认项永远一致。
- **手柄选模式的三条键位是「直选」，不是「移动光标 + 确认」**：`A/X` 直接单人、
  `B/Y` 直接双人、`Start` 确认高亮项。所以玩家按 `A` 两下（想「开始游戏」）会落到单人 ——
  页脚那行提示必须写清这一点，别指望玩家自己猜。
- **测手柄要用 `navigator.getGamepads` 桩 + 关闭后台节流**：真实手柄没法在 CI 里驱动，
  但可以 `Page.addScriptToEvaluateOnNewDocument` 注入假 `getGamepads`，再用
  `window.__pad.set(i, btn, on)` 逐帧按。**同时必须给 Chrome 加
  `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion`** ——
  否则页面 `hidden` 时 rAF 完全停摆，而 `js/guide.js` 的手柄轮询、`js/ui-shell.js` 的
  `padFrame` 全挂在 rAF 上，测出来就是「手柄识别到 0 个」，会把正常功能误判成坏掉。
- **鼠标与手指靠 `pointerType` 区分**：`mouse` 不算手指 —— 触摸屏笔记本上用鼠标玩要保持桌面界面。`touch` / `pen` 算。
- **`index.html` 的 script 标签带 `?v=` 版本号**：文件名不带 hash，浏览器与 CDN 会长期缓存 `js/*.js`。玩家拿到旧版 `touch.js` 就会在桌面上看到手机虚拟键，刷新几次都改不掉。**改了 `js/` 下任何文件就把版本号 +1。**
- **从主屏图标启动时没有「第一次手指落下」事件**：自动判断会等不到，虚拟键永远不出现。所以有 `mobile.html` 强制入口（`?touch=1`），别指望自动判断覆盖这个场景。
- **`stateFrame` 的 walk 分支必须取模**：`p.walk` 是累计位移，只增不减，而 `cycle = WALK_CYCLE * n / 4` 只有 3.6 个单位 —— 走约 0.32 秒帧号就越过末帧。原来只夹不取模（夹到 `n-1`），于是第一轮播完后**永久停在最后一帧**：画面读成「滑步 + 僵直」，素材其实是齐的。`drawWalkFrames` 一直有 `% n`，两条路径现在口径一致。
- **`dt` 被钳在 0.045 秒**（`index.html` 的 loop）。CDP / Playwright 环境下 rAF 常常被节流到 1~2 fps，于是世界以 16 倍慢放 —— 测步频、测动画循环时别用真实时间，要用固定步长复算。

## 文档地图

- 想改玩法 → `index.html`；想改画面 → [js/README.md](js/README.md)。
- 想知道为什么这么设计 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 想查某次决策与调查的来龙去脉 → [.agents/notes/](.agents/notes/)。
- 想重新出素材 → [tools/README.md](tools/README.md)。
- 想投稿 / 录屏 → [文案包.md](文案包.md)、[操作与录屏说明.md](操作与录屏说明.md)、[交付清单.md](交付清单.md)。
- 想查原作机制 → [双刃战士玩法介绍.md](双刃战士玩法介绍.md)。
- 想部署上服务器 / 手机端怎么用 → [docs/部署与手机端.md](docs/部署与手机端.md)、[docs/手机端适配.md](docs/手机端适配.md)。
- 想知道这轮修了什么 → [docs/修改方案汇总.md](docs/修改方案汇总.md)。
