# tools/ — 素材流水线脚本

全部脚本都是本机一次性工具，不在运行期被游戏加载。
素材设计理由见 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)；本目录规则见 [AGENTS.md](AGENTS.md)。

**共同前提**：源图在 `C:\Users\11965\Desktop\imagegen无限\output`，该路径硬编码在各脚本顶部。
换机、换目录必须先改 `SRC`，否则脚本会读空目录并静默写出空产物。

**强制顺序**：`prep_assets` / `prep_fx` / `fix_fg` / `prep_interact` / `prep_icons` → `slice_anim` → `slice_anim_extra` → `slice_enemy_anim`。
理由：`slice_anim.py` 会整体重写 `js/anim-data.js`（丢掉 `window.ENEMY_ANIM` 与三个新增动作）。文件层面它现在只删角色帧、不碰敌人帧，见下文「`--only` 开关」一节。

---

## prep_assets.py — 背景 / 道具 / 角色底图

- 做什么：洋红抠图 + 去污染 + 裁透明边 + 缩放 + 存 WebP/JPEG。
- 何时跑：换背景、换道具、换角色立绘时。
- 输入：`sx-scene/far-bg-altar.png`、`mid-bg-pit.png`、`foreground-occlusion.png`、`ground-strip-wide.png`、`sx-scene/props/*.png`、`sanxingdui-game/sanxingdui-chibi-*.png`。
- 输出：`assets/bg-far.jpg`、`assets/bg-mid.webp`、`assets/ground.webp`、`assets/props/*.webp`、`assets/char/turnaround.webp`、`assets/char/pose-0.webp`。
- 幂等性：可重复跑，同名覆盖；不会删除多余文件。
- **`char/` 只剩 `pose-0.webp` 在用**（`js/assets.js` 的 `pose0`，是 `ANIM` 缺失时的降级底图）。`pose-1` / `front` / `side` / `back` 四张自始无消费方，2026-10-25 已连键带文件删除（省 260 KB 启动白加载）。`bg-fg.webp` 随前景遮挡层一起删除，本脚本残留的输出描述已同步清掉 —— 若重跑后它又出现，直接删，没有读取点。

## prep_fx.py — 刀光 / 火花 / 旋风环 / 石块

- 做什么：洋红抠图（`lo=45`、`hi=115`、`despill=22`）+ 按列投影切分多对象 + 缩放 + 末尾打印洋红残留计数。
- 何时跑：换刀光、换火花、换旋风环时。
- 输入：`sanxingdui-fx/slash-set-1.png`、`slash-set-2.png`、`slash-whirl.png`、`fx-throw-rock.png`。
- 输出：`assets/slash-1..3.webp`、`assets/hit-1..3.webp`、`assets/whirl-ring.webp`、`assets/proj-rock.webp`。
- 幂等性：可重复跑，同名覆盖。
- 验收：末尾「洋红残留」应为 0 或个位数，偏大说明源图底色不纯。

## fix_fg.py — 前景层重做

- 做什么：前景原图里那几团紫灰色块是实心像素（alpha ≈ 255），不是抠图残留；本脚本按亮度整体重映射为暗青绿剪影，只留明暗层次。
- 何时跑：`prep_assets.py` 出的前景仍偏紫时，单独重做这一层。
- 输入：`sx-scene/foreground-occlusion.png`。
- 输出：`assets/bg-fg.webp`（只覆盖这一张）。
- 幂等性：可重复跑，同名覆盖；与 `prep_assets.py` 对同一文件有竞争，先跑 `prep_assets` 再跑本脚本。

## slice_anim.py — 角色逐帧切片

- 做什么：洋红抠图 + 去溢色 + FFT 估帧数 + 列投影分帧 + 跨帧统一锚点 + 预乘缩放 + 按体积预算降采样 + 生成数据文件。
- 何时跑：换角色条带、改动作帧数、改锚点算法时。
- 输入：`sanxingdui-anim/char-{idle,walk,attack,jump,hurt,whirl,throw,bow,dead}.png`。
- 输出：`assets/anim/{clip}-{i}.webp`（9 动作 32 帧）+ **重写** `js/anim-data.js` 的 `window.ANIM`。
- 注意：它重建整份 `window.ANIM`，`pickup` / `attack-heavy` / `attack-thrust` 三个 clip 会被丢掉；跑完要补跑 `slice_anim_extra.py`。
- 幂等性：**不幂等**。先删角色帧（只删 `<clip>-<i>.webp`，敌人帧保留），再整批重写数据文件。
- 验收：跑完必须 `node --check js/anim-data.js`；输出报表里的「洋红残留」应为 0，缩放系数不应低于 0.55。

