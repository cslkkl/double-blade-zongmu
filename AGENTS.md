# 三星堆·双刃战士 — 维护索引

## 全局规则
- 硬约束：零依赖 + `file://` 双击可跑；禁 CDN、禁 npm、禁外部字体、禁 ES module，理由见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 分层：位图只管好看，判定只用数字；改绘制不许动碰撞盒，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 每层素材必须有纯代码降级；任何缺图都不许白屏，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 改 `js/` 之前先查 [js/README.md](js/README.md) 的变更影响路由。
- 改 `tools/` 之前先看 [tools/README.md](tools/README.md) 的幂等性与输入输出。

## 常用命令
验证（每次收工都跑，全绿才算完）：
- `node tools/check-inline.mjs` — 校验 `index.html` 内联脚本语法。
- `node tools/selftest_enemies.mjs` — 敌人绘制自检，node + mock canvas，不开浏览器。
- `node --check js/anim-data.js` — 生成物语法门禁。
- `python <maintenance-flow>/check-markdown-links.py . --fragments` — 文档链接校验。

重新生成素材（会覆盖产物，先提交再跑）：
- `python tools/slice_anim.py` — 角色 9 动作 → `assets/anim/` + `js/anim-data.js`。
- `python tools/slice_enemy_anim.py` — 敌人 4 类 → `assets/anim/enemy-*` + `window.ENEMY_ANIM`。
- `python tools/prep_fx.py` — 刀光 / 火花 / 旋风环 / 石块。
- `python tools/prep_assets.py` — 背景 / 道具 / 角色底图。
- `python tools/fix_fg.py` — 前景层单独重做。

## 验证快照
- 2026-10-24：`check-inline` 通过；`selftest_enemies` 0 失败；`node --check` 7/7 通过；素材 73 文件、2.55 MB（其中 71 个被引用）。
- 无 CI，以上为本机手工结果；改完代码重跑一遍再写结论。

## 待办
- [ ] `神鸟弓` 有数据、有 `fireProjectile` 的 bow 分支、有 bow 三帧，但掉落池 `["dagger","sword","hammer","dagger","sword","rock"]` 不含它，实机拿不到。
- [ ] `青铜钺`、`三枝叉` 同样只在 `WEAPONS` 表里，无发放路径。
- [ ] `slice_anim.py` 跑起来会清空 `assets/anim` 全部 webp（含敌人帧），只能先角色后敌人；给它加只清角色帧的开关。
- [ ] 未消费素材：`assets/char/front|side|back|pose-1|side-sheet|turnaround.webp`；`FX.drawWhirl`、`FX.drawHudPanel` 无调用方。留档或删。
- [ ] 背景 `ready()` 只判 `complete`，加载失败的图也算就绪：`bg-far` 加载失败时只剩底色渐变，不回落 `drawBG`。

## 活跃坑
- 生图模型画 sprite strip 时，不同动作条带的角色身高不一致（walk 比 idle 小 33%），靠 `js/anim-data.js` 的 `scaleFix` 校正，见 [js/anim-data.js](js/anim-data.js)。
- 洋红底素材必须做 despill，否则边缘一圈紫：`min(R,B)-G` > 110 硬抠、45~115 软边、剩下的把 R/B 压到 `G+34` 以内，见 [tools/README.md](tools/README.md)。
- 多个 agent 共享同一个 Playwright 实例时，会互相导航抢浏览器；自检一律用 `node tools/selftest_enemies.mjs`（mock canvas），不开浏览器。
- `slice_anim.py` 生成 `anim-data.js` 时写出过 `fps: 6, true, loop: true` 这种语法错误，生成后必须 `node --check`。

## 文档地图
- 架构与设计决策 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- js 文件索引与变更路由 → [js/README.md](js/README.md)；规则 → [js/AGENTS.md](js/AGENTS.md)
- 素材流水线与脚本 → [tools/README.md](tools/README.md)；规则 → [tools/AGENTS.md](tools/AGENTS.md)
- 对外门面与文物依据 → [README.md](README.md)
- 原作机制对照 → [双刃战士玩法介绍.md](双刃战士玩法介绍.md)
- 参赛文案 / 录屏 / 交付 → [文案包.md](文案包.md)、[操作与录屏说明.md](操作与录屏说明.md)、[交付清单.md](交付清单.md)
