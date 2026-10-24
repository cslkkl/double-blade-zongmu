# tools/ — 素材流水线脚本

全部脚本都是本机一次性工具，不在运行期被游戏加载。
素材设计理由见 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)；本目录规则见 [AGENTS.md](AGENTS.md)。

**共同前提**：源图在 `C:\Users\11965\Desktop\imagegen无限\output`，该路径硬编码在各脚本顶部。
换机、换目录必须先改 `SRC`，否则脚本会读空目录并静默写出空产物。

**强制顺序**：`prep_assets` / `prep_fx` / `fix_fg` → `slice_anim` → `slice_enemy_anim`。
理由：`slice_anim.py` 会整体重写 `js/anim-data.js`（丢掉 `window.ENEMY_ANIM`）。文件层面它现在只删角色帧、不碰敌人帧，见下文「`--only` 开关」一节。

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
- 幂等性：**不幂等**。先删角色帧（只删 `<clip>-<i>.webp`，敌人帧保留），再整批重写数据文件。
- 验收：跑完必须 `node --check js/anim-data.js`；输出报表里的「洋红残留」应为 0，缩放系数不应低于 0.55。

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
- 清理范围是硬编码正则，新增角色动作（clip 名不在 9 个之内）时必须同步改 `slice_anim.py` 顶部的 `CHAR_FRAME_RE`，否则旧帧不会被清掉。

## selftest_enemies.mjs — 敌人绘制自检

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

---

## 已废弃

- `prep-assets.ps1` — 第一版 PowerShell 抠图脚本，被 `prep_assets.py` 取代，已从本目录移除。
  找不到它是正常的，不要再补回来。

## 变更影响路由

| 改这个脚本 | 必须一起看 |
|---|---|
| `slice_anim.py` | `js/anim-data.js` 的 `window.ANIM`、`char-rig.js` 的 `CLIPS` 与降级链 |
| `slice_enemy_anim.py` | `js/anim-data.js` 末尾的 `window.ENEMY_ANIM`、`enemies-assets.js` 的 `KINDS`、`selftest_enemies.mjs` |
| `prep_assets.py` / `prep_fx.py` / `fix_fg.py` | `js/assets.js` 的 `MANIFEST` 键名与路径、`background.js` 的 `PROPS` 键名 |
| 锚点或 `scaleFix` 相关逻辑 | `docs/ARCHITECTURE.md` 的「跨帧对齐约定」 |