## prep_interact.py — 宝箱 / 机关 / 拾取物

- 做什么：洋红抠图（`lo=45`、`hi=115`、`despill=22`）+ 裁透明边 + 按长边上限缩放 + 存 WebP，末尾逐张打印紫色残留计数。
- 何时跑：换宝箱、机关、海贝、玉器的图时。
- 输入：`sx-scene/interact/obj-chest-closed.png`、`obj-chest-open.png`、`obj-mechanism-off.png`、`obj-mechanism-on.png`、`obj-pickup-cowrie.png`、`obj-pickup-jade.png`。
- 输出：`assets/interact/` 六张 —— `chest-closed` / `chest-open` / `mechanism-off` / `mechanism-on` (长边 260) 与 `pickup-cowrie` / `pickup-jade` (长边 120)。
- 幂等性：可重复跑，同名覆盖。
- 验收：末尾每张的「紫色残留」应为 0 或个位数。

## prep_icons.py — 图标统一画布

- 做什么：把生图给出的多图标拼版按网格切开（切点吸附到 alpha 投影最低的列 / 行，避免切到物体），再**归一到同一正方形画布**并按最长边占固定比例居中。
- 何时跑：换武器 / 物品 / 界面图标时。
- 输入：`sanxingdui-items/weapon-set.png`（3×2）、`item-set.png`（3×2）、`ui-icon-set.png`（2×2）。
- 输出：`assets/icons/` **10 张** —— 武器 6 张 `wp-*.webp`（256 画布，占 0.86）、物品 4 张 `it-*.webp`（192，占 0.84：`jade` / `bell` / `jar` / `rock`）。界面图标 4 张已停产出（见下）。
- **只产出有消费方的图标**：`DEAD_ITEMS = {cowrie, eye}` 与 `WRITE_UI_ICONS = False` 两个开关控制。`it-cowrie` / `it-eye` 与整组 `icon-*` 在 `js/assets.js` 与 `index.html` 里都没有读取点，2026-10-25 已连键带图删除。**不能直接删 `ITEMS` / `ICONS` 列表的元素** —— 切分按网格下标，删元素会让后面每格错位；只跳过写盘。
- 为什么必须归一：一次出的六个图标各自包围盒不同，直接按包围盒缩放到目标尺寸就会忽大忽小；归一后缩放只剩长边一个自由度。
- 幂等性：可重复跑，同名覆盖。
- 验收：末尾批量校验「紫色残留」合计应为 0 或个位数；`assets/icons/` 应为 10 个文件（6 武器 + 4 物品）。
- ⚠️ 现存 `it-*.webp` 的长边占比是 **0.41~0.65**，与脚本设定的 0.84 不符 —— 说明它们是**更早版本脚本的产物**，从没按当前参数重跑过。重跑一次即可对齐，但跑完要人眼确认四个物品的相对大小（`it-rock` 只有 79×79，是六张里最小的）。

## prep_touch.py — 手机虚拟键青铜盘与金线纹样

