// Recolour the Gulf Arcade mark into the fee index palette (graphite sky, teal sun and contrail, blue-grey dunes, light plane)
// and write the logo sizes to public/. Source: brand/gulfarcade-logo-source.png (512px raster; no vector exists).
// Quality: the mark is upscaled 3x first, every pixel is blended between the palette targets by its distance to the source
// colours (so anti-aliased edges stay smooth instead of snapping to one colour), then downscaled back. Run after changing the palette.
import sharp from 'sharp';
const SRC = 'brand/gulfarcade-logo-source.png', SCALE = 3;
const { data, info } = await sharp(SRC).ensureAlpha().resize(512 * SCALE, 512 * SCALE, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, out = Buffer.from(data);
const px = (x, y) => { const i = ((y * SCALE) * W + x * SCALE) * 4; return [data[i], data[i + 1], data[i + 2]]; };
// Source colours, sampled from known spots of the mark (positions in the 512px original)
const REF = {
  sky: px(256, 30),       // red background (top centre; the corners are rounded)
  plane: px(300, 125),    // black plane body
  trail: px(60, 300),     // white contrail
  sun: px(330, 285),      // yellow sun
  dune: px(256, 430),     // sand
  dune2: px(90, 330),     // lighter sand
  dune3: px(420, 480),    // darker sand
};
console.log('sampled', Object.fromEntries(Object.entries(REF).map(([k, v]) => [k, '#' + v.map((c) => c.toString(16).padStart(2, '0')).join('')])));
const hsv2rgb = (h, s, v) => { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
// Palette targets; the sky has a faint vertical gradient and the dunes keep their own shading
const target = {
  sky: (y) => hsv2rgb(222, 0.62, 0.16 + (y / H) * 0.14),
  plane: (y, v) => hsv2rgb(215, 0.04, 0.985 - Math.max(0, 0.28 - v) * 0.3),
  trail: () => hsv2rgb(174, 0.55, 0.95),
  sun: () => hsv2rgb(174, 0.72, 0.86),
  dune: (y, v) => hsv2rgb(208, 0.28 + (1 - v) * 0.3, 0.42 + v * 0.42),
};
target.dune2 = target.dune; target.dune3 = target.dune;
const keys = Object.keys(REF), P = 6;   // weight exponent: high enough that interiors stay one colour, low enough that edges blend
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4; if (!out[i + 3]) continue;
  const r = out[i], g = out[i + 1], b = out[i + 2], v = lum(r, g, b);
  let sw = 0, acc = [0, 0, 0];
  for (const k of keys) {
    const [rr, gg, bb] = REF[k]; const d = Math.hypot(r - rr, g - gg, b - bb) + 1;
    const w = 1 / Math.pow(d, P); const t = target[k](y, v);
    sw += w; acc[0] += w * t[0]; acc[1] += w * t[1]; acc[2] += w * t[2];
  }
  out[i] = acc[0] / sw; out[i + 1] = acc[1] / sw; out[i + 2] = acc[2] / sw;
}
const base = sharp(out, { raw: { width: W, height: H, channels: 4 } });
for (const n of [512, 192, 180, 96, 32]) await base.clone().resize(n, n, { kernel: 'lanczos3' }).png().toFile(`public/logo-${n}.png`);
for (const n of [32, 64]) await base.clone().resize(n, n, { kernel: 'lanczos3' }).webp({ quality: 92 }).toFile(`public/logo-${n}.webp`);
await base.clone().resize(64, 64, { kernel: 'lanczos3' }).png().toFile('public/favicon.png');
await base.clone().resize(640, 640, { kernel: 'lanczos3' }).png().toFile('brand/telegram-profile.png');
console.log('logo sizes written (+ brand/telegram-profile.png)');
