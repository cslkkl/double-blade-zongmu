window.ANIM = {
  idle:   { frames: 4, fps: 6,  loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.00,
            files: ["assets/anim/idle-0.webp", "assets/anim/idle-1.webp", "assets/anim/idle-2.webp", "assets/anim/idle-3.webp"] },
  walk:   { frames: 6, fps: 12, loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.49,
            files: ["assets/anim/walk-0.webp", "assets/anim/walk-1.webp", "assets/anim/walk-2.webp",
                    "assets/anim/walk-3.webp", "assets/anim/walk-4.webp", "assets/anim/walk-5.webp"] },
  attack: { frames: 4, fps: 16, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.16,
            files: ["assets/anim/attack-0.webp", "assets/anim/attack-1.webp", "assets/anim/attack-2.webp", "assets/anim/attack-3.webp"] },
  jump:   { frames: 3, fps: 10, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.96,
            files: ["assets/anim/jump-0.webp", "assets/anim/jump-1.webp", "assets/anim/jump-2.webp"] },
  hurt:   { frames: 2, fps: 14, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.78,
            files: ["assets/anim/hurt-0.webp", "assets/anim/hurt-1.webp"] },
  whirl:  { frames: 4, fps: 18, loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.27,
            files: ["assets/anim/whirl-0.webp", "assets/anim/whirl-1.webp", "assets/anim/whirl-2.webp", "assets/anim/whirl-3.webp"] },
  throw:  { frames: 3, fps: 14, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.94,
            files: ["assets/anim/throw-0.webp", "assets/anim/throw-1.webp", "assets/anim/throw-2.webp"] },
  bow:    { frames: 3, fps: 12, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.85,
            files: ["assets/anim/bow-0.webp", "assets/anim/bow-1.webp", "assets/anim/bow-2.webp"] },
  dead:   { frames: 3, fps: 8,  loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.04,
            files: ["assets/anim/dead-0.webp", "assets/anim/dead-1.webp", "assets/anim/dead-2.webp"] },
  pickup:        { frames: 3, fps: 10, loop: false, w: 459, h: 560, anchorX: 0.4227, footY: 1.0, scaleFix: 0.914,
            files: ["assets/anim/pickup-0.webp", "assets/anim/pickup-1.webp", "assets/anim/pickup-2.webp"] },
  "attack-heavy":{ frames: 4, fps: 14, loop: false, w: 421, h: 560, anchorX: 0.4763, footY: 1.0, scaleFix: 0.867,
            files: ["assets/anim/attack-heavy-0.webp", "assets/anim/attack-heavy-1.webp", "assets/anim/attack-heavy-2.webp", "assets/anim/attack-heavy-3.webp"] },
  "attack-thrust":{ frames: 4, fps: 16, loop: false, w: 498, h: 403, anchorX: 0.3705, footY: 1.0, scaleFix: 0.754,
            files: ["assets/anim/attack-thrust-0.webp", "assets/anim/attack-thrust-1.webp", "assets/anim/attack-thrust-2.webp", "assets/anim/attack-thrust-3.webp"] },
};

/* 敌人动画（脚步已放慢：walker 7fps / fast 10fps / brute 6fps） */
window.ENEMY_ANIM = {
  walker: { frames: 4, fps: 7,  loop: true, w: 365, h: 378, anchorX: 0.4452, footY: 1.0,
            files: ["assets/anim/enemy-walker-0.webp", "assets/anim/enemy-walker-1.webp",
                    "assets/anim/enemy-walker-2.webp", "assets/anim/enemy-walker-3.webp"] },
  fast:   { frames: 4, fps: 10, loop: true, w: 400, h: 332, anchorX: 0.5000, footY: 1.0,
            files: ["assets/anim/enemy-fast-0.webp", "assets/anim/enemy-fast-1.webp",
                    "assets/anim/enemy-fast-2.webp", "assets/anim/enemy-fast-3.webp"] },
  brute:  { frames: 4, fps: 6,  loop: true, w: 400, h: 341, anchorX: 0.4939, footY: 1.0,
            files: ["assets/anim/enemy-brute-0.webp", "assets/anim/enemy-brute-1.webp",
                    "assets/anim/enemy-brute-2.webp", "assets/anim/enemy-brute-3.webp"] },
  boss:   { frames: 2, fps: 3,  loop: true, w: 400, h: 270, anchorX: 0.5162, footY: 1.0,
            files: ["assets/anim/enemy-boss-0.webp", "assets/anim/enemy-boss-1.webp"] }
};