- 做什么：洋红抠图 + 网格切片 + 归一（盘按盘体实心区包围盒、纹样按内容包围盒）+ 存 WebP，末尾打印洋红残留。
- 何时跑：换虚拟键底盘、换暗刻纹样，或改盘 / 纹样的画布占比时。与其它脚本**无顺序依赖** —— 它只写 `assets/touch/`，不碰 `js/` 任何文件。
- 输入：`sanxingdui-touch/touch-plate.png`（双盘并排）、`sanxingdui-touch/touch-glyphs.png`（4×2 纹样）。
- 输出：`assets/touch/` **10 张** —— 底盘 2 张 `plate`（正圆）/ `plate-sq`（圆角方盘），都是 256×256；纹样 8 张 `glyph-{left,right,jump,atk,skill,act,drop,give}`，256 方画布内内容长边占 0.70（= 179）。
- **不进 `js/assets.js` 的 `MANIFEST`**：启动期静态图预算已满（41 键 / 40 条路径），而这 10 张只有真触屏才用得上。由 `js/touch.js` 自建 Image 缓存、`available()` 为真时才加载。
- 盘体占画布 0.96；**盘底下缘那圈柔和暗影故意保留** —— 盘图自带圆角（动作键 50% / 走键 26%），溢出圆外的暗影被图自己的圆角裁掉，剩下的正好沿盘沿读成接触阴影，不用 CSS `box-shadow` 再模拟一遍。
- 归一化取「盘体实心区包围盒」，**不能用含暗影的 alpha 包围盒**：暗影会把包围盒撑大一圈，盘体跟着被压小一圈。
- 当前产物的实测值（2026-10-26）：`glyph-*` 长边占比 0.699、几何中心 (0.498, 0.498)；两张盘按含暗边的 alpha 包围盒是 0.980（248×251）与 0.988（251×253）—— 比契约 0.96 大，因为暗边也算进包围盒了。消费侧按契约 0.96 铺（`104.17%`），所以盘沿会溢出按钮边约 2%（60px 键上约 1.2px），观感是「盘压住按钮边」，不是缺陷。
- 幂等性：可重复跑，同名覆盖；不删除多余文件。
- 验收：脚本末尾自己打三张表 ——
  - **盘体占比**：目标 0.96，偏差 > 3% 标 `⚠️`；`plate-sq` 另报「实测圆角半径 ≈ x% 边长」与「`border-radius:26%` 裁切掉盘体多少 px」（圆角吃掉的那点盘体是有意的，与 `js/touch.js` 里的 `border-radius:26%` 对齐）；
  - **洋红残留**：10 张合计应为 0 或个位数（缩放后还会再跑一遍 despill，因为重采样会把已压下去的紫重新抬出来）；
  - **体积**：盘 ≤ 60 KB、纹样 ≤ 20 KB 每张，超了标 `⚠️`。
- 另外会输出一张合成预览（深色底 + 金色按下态，64px / 40px 两档真实键面尺寸），落到系统临时目录，用来人眼看「低不透明度纹样压在盘上还认不认得出」。
- 踩坑：洋红底必须 despill。纹样是**低不透明度**压在按键文字下面的，边缘那圈紫在深青绿的盘面上会被放大成脏边。

## slice_anim_extra.py — 新增动作切片

- 做什么：复用 `slice_anim.py` 的抠图、分帧、锚点原语，切 `pickup` / `attack-heavy` / `attack-thrust` 三张条带并回写 `js/anim-data.js` 的 `window.ANIM`。
- 何时跑：新增或重出这三个动作时；既有 9 个动作不碰。
- 输入：`sanxingdui-anim/char-pickup.png`、`char-attack-heavy.png`、`char-attack-thrust.png`。
- 输出：`assets/anim/{pickup,attack-heavy,attack-thrust}-{i}.webp`（3 + 4 + 4 = 11 帧）+ 就地替换 / 追加 `window.ANIM` 里的三个 clip。
- 幂等性：对已存在的 clip 走替换分支，不重复追加；不改动其它 clip。
- 门禁：写完数据文件后脚本内部直接跑 `node --check js/anim-data.js`，非 0 就 `SystemExit(1)` —— 历史上一版曾写出缺冒号的行，把整份数据文件弄成语法错误。
- **`scaleFix` 不再被覆盖（2026-10-25 修）**：脚本**算不出**正确值 —— 弯腰（`pickup`）与蹲低（`attack-thrust`）的内容高天然更矮，按包围盒反算会把弯腰的人放大到站立高度（这是踩过的坑：宽高比 2.19 → 1.19）。所以现在：
  - **已存在的 clip**：`_existing_scale_fix()` 从文件里沿用旧值，手改过的校准绝不会被重跑冲掉；
  - **新增的 clip**：写 `1.0` 占位并打印醒目警告，必须人眼实测后手改；
  - 无论哪种，都把「按包围盒反算」的数字打出来（`estimate_scale_fix`）供对照，**不落盘**。
- 验收：`node --check js/anim-data.js` 通过；三个 clip 的屏幕身高与 idle 一致（178~181px）；重跑前后 `scaleFix` 三个值（0.914 / 0.867 / 0.754）必须一字不差。

## slice_enemy_anim.py — 敌人逐帧切片

