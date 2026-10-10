import { Container, Graphics, type StrokeStyle } from 'pixi.js';
import { COLORS } from './art';

const SKIN = 0xf7d6bd;
const SKIN_SHADE = 0xe6b593;
const HAIR = 0xf4d063;
const HAIR_SHADE = 0xd6a53a;
const HAIR_LIGHT = 0xfbe9a6;
const UNIFORM = 0x5d9bd8;
const UNIFORM_SHADE = 0x437fbe;
const UNIFORM_DARK = 0x2f5f97;
const LIPS = 0xcc3530;
const EYES = 0x4a78a8;

const ink = (width = 3): StrokeStyle => ({ width, color: COLORS.ink, join: 'round', cap: 'round' });

/**
 * The stewardess from the original's menus: a 1950s air hostess in a pale blue uniform and cap, turned three
 * quarters to the left and saluting with a white glove. Drawn from the waist up, about 360 wide and 560 tall,
 * with the top of her cap near (190, 30).
 */
export const stewardess = (): Container => {
  const c = new Container();
  c.addChild(hairBack(), body(), neck(), arm(), head(), hairFront(), cap(), glove());
  return c;
};

/** The back of her bob, rolled under at the nape. */
const hairBack = (): Graphics =>
  new Graphics()
    .moveTo(122, 96)
    .bezierCurveTo(140, 44, 236, 40, 258, 106)
    .bezierCurveTo(272, 150, 268, 206, 248, 236)
    .bezierCurveTo(240, 256, 214, 262, 200, 248)
    .lineTo(150, 248)
    .closePath()
    .fill(HAIR)
    .stroke(ink())
    .circle(242, 240, 19)
    .fill(HAIR)
    .stroke(ink())
    .moveTo(232, 232)
    .quadraticCurveTo(244, 228, 250, 242)
    .stroke({ width: 2.5, color: HAIR_SHADE, cap: 'round' });

/** Jacket with dark-edged lapels, the big white blouse collar of the period, a knotted scarf and gold buttons. */
const body = (): Graphics => {
  const g = new Graphics();
  g.moveTo(150, 282)
    .bezierCurveTo(110, 288, 70, 300, 50, 334)
    .bezierCurveTo(34, 386, 30, 466, 28, 580)
    .lineTo(336, 580)
    .bezierCurveTo(334, 480, 326, 394, 306, 334)
    .bezierCurveTo(292, 304, 252, 288, 210, 282)
    .closePath()
    .fill(UNIFORM)
    .stroke(ink());
  // Shading down her far side and under the saluting arm.
  g.moveTo(66, 340)
    .bezierCurveTo(58, 420, 56, 500, 58, 580)
    .lineTo(28, 580)
    .bezierCurveTo(30, 466, 34, 386, 50, 334)
    .closePath()
    .fill(UNIFORM_SHADE);
  g.moveTo(300, 330)
    .bezierCurveTo(318, 400, 324, 480, 326, 580)
    .lineTo(336, 580)
    .bezierCurveTo(334, 480, 326, 394, 306, 334)
    .closePath()
    .fill(UNIFORM_SHADE);
  g.moveTo(80, 352)
    .bezierCurveTo(74, 430, 72, 500, 74, 580)
    .stroke({ width: 3, color: UNIFORM_SHADE, cap: 'round' });
  // Blouse showing in the V, then the lapels over it.
  g.poly([150, 282, 214, 282, 184, 386]).fill(0xffffff).stroke(ink());
  g.poly([150, 282, 118, 300, 140, 332, 126, 344, 184, 412, 184, 386])
    .fill(UNIFORM_SHADE)
    .stroke(ink());
  g.poly([214, 282, 248, 298, 230, 330, 246, 342, 184, 412, 184, 386])
    .fill(UNIFORM_SHADE)
    .stroke(ink());
  g.moveTo(140, 332)
    .lineTo(184, 404)
    .moveTo(230, 330)
    .lineTo(186, 404)
    .stroke({ width: 2.5, color: UNIFORM_DARK, cap: 'round' });
  // Wide pointed collar spread over the lapels.
  g.poly([154, 280, 110, 312, 154, 320, 176, 298]).fill(0xffffff).stroke(ink());
  g.poly([210, 280, 256, 308, 212, 318, 190, 298]).fill(0xffffff).stroke(ink());
  // Scarf knot and tails.
  g.poly([170, 296, 196, 296, 192, 312, 174, 312]).fill(UNIFORM_DARK).stroke(ink(2.5));
  g.poly([174, 310, 184, 314, 176, 344, 166, 336])
    .poly([192, 310, 184, 314, 194, 342, 204, 334])
    .fill(UNIFORM_DARK)
    .stroke(ink(2.5));
  for (const y of [448, 512]) g.circle(186, y, 6.5).fill(COLORS.gold).stroke(ink(2));
  // Gold wings on the breast.
  g.moveTo(232, 372)
    .quadraticCurveTo(250, 360, 274, 364)
    .quadraticCurveTo(254, 374, 232, 376)
    .closePath()
    .fill(COLORS.gold)
    .stroke(ink(1.8));
  g.circle(232, 374, 4).fill(COLORS.gold).stroke(ink(1.8));
  return g;
};