/* 手持不同武器的站立姿态：换武器时替换 idle 帧。
   scaleFix 已按 idle 的内容高反算，屏幕身高一致，不会跳变。 */
window.ANIM_HOLD = {
axe     : { w: 543, h: 560, anchorX: 0.5212, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-axe.webp" },
  hammer  : { w: 545, h: 560, anchorX: 0.4376, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-hammer.webp" },
  sword   : { w: 435, h: 560, anchorX: 0.4057, footY: 1.0, scaleFix: 0.71,
            file: "assets/anim/hold-sword.webp" },
  dagger  : { w: 465, h: 560, anchorX: 0.5527, footY: 1.0, scaleFix: 0.71,
            file: "assets/anim/hold-dagger.webp" },
  spear   : { w: 348, h: 560, anchorX: 0.5029, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-spear.webp" },
  bow     : { w: 560, h: 545, anchorX: 0.6357, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-bow.webp" },
  rock    : { w: 558, h: 560, anchorX: 0.457, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-rock.webp" },
  short   : { w: 380, h: 560, anchorX: 0.5868, footY: 1.0, scaleFix: 0.711,
            file: "assets/anim/hold-short.webp" },
  blade   : { w: 365, h: 560, anchorX: 0.5767, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-blade.webp" },
  jar     : { w: 363, h: 560, anchorX: 0.6129, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-jar.webp" },
  bell    : { w: 425, h: 560, anchorX: 0.5394, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-bell.webp" }
};

/* >>> slice_weapon_assets: WEAPON_ATTACK >>> */
/* 攻击姿态帧：键集合固定，bell 不在其中（沿用 jar 姿态，由上层兜底）。
   scaleFix 按「头冠顶 → 脚底」反算：身体高度的屏幕长度与 idle 一致。
   武器举过头顶的格（axe/hammer）画布会高很多，scaleFix 因此偏大，属正常。 */
window.WEAPON_ATTACK = {
  short   : { w: 477, h: 479, anchorX: 0.6567, footY: 1.0, scaleFix: 0.723,
            file: "assets/anim/atk-short.webp" },
  dagger  : { w: 560, h: 452, anchorX: 0.5687, footY: 1.0, scaleFix: 0.723,
            file: "assets/anim/atk-dagger.webp" },
  sword   : { w: 560, h: 538, anchorX: 0.4696, footY: 1.0, scaleFix: 0.752,
            file: "assets/anim/atk-sword.webp" },
  axe     : { w: 363, h: 560, anchorX: 0.5096, footY: 1.0, scaleFix: 1.078,
            file: "assets/anim/atk-axe.webp" },
  hammer  : { w: 560, h: 481, anchorX: 0.5411, footY: 1.0, scaleFix: 0.72,
            file: "assets/anim/atk-hammer.webp" },
  spear   : { w: 560, h: 446, anchorX: 0.3241, footY: 1.0, scaleFix: 0.724,
            file: "assets/anim/atk-spear.webp" },
  bow     : { w: 386, h: 552, anchorX: 0.4197, footY: 1.0, scaleFix: 0.784,
            file: "assets/anim/atk-bow.webp" },
  rock    : { w: 392, h: 503, anchorX: 0.5319, footY: 1.0, scaleFix: 0.717,
            file: "assets/anim/atk-rock.webp" },
  blade   : { w: 537, h: 503, anchorX: 0.5121, footY: 1.0, scaleFix: 0.717,
            file: "assets/anim/atk-blade.webp" },
  jar     : { w: 357, h: 552, anchorX: 0.5658, footY: 1.0, scaleFix: 0.793,
            file: "assets/anim/atk-jar.webp" }
};
/* <<< slice_weapon_assets: WEAPON_ATTACK <<< */


/* >>> slice_weapon_assets: WEAPON_FX >>> */
/* 武器刀光：r 为建议半径，arc 为挥砍弧张开角度（弧度）。
   bell 与 jar 共用 burst 那张爆炸环。 */
window.WEAPON_FX = {
  short   : { file: "assets/fx/wp-slash-short.webp", scale: 1.0, r: 98, arc: 1.15 },
  dagger  : { file: "assets/fx/wp-slash-dagger.webp", scale: 1.0, r: 84, arc: 0.75 },
  sword   : { file: "assets/fx/wp-slash-sword.webp", scale: 1.0, r: 112, arc: 1.45 },
  axe     : { file: "assets/fx/wp-slash-axe.webp", scale: 1.0, r: 126, arc: 1.85 },
  hammer  : { file: "assets/fx/wp-slash-hammer.webp", scale: 1.0, r: 132, arc: 1.95 },
  spear   : { file: "assets/fx/wp-slash-spear.webp", scale: 1.0, r: 130, arc: 0.45 },
  bow     : { file: "assets/fx/wp-slash-bow.webp", scale: 1.0, r: 100, arc: 0.9 },
  rock    : { file: "assets/fx/wp-slash-rock.webp", scale: 1.0, r: 92, arc: 1.0 },
  blade   : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 96, arc: 1.3 },
  jar     : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 112, arc: 1.05 },
  bell    : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 108, arc: 1.2 }
};
/* <<< slice_weapon_assets: WEAPON_FX <<< */


/* >>> slice_weapon_assets: HIT_MATERIAL >>> */
/* 打击火花四张：按材质选图。 */
window.HIT_MATERIAL = {
  jade   : "assets/fx/hit-jade.webp",
  bronze : "assets/fx/hit-bronze.webp",
  blunt  : "assets/fx/hit-blunt.webp",
  airy   : "assets/fx/hit-airy.webp"
};
/* <<< slice_weapon_assets: HIT_MATERIAL <<< */

/* >>> slice_weapon_assets: WEAPON_ATTACK_CLIP >>> */
/* 4 帧出招序列。与 WEAPON_ATTACK（单帧降级）并存。
   同一把武器的 4 帧共用同一画布 w/h 与同一个 scaleFix（否则播放会跳）。
   anchorX 逐帧一个：身体轴线随姿势前后移，逐帧取才不漂。 */
window.WEAPON_ATTACK_CLIP = {
  short   : { frames: 4, w: 347, h: 560, scaleFix: 0.997, footY: 1.0,
            anchorX: [0.6268, 0.6268, 0.6268, 0.6268],
            files: ["assets/anim/atk-short-0.webp", "assets/anim/atk-short-1.webp", "assets/anim/atk-short-2.webp", "assets/anim/atk-short-3.webp"] },
  dagger  : { frames: 4, w: 547, h: 526, scaleFix: 0.715, footY: 1.0,
            anchorX: [0.5622, 0.5622, 0.5622, 0.5622],
            files: ["assets/anim/atk-dagger-0.webp", "assets/anim/atk-dagger-1.webp", "assets/anim/atk-dagger-2.webp", "assets/anim/atk-dagger-3.webp"] },
  sword   : { frames: 4, w: 365, h: 560, scaleFix: 0.926, footY: 1.0,
            anchorX: [0.5699, 0.5699, 0.5699, 0.5699],
            files: ["assets/anim/atk-sword-0.webp", "assets/anim/atk-sword-1.webp", "assets/anim/atk-sword-2.webp", "assets/anim/atk-sword-3.webp"] },
  axe     : { frames: 4, w: 327, h: 560, scaleFix: 0.951, footY: 1.0,
            anchorX: [0.5, 0.5, 0.5107, 0.5],
            files: ["assets/anim/atk-axe-0.webp", "assets/anim/atk-axe-1.webp", "assets/anim/atk-axe-2.webp", "assets/anim/atk-axe-3.webp"] },
  hammer  : { frames: 4, w: 284, h: 560, scaleFix: 0.97, footY: 1.0,
            anchorX: [0.4701, 0.4701, 0.4701, 0.4701],
            files: ["assets/anim/atk-hammer-0.webp", "assets/anim/atk-hammer-1.webp", "assets/anim/atk-hammer-2.webp", "assets/anim/atk-hammer-3.webp"] },
  spear   : { frames: 4, w: 559, h: 405, scaleFix: 0.718, footY: 1.0,
            anchorX: [0.4548, 0.4658, 0.4658, 0.4767],
            files: ["assets/anim/atk-spear-0.webp", "assets/anim/atk-spear-1.webp", "assets/anim/atk-spear-2.webp", "assets/anim/atk-spear-3.webp"] },
  bow     : { frames: 4, w: 391, h: 560, scaleFix: 0.796, footY: 1.0,
            anchorX: [0.4316, 0.4357, 0.4357, 0.4399],
            files: ["assets/anim/atk-bow-0.webp", "assets/anim/atk-bow-1.webp", "assets/anim/atk-bow-2.webp", "assets/anim/atk-bow-3.webp"] },
  rock    : { frames: 4, w: 407, h: 560, scaleFix: 0.724, footY: 1.0,
            anchorX: [0.5461, 0.4969, 0.5215, 0.5215],
            files: ["assets/anim/atk-rock-0.webp", "assets/anim/atk-rock-1.webp", "assets/anim/atk-rock-2.webp", "assets/anim/atk-rock-3.webp"] },
  blade   : { frames: 4, w: 429, h: 559, scaleFix: 0.722, footY: 1.0,
            anchorX: [0.5746, 0.5408, 0.5577, 0.5577],
            files: ["assets/anim/atk-blade-0.webp", "assets/anim/atk-blade-1.webp", "assets/anim/atk-blade-2.webp", "assets/anim/atk-blade-3.webp"] },
  jar     : { frames: 4, w: 378, h: 530, scaleFix: 0.745, footY: 1.0,
            anchorX: [0.629, 0.5909, 0.5529, 0.5909],
            files: ["assets/anim/atk-jar-0.webp", "assets/anim/atk-jar-1.webp", "assets/anim/atk-jar-2.webp", "assets/anim/atk-jar-3.webp"] }
};
/* <<< slice_weapon_assets: WEAPON_ATTACK_CLIP <<< */

/* >>> slice_weapon_assets: WEAPON_WALK_CLIP >>> */
/* 4 帧行走循环。有它的武器，走路时画这一套（手里有武器），
   没有就落回 ANIM_HOLD 的静帧，再没有才落回通用 walk clip。
   帧号由 p.walk（累计位移）推导，不按时间自由播放 —— 原地踏步会
   和实际移动对不上，看起来像滑步。
   同一把武器 4 帧共用画布 w/h 与 scaleFix；anchorX 逐帧一个。 */
window.WEAPON_WALK_CLIP = {
  short   : { frames: 4, fps: 10, loop: true, w: 298, h: 479, scaleFix: 0.706, footY: 1.0,
            anchorX: [0.3708, 0.4262, 0.3691, 0.4245],
            files: ["assets/anim/walk-short-0.webp", "assets/anim/walk-short-1.webp", "assets/anim/walk-short-2.webp", "assets/anim/walk-short-3.webp"] },
  dagger  : { frames: 4, fps: 10, loop: true, w: 297, h: 533, scaleFix: 0.707, footY: 1.0,
            anchorX: [0.367, 0.3746, 0.3653, 0.3822],
            files: ["assets/anim/walk-dagger-0.webp", "assets/anim/walk-dagger-1.webp", "assets/anim/walk-dagger-2.webp", "assets/anim/walk-dagger-3.webp"] },
  sword   : { frames: 4, fps: 10, loop: true, w: 325, h: 525, scaleFix: 0.707, footY: 1.0,
            anchorX: [0.33, 0.33, 0.3508, 0.3092],
            files: ["assets/anim/walk-sword-0.webp", "assets/anim/walk-sword-1.webp", "assets/anim/walk-sword-2.webp", "assets/anim/walk-sword-3.webp"] },
  axe     : { frames: 4, fps: 10, loop: true, w: 371, h: 464, scaleFix: 0.708, footY: 1.0,
            anchorX: [0.5526, 0.566, 0.5499, 0.5243],
            files: ["assets/anim/walk-axe-0.webp", "assets/anim/walk-axe-1.webp", "assets/anim/walk-axe-2.webp", "assets/anim/walk-axe-3.webp"] },
  hammer  : { frames: 4, fps: 10, loop: true, w: 367, h: 524, scaleFix: 0.712, footY: 1.0,
            anchorX: [0.6226, 0.6226, 0.6226, 0.6226],
            files: ["assets/anim/walk-hammer-0.webp", "assets/anim/walk-hammer-1.webp", "assets/anim/walk-hammer-2.webp", "assets/anim/walk-hammer-3.webp"] },
  spear   : { frames: 4, fps: 10, loop: true, w: 301, h: 551, scaleFix: 0.831, footY: 1.0,
            anchorX: [0.3688, 0.3937, 0.3704, 0.3821],
            files: ["assets/anim/walk-spear-0.webp", "assets/anim/walk-spear-1.webp", "assets/anim/walk-spear-2.webp", "assets/anim/walk-spear-3.webp"] },
  bow     : { frames: 4, fps: 10, loop: true, w: 282, h: 491, scaleFix: 0.707, footY: 1.0,
            anchorX: [0.4583, 0.4583, 0.4583, 0.4583],
            files: ["assets/anim/walk-bow-0.webp", "assets/anim/walk-bow-1.webp", "assets/anim/walk-bow-2.webp", "assets/anim/walk-bow-3.webp"] },
  rock    : { frames: 4, fps: 10, loop: true, w: 310, h: 509, scaleFix: 0.707, footY: 1.0,
            anchorX: [0.45, 0.4613, 0.4403, 0.4597],
            files: ["assets/anim/walk-rock-0.webp", "assets/anim/walk-rock-1.webp", "assets/anim/walk-rock-2.webp", "assets/anim/walk-rock-3.webp"] },
  blade   : { frames: 4, fps: 10, loop: true, w: 303, h: 518, scaleFix: 0.709, footY: 1.0,
            anchorX: [0.3498, 0.3333, 0.3449, 0.3474],
            files: ["assets/anim/walk-blade-0.webp", "assets/anim/walk-blade-1.webp", "assets/anim/walk-blade-2.webp", "assets/anim/walk-blade-3.webp"] },
  jar     : { frames: 4, fps: 10, loop: true, w: 255, h: 560, scaleFix: 0.894, footY: 1.0,
            anchorX: [0.8725, 0.8765, 0.8765, 0.8725],
            files: ["assets/anim/walk-jar-0.webp", "assets/anim/walk-jar-1.webp", "assets/anim/walk-jar-2.webp", "assets/anim/walk-jar-3.webp"] },
  bell    : { frames: 4, fps: 10, loop: true, w: 296, h: 485, scaleFix: 0.706, footY: 1.0,
            anchorX: [0.413, 0.413, 0.413, 0.413],
            files: ["assets/anim/walk-bell-0.webp", "assets/anim/walk-bell-1.webp", "assets/anim/walk-bell-2.webp", "assets/anim/walk-bell-3.webp"] }
};
/* <<< slice_weapon_assets: WEAPON_WALK_CLIP <<< */
