# 素材契约 — 生图 → 切片 → 渲染的唯一口径

> 这份文档的唯一目的：**让任何 agent（或人）接着做素材时不会把方向、命名、
> 比例搞乱**。改素材前先读这一页，不要从别处的描述里猜。
>
> 具体脚本的用法与幂等性在 [../tools/README.md](../tools/README.md)；
> 生成时最容易踩的坑在 [../tools/AGENTS.md](../tools/AGENTS.md)。

## 1. 朝向：一律朝右

| 项 | 规定 |
|---|---|
| 角色朝向 | 侧身，**鼻子与面具前缘在画面右侧**，后脑与冠的背面在左侧 |
| 判据 | 看**鼻子/面具前缘**，不要看武器在哪只手 —— 武器会随姿势换手，鼻子不会 |
| 例外 | 无。11 张原画参考图全部朝右，没有一张左向 |
| 游戏内 | `char-rig.js` 用 `ctx.scale(p.facing < 0 ? -1 : 1, 1)` 翻转，所以**素材本身只出右向**，左向靠运行时镜像 |

### 生图时怎么保证
`facing RIGHT` 这句对模型**不够稳**（实测约一半概率会跟着参考图走反面）。必须写成：

```
... side view, and the nose points to the RIGHT edge of the image, facing right. Flip him if needed.
```

验收时**逐张目视 + 代码取色**，不要只信提示词。

## 2. 背景：纯洋红 #FF00FF

- 抠图靠 `min(R,B) - G`，所以背景必须是**纯平洋红**，不能有白底 / 黑底 / 灰底 / 渐变 / 落地阴影
- 提示词里写 `pure flat magenta background (#FF00FF)` 仍可能出白底（实测发生过 3 次）
- **验收必须用代码取角点像素**：四角各取一点，要求 `R>200 且 B>200 且 G<90`
- 白底图直接作废重生成，不要试图修

## 3. 命名与格数

条带源图（生图产物）落 `D:\ProjectSomething\imagegen-mcp\output\weapon-states\`：

```
<key>-walk.png     4 格  行走循环
<key>-jump.png     2 格  屈膝起跳 / 滞空收腿
<key>-attack.png   4 格  蓄力 → 挥出 → 收势 → 复位
<key>-aux.png      2 格  第0格 受击后仰  第1格 弯腰拾取
```

`<key>` ∈ `short dagger sword axe hammer spear bow rock blade jar bell`（11 把，全小写）

**注意 `aux` 不是"一个叫 aux 的状态"**：它是一张 2 格条带里塞了**两个独立状态**，
第 0 格给 `hurt`、第 1 格给 `pickup`。切片脚本按格号拆开写进数据块。

产物（`assets/anim/`）：

| 状态 | 文件名 | 帧数 |
|---|---|---|
| walk | `walk-<key>-<0..3>.webp` | 4 |
| jump | `jump-<key>-<0..1>.webp` | 2 |
| attack | `attack-<key>-<0..3>.webp` | 4 |
| hurt | `hurt-<key>.webp` | 1 |
| pickup | `pickup-<key>.webp` | 1 |

> **一个踩过的坑**：早期版本按 `<state>-<key>.webp` 统一命名，多格条带的 4 格会
> 互相覆盖，44 张被压成 11 张，且 `anim-data.js` 里 4 个 `files` 全指向同一个文件。
> 多帧状态的文件名**必须带帧号**。

## 4. 比例：所有素材同身高

- 屏幕身高 = `252 × scaleFix × (身体高 ÷ 画布高)`
- 验收标准：**11 把 × 5 个状态的实渲身高统一在 174.5~174.7px**
- `scaleFix` 每把武器每个状态一个数（同一张条带的各格共用同一画布，所以共用同一个）
- `anchorX` **逐帧一个**（数组）：身体轴线随姿势前后移，逐帧取才不漂

### 身高锚为什么有兜底
`slice_weapon_assets.detect_head` 找的是原画那顶**金色**头冠
（`R>=180 G>=145 B<=160`）。图生图的新素材是青铜绿面具，金冠条件经常不成立
（实测 11 把里 8 把失败）。所以切片脚本先用它，失败再走 `body_top()`：

1. 肩线 = 从脚底往上扫，第一个宽度 ≥ 最大宽 50% 的行
2. 头 = 以肩线行的轮廓中心为轴、左右各 0.30 倍宽的竖带里，最上面那个有内容的行
3. 举过头顶的武器（锤/钺/矛）通常偏在一侧，落在竖带外，不计入身高

两套锚都失败 → 跳过该武器并在报告里标出，**不造假数据**。

## 5. 画风基准

唯一基准是 `_refs/hold-png/ref-hold-<key>.png`（从 `assets/anim/hold-<key>.webp` 转的 PNG）。

必须一致的可辨识特征：
- 瘦长比例（约 1:5 头身，**不是 chibi**）
- 细而干净的描边
- 青铜绿面具 + 高方冠（冠顶有金边）
- 铠甲卷云纹 + 金色包边、棕色腰带
- 武器偏小写实，**不要画得比人物还大**

生图方式：**图生图**，每张必带参考图；同一把武器的后三种动作额外带该武器已验收的
`walk` 图做第二参考，保证跨动作咬合。

## 6. 验收清单（每张都过一遍）

- [ ] 画风同源：比例 / 描边 / 冠形 / 纹样 / 配色与参考图一致，非 chibi
- [ ] 朝向：鼻子朝右（与参考图同向）
- [ ] 格数正确，各格独立不重叠、不裁切、间隙清晰
- [ ] 背景四角取色：`R>200 && B>200 && G<90`
- [ ] 脚底基线一致；同张内各格比例一致
- [ ] 动作可辨，不是同一姿势复制四遍（帧间差异率 > 8%）
- [ ] 武器与参考图同款，尺寸合理

## 7. 跑管线

```powershell
# 1. 生成参考图（从现有 hold 帧转 PNG，只在参考图缺失时跑）
python tools/make_refs.py

