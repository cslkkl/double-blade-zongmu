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
- 输出：`assets/bg-far.jpg`、`assets/bg-mid.webp`、`assets/bg-fg.webp`、`assets/ground.webp`、`assets/props/*.webp`、`assets/char/turnaround.webp`、`assets/char/pose-0|1.webp`。
- 幂等性：可重复跑，同名覆盖；不会删除多余文件。
- 已知缺口：`assets/char/front.webp`、`side.webp`、`back.webp` 不在本脚本产出里。

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
- 输出：`assets/icons/` 16 张 —— 武器 6 张 `wp-*.webp`（256 画布，占 0.86）、物品 6 张 `it-*.webp`（192，占 0.84）、界面 4 张 `icon-*.webp`（128，占 0.88）。
- 为什么必须归一：一次出的六个图标各自包围盒不同，直接按包围盒缩放到目标尺寸就会忽大忽小；归一后缩放只剩长边一个自由度。
- 幂等性：可重复跑，同名覆盖。
- 验收：末尾批量校验「紫色残留」合计应为 0 或个位数；`assets/icons/` 应为 16 个文件。

## slice_anim_extra.py — 新增动作切片

- 做什么：复用 `slice_anim.py` 的抠图、分帧、锚点原语，切 `pickup` / `attack-heavy` / `attack-thrust` 三张条带并回写 `js/anim-data.js` 的 `window.ANIM`。
- 何时跑：新增或重出这三个动作时；既有 9 个动作不碰。
- 输入：`sanxingdui-anim/char-pickup.png`、`char-attack-heavy.png`、`char-attack-thrust.png`。
- 输出：`assets/anim/{pickup,attack-heavy,attack-thrust}-{i}.webp`（3 + 4 + 4 = 11 帧）+ 就地替换 / 追加 `window.ANIM` 里的三个 clip。
- 幂等性：对已存在的 clip 走替换分支，不重复追加；不改动其它 clip。
- 门禁：写完数据文件后脚本内部直接跑 `node --check js/anim-data.js`，非 0 就 `SystemExit(1)` —— 历史上一版曾写出缺冒号的行，把整份数据文件弄成语法错误。
- 注意：脚本把 `scaleFix` 初始写成 `1.0`，那是占位不是终点。跑完必须按内容高反算并手改（算法见 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) 的「跨帧对齐约定」）。
- 验收：`node --check js/anim-data.js` 通过；三个新 clip 的屏幕身高与 idle 一致（178~181px）。

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

- 做什么：一次跑完武器视觉的三类产物 —— 站立持械帧 / 出招姿态帧 / 武器专属特效（含打击材质火花），并把四个数据块就地写进 `js/anim-data.js`。
- 何时跑：新增武器、重出持械或出招姿态、重出武器刀光时。
- 输入（`sanxingdui-weapon/`）：
  - `hold-extra.png` 4 格 → `short` / `blade` / `jar` / `bell` 的站立帧
  - `atk-melee-a.png` 3 格 → `short` / `dagger` / `spear` 的出招姿态
  - `atk-melee-b.png` 3 格 → `sword` / `axe` / `hammer`
  - `atk-ranged.png` 4 格 → `bow` / `rock` / `blade` / `jar`
  - `fx-melee-a.png` 3 件 → `wp-slash-short` / `-dagger` / `-spear`
  - `fx-melee-b.png` 3 件 → `wp-slash-sword` / `-axe` / `-hammer`
  - `fx-ranged.png` 3 件 → `wp-slash-bow` / `-rock` / `-burst`（`jar` 与 `bell` 共用 `burst`）
  - `fx-hit-material.png` 4 格 → `hit-jade` / `hit-bronze` / `hit-blunt` / `hit-airy`
- 输出：`assets/anim/hold-<key>.webp`、`assets/anim/atk-<key>.webp`、`assets/fx/*.webp`，并**追加 / 就地替换**四个数据块：`window.ANIM_HOLD`（只追加新键）、`window.WEAPON_ATTACK`、`window.WEAPON_FX`、`window.HIT_MATERIAL`。
- **`scaleFix` 用腰带锚定，不用内容包围盒高**：出招姿态里武器尖端常高过头顶，包围盒高会把角色算成小人。腰带在腰上，任何姿态都够不到，`scaleFix = idle 腰带到脚底 ÷ 该格腰带到脚底`。同一张图的几格由同一次生图画出，比例一致，所以对同图做一致性校验（偏离中位数 > 6% 判误检并用中位数替换）。
- `anchorX` 同样取腰带行的水平中心，不取包围盒中心 —— 挥砍时武器向一侧大幅伸出，包围盒中心会把人物站位整体带偏。
- 幂等性：只替换自己那几个文件与那四个数据块，不碰 `window.ANIM` / `window.ENEMY_ANIM`，也不重算已有的 7 个 `hold` 键。
- 门禁：写完数据文件跑 `node --check js/anim-data.js`，非 0 直接退出；末尾逐张打印洋红残留计数。
- 验收：`node --check` 通过；腰带到脚底的屏幕长度与 idle 相差 ≤ 2%；洋红残留为 0 或个位数。

## selftest_weapons.mjs — 武器视觉自检

- 做什么：node + mock canvas 跑 `char-rig.js` 与 `fx.js`，校验三件事：每把武器都能拿到「站立帧 / 出招姿态 / 专属刀光」三件套；缺键时能逐级落回（动画 clip → 通用 slash-1..3 → 纯代码弧光）而不抛异常；`WEAPON_FX` 的 `file` 在磁盘上真实存在。
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

## 已废弃

- `prep-assets.ps1` — 第一版 PowerShell 抠图脚本，被 `prep_assets.py` 取代，已从本目录移除。
  找不到它是正常的，不要再补回来。

## 变更影响路由

| 改这个脚本 | 必须一起看 |
|---|---|
| `slice_anim.py` | `js/anim-data.js` 的 `window.ANIM`、`char-rig.js` 的 `CLIPS` 与降级链；跑完补 `slice_anim_extra.py` |
| `slice_anim_extra.py` | 三个新 clip 的 `scaleFix` 是否按内容高反算、`char-rig.js` 的 `CLIPS` 是否含这三个名字 |
| `slice_enemy_anim.py` | `js/anim-data.js` 末尾的 `window.ENEMY_ANIM`、`enemies-assets.js` 的 `KINDS`、`selftest_enemies.mjs` |
| `prep_assets.py` / `prep_fx.py` / `fix_fg.py` | `js/assets.js` 的 `MANIFEST` 键名与路径、`background.js` 的 `PROPS` 键名 |
| `prep_interact.py` | `js/assets.js` 的 `chestClosed / chestOpen / mechanismOff / mechanismOn / pickupCowrie / pickupJade` 六个键 |
| `prep_icons.py` | `js/assets.js` 的 `wp* / it* / icon*` 三族键名、`index.html` 的 `WP_ICON` 映射与 `DROP_ICON_SIZE` |
| 锚点或 `scaleFix` 相关逻辑 | `docs/ARCHITECTURE.md` 的「跨帧对齐约定」 |
| `selftest_audio.mjs` | `js/audio.js` 的导出清单；导出增删要同步改用例，否则自检会漏掉新接口 |
