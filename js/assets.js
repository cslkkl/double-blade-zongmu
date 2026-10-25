/* =====================================================================
   资源加载器
   用法：Assets.load().then(() => start())
   ===================================================================== */
(function () {
  "use strict";

  var MANIFEST = {
    bgFar:       "assets/bg-far.jpg",
    bgMid:       "assets/bg-mid.webp",
    ground:      "assets/ground.webp",
    sacredTree:  "assets/props/sacred-tree.webp",
    maskRelief:  "assets/props/mask-relief.webp",
    brazier:     "assets/props/brazier.webp",
    potteryJar:  "assets/props/pottery-jar.webp",
    banner:      "assets/props/banner.webp",
    bellCluster: "assets/props/bell-cluster.webp",
    jadeTablet:  "assets/props/jade-tablet.webp",
    ivoryTusk:   "assets/props/ivory-tusk.webp",
    slash1:      "assets/slash-1.webp",
    slash2:      "assets/slash-2.webp",
    slash3:      "assets/slash-3.webp",
    hit1:        "assets/hit-1.webp",
    hit2:        "assets/hit-2.webp",
    hit3:        "assets/hit-3.webp",
    whirlRing:   "assets/whirl-ring.webp",
    projRock:    "assets/proj-rock.webp",
    chestClosed:  "assets/interact/chest-closed.webp",
    chestOpen:    "assets/interact/chest-open.webp",
    mechanismOff: "assets/interact/mechanism-off.webp",
    mechanismOn:  "assets/interact/mechanism-on.webp",
    pickupCowrie: "assets/interact/pickup-cowrie.webp",
    pickupJade:   "assets/interact/pickup-jade.webp",
    /* HUD 玩家卡片：青铜底板 + 纵目面具头像（index.html 的 CSS 直接引用
       同一路径，这里登记只为预热浏览器缓存；图挂了 CSS 天然退回渐变/透明，
       加载器本身失败不阻塞，别破坏这条设计）。 */
    hudCard:      "assets/ui/hud-card.webp",
    portraitP1:   "assets/ui/portrait-p1.webp",
    /* 标题页 / 通关页全屏场景（ov-title / ov-win 的 CSS 背景同上，仅预热缓存） */
    titleScene:   "assets/ui/title-scene.webp",
    winScene:     "assets/ui/win-scene.webp",
    /* 拾取图标：统一画布，避免忽大忽小 */
    wpShort:     "assets/icons/wp-dagger.webp",
    wpDagger:    "assets/icons/wp-dagger.webp",
    wpSword:     "assets/icons/wp-sword.webp",
    wpAxe:       "assets/icons/wp-axe.webp",
    wpHammer:    "assets/icons/wp-mace.webp",
    wpSpear:     "assets/icons/wp-spear.webp",
    wpBow:       "assets/icons/wp-bow.webp",
    wpRock:      "assets/icons/it-rock.webp",
    itCowrie:    "assets/icons/it-cowrie.webp",
    itJade:      "assets/icons/it-jade.webp",
    itEye:       "assets/icons/it-eye.webp",
    itBell:      "assets/icons/it-bell.webp",
    itJar:       "assets/icons/it-jar.webp",
    itRock:      "assets/icons/it-rock.webp",
    iconEye:     "assets/icons/icon-eye.webp",
    iconMask:    "assets/icons/icon-mask.webp",
    iconLeiwen:  "assets/icons/icon-leiwen.webp",
    iconTree:    "assets/icons/icon-tree.webp",    pose0:       "assets/char/pose-0.webp",
    pose1:       "assets/char/pose-1.webp",
    charFront:   "assets/char/front.webp",
    charSide:    "assets/char/side.webp",
    charBack:    "assets/char/back.webp"
  };

  window.IMG = {};
  var pending = 0, done = 0, failed = [];

  /* load(onProgress) → Promise<{loaded, failed}>
     onProgress(ratio, settled, total)：每张图落地调一次。
     ratio 是 0~1，成功与失败都算「落地」—— 进度必须能走到 1，
     否则缺一张图就永远停在 99%，标题页的入口也跟着永远锁着。 */
  function load(onProgress) {
    return new Promise(function (resolve) {
      var keys = Object.keys(MANIFEST);
      var total = keys.length;
      var settled = 0;

      pending = total;
      done = 0;
      failed = [];

      function tick() {
        settled++;
        if (typeof onProgress === "function") {
          try { onProgress(total ? settled / total : 1, settled, total); } catch (e) {}
        }
        if (settled >= total) finish(resolve);
      }

      keys.forEach(function (k) {
        var im = new Image();
        im.onload = function () {
          done++; pending--;
          tick();
        };
        im.onerror = function () {
          failed.push(k);
          pending--;
          tick();
        };
        im.src = MANIFEST[k];
        window.IMG[k] = im;
      });

      if (total === 0) {
        if (typeof onProgress === "function") {
          try { onProgress(1, 0, 0); } catch (e) {}
        }
        finish(resolve);
      }
    });
  }

  function finish(resolve) {
    if (failed.length) {
      console.warn("[Assets] 加载失败:", failed.join(", "));
    }
    resolve({ loaded: done, failed: failed });
  }

  window.Assets = { load: load, MANIFEST: MANIFEST };
})();
