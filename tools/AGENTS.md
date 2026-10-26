# tools/ — 规则层

继承根规则，见 [../AGENTS.md](../AGENTS.md)；每个脚本做什么、输入输出、幂等性见 [README.md](README.md)。

本目录特有约束：
- 脚本只读源图、只写 `assets/` 与 `js/anim-data.js`；不许写 `index.html` 或其它 `js/*.js`。
- 产物路径（`DST` / `OUT_*`）一律相对仓库根（`ASSETS = ROOT / "assets"`、`ROOT / "js" / "anim-data.js"`），不写盘符；外部生图源目录走环境变量 `SD_IMG_SRC`，脚本已有 `--src` 的以 `--src` 优先，两者都没有就报错退出，不许静默读空目录。改路径只改脚本顶部的路径口径块，不许散落到函数里。
- 生成物写完必须 `node --check js/anim-data.js`；改敌人相关必跑 `node tools/selftest_enemies.mjs`。
- 跑 `slice_anim.py` 前先确认敌人帧可重出：它会清空 `assets/anim/` 全部 `.webp`。
- 自检脚本一律 node + mock canvas，不启浏览器、不接共享 Playwright。
- 素材契约（画布、锚点、`scaleFix` 口径）以 [../docs/ASSETS.md](../docs/ASSETS.md) 为准。

## 生图验收：先量尺寸，再看图

- **上游会静默回传输入原图**（输出与参考图 sha256 相同，提示词未生效）。这类图构图配色全「对」，
  只有尺寸与帧数是错的，肉眼极难发现。**第一步读尺寸 / 宽高比，第二步对输出与输入做 sha256 比对**，
  都过不了别急着看图。
- `ratio: "16:9"` 不保证像素尺寸恒定：同一批同一模型出过 `1774×887` / `1754×896` / `1842×854` 三种。
  切片按画布反算 `scaleFix` 前必须先读实际尺寸。
- **朝向只能人眼看「鼻子朝哪」，不许脚本判**。试过 4 种几何判据（眼白 vs 冠心、下巴 vs 冠心、靴尖 vs 膝、剪影左右延伸），
  在 11 张参考图上投票误判 7/11，且错误方向系统性偏「左」；根因是高方冠比脸宽太多、鼻子只突出几个像素。
  也不要用「武器在哪只手」判 —— 武器随姿势换手，鼻子不会。依据见
  [../.agents/notes/依据-生图条带朝向判据与回传原图坑.md](../.agents/notes/依据-生图条带朝向判据与回传原图坑.md)。
- 图生图提示词必须显式写 `do NOT mirror or flip`，并把「鼻子 / 眉 / 颊 / 颌都朝右边缘」写进同一句；
  只写 `side view facing RIGHT` 约有一半会跑偏。四帧也要逐帧文字描述姿势，否则模型倾向四帧同姿
  （本批 1v4 帧间差最低只有 6.1%，合格线应 ≥ 8%）。
- 洋红底必须 despill，否则边缘一圈紫：见 [README.md](README.md)。

## 锚点与缩放

- **`anchorX` / `footY` 不许让脚本猜。** 切片脚本用「剪影中线」定身体轴，但举武器时剪影中心被拽走：
  同一把武器四帧能猜出 0.26 和 0.82。这与「朝向只能人眼看鼻子」是同一个根因 —— 剪影的几何中心不是身体的轴。
  要改就开 `align_weapon_frames.html` 用眼睛对，导出 JSON 后 `python align_apply.py align.json` 回填。
- **`align_weapon_frames.html` 导出必须是合法 JSON**（键名带引号、带武器名那一层）。早先导出的是给人抄的
  JS 片段（`walk: {` 无引号 + 武器名只在注释里），`align_apply.py` 当场 JSON 解析失败 ——
  「导出 → 回填」中间不许有人工改写。