- 做什么：复用 `slice_anim` 的抠图/分帧/锚点函数，按 kind 建独立画布，`despill` 比角色更硬，最后**追加** `window.ENEMY_ANIM`。
- 何时跑：换敌人条带、改敌人帧数时。
- 输入：`sanxingdui-enemy/enemy-walker.png`、`enemy-fast.png`、`enemy-brute.png`、`boss-zongmu.png`。
- 输出：`assets/anim/enemy-*-{i}.webp`（4 类 14 帧）+ 追加 `js/anim-data.js` 的 `window.ENEMY_ANIM`。
- 幂等性：对自身幂等（重复跑会先删掉已追加的那一段再重写）；但会覆盖 `ENEMY_ANIM` 之外不碰 `window.ANIM`。
- 验收：跑完 `node --check js/anim-data.js`，再跑 `node tools/selftest_enemies.mjs`。

## slice_anim.py 的 `--only` 开关 — 角色 / 敌人分跑

- 默认（`python tools/slice_anim.py`）：只切角色，清理时只删匹配 `^(idle|walk|attack|jump|hurt|whirl|throw|bow|dead)-\d+\.webp$` 的文件；`enemy-*-{i}.webp` 原样保留，跑完不用急着补敌人。
- `--only char`：与默认行为完全一致，只是显式写法。
- `--only enemy`：不切角色，直接委托 `tools/slice_enemy_anim.py`（它只覆盖敌人帧并在末尾追加 `window.ENEMY_ANIM`）。
- 注意仍然要「先角色后敌人」：`slice_anim.py` 会整体重写 `js/anim-data.js`，`window.ENEMY_ANIM` 会被丢掉一次；跑完角色记得补跑 `--only enemy`。
- 同样要先跑 `slice_anim_extra.py`：那三个新 clip 不在 `CLIPS` 主表里，重写后也不在数据文件里。
- 清理范围是硬编码正则，新增角色动作（clip 名不在 9 个之内）时必须同步改 `slice_anim.py` 顶部的 `CHAR_FRAME_RE`，否则旧帧不会被清掉。

## slice_weapon_assets.py — 武器素材一次性流水线

- 做什么：一次跑完武器视觉的产物 —— 站立持械帧 / 武器专属特效（含打击材质火花），并把数据块就地写进 `js/anim-data.js`。出招姿态帧**默认不产出**（见下）。
- 何时跑：新增武器、重出持械、重出武器刀光时。
- 输入（`sanxingdui-weapon/`）：
  - `hold-extra.png` 4 格 → `short` / `blade` / `jar` / `bell` 的站立帧
  - `atk-melee-a.png` / `atk-melee-b.png` / `atk-ranged.png` → 出招姿态（**仅 `--with-atk` 时读**）
  - `fx-melee-a.png` 3 件 → `wp-slash-short` / `-dagger` / `-spear`
  - `fx-melee-b.png` 3 件 → `wp-slash-sword` / `-axe` / `-hammer`
  - `fx-ranged.png` 3 件 → `wp-slash-bow` / `-rock` / `-burst`（`jar` 与 `bell` 共用 `burst`）
  - `fx-hit-material.png` 4 格 → `hit-jade` / `hit-bronze` / `hit-blunt` / `hit-airy`
- 输出：`assets/anim/hold-<key>.webp`、`assets/fx/*.webp`，并**追加 / 就地替换**三个数据块：`window.ANIM_HOLD`（只追加新键）、`window.WEAPON_FX`、`window.HIT_MATERIAL`。
- **`--with-atk` 默认关闭（2026-10-25）**：`window.WEAPON_ATTACK` 与那 10 张 `atk-<key>.webp` 已废弃删除 —— `WEAPON_CLIP` 现在 11 把武器全有 `attack`，`char-rig.js` 的 `draw()` 第一档就 `return`，这条旧通道永远轮不到。正常出素材时**不要**加这个开关，否则 1.78 MB 静默长回来。数据块即使残留也会被 `_drop_block` 清掉且不重建。
- **`scaleFix` 用腰带锚定，不用内容包围盒高**：出招姿态里武器尖端常高过头顶，包围盒高会把角色算成小人。腰带在腰上，任何姿态都够不到，`scaleFix = idle 腰带到脚底 ÷ 该格腰带到脚底`。同一张图的几格由同一次生图画出，比例一致，所以对同图做一致性校验（偏离中位数 > 6% 判误检并用中位数替换）。
- `anchorX` 同样取腰带行的水平中心，不取包围盒中心 —— 挥砍时武器向一侧大幅伸出，包围盒中心会把人物站位整体带偏。
- 幂等性：只替换自己那几个文件与那三个数据块，不碰 `window.ANIM` / `window.ENEMY_ANIM`，也不重算已有的 7 个 `hold` 键。
- 门禁：写完数据文件跑 `node --check js/anim-data.js`，非 0 直接退出；末尾逐张打印洋红残留计数。
- 验收：`node --check` 通过；腰带到脚底的屏幕长度与 idle 相差 ≤ 2%；洋红残留为 0 或个位数。

