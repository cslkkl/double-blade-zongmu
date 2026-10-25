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
| `python tools/slice_weapon_assets.py` | 武器站立帧 / 出招姿态 / 专属特效 → `assets/anim/hold-*`、`atk-*`、`assets/fx/`（就地写 4 个数据块） |
| `python tools/slice_weapon_seq.py` | 武器出招四帧序列 → `assets/anim/atk-<key>-<0..3>`（写 `WEAPON_ATTACK_CLIP`） |
| `python tools/slice_weapon_walk.py --src <目录>` | 武器持械行走四帧 → `assets/anim/walk-<key>-<0..3>`（写 `WEAPON_WALK_CLIP`） |
| `python tools/prep_interact.py` | 宝箱 / 机关 / 拾取物 → `assets/interact/` |
| `python tools/prep_icons.py` | 武器 / 物品 / 界面图标 → `assets/icons/` |
| `python tools/prep_fx.py` | 刀光 / 火花 / 旋风环 / 石块 |
| `python tools/prep_assets.py` | 背景 / 道具 / 角色底图 |
| `python tools/slice_enemy_anim.py` | 敌人 4 类 → `assets/anim/enemy-*` |

`slice_anim.py` 默认只切角色、只删角色帧；敌人用 `--only enemy`。
`slice_anim.py` 重写整份 `window.ANIM`，会丢掉新增的 3 个动作，跑完必须补 `slice_anim_extra.py`。

## 验证快照

- 2026-10-24（武器视觉 + 出招序列 + 暂停 + 指南模块化 + 攻击/拾取分家后）：`check-inline` 通过；`selftest_enemies` 0 失败；`selftest_audio` 0 失败；`selftest_weapons` 0 失败；`node --check` 9/9 通过。
- 2026-10-24（背包改单手 + 去遮挡物阴影 + 并入 main 暂停/Guide 模块化）：check-inline 通过（内联脚本 120422 字符）；selftest_enemies / selftest_audio / selftest_weapons 0 失败；node --check 9/9 通过。
- 2026-10-25（手柄震动 js/rumble.js + 键位指南放大）：check-inline 通过（内联脚本 127304 字符）；selftest_enemies / selftest_audio / selftest_weapons 0 失败；node --check 10/10 通过。
- 暂停链路由 CDP 驱动本机 `file://` 页面实测：Esc 暂停 / 解冻、抽屉开着时 Esc 只收抽屉、暂停中切设备换图、R 重开、暂停页点击、非 play 阶段不响应，逐条断言通过。
- **2026-10-25（手机端适配 + 三份审计修复后）**：`check-inline` 通过（内联脚本 139378 字符）；`selftest_enemies` / `selftest_audio` / `selftest_weapons` 全 0 失败；`node --check` 12/12 通过。浏览器端 12 项端到端断言全绿（0 报错 / 对局正常 / 敌人峰值 7 / 粒子不超 600 / `readPad` 有 `pause` / 拾取半径与提示半径都是 90 / `short` dur=55 / axe walk 3 帧 / `Touch` 已加载 / 粒子兜底 900→600 / `syncHUD` 60 帧 0 次 `getElementById`）。
- **2026-10-25（提音量 + 重做 BGM 编曲后）**：`check-inline` 通过（内联脚本 139514 字符）；`selftest_enemies` / `selftest_audio`（29 项）/ `selftest_weapons` 全 0 失败；`node --check` 12/12 通过；链接检查 31 文件 75 链接 0 错。浏览器实测：`file://` 直开、进单人模式、开局 BGM 起、挥砍与跳跃出声、控制台 0 报错 0 警告。离线渲染 A/B：同场景 RMS +2.8 dB、峰值 +2.6 dB、**0 个削波样本**（峰值 -19.3 dB，离满量程还差 19 dB）。动机核验：档 0 走 D–G–F–A，档 3 走 D5–C5–A4–G4–A–G–F–D，低音线 D3/A2，档 3 drone 顶到 Eb3。
- 规模：`index.html` 约 4350 行；`js/` 12 个模块；`assets/` 329 个文件 18.32 MB。
- 素材分布：`anim/` 249、`fx/` 13、`icons/` 16、`icon/` 10、`ui/` 10、`interact/` 6、`props/` 8、`char/` 5、根 11。
- 素材预算：单帧 ≤ 60 KB（实测最大 55.4 KB）、总量 ≤ 8 MB（上调依据见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的「素材流水线」）。**当前 18.32 MB 超预算 10.3 MB**，2026-10-25 已清掉未引用的 15.78 MB（`promo/` 与 `bg-fg.webp`），剩下的都是运行时真加载的。
- 帧数：角色 12 个 clip 共 43 帧；敌人 4 类共 14 帧；武器站立帧 11、出招单帧 10、出招序列 10 把 × 4 帧、持械行走 11 把（其中斧头 3 帧，见活跃坑）。
- 关卡：6 阵共 85 体。
- 无 CI，以上为本机手工结果；改完代码重跑一遍再写结论。