# 2. 朝向自检（切片前必跑）
python tools/check_weapon_facing.py --src <条带目录>

# 3. 切片 + 写数据块
python tools/slice_weapon_states.py --src <条带目录>

# 4. 门禁
node --check js/anim-data.js
node tools/selftest_weapons.mjs
```

## 8. 渲染层怎么消费

`window.WEAPON_CLIP[key][state] = { frames, loop, fps, w, h, scaleFix, footY, anchorX[], files[] }`

`char-rig.js` 的 `drawWeaponState()` 是第一优先级，查不到该状态才逐级回落：

```
WEAPON_CLIP[state] → 旧通道（ANIM_HOLD / WEAPON_WALK_CLIP / WEAPON_ATTACK_CLIP）→ 公共 clip → 降级精灵
```

帧号来源按状态分流，这是最容易改坏的地方：

| 状态 | 帧号来源 | 理由 |
|---|---|---|
| walk | `p.walk`（累计位移）÷ `WALK_CYCLE` | 站着不动不该换帧，减速步频自然降 |
| attack | `swingT / swingDur`（判定） | 有几帧不影响出手时机 |
| hurt | `hurtT` 比例 | 一次性动作 |
| pickup | `pickupT` 比例 | 一次性动作 |
| jump | `vy > 0 ? 0 : 1` | 顶点前 / 顶点后 |
| idle | 固定第 0 帧 | — |

## 9. 已知的坑（都是从实际事故里提炼的）

1. **`facing RIGHT` 不够** —— 模型会跟参考图走，要显式写 "nose points to the RIGHT edge"
2. **洋红底不是必中** —— 带 BACKGROUND RULE 也可能出白底，必须逐张取色
3. **多格条带的文件名必须带帧号** —— 否则互相覆盖
4. **`detect_head` 只认金色** —— 新素材要走 `body_top()` 兜底
5. **`aux` 是两张状态拼一张条带** —— 别当单一状态塞进数据块
6. **参考图本身全部朝右** —— 曾经有 agent 误判"6 张是左向"，把对的图改反了。
   判断一律看鼻子，不要看武器
