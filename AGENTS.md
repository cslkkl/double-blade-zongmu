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
| `python tools/prep_interact.py` | 宝箱 / 机关 / 拾取物 → `assets/interact/` |
| `python tools/prep_icons.py` | 武器 / 物品 / 界面图标 → `assets/icons/` |
| `python tools/prep_fx.py` | 刀光 / 火花 / 旋风环 / 石块 |
| `python tools/prep_assets.py` | 背景 / 道具 / 角色底图 |
| `python tools/slice_enemy_anim.py` | 敌人 4 类 → `assets/anim/enemy-*` |

`slice_anim.py` 默认只切角色、只删角色帧；敌人用 `--only enemy`。
`slice_anim.py` 重写整份 `window.ANIM`，会丢掉新增的 3 个动作，跑完必须补 `slice_anim_extra.py`。

## 验证快照

- 2026-10-24（武器视觉）：`check-inline` 通过（内联脚本 123915 字符）；`selftest_enemies` 0 失败；`selftest_audio` 0 失败；`selftest_weapons` 0 失败；`node --check` 8/8 通过。
- 2026-10-24（上一版）：`check-inline` 通过（内联脚本 121802 字符）；`selftest_enemies` 0 失败；`selftest_audio` 0 失败；`node --check` 8/8 通过；链接校验 65 链接 0 错误。
- 规模：`index.html` 3903 行 / 155186 字节；`js/` 8 个模块；`assets/` 133 个文件（`assets/fx/` 新增 13 张）。
- 素材分布：`anim/` 71（新增 10 张 `atk-*` + 4 张 `hold-*`）、`fx/` 13、`icons/` 16、`interact/` 6、`props/` 8、`char/` 5、`assets/` 根 12。
- 帧数：角色 12 个 clip 共 43 帧；敌人 4 类共 14 帧；武器站立帧 11 张、出招姿态 10 张。
- 关卡：6 阵共 85 体。
- 无 CI，以上为本机手工结果；改完代码重跑一遍再写结论。

## 待办

- [ ] `js/assets.js` 里 `pose1` / `charFront` / `charSide` / `charBack` 四个键无消费方，每次启动白加载约 265 KB。
- [ ] `js/assets.js` 里 `itCowrie` / `itEye` 与 `iconEye` / `iconMask` / `iconLeiwen` / `iconTree` 六个图标键无消费方（`assets/icons/` 16 张里 6 张只占体积）。
- [ ] `js/assets.js` 里 `wpShort` 与 `wpDagger` 指向同一张 `wp-dagger.webp`，`wpRock` 与 `itRock` 指向同一张 `it-rock.webp` —— 48 个键只有 46 条不同路径。
- [ ] `FX.drawHudPanel` 无调用方（`FX.drawWhirl` 已接进 `drawWhirlAsset`）。
- [ ] 物品族图标长边占比 0.41~0.65，与 `prep_icons.py` 设定的 0.84 不符，重跑一次可对齐；重跑后要人眼确认六个物品的相对大小。
- [ ] `slice_anim_extra.py` 写 `scaleFix: 1.0` 只是占位，需按内容高反算后手改（当前三个 clip 已是 0.914 / 0.867 / 0.754）。
- [ ] 武器出招姿态目前是「一张图 + 由 `swingT` 推导的变换」，不是帧序列。多帧条带（`seq-<key>.png`）已经出图，切帧与 `WEAPON_ATTACK_CLIP` 接线待做 —— 四帧会让挥砍更顺，但要逐帧算 `anchorX`（挥砍时身体前后移）。

## 活跃坑

- 生图条带的角色身高不一致（walk 比 idle 小 33%），靠 `js/anim-data.js` 的 `scaleFix` 校正。
- **`scaleFix` 不是「抄 1.0 就行」**：屏幕身高 = `252 × scaleFix × (内容高 ÷ 画布高)`，画布里的空白不吃像素。
  - 正确算法以 idle 为基准反算：`scaleFix = (idle 内容高 ÷ idle 画布高) ÷ (该 clip 内容高 ÷ 该 clip 画布高)`。
  - 新增动作只填 `1.0` 会让角色切过去时突然变大：`attack-thrust` 曾渲成 240px、`attack-heavy` 208.6px、`pickup` 198px，而 idle 是 181px。
  - 新动作切片后必须实测内容高（alpha > 24 的包围盒），不能凭画布高填 1.0。
  - 验收标准：12 个动作的屏幕身高统一在 178~181px，容差 ±2px。
- 洋红底必须 despill，否则边缘一圈紫：见 [tools/README.md](tools/README.md)。
- 多个 agent 共享同一个 Playwright 实例会互相抢浏览器；自检一律走 mock canvas。
- 声音全在 [js/audio.js](js/audio.js)，实时合成、不读音频文件 —— `file://` 下 `fetch` / `XHR` 取音频会被 CORS 拦，放 `assets/audio/*.mp3` 等于放一堆加载不了的文件。要换音色改配方表，别加素材。
- 打击音的材质靠 `startSwing(wp.key)` 传入的武器 key。新增武器必须同时在 `audio.js` 的 `MATERIAL` 里给材质，否则一律听成玉器。
- BGM 的喘息压音只认 `bgm.breathe` 标志（在 `bgmTick` 里统一结算）。直接改 `bus.music` 增益会被下一帧覆盖回满。
- **新增任何覆盖层 / 可交互界面，必须同时想手柄怎么过这一页。** `readPad()` 只在 `play` 阶段被调用，离开对局就没人读手柄 —— 失败页与通关页曾因此只能鼠标点。
- 手柄按下沿检测必须带「启用闸」（先见到一次全部松开）。界面刚打开时那一下按键还按在手上，不设闸会当场确认掉，玩家看不到界面（模式选择页曾因此被 A 键直接跳过）。
- 界面文案跟输入设备走：`body.pad-mode` 由「是否真有手柄连接」驱动，键盘键位与手柄键位是两套 DOM，靠类互斥切换。
- 手柄键位以 `readPad()` 与 `ui-shell.js` 的 `PAD_ROWS` 为准（`A` 挥刀 / `X` 跳 / `B` 技能 / `Y` 拾取）。对外文档曾把 `A`/`X` 写反，改键位要连 README 与《操作与录屏说明》一起改。
- `slice_anim.py` 生成过 `fps: 6, true, loop: true` 这类语法错误，生成后必须 `node --check`。
- `slice_anim_extra.py` 曾写出缺冒号的 `anim-data.js` 行（`"attack-heavy"{ frames: ...`），整份数据文件当场语法错误；现已在脚本内加 `node --check` 门禁，非 0 直接退出。
- 敌人走路动画按 `e.walk` 累计位移推进，不跟真实时间；改步频调 `enemies-assets.js` 的 `STRIDE`。

## 文档地图

- 想改玩法 → `index.html`；想改画面 → [js/README.md](js/README.md)。
- 想知道为什么这么设计 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 想查某次决策与调查的来龙去脉 → [.agents/notes/](.agents/notes/)。
- 想重新出素材 → [tools/README.md](tools/README.md)。
- 想投稿 / 录屏 → [文案包.md](文案包.md)、[操作与录屏说明.md](操作与录屏说明.md)、[交付清单.md](交付清单.md)。
- 想查原作机制 → [双刃战士玩法介绍.md](双刃战士玩法介绍.md)。