## slice_weapon_seq.py — 武器出招四帧序列（已废弃，默认不跑）

- **2026-10-25 起默认整段跳过**：不加 `--with-atk` 就只打印一段说明、不写任何文件。
- 为什么废弃：本脚本产出的 40 张 `atk-<key>-<i>.webp` + `window.WEAPON_ATTACK_CLIP` 与 `WEAPON_CLIP.attack` 功能重复，且 `draw()` 第一档判断永远先命中 `WEAPON_CLIP`，这条通道轮不到。50 张图（1.78 MB）已删，数据块已删。
- 真要恢复：`python tools/slice_weapon_seq.py --with-atk`（同时用 `slice_weapon_assets.py --with-atk` 补单帧），并确认 `tools/selftest_weapons.mjs` 里 `ATKC` 相关断言重新生效。
- 技术细节仍然有效（恢复时才用得上）：输入 `seq-{short,...}.png` 横向 4 格，`bell` 复用 `jar`；**同一把武器的 4 帧必须共用同一张画布**（取 4 格内容包围盒并集外扩 4px、等比缩到长边 ≤ 560），画布尺寸不一致人物会每秒抖四次；`scaleFix` 每把武器一个、`anchorX` 逐帧一个（数组，偏离中位数 > 8% 判误检）。

## slice_weapon_walk.py — 武器持械行走四帧序列

- 做什么：把每把武器的 4 帧行走条带切成 `walk-<key>-<i>.webp`，并就地写 `window.WEAPON_WALK_CLIP`。
- 何时跑：重出持械行走动画、改帧数时。
- 输入（用 `--src` 指定，不写死 SRC）：`walk-{short,dagger,sword,axe,hammer,spear,bow,rock,blade,jar,bell}.png`，每张横向 4 格。
- 输出：44 张 `assets/anim/walk-<key>-<0..3>.webp` + `window.WEAPON_WALK_CLIP`。
- **为什么走路要单独一套**：走路原先落回通用 walk clip（所有角色共用、手上没武器），于是「站着有武器、一走就空手」—— 连续性断在最常发生的那一帧。程序化浮沉只是权宜，逐帧才是解法。
- **身高锚有兜底**：`slice_weapon_assets.detect_head` 认的是原画那顶**金色**头冠（`R>=180 G>=145 B<=160`）。AI 新出的青铜面具素材金冠条件不成立，11 把里 8 把检测失败，所以本脚本先用它、失败再走 `body_top()`（肩线以上、轮廓中心 ±0.30 宽的竖带里第一个有内容的行）。举过头顶的锤 / 钺通常偏在一侧，落在竖带外，不计入身高。
- `scaleFix` 每把武器一个（4 帧共用）；`anchorX` 逐帧一个。口径与 `slice_weapon_seq.py` 完全一致。
- `--src` / `--only` / `--debug` 三个参数；产物路径显式指到仓库内，不复用 `slice_anim` 的 `OUT_IMG`（那个是相对硬编码 `SRC` 拼的，换机器就没有该目录）。
- 幂等：只替换自己那 44 个文件与 `WEAPON_WALK_CLIP` 数据块。
- 门禁：写完 `node --check js/anim-data.js`，再跑 `node tools/selftest_weapons.mjs`。
- 验收：每把武器 4 帧的「头冠→脚底」屏幕高度极差 ≤ 3%；4 个文件尺寸完全一致；与单帧 `atk-<key>.webp` 的屏幕身高差 ≤ 4%。

## measure_slash.py — 刀光素材几何测量（朝向 / 弧心 / 脊线半径）

