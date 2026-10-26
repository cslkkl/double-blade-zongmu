# 部署 — 静态托管与上线要求

静态站点，无构建步骤、无后端、无依赖。把文件放进任意静态服务器的目录即可。

> **本页是唯一 home**：要传什么、缓存头、HTTPS / 横屏 / 触屏三条上线要求。
> **改这里之后要同步**：[../操作与录屏说明.md](../操作与录屏说明.md) 的「交付物是哪三样」（同一件事的现场版）。
> **本页被引用**：[../AGENTS.md](../AGENTS.md) 分层索引 · [README.md](README.md) 事实路由表。
> 手机端实现细节不在这里，在 [MOBILE.md](MOBILE.md)。

---

## 一、要传什么

**只传这四样**（其余都是开发资料，不该上服务器）：

| 路径 | 体积 | 说明 |
|---|---|---|
| `index.html` | 0.20 MB | 游戏本体（含内联脚本与样式，内联脚本约 14.4 万字符） |
| `mobile.html` | 1 KB | **手机版入口**：跳到 `index.html?touch=1` |
| `js/` | 0.34 MB | 12 个 IIFE 模块，索引见 [js/README.md](../js/README.md) |
| `assets/` | 21.55 MB | 330 个文件，全部是运行时真加载的素材 |
| `docs/` | 可选 | 说明文档，**不需要上线** |

好消息：`.gitignore` 已经把开发目录全部排除了，且未引用的素材已清理 ——
仓库约四百个文件 / 二十余 MB，直接 `git clone` 或从仓库打包上传就行，
不会带上那 540 MB 的录屏与调试产物。

被忽略的（合计 540 MB，都在本机，不进仓库）：

```
_video/       370 MB   录屏原片（投稿用，不是游戏资源）
_shots/        98 MB   调试截图
_materials/    53 MB   参考图与原始 PDF
tmp/           28 MB   临时脚本与量帧产物
_dbg/          19 MB   调试叠图
_archive/     0.4 MB
tools/        0.3 MB   素材流水线（只在本地跑）
.agents/ .github/     开发笔记与 CI
```

体积账：运行时实际请求 323 个素材 / 17.93 MB，与 `assets/` 现有的 329 个 / 18.32 MB
基本一致 —— 剩下的 6 张是 PWA 备用图标尺寸（将来加 manifest 时用得上）。

已清理的未引用素材（15.78 MB，都不在任何代码里）：
`assets/promo/` 14 个 / 15.31 MB（宣传片与海报，游戏里不播）、
`assets/bg-fg.webp` 89 KB。

---

## 二、三种部署方式，任选

### A. nginx（推荐，最可控）

```nginx
server {
    listen 80;
    server_name your.domain;
    root /var/www/sanxingdui;
    index index.html;

    # 关键：素材是 webp/mp4，要显式给 MIME。nginx 默认表里有 webp，
    # 但老版本没有 mp4 的 Accept-Ranges —— 短片要靠 Range 请求拖进度条。
    types {
        text/html   html;
        text/css    css;
        application/javascript  js;
        image/webp  webp;
        image/png   png;
        image/svg+xml svg;
        video/mp4   mp4;
        image/x-icon ico;
    }

    # 素材带哈希式文件名（walk-axe-0.webp），可以长缓存
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Accept-Ranges bytes;
    }
    # index.html 与 js 必须短缓存，否则改了代码玩家还看旧版
    location ~* \.(html|js)$ {
        expires 5m;
        add_header Cache-Control "public, must-revalidate";
    }

    # gzip：js 与 html 能压到 1/4
    gzip on;
    gzip_types text/html application/javascript text/css;
    gzip_min_length 1024;
}
```

传文件：`scp -r index.html js assets docs user@host:/var/www/sanxingdui/`

### B. GitHub Pages

仓库已是公开的，但 `has_pages: false`。开法：

1. 把上面「要传什么」那四样放到仓库根（现在 `index.html` 已在根，`js/` `assets/` 也在，直接可用）
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch` → `main` / `/ (root)`
3. 等一分钟，访问 `https://<user>.github.io/<repo>/`

注意：GitHub Pages 单文件上限 100 MB、仓库建议 1 GB 以内 —— 当前仓库 575 MB
主要是 `_video/`，**必须先把开发目录移出去或加进 `.gitignore`**，否则推不上去。

### C. 任意静态托管（Vercel / Netlify / Cloudflare Pages）

拖拽或连 Git 都行，无需 `vercel.json` / `netlify.toml` —— 没有构建步骤，
框架选「Other / 静态」。唯一要设的是缓存头，可在面板里给 `/assets/*` 加
`Cache-Control: public, max-age=2592000`。

---

## 三、手机端怎么复现全部功能

游戏是**纯静态 + 无外部请求**的，所以手机能玩到什么，取决于浏览器能力，不是服务器配置。

### 入口在哪

| 入口 | 给谁 | 行为 |
|---|---|---|
| `index.html` | 桌面 | 键盘 / 手柄界面。有触摸硬件的设备会**自动**切触屏档 |
| `mobile.html` | 手机 | 跳到 `index.html?touch=1`，**强制**触屏档 |

`mobile.html` 存在的理由：从主屏图标启动时没有「第一次手指落下」这个事件，
自动判断会等不到 —— 虚拟键永远不出现。强制开关解决这个。

强制参数：

| 参数 | 效果 |
|---|---|
| `?touch=1` | 强制触屏档（虚拟键 + 触屏图例 + 竖屏提示） |
| `?touch=0` | 强制桌面档（触摸屏笔记本上想用鼠标玩时用） |