const neck = (): Graphics =>
  new Graphics()
    .moveTo(148, 212)
    .lineTo(152, 286)
    .bezierCurveTo(166, 298, 198, 298, 212, 286)
    .lineTo(208, 212)
    .closePath()
    .fill(SKIN)
    .stroke(ink())
    // Shadow under the jaw.
    .moveTo(150, 226)
    .bezierCurveTo(170, 250, 196, 252, 208, 236)
    .lineTo(208, 214)
    .lineTo(150, 214)
    .closePath()
    .fill(SKIN_SHADE);

/** The saluting arm: upper arm out to the elbow, forearm angled up to her brow, a darker cuff at the wrist. */
const arm = (): Graphics =>
  new Graphics()
    // Inner edge from the shoulder up to the elbow, the forearm up to the wrist and back, round the elbow,
    // then the outer edge of the upper arm down into the shoulder.
    .moveTo(258, 298)
    .bezierCurveTo(276, 270, 292, 240, 304, 214)
    .lineTo(232, 146)
    .lineTo(262, 122)
    .lineTo(330, 186)
    .bezierCurveTo(352, 196, 364, 218, 358, 240)
    .bezierCurveTo(350, 274, 338, 304, 322, 338)
    .bezierCurveTo(304, 312, 282, 300, 258, 298)
    .closePath()
    .fill(UNIFORM)
    .stroke(ink())
    // Shading under the upper arm and the crease inside the elbow.
    .moveTo(352, 246)
    .bezierCurveTo(344, 278, 334, 306, 322, 334)
    .bezierCurveTo(330, 300, 338, 272, 342, 244)
    .closePath()
    .fill(UNIFORM_SHADE)
    .moveTo(304, 214)
    .quadraticCurveTo(320, 214, 334, 204)
    .stroke({ width: 3, color: UNIFORM_SHADE, cap: 'round' })
    .poly([262, 124, 234, 146, 244, 158, 272, 136])
    .fill(UNIFORM_DARK)
    .stroke(ink(2.5));

/** Her face in three-quarter view, looking off to the left under heavy lids, with red lips. */
const head = (): Graphics => {
  const g = new Graphics();
  g.ellipse(224, 166, 10, 17).fill(SKIN).stroke(ink());
  g.moveTo(120, 112)
    .bezierCurveTo(114, 128, 112, 138, 112, 146)
    .bezierCurveTo(104, 158, 96, 168, 94, 176)
    .bezierCurveTo(98, 180, 104, 182, 108, 184)
    .bezierCurveTo(106, 190, 104, 194, 104, 198)
    .bezierCurveTo(106, 204, 108, 208, 108, 212)
    .bezierCurveTo(112, 228, 130, 242, 152, 242)
    .bezierCurveTo(188, 242, 214, 222, 222, 196)
    .bezierCurveTo(230, 172, 232, 138, 222, 108)
    .bezierCurveTo(204, 70, 140, 70, 120, 112)
    .closePath()
    .fill(SKIN)
    .stroke(ink());
  // Soft shading down the far cheek and a touch of rouge.
  g.moveTo(222, 130)
    .bezierCurveTo(226, 170, 218, 206, 196, 228)
    .bezierCurveTo(212, 200, 216, 170, 210, 132)
    .closePath()
    .fill({ color: SKIN_SHADE, alpha: 0.8 });
  g.ellipse(176, 190, 17, 9).fill({ color: 0xef8e88, alpha: 0.35 });
  g.ellipse(120, 188, 8, 6).fill({ color: 0xef8e88, alpha: 0.3 });

  // Near eye: almond shape, iris turned to the left, a heavy upper lid with a flick of lashes.
  g.moveTo(158, 152)
    .quadraticCurveTo(176, 138, 196, 150)
    .quadraticCurveTo(176, 160, 158, 152)
    .fill(0xffffff);
  g.circle(170, 150, 6)
    .fill(EYES)
    .circle(170, 150, 3)
    .fill(COLORS.ink)
    .circle(172, 147.5, 1.6)
    .fill(0xffffff);
  g.moveTo(156, 151).quadraticCurveTo(176, 136, 198, 149).stroke(ink(4));
  g.moveTo(196, 148).lineTo(204, 142).moveTo(192, 144).lineTo(198, 136).stroke(ink(2.2));
  g.moveTo(160, 140)
    .quadraticCurveTo(178, 128, 196, 140)
    .stroke({ width: 2, color: SKIN_SHADE, cap: 'round' });
  g.moveTo(158, 125).quadraticCurveTo(178, 112, 202, 122).stroke(ink(2.5));
  // Far eye, foreshortened beside the nose.
  g.moveTo(118, 152)
    .quadraticCurveTo(128, 143, 138, 151)
    .quadraticCurveTo(128, 157, 118, 152)
    .fill(0xffffff);
  g.circle(124, 151, 4.5).fill(EYES).circle(124, 151, 2.2).fill(COLORS.ink);
  g.moveTo(116, 152).quadraticCurveTo(128, 140, 140, 150).stroke(ink(3.5));
  g.moveTo(117, 152).lineTo(111, 147).stroke(ink(2));
  g.moveTo(116, 127).quadraticCurveTo(128, 119, 140, 125).stroke(ink(2.5));
  // Nose and nostril, then the smile.
  g.moveTo(140, 156)
    .quadraticCurveTo(136, 168, 124, 178)
    .stroke({ width: 2, color: SKIN_SHADE, cap: 'round' });
  g.moveTo(108, 182).quadraticCurveTo(116, 184, 120, 180).stroke(ink(2));
  g.moveTo(106, 199)
    .quadraticCurveTo(114, 192, 120, 196)
    .quadraticCurveTo(128, 191, 144, 199)
    .quadraticCurveTo(128, 212, 112, 206)
    .quadraticCurveTo(106, 204, 106, 199)
    .closePath()
    .fill(LIPS)
    .stroke(ink(2));
  g.moveTo(108, 200)
    .quadraticCurveTo(126, 203, 143, 199)
    .stroke({ width: 1.6, color: 0x8e1f1c, cap: 'round' });
  g.moveTo(144, 199).quadraticCurveTo(149, 197, 150, 193).stroke(ink(1.8));
  g.ellipse(122, 194, 4, 1.4).fill({ color: 0xffffff, alpha: 0.5 });
  return g;
};

