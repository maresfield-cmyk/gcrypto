// Recolour the Gulf Arcade mark into the fee index palette (graphite sky, teal sun and contrail, blue-grey dunes, light plane)
// and write the logo sizes to public/. Source: brand/gulfarcade-logo-source.png. Run after changing the palette below.
import sharp from 'sharp';
const SRC = 'brand/gulfarcade-logo-source.png';
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, out = Buffer.from(data);
const rgb2hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; } return [h, mx ? d / mx : 0, mx]; };
const hsv2rgb = (h, s, v) => { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, a = out[i + 3]; if (!a) continue;
  const [h, s, v] = rgb2hsv(out[i], out[i + 1], out[i + 2]);
  let nh, ns, nv;
  if (v < 0.28) { nh = 215; ns = 0.04; nv = 0.985 - (0.28 - v) * 0.3; }                        // the plane: black -> light
  else if (s < 0.15 && v > 0.8) { nh = 174; ns = 0.55; nv = 0.95; }                          // the contrail: white -> teal
  else if (h >= 345 || h < 15) { nh = 222; ns = 0.62; nv = 0.16 + (y / H) * 0.14; }          // red sky -> graphite with a faint vertical gradient
  else if (h >= 45 && h < 70 && s > 0.6) { nh = 174; ns = 0.72; nv = 0.86; }                  // yellow sun -> teal
  else if (h >= 15 && h < 60) { nh = 208; ns = 0.28 + (1 - v) * 0.3; nv = 0.42 + v * 0.42; }  // sand dunes -> cool blue-grey, keeping their shading
  else { nh = h; ns = s; nv = v; }
  const [r, g, b] = hsv2rgb(nh, Math.min(1, ns), Math.min(1, nv)); out[i] = r; out[i + 1] = g; out[i + 2] = b;
}
const base = sharp(out, { raw: { width: W, height: H, channels: 4 } });
for (const n of [512, 192, 180, 96, 32]) await base.clone().resize(n, n).png().toFile(`public/logo-${n}.png`);
await base.clone().resize(64, 64).png().toFile('public/favicon.png');
console.log('logo sizes written');