- 做什么：量 9 张刀光素材（`slash-1..3` + `wp-slash-*`）的不透明包围盒、alpha 加权质量重心、最厚点列、以及**脊线弧心与半径**（逐行取最长游程中点当脊线，再对脊线做最小二乘圆拟合，Kåsa 法），输出 JSON 到 stdout。
- 何时跑：换刀光素材之后**必须重跑**，否则 `js/fx.js` 的 `ARC` 表会把刃口高光画到图外。
- 输入：`assets/slash-1..3.webp`、`assets/fx/wp-slash-*.webp`。
- 输出：stdout 的 JSON（不写任何文件），每项含 `bbox` / `mass_cx_n` / `thick_x_n` / `arc_cx_n` / `arc_cy_n` / `arc_r_n` / `convex_dir`。
- 怎么用：把新数值填进 `js/fx.js` 的 `ARC` 与 `tools/selftest_weapons.mjs` 的 `ARC_FIXTURE`，两处必须一致（5c 会校验）。
- 判据：`convex_dir` 全为 −1 即「凸背朝左」。若某张变成 +1，说明素材被重新生成了朝向，`ART_CONVEX` 要跟着改。
- 幂等性：纯只读，无副作用。

## probe_slash_orient.py — 刀光朝向的像素级验证

- 做什么：读一张探针截图（两个朝向并排渲染），按亮度加权算各自的质心与包围盒，断言「亮肚在面向一侧」且两者**互为镜像**。
- 何时跑：改 `slashMirror` / `ARC` 之后，作为参数级自检之外的独立复核。
- 输入：探针截图 PNG（900×460，`facing=+1` 的锚点在 (240,230)、`facing=-1` 在 (660,230)）。
- 输出：stdout 报表；退出码 0 = 通过，1 = 有断言失败。
- **探针怎么造**（踩过的坑都在这）：`file://` 下 `getImageData` 抛 `SecurityError`，必须走截图；游戏主循环一直在动会让 Playwright 截图超时，要么 `animations: "disabled"` 并裁剪到画布，要么先停 rAF；`<canvas>` 会被全局 CSS 拉成 1600×900，必须显式写 `style.width/height`；**探针里不许画任何文字或辅助线** —— 它们会进像素统计，曾造出 3.4px 的假不对称。
- 幂等性：纯只读（只读截图），无副作用。

## selftest_drop.mjs — 掉落池自检

- 做什么：从 `index.html` 抽出 `DROP_POOL` 与 `pickDropKey` 两段源码，在 `vm` 里单独执行，校验七件事：0~20 阵都抽得出非空池子；玉璋刃 / 骨牙匕只在前两阵出现、第三阵起一个不漏地退场；11 件武器在各自解锁阵次起真的抽得到；`heavyMul` 只放大非基础件（`from > 0`），第一阵倍率 1 与倍率 2 同分布；池内均匀 —— 实际分布与「条目数即权重」一致（±2%），谁把加权表请回来当场失败；**第三、四、五阵各有一件新武器首次入池**（不许第三阵一次开满）；**池子平均伤害随阵次单调不减、件数不缩水**。
- 怎么替代随机：`Math.random` 临时换成固定种子的线性同余序列，才能断言「均匀」而不是靠运气。
- 何时跑：改 `DROP_POOL`、改 `pickDropKey`、改 `heavyMul` 的传参、调整任何武器的解锁 / 退场阵次后。
- 输入：`index.html`（只读那两段，不跑整份内联脚本 —— 它要 DOM / canvas）。
- 输出：stdout 报表；退出码 0 = 通过，1 = 有失败项。
- 幂等性：纯只读，无副作用。
- 回归防线实测：把 `short` / `dagger` 的 `until:2` 删掉 → 8 项失败；把 `hammer` / `bow` 从第三阵推到第四、五阵 → 3 项失败（第三阵无新武器、平均伤害回头、池子缩水）。

## selftest_weapons.mjs — 武器视觉自检