## 待办

- [ ] `js/assets.js` 里 `pose1` / `charFront` / `charSide` / `charBack` 四个键无消费方，每次启动白加载约 265 KB。
- [ ] `js/assets.js` 里 `itCowrie` / `itEye` 与 `iconEye` / `iconMask` / `iconLeiwen` / `iconTree` 六个图标键无消费方（`assets/icons/` 16 张里 6 张只占体积）。
- [ ] `js/assets.js` 里 `wpShort` 与 `wpDagger` 指向同一张 `wp-dagger.webp`，`wpRock` 与 `itRock` 指向同一张 `it-rock.webp` —— 48 个键只有 46 条不同路径。
- [ ] `FX.drawHudPanel` 无调用方（`FX.drawWhirl` 已接进 `drawWhirlAsset`）。
- [ ] 物品族图标长边占比 0.41~0.65，与 `prep_icons.py` 设定的 0.84 不符，重跑一次可对齐；重跑后要人眼确认六个物品的相对大小。
- [ ] `slice_anim_extra.py` 写 `scaleFix: 1.0` 只是占位，需按内容高反算后手改（当前三个 clip 已是 0.914 / 0.867 / 0.754）。
- [ ] 武器出招是多帧序列（`WEAPON_ATTACK_CLIP`，4 帧），但帧号由 `swingT` 推导、不跟 fps：改帧数只改动画密度，不改出手时机。想更顺就重出 `seq-<key>.png` 再跑 `slice_weapon_seq.py`，别在代码里插帧。
- [ ] 持械行走（`WEAPON_WALK_CLIP`）的画风与原画有差距：新素材是 AI 重出的青铜面具武士，描边更粗、配色更平。要统一就得连 `hold-*` / `atk-*` 一起重出，单改行走会更割裂。
- [ ] **武器帧的 `anchorX` 还是脚本猜的，31 个状态有逐帧差**（最大跨度 0.61 ≈ 屏幕 97px）：铃 `attack` 97px、玉璋刃 `walk` 89px、匕首 `attack` 85px、锤 `jump` 84px。工具已就位（`tools/align_weapon_frames.html` 人眼拖 → 导出 JSON → `tools/align_apply.py` 回填），累计工作量约 11 把 × 5 状态。`python tools/align_apply.py --report` 查现状。

## 活跃坑

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
- 声音全在 [js/audio.js](js/audio.js)，实时合成、不读音频文件 —— `file://` 下 `fetch` / `XHR` 取音频会被 CORS 拦，放 `assets/audio/*.mp3` 等于放一堆加载不了的文件。要换音色改配方表，别加素材。
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
- **触屏按键层不能放进 `#stage`**：`#stage` 是 1600×900 逻辑坐标、被 `transform:scale(0.43)` 缩过，100px 的按钮到屏幕上只剩 43px，低于 44px 规范下限。按键层必须 `position:fixed` 贴视口，尺寸用 `vmin` 夹在 `[48, 84]`。
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