/** The front of her hair: a deep side-parted wave across the forehead and a flip curl at the jaw. */
const hairFront = (): Graphics => {
  const g = new Graphics()
    .moveTo(112, 130)
    .bezierCurveTo(110, 92, 150, 64, 200, 68)
    .bezierCurveTo(238, 72, 260, 104, 256, 142)
    .bezierCurveTo(254, 172, 246, 198, 236, 214)
    .bezierCurveTo(250, 222, 252, 240, 238, 248)
    .bezierCurveTo(222, 254, 208, 240, 216, 226)
    .bezierCurveTo(224, 206, 228, 180, 224, 158)
    .bezierCurveTo(216, 130, 200, 110, 172, 110)
    .bezierCurveTo(150, 110, 132, 118, 112, 130)
    .closePath()
    .fill(HAIR)
    .stroke(ink());
  // Strands that show the wave's curl.
  g.moveTo(140, 100)
    .bezierCurveTo(168, 84, 210, 84, 234, 112)
    .moveTo(150, 108)
    .bezierCurveTo(180, 96, 214, 104, 236, 140)
    .moveTo(240, 150)
    .bezierCurveTo(240, 180, 236, 200, 230, 214);
  g.stroke({ width: 2.5, color: HAIR_SHADE, cap: 'round' });
  g.moveTo(160, 84)
    .bezierCurveTo(186, 76, 214, 80, 230, 96)
    .stroke({ width: 3, color: HAIR_LIGHT, cap: 'round' });
  return g;
};

/** A small pale blue cap set back and tilted on her head, with a dark band and gold badge. */
const cap = (): Graphics => {
  const g = new Graphics();
  g.position.set(196, 66);
  g.rotation = -0.2;
  g.moveTo(-64, 8)
    .bezierCurveTo(-60, -22, 58, -30, 66, 0)
    .bezierCurveTo(40, 12, -40, 18, -64, 8)
    .closePath()
    .fill(UNIFORM)
    .stroke(ink());
  g.moveTo(-40, -6)
    .bezierCurveTo(-10, -20, 30, -20, 50, -8)
    .stroke({ width: 3, color: 0x9cc6ee, cap: 'round' });
  g.moveTo(-66, 8)
    .bezierCurveTo(-40, 20, 40, 14, 68, 0)
    .lineTo(68, 10)
    .bezierCurveTo(40, 28, -40, 30, -66, 18)
    .closePath()
    .fill(UNIFORM_DARK)
    .stroke(ink());
  g.circle(-6, -2, 6).fill(COLORS.gold).stroke(ink(1.8));
  g.moveTo(-20, 0)
    .quadraticCurveTo(-14, -6, -12, -1)
    .moveTo(8, 0)
    .quadraticCurveTo(2, -6, 0, -1)
    .stroke({ width: 2.5, color: COLORS.gold, cap: 'round' });
  return g;
};

/** White glove held flat at her brow, fingers together and pointing at the cap. */
const glove = (): Graphics =>
  new Graphics()
    .moveTo(232, 152)
    .lineTo(256, 126)
    .bezierCurveTo(244, 108, 214, 94, 182, 86)
    .bezierCurveTo(164, 82, 156, 96, 168, 102)
    .bezierCurveTo(184, 108, 196, 114, 204, 122)
    .bezierCurveTo(196, 132, 206, 148, 232, 152)
    .closePath()
    .fill(0xffffff)
    .stroke(ink())
    .moveTo(178, 92)
    .bezierCurveTo(204, 98, 226, 108, 244, 124)
    .moveTo(186, 100)
    .bezierCurveTo(206, 106, 222, 114, 236, 130)
    .stroke({ width: 2, color: 0xc4ccd6, cap: 'round' })
    .moveTo(204, 122)
    .bezierCurveTo(212, 128, 220, 132, 230, 132)
    .stroke(ink(2.2));