- 做什么：node + mock canvas 跑 `char-rig.js` 与 `fx.js`，校验五件事：出招序列的字段约束（4 帧共用画布与 `scaleFix`、`anchorX` 是逐帧数组）；每把武器都能拿到「站立帧 / 出招图 / 专属刀光」三件套；挥砍过程中真的播到了多个不同帧；缺键能逐级落回（序列 → 单帧 → 动画 clip；专属刀光 → 通用 slash-1..3 → 纯代码弧光）而不抛异常；**刀光朝向与刃口高光锚定**（5b / 5c 两节）。
- 5b 怎么测朝向：mock ctx 自带 CTM（`translate / rotate / scale` 真正乘矩阵，`save/restore` 连 `globalCompositeOperation` 一起存），把 `drawImage` 的目标矩形变换到设备空间，断言「源画 −x 轴（凸背）的设备指向 = facing」，并断言两个朝向逐点镜像（容差 0.01px）。
- 5c 怎么测高光：从记录的 `arc()` 里按半径匹配刃口高光，断言它的圆心落在**实测弧心** `(ox + dw·cx, oy + dh·cy)` 而不是原点 —— 旧代码在原点画弧，高光整根悬在月牙外。
- 何时跑：改 `char-rig.js`、`fx.js`、`anim-data.js` 的武器相关数据块，或新增武器后。
- 输入：`js/anim-data.js`、`js/char-rig.js`、`js/fx.js`、`assets/` 目录。
- 输出：stdout 报表；退出码 0 = 通过，1 = 有失败项。
- 幂等性：纯只读，无副作用。

- 做什么：node + mock canvas 跑 `enemies-assets.js`，校验对外契约、目标高度、宽高比、`anchorX` 水平对齐、脚底对齐、帧号定格、缓存有界、血条位置、`maxHp ≤ 1` 不画血条、BOSS 血条抬到 `1.6H`、朝向镜像、降级路径不抛异常。
- 何时跑：改 `enemies-assets.js`、改 `anim-data.js`、改敌人参数后，每次都要跑。
- 输入：`js/anim-data.js`、`js/enemies-assets.js`（读文件，`vm` 里执行）。
- 输出：stdout 报表；退出码 0 = 通过，1 = 有失败项。
- 幂等性：纯只读，无副作用。
- 为什么不用浏览器：多 agent 共享同一个 Playwright 实例会互相导航抢浏览器，自检一律用 node + mock canvas。

## check-inline.mjs — 内联脚本语法校验

- 做什么：抽出 `index.html` 最后一个 `<script>` 块，用 `new Function()` 编译，只验语法不执行。
- 何时跑：改 `index.html` 内联脚本后，每次提交前。
- 输入：`index.html`。
- 输出：stdout；退出码 0 = 通过，1 = 语法错误或找不到内联脚本。
- 幂等性：纯只读，无副作用。

## selftest_audio.mjs — 声音自检

- 做什么：node + mock Web Audio 跑 `js/audio.js`，校验模块导出、总线与压缩器建立、12 种武器材质 × 三档受击都能发声、材质映射、复音节流真的压住同帧连打、BGM 起停与波次档位、喘息标志的置位与清除、静音与音量接口、无 `AudioContext` 时安全空转。
- 何时跑：改 `js/audio.js`、新增武器（要同时在 `MATERIAL` 里给材质）、改 `index.html` 音效壳后，每次都要跑。
- 输入：`js/audio.js`（读文件，`vm` 里执行）。
- 输出：stdout 报表；退出码 0 = 通过，1 = 有失败项。
- 幂等性：纯只读，无副作用。
- 为什么不用浏览器：同 `selftest_enemies.mjs`，多 agent 共用 Playwright 会互相抢浏览器。真实音频链路的验证另外做过一次：`file://` 载入页面、真 `AudioContext`、6 秒实机连打与四类投掷物爆炸，控制台零报错。
- 已知局限：mock 只能证明「节点被正确创建与调用」，证明不了音色好不好听。改配方表后要人耳听一遍。

---

## align_weapon_frames.html + align_apply.py — 手动对齐武器帧（anchorX / footY）

**为什么需要**：`js/anim-data.js` 的 `WEAPON_CLIP` 里每帧一个 `anchorX`（0..1 的横轴锚点），
切片脚本是用「剪影中线」猜的。同一把武器的四帧，猜出来的值能差 0.5 —— 屏幕上就是走路左右乱跳。
实测抖动：玉璋刃 `walk` 89px、铃 `attack` 97px、锤 `jump` 84px。自动判据救不了
（同源教训见 `AGENTS.md` 的「朝向只能人眼看」），所以这一步交给人眼。