- **`js/anim-data.js` 里 `footY` 与 `anchorX` 挤在同一行**（`footY: 1.0, anchorX: [...]`），
  用 `^\s*anchorX:` 之类的行首锚定正则一个都匹配不到 —— 找字段只能 `\banchorX:`。
  这个坑让 `align_apply.py --report` 一开始静默输出「全部已对齐」（把 31 个未对齐状态全漏掉）。
- **`scaleFix` 不是「抄 1.0 就行」**：屏幕身高 = `252 × scaleFix × (内容高 ÷ 画布高)`，画布里的空白不吃像素。
  正确算法以 idle 为基准反算：`scaleFix = (idle 内容高 ÷ idle 画布高) ÷ (该 clip 内容高 ÷ 该 clip 画布高)`。
  新动作切片后必须实测内容高（alpha > 24 的包围盒），不能凭画布高填 1.0。
  验收标准：12 个动作的屏幕身高统一在 178~181px，容差 ±2px。
- **武器的姿态不能按「内容包围盒高」反算 `scaleFix`**：举钺、举锤时武器尖端高过头顶，包围盒会把角色算成小人
  （实测 atk-axe 按包围盒 269px、按头冠 174.6px，idle 基准 177.1px）。用「头冠顶 → 脚底」；
  腰带锚也不行 —— 新图腿更长，腰底占比 0.496 vs idle 0.411，会整体缩 10%。
- **`detect_head` 只认金色头冠**（`R>=180 G>=145 B<=160`）。AI 新出的青铜面具素材不满足该条件，
  `slice_weapon_walk.py` 因此加了 `body_top()` 兜底（肩线以上、轮廓中心 ±0.30 宽的竖带取最上行）。
  11 把里 8 把走兜底；两套锚都失败时直接跳过该武器，不造假数据。
- **`hurt-*` 的源画比 `walk-*` 大 6~19%**（10 把武器的 hurt ratio 全在 0.9893~0.9911，walk 只有 0.83~0.97）。
  5 个状态共用同一个 `scaleFix` 时这个差异会 100% 落到屏幕上 —— 玩家每次挨打都闪一下大小。
  已给 11 把武器的 `hurt` 单独算 `scaleFix`（验收：walk 与 hurt 屏幕身高差 ≤3px）。
  **但 `pickup` 不能同样处理**：它是弯腰，宽高比从 2.19 掉到 1.19，按包围盒归一化会把弯腰的人放大到站立高度。
  判断「是姿势还是画错」看宽高比，不看高度。
- 生图条带的角色身高不一致（walk 比 idle 小 33%），靠 `js/anim-data.js` 的 `scaleFix` 校正。

## 生成物与自检

- `slice_anim.py` 生成过 `fps: 6, true, loop: true` 这类语法错误，生成后必须 `node --check`。
- `slice_anim_extra.py` 曾写出缺冒号的 `anim-data.js` 行（`"attack-heavy"{ frames: ...`），整份数据文件当场语法错误；
  现已在脚本内加 `node --check` 门禁，非 0 直接退出。
- 多个 agent 共享同一个 Playwright 实例会互相抢浏览器；自检一律走 mock canvas。
- **验刀光的探针页里不许放文字或辅助线**：它们会进像素统计，曾让 `probe_slash_orient.py` 报出 3.4px 的假不对称。
  另外 `file://` 下 `getImageData` 抛 `SecurityError`，游戏主循环会让 Playwright 截图超时，
  `<canvas>` 会被全局 CSS 拉成 1600×900 —— 三条都得绕。
- **`file://` 下 `canvas` 会因跨源图片被污染**，一 `getImageData` 就 `SecurityError`。所以对齐工具只画不读像素；
  别想着在里面加「自动测包围盒」。
- **`.col-c` 这类 `flex-direction:column` 容器里的 `<canvas>` 会被 `align-items:stretch` 拉宽**，
  位图被非等比放大一次（1000 → 1147），拖起来手感发飘。要给 `align-self:flex-start`。