部署后手机上访问 `https://你的域名/mobile.html`，
再「添加到主屏幕」，从图标启动就是纯手机版（无地址栏、横屏全屏）。

### 必须满足的三条

| 项 | 要求 | 不满足会怎样 |
|---|---|---|
| HTTPS | **必须**（除 `localhost`） | 不是 HTTPS 时 `navigator.vibrate` 与部分 Web Audio 被禁用；安卓 Chrome 还会警告「不安全」 |
| 横屏 | 建议锁横屏，或让玩家手动转 | 竖屏下画面被压成窄带（1600×900 缩到 390 宽 = 0.24 倍，角色只有 43px 高），已做整屏「请横过来」遮罩 |
| 触屏 | 有触摸硬件（`navigator.maxTouchPoints > 0` 或 `ontouchstart`） | 极老浏览器（iOS < 13）只支持 TouchEvent，`js/touch.js` 有 `touchstart` 回退路径 |

**注意**：判「有没有触屏」只看触摸硬件，**不看 `PointerEvent`** ——
桌面 Chrome 全都支持 PointerEvent，拿它当判据会让鼠标点一下就切进手机版。
鼠标与手指的区分靠 `pointerType`（`mouse` 不算手指）。

### 手机端功能对照表

| 功能 | 手机能不能 | 怎么做到 |
|---|---|---|
| 移动 / 跳 / 挥刀 / 技能 / 拾取 / 丢弃 / 递队友 | ✅ | 屏幕左右两簇虚拟键（`js/touch.js`），8 个动作键 + 2 个系统键 |
| 单人 / 双人同屏 | ✅ | 双人时每人独占半屏，两簇按键互不重叠（有自动检测） |
| 开场短片 + 长按跳过 | ✅ | 短片下半屏是长按区，按住 0.7 秒跳过 |
| 暂停 / 继续 | ✅ | 顶栏 ⏸ 按钮，或暂停页点空白处 |
| 键位说明 | ✅ | 顶栏 `?`，内容自动切成触屏版（手机示意图） |
| 失败 / 通关 → 重来 | ✅ | 点页面按钮（已放大到 62px 高）或点任意处 |
| 手柄 | ✅ | 蓝牙手柄连上后虚拟键自动隐藏，改用手柄（含震动） |
| 键盘 | ✅（需外接） | 与桌面完全一致 |
| 震动反馈 | ⚠️ 仅安卓 | `navigator.vibrate` 是安卓专有；iOS Safari 不支持，静默 no-op |
| BGM / 音效 | ✅ | 打击音实时合成；BGM 读 assets/audio/bgm-main.mp3（<audio> 元素），音轨缺席时退回程序化 BGM |
| 双击连发 | ❌ | 未做。连按三连击要手动点三次（每次约 0.4 秒内），实测可行但不如手柄顺 |
| 横屏锁定 | ❌ | 未做 `screen.orientation.lock`（需要全屏权限，且 iOS 不支持） |

### 真机验收清单

以下是我在 Chrome 桌面模拟视口（844×390 / 390×844）实测过的，
**真机还需复测**（标 ★ 的是模拟环境测不出来的）：

- [ ] 横屏进入，画面完整无裁切、血条不被刘海遮
- [ ] ★ iOS Safari 地址栏收起/展开时画面不跳（`visualViewport` 行为）
- [ ] ★ 安卓地址栏收展时同理
- [ ] ★ 安全区：iPhone 刘海机型左右留白是否够
- [ ] 虚拟键 8 个全部能按，位置不重叠（控制台无 `[Touch] 虚拟键重叠` 警告）
- [ ] 按住 ▶ 角色持续右移，松手立刻停
- [ ] 连点「刀」三下能打出三连击
- [ ] 跳跃、技能、拾取、丢弃、递队友各一次
- [ ] ★ 双人模式两个拇指同时操作互不干扰
- [ ] ★ 来电 / 切 App / 锁屏后回来，角色不会自己一直走
- [ ] 竖屏时有「请横过来」提示，且按键不显示
- [ ] 失败页点「重来」能重开
- [ ] ★ 蓝牙手柄连上后虚拟键自动消失
- [ ] ★ 安卓上按虚拟键有轻微震动

---

## 四、已知的手机端取舍

1. **画面不随屏幕分辨率提高清晰度**。canvas 内部按逻辑分辨率绘制（高度 900、
   宽度见下条），在 2K/3K 屏上是被 CSS 放大后的结果，边缘略软。
   要提高清晰度得把内部分辨率乘以 devicePixelRatio，但那会让所有
   绘制坐标、碰撞盒、判定半径全部失效（它们都以逻辑坐标为单位写死）。
   这是架构级的取舍，不是遗漏。
2. **画面比例不再固定 16:9（2026-10-26 起）**。逻辑**高度**恒 900、宽度在触屏设备上
   按视口比例加宽（上限 2100），所以手机横屏能填满屏幕 —— 实测 844×390 从
   「左右各留 75px 黑边」变成填充 99.8%，而角色身高与所有判定距离一个像素都没变。
   桌面恒 1600 不变。细节与「为什么远景要等比、中景要原尺寸平铺」见
   [手机端适配.md](MOBILE.md) 的「逻辑视口加宽」。
3. **iOS 无震动**。`navigator.vibrate` 只有安卓有。
4. **竖屏不可玩**。只给「请横过来」提示，没做旋转画面的降级版。
5. **按键位置写死**。小屏机（5.5"）与平板（11"）共用同一套百分比布局，
   没有拖拽自定义。

---

本页是上线要求的唯一 home；改完同步 `操作与录屏说明.md` 里「交付物是哪三样」那段。
手机端实现细节去 [MOBILE.md](MOBILE.md)，文件索引去 [README.md](README.md)。