- **`align_weapon_frames.html`**（浏览器打开，零依赖，`file://` 直接用）
  - 做什么：读 `js/anim-data.js` 的现值，把某个武器某状态的所有帧叠在一起，
    拖到同一基准，导出 JSON。
  - 输入：`../js/anim-data.js`、`../assets/anim/*.webp`。
  - 输出：`{"<武器>": {"<状态>": {"anchorX": [...], "footY": [...]}}}`（合法 JSON）。
  - 不读像素：只画不 `getImageData` —— `file://` 下 `canvas` 会被污染，
    一读像素就 `SecurityError`。这也是这里刻意不做「一键自动对齐」的原因。
  - 交互：拖画面 = 移当前帧；`←→↑↓` 1px、`Shift`+方向 10px；`Tab` 换帧；
    点数字选帧、双击数字设参考帧；「全部锁到参考帧」一次抹平逐帧差。
  - 验收：左侧「距参考帧」变成 `+0, +0 ✓`；底部预览循环播放时不抖。
- **`align_apply.py`**（回填）
  - 做什么：只改 `anchorX` / `footY` 两个字段，不碰 `frames` / `files` / `scaleFix`；写完自动 `node --check`，失败自动回滚。
  - 用法：`python tools/align_apply.py align.json`（`--dry` 只看 diff；`--report` 不需要导出文件，直接列出当前哪些状态还有逐帧差）。
  - 安全阀：帧数对不上整段拒绝（导出的是旧数据）；写前存 `.bak`。
  - 幂等性：可重复跑，同名覆盖；`--report` 纯只读。

**跑完必做**：`node tools/selftest_weapons.mjs && node tools/check-inline.mjs`。

**`footY` 现在可以逐帧**：`char-rig.js` 的 `footOf(def, idx)` 与 `anchorOf` 同构
（数字 = 整段共用，数组 = 逐帧）。手工对齐时纵向一样会歪 —— 底边贴齐只保证
「裁剪框」贴齐，不保证脚底在同一行。

---

## 已废弃

- `prep-assets.ps1` — 第一版 PowerShell 抠图脚本，被 `prep_assets.py` 取代，已从本目录移除。
  找不到它是正常的，不要再补回来。

## 变更影响路由

| 改这个脚本 | 必须一起看 |
|---|---|
| `slice_anim.py` | `js/anim-data.js` 的 `window.ANIM`、`char-rig.js` 的 `CLIPS` 与降级链；跑完补 `slice_anim_extra.py` |
| `slice_anim_extra.py` | 三个新 clip 的 `scaleFix` 是否**没被覆盖**（脚本沿用旧值）、`char-rig.js` 的 `CLIPS` 是否含这三个名字 |
| `slice_enemy_anim.py` | `js/anim-data.js` 末尾的 `window.ENEMY_ANIM`、`enemies-assets.js` 的 `KINDS`、`selftest_enemies.mjs` |
| `prep_assets.py` / `prep_fx.py` / `fix_fg.py` | `js/assets.js` 的 `MANIFEST` 键名与路径、`background.js` 的 `PROPS` 键名 |
| `prep_interact.py` | `js/assets.js` 的 `chestClosed / chestOpen / mechanismOff / mechanismOn / pickupCowrie / pickupJade` 六个键 |
| `prep_icons.py` | `js/assets.js` 的 `wp* / it*` 两族键名（`icon*` 已停产出）、`index.html` 的 `ICON` 映射与 `DROP_ICON_SIZE` |
| `prep_touch.py` | `js/touch.js` 的 `ART` 表（文件名与字段一一对应）、`assets/touch/` 那 10 张、`showcase.js` 界面 tab 的「手机虚拟键」清单（`TOUCH`） |
| `slice_weapon_assets.py` | `js/anim-data.js` 的 `ANIM_HOLD` / `WEAPON_FX` / `HIT_MATERIAL`；`--with-atk` 会复活已废弃的 `WEAPON_ATTACK` |
| `slice_weapon_seq.py` | **默认不写任何文件**；`--with-atk` 才复活已废弃的 `WEAPON_ATTACK_CLIP` 与 40 张 `atk-*` |
| 锚点或 `scaleFix` 相关逻辑 | `docs/ARCHITECTURE.md` 的「跨帧对齐约定」 |
| `align_apply.py` / `align_weapon_frames.html` | `char-rig.js` 的 `anchorOf` / `footOf`、`js/anim-data.js` 的 `WEAPON_CLIP`、`selftest_weapons.mjs` |
| `selftest_audio.mjs` | `js/audio.js` 的导出清单；导出增删要同步改用例，否则自检会漏掉新接口 |
| `selftest_drop.mjs` | `index.html` 的 `DROP_POOL` / `pickDropKey`；改池子结构或加减武器要同步它的 5 组断言 |
