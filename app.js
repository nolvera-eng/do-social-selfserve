// Social Templates: draws each layout to a 1080 × 1080 or 1920 × 1080 canvas from the values below.

// ---- Design values ----
// Posts are always 1080 tall; landscape posts are wider. Positions are in pixels on that canvas.
const H = 1080;
const FORMATS = { square: 1080, landscape: 1920 };
let W = 1080;
const wide = () => W > H;

const COLOR = {
  ink: "#f4f7f6",
  cyan: "#7fe0e4",
  pillFill: "rgba(4, 22, 24, 0.62)",
  pillLine: "rgba(170, 215, 215, 0.45)",
  boxFill: "rgba(4, 20, 22, 0.74)",
  boxLine: "rgba(170, 215, 215, 0.42)",
  divider: "rgba(170, 215, 215, 0.4)",
};

// The logo's proportions, from its viewBox.
const LOGO_RATIO = 126.09 / 21;

const SANS = '"Inter", sans-serif';
const MONO = '"IBM Plex Mono", monospace';

// Templates, their layouts, and which fields each layout uses.
const TEMPLATES = {
  event: {
    name: "Event",
    variants: {
      cohosts: { name: "Cohosts", fields: ["headline", "pills", "cohosts"] },
      speaker: { name: "One speaker", fields: ["eyebrow", "headline", "pills", "speakers"], speakers: 1 },
      speakers: { name: "Two speakers", fields: ["eyebrow", "headline", "pills", "speakers"], speakers: 2 },
    },
  },
  model: {
    name: "Model launch",
    variants: {
      list: { name: "List", fields: ["headline", "pills"] },
      spotlight: { name: "Spotlight", fields: ["eyebrow", "title", "label", "pills"] },
    },
  },
  partner: {
    name: "Partnership",
    variants: {
      horizontal: { name: "Side by side", fields: ["partner"] },
      vertical: { name: "Stacked", fields: ["partner"] },
      promo: { name: "Promo", fields: ["partner", "headline", "label", "pills"] },
    },
  },
};

// Copy is kept per template, so each layout of a template shows the same post.
const DEFAULT_COPY = {
  event: {
    eyebrow: "BoxWorks [Dev Summit] • Hands-on workshop",
    headline: "merge(happy_hour) ->\nopen_inference",
    pills: "Thursday, Oct 1, 2026\n6–8:30PM\nSan Francisco, CA",
  },
  model: {
    eyebrow: "Now available:",
    title: "Claude Fable 5.1",
    headline: "The most sought-after GPUs on the market.\n\nNow available as Spot GPU Droplets, in Public Preview on DigitalOcean.",
    label: "Access the new model via:",
    pills: "Serverless Inference\nInference Router\nModel Synthesis\nEvaluations",
  },
  partner: {
    headline: "Now\n50% off",
    label: "Access the new model via:",
    pills: "Serverless Inference\nInference Router\nModel Synthesis\nEvaluations",
  },
};

const state = {
  template: "event",
  variant: { event: "cohosts", model: "list", partner: "horizontal" },
  copy: structuredClone(DEFAULT_COPY),
  partner: { name: "Nvidia", file: "nvidia.svg", img: null }, // placeholder until replaced
  partnerScale: 100, // partner logo size, % of the layout's default
  cohostScale: 100, // cohost logo size, % of the layout's default
  cohostLabel: "Cohosted with",
  // Cohosts are always logos; these three from the library are placeholders until they're replaced.
  cohosts: [
    { name: "Bright Data", file: "bright-data.svg", img: null },
    { name: "Hugging Face", file: "hugging-face.svg", img: null },
    { name: "Mistral", file: "mistral.svg", img: null },
    { name: "", img: null },
  ],
  speakers: [
    { label: "Instructor", name: "Jordan Lee", title: "AI/ML Engineer", img: null },
    { label: "Featured speaker", name: "Sam Rivera", title: "SVP of AI", img: null },
  ],
  bg: "terrain",
  theme: "foam",
  format: "square", // "square" (1080 × 1080) or "landscape" (1920 × 1080)
  textAnim: "none", // text entrance: "none", "fade" or "rise"
  style: "outline", // terrain faces: "outline" (background color, lines only) or "filled" (shaded)
  seed: 7,
  motion: "forward", // animated terrain: "forward" or "rotate"
  speed: 2, // animated terrain pace: one full pass takes 320 / speed seconds
  clip: 15, // seconds of video; the animated terrain loops within it
  shade: 0,
};

// ---- Drawing helpers ----

function font(ctx, weight, size, family, tracking = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.letterSpacing = `${tracking}px`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Lines for a block of text. A blank line starts a new paragraph: its first line is marked `gap`.
function wrap(ctx, text, maxWidth) {
  const out = [];
  text.split(/\n\s*\n/).forEach((para, p) => {
    let first = true;
    para.split("\n").forEach((hard) => {
      let line = "";
      const push = () => { out.push({ text: line, gap: first && p > 0 }); first = false; };
      hard.split(/\s+/).filter(Boolean).forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) { push(); line = word; } else line = test;
      });
      if (line) push();
    });
  });
  return out;
}

// Shrinks the text until it fits in maxLines. Lines broken by hand are kept whole when they can be.
function fit(ctx, text, { weight, size, min, maxWidth, maxLines, family = SANS, tracking = 0 }) {
  const hard = text.split("\n").filter((l) => l.trim()).length;
  let first = null;
  for (let s = size; s >= min; s -= 2) {
    font(ctx, weight, s, family, s * tracking);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length > maxLines) continue;
    first ??= { lines, size: s };
    if (lines.length <= hard) return { lines, size: s };
  }
  if (first) { font(ctx, weight, first.size, family, first.size * tracking); return first; }
  font(ctx, weight, min, family, min * tracking);
  return { lines: wrap(ctx, text, maxWidth).slice(0, maxLines), size: min };
}

// ---- Text animation ----
// Each piece of a post (logo, line of text, pill, mark) enters in drawing order, one after another:
// "fade" fades it in, "rise" also slides it up into place. `reveal.t` is the time in seconds since
// the entrance started; Infinity draws everything in place.
const TEXT_ANIM = { stagger: 0.12, duration: 0.9, rise: 36, clip: 6 };
const reveal = { i: 0, t: Infinity, count: 0 };
const revealEnd = () => Math.max(0, reveal.count - 1) * TEXT_ANIM.stagger + TEXT_ANIM.duration;
function el(ctx, fn) {
  const i = reveal.i++;
  if (state.textAnim === "none" || reveal.t === Infinity) return fn();
  const p = Math.min(1, Math.max(0, (reveal.t - i * TEXT_ANIM.stagger) / TEXT_ANIM.duration));
  const e = 1 - (1 - p) ** 3, alpha = ctx.globalAlpha, m = ctx.getTransform();
  ctx.globalAlpha = alpha * e;
  if (state.textAnim === "rise") ctx.translate(0, (1 - e) * TEXT_ANIM.rise);
  const r = fn();
  ctx.globalAlpha = alpha;
  ctx.setTransform(m);
  return r;
}

// Draws lines from the first baseline; returns the last baseline.
function drawLines(ctx, lines, x, y, lineHeight, align = "left", paraGap = 0) {
  ctx.textAlign = align;
  let b = y;
  lines.forEach((l, i) => {
    if (i > 0) b += lineHeight + (l.gap ? paraGap : 0);
    el(ctx, () => ctx.fillText(l.text, x, b));
  });
  return b;
}

function drawLogo(ctx, x, y, h, align = "left") {
  const w = h * LOGO_RATIO;
  const left = align === "center" ? x - w / 2 : x;
  if (IMG.logo) el(ctx, () => ctx.drawImage(IMG.logo, left, y, w, h));
  return w;
}

// A partner or cohost logo; nothing is drawn until one is added.
function markWidth(ctx, mark, h) {
  return mark.img ? h * (mark.img.width / mark.img.height || 3) : 0;
}
function drawMark(ctx, mark, x, cy, h) {
  const w = markWidth(ctx, mark, h);
  if (mark.img) el(ctx, () => ctx.drawImage(mark.img, x, cy - h / 2, w, h));
  return w;
}

// Pills flow into rows, each row aligned left or centered on x. Returns the bottom edge.
function drawPills(ctx, items, { x, top, maxWidth, align = "left", h, size, padX, gap, rowGap }) {
  if (!items.length) return top;
  font(ctx, 400, size, MONO, size * 0.02);
  const widths = items.map((t) => ctx.measureText(t).width + padX * 2);
  const rows = [[]];
  let used = 0;
  items.forEach((t, i) => {
    const w = widths[i];
    if (rows[rows.length - 1].length && used + gap + w > maxWidth) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(i);
    used += (rows[rows.length - 1].length > 1 ? gap : 0) + w;
  });
  rows.forEach((row, r) => {
    const rowW = row.reduce((s, i) => s + widths[i], 0) + gap * (row.length - 1);
    let px = align === "center" ? x - rowW / 2 : x;
    const py = top + r * (h + rowGap);
    row.forEach((i) => {
      el(ctx, () => {
        roundRect(ctx, px + 1, py + 1, widths[i] - 2, h - 2, 9);
        ctx.fillStyle = COLOR.pillFill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLOR.pillLine;
        ctx.stroke();
        ctx.fillStyle = COLOR.cyan;
        ctx.textAlign = "left";
        ctx.fillText(items[i], px + padX, py + h / 2 + size * 0.36);
      });
      px += widths[i] + gap;
    });
  });
  return top + rows.length * h + (rows.length - 1) * rowGap;
}

function drawBox(ctx, x, y, w, h) {
  el(ctx, () => {
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 12);
    ctx.fillStyle = COLOR.boxFill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.boxLine;
    ctx.stroke();
  });
}

function divider(ctx, x1, x2, y) {
  el(ctx, () => {
    ctx.fillStyle = COLOR.divider;
    ctx.fillRect(x1, y, x2 - x1, 2);
  });
}

function label(ctx, text, x, y, { size, tracking, align = "left", color = COLOR.cyan }) {
  font(ctx, 400, size, MONO, size * tracking);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  // Letter spacing adds space after the last letter too, so centered labels shift it back.
  el(ctx, () => ctx.fillText(text.toUpperCase(), align === "center" ? x + (size * tracking) / 2 : x, y));
}

// Speaker photos: black and white, over the green-to-pink gradient, in a rounded frame.
function drawPhoto(ctx, img, x, y, s) {
  el(ctx, () => photo(ctx, img, x, y, s));
}
function photo(ctx, img, x, y, s) {
  ctx.save();
  roundRect(ctx, x, y, s, s, 12);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + s);
  g.addColorStop(0, "#173f37");
  g.addColorStop(0.55, "#4d6e66");
  g.addColorStop(1, "#c595c4");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, s, s);
  if (img) {
    const k = Math.max(s / img.width, s / img.height);
    ctx.filter = "grayscale(1) contrast(1.05)";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x + (s - img.width * k) / 2, y + (s - img.height * k) / 2, img.width * k, img.height * k);
    ctx.filter = "none";
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = g;
    ctx.fillRect(x, y, s, s);
  } else {
    // A placeholder head and shoulders until a photo is added.
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s * 0.4, s * 0.17, 0, Math.PI * 2);
    ctx.ellipse(x + s / 2, y + s * 1.02, s * 0.36, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  roundRect(ctx, x + 1, y + 1, s - 2, s - 2, 12);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR.pillLine;
  ctx.stroke();
}

const pillsOf = (copy) => (copy.pills || "").split("\n").map((t) => t.trim()).filter(Boolean).map((t) => t.toUpperCase());

// ---- Background ----
// "Static" draws the terrain in code; "Animated" is the same terrain in motion.
// Each theme colors the terrain: base RGB plus how much light adds to it.
const THEMES = {
  foam: { bg: [0, 21, 21], fill: [0, 24, 25], fillLit: [22, 58, 60], wire: [80, 140, 150], wireLit: [16, 25, 25] },
  algae: { bg: [0, 21, 21], fill: [4, 23, 19], fillLit: [46, 54, 22], wire: [115, 130, 52], wireLit: [20, 25, 14] },
  lilac: { bg: [0, 21, 21], fill: [6, 22, 24], fillLit: [50, 36, 48], wire: [150, 104, 138], wireLit: [27, 22, 26] },
};
const rgb = (base, add, k) => base.map((v, i) => Math.round(v + add[i] * k)).join(", ");
// A field of jittered triangles lifted by layered noise, seen from above in perspective, shaded
// by a low light and fading into the dark at the top. Each seed is a different stretch of terrain.
const TERRAIN = {
  spacing: 0.03, // world units between points
  jitter: 0.32, // share of the spacing each point moves, so the triangles aren't all the same
  camY: 1.0, focal: 0.95, horizon: -0.13, // camera height, focal length (× width), horizon (× height)
  near: 0.42, far: 4.6,
  angle: 0.62, // the grid is turned so the lines run diagonally
  lift: 0.6, // height of the hills
  ridge: 0.3, // share of sharp-crested ridges in the hills, so peaks come to a point
  spike: 0.009, // how far each point moves up or down at random, for a crumpled, faceted surface
  light: [-0.85, 0.5, -0.25],
};

function hash2(a, b, seed) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Ridged noise: folds each layer at its middle, so crests are sharp instead of rounded.
function ridged(x, y, seed) {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { s += amp * (1 - Math.abs(2 * noise(x * f, y * f, seed + 40 + o * 13) - 1)) ** 2; amp *= 0.5; f *= 2.1; }
  return s;
}
function fbm(x, y, seed) {
  let s = 0, amp = 0.55, f = 1;
  for (let o = 0; o < 5; o++) { s += amp * noise(x * f, y * f, seed + o * 17); amp *= 0.48; f *= 2.05; }
  return s;
}

// The terrain fades into the dark at the top.
function fadeTop(ctx) {
  const dark = THEMES[state.theme].bg.join(", ");
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  g.addColorStop(0, `rgba(${dark}, 0.7)`);
  g.addColorStop(0.5, `rgba(${dark}, 0.5)`);
  g.addColorStop(0.8, `rgba(${dark}, 0.2)`);
  g.addColorStop(1, `rgba(${dark}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const terrainCache = new Map();
function terrain(seed) {
  const key = `${seed}-${state.theme}-${state.style}-${W}`;
  if (terrainCache.has(key)) return terrainCache.get(key);
  const T = TERRAIN, C = THEMES[state.theme];
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = `rgb(${C.bg.join(", ")})`;
  ctx.fillRect(0, 0, W, H);

  // Wider posts see more terrain to the sides, so the field grows with them.
  const f = T.focal * H, hy = T.horizon * H;
  const cos = Math.cos(T.angle), sin = Math.sin(T.angle);
  const n = Math.ceil((5.2 * (wide() ? 1.8 : 1)) / T.spacing);
  const pts = new Array((n + 1) * (n + 1));
  const ox = (seed * 3.17) % 11, oz = (seed * 5.71) % 13;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = (i - n / 2) * T.spacing + (hash2(i, j, seed) - 0.5) * T.jitter * T.spacing;
      const v = (j - n / 2) * T.spacing + (hash2(j, i, seed + 9) - 0.5) * T.jitter * T.spacing;
      const x = u * cos - v * sin, z = u * sin + v * cos + 2.5;
      // Hills from the noise, plus a long crease that runs into the frame.
      const crease = Math.exp(-((x + 0.3 - (z - 1.2) * 0.42) ** 2) / 0.1) * 0.2;
      const hills = (1 - T.ridge) * fbm(x * 0.55 + ox, z * 0.55 + oz, seed) + T.ridge * ridged(x * 0.9 + ox, z * 0.9 + oz, seed);
      const spike = (hash2(i, j, seed + 23) - 0.5) * T.spike;
      const y = (hills - 0.42) * T.lift - crease + spike;
      const p = { x, y, z };
      if (z > 0.05) { p.sx = W / 2 + (x * f) / z; p.sy = hy + ((T.camY - y) * f) / z; }
      pts[j * (n + 1) + i] = p;
    }
  }
  const L = T.light, ll = Math.hypot(...L);
  const tris = [];
  const visible = (p) => p.sx !== undefined && p.z > T.near && p.z < T.far;
  const on = (a, b, c2) => Math.max(a.sx, b.sx, c2.sx) > -40 && Math.min(a.sx, b.sx, c2.sx) < W + 40 && Math.max(a.sy, b.sy, c2.sy) > -40 && Math.min(a.sy, b.sy, c2.sy) < H + 40;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = pts[j * (n + 1) + i], b = pts[j * (n + 1) + i + 1], cc = pts[(j + 1) * (n + 1) + i], d = pts[(j + 1) * (n + 1) + i + 1];
      for (const t of [[a, b, d], [a, d, cc]]) {
        if (!t.every(visible) || !on(...t)) continue;
        const [p, q, r] = t;
        const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z, vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        const lit = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ll));
        tris.push({ t, z: (p.z + q.z + r.z) / 3, lit });
      }
    }
  }
  tris.sort((a, b) => b.z - a.z);
  ctx.lineJoin = "round";
  for (const { t, z, lit } of tris) {
    const near = Math.min(1, Math.max(0, (T.far - z) / (T.far - T.near))) ** 1.6; // 0 far, 1 near
    const shade = lit ** 1.4;
    ctx.beginPath();
    ctx.moveTo(t[0].sx, t[0].sy);
    ctx.lineTo(t[1].sx, t[1].sy);
    ctx.lineTo(t[2].sx, t[2].sy);
    ctx.closePath();
    const k = shade * (0.2 + 0.8 * near);
    ctx.fillStyle = state.style === "outline" ? `rgb(${C.bg.join(", ")})` : `rgb(${rgb(C.fill, C.fillLit, k)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb(C.wire, C.wireLit, lit)}, ${(0.06 + 0.8 * near) * (0.24 + 0.76 * shade)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  fadeTop(ctx);
  terrainCache.set(key, c);
  return c;
}

function drawBackground(ctx) {
  if (state.bg === "animated" && animFrame) { ctx.drawImage(animFrame, 0, 0); fadeTop(ctx); }
  else ctx.drawImage(terrain(state.seed), 0, 0);
  ctx.fillStyle = `rgba(${THEMES[state.theme].bg.join(", ")}, ${state.shade / 100})`;
  ctx.fillRect(0, 0, W, H);
}

// Four faint hairlines (35% opacity), 30px in from each edge, running the full width and height so they
// cross at the corners. Each crossing gets a short, solid cross.
function drawFrame(ctx) {
  const C = THEMES[state.theme], inset = 30, arm = 8;
  const color = C.wire.map((v, i) => v + C.wireLit[i]).join(", ");
  const left = inset, right = W - inset - 1, top = inset, bottom = H - inset - 1;
  ctx.fillStyle = `rgba(${color}, 0.35)`;
  ctx.fillRect(0, top, W, 1);
  ctx.fillRect(0, bottom, W, 1);
  ctx.fillRect(left, 0, 1, H);
  ctx.fillRect(right, 0, 1, H);
  ctx.fillStyle = `rgb(${color})`;
  for (const x of [left, right]) for (const y of [top, bottom]) {
    ctx.fillRect(x - arm, y, arm * 2 + 1, 1);
    ctx.fillRect(x, y - arm, 1, arm * 2 + 1);
  }
}

// ---- Layouts ----
// Every position is in pixels on the post; landscape posts center on W / 2 and give the copy more width.

const LAYOUTS = {
  event: {
    cohosts(ctx, copy) {
      const room = wide() ? 1250 : 900;
      // Landscape: everything 1.2× larger, growing from the top center.
      if (wide()) {
        const k = 1.2, ox = W / 2, oy = 40;
        ctx.translate(ox * (1 - k), oy * (1 - k));
        ctx.scale(k, k);
      }
      const lh = wide() ? 73 : 58, logoBottom = 125 + (73 - lh) / 2 + lh;
      drawLogo(ctx, W / 2, logoBottom - lh, lh, "center");
      // A headline that fits on one line is set larger; longer ones shrink to fit three lines.
      const top = wide() ? 92 : 76, opts = { weight: 400, min: 48, maxWidth: wide() ? 1250 : 950, maxLines: 3, tracking: -0.01 };
      let { lines, size } = fit(ctx, copy.headline, { ...opts, size: top });
      if (lines.length === 1) ({ lines, size } = fit(ctx, copy.headline, { ...opts, size: wide() ? 124 : 108, min: top, maxLines: 1 }));
      // Headline, pills and cohosts, starting `y` below the logo; returns the bottom of the last thing drawn.
      const body = (y) => {
        ctx.fillStyle = COLOR.ink;
        const last = drawLines(ctx, lines, W / 2, y + size * 0.73, size * 1.13, "center");
        const bottom = drawPills(ctx, pillsOf(copy), { x: W / 2, top: last + 72, maxWidth: room, align: "center", h: 70, size: 28, padX: 36, gap: 26, rowGap: 26 });
        const marks = state.cohosts.filter((m) => m.img);
        if (!marks.length) return bottom;
        // The cohosts follow the pills, so they move up with a short headline and down with a long one.
        const ly = bottom + 130;
        label(ctx, state.cohostLabel, W / 2, ly, { size: 24, tracking: 0.06, align: "center" });
        // Logos share one row; they get smaller if there are many.
        let h = 46 * state.cohostScale / 100, total;
        const gap = 64;
        do { total = marks.reduce((s, m) => s + markWidth(ctx, m, h), 0) + gap * (marks.length - 1); } while (total > room && (h -= 2) > 24);
        let x = W / 2 - total / 2;
        marks.forEach((m) => { x += drawMark(ctx, m, x, ly + 83, h) + gap; });
        return ly + 83 + h / 2;
      };
      let y = logoBottom + 65;
      // One-line headlines: measure the block invisibly, then center it between the logo and the matching bottom margin.
      if (lines.length === 1) {
        const i = reveal.i;
        ctx.save();
        ctx.globalAlpha = 0;
        const end = body(y);
        ctx.restore();
        reveal.i = i;
        const space = H - (logoBottom - lh) - logoBottom;
        y = Math.max(y, logoBottom + (space - (end - y)) / 2);
      }
      body(y);
    },
    speaker(ctx, copy) { eventWithSpeakers(ctx, copy, 1); },
    speakers(ctx, copy) { eventWithSpeakers(ctx, copy, 2); },
  },
  model: {
    list(ctx, copy) {
      // Landscape: everything 1.25× larger, growing from the top-left margin.
      if (wide()) {
        const k = 1.25, ox = 133, oy = 60;
        ctx.translate(ox * (1 - k), oy * (1 - k));
        ctx.scale(k, k);
      }
      const mx = wide() ? 133 : 90;
      if (wide()) drawLogo(ctx, mx, 125, 62);
      else drawLogo(ctx, mx, 128, 60);
      const { lines, size } = fit(ctx, copy.headline, { weight: 400, size: 58, min: 40, maxWidth: wide() ? 1150 : 770, maxLines: 7, tracking: -0.01 });
      ctx.fillStyle = COLOR.ink;
      const last = drawLines(ctx, lines, mx, 300, size * 1.21, "left", size * 0.66);
      drawPills(ctx, pillsOf(copy), { x: mx, top: last + 90, maxWidth: wide() ? 1300 : 814, h: 70, size: 26, padX: 38, gap: 26, rowGap: 26 });
    },
    spotlight(ctx, copy) {
      const bw = wide() ? 1300 : 890, bx = (W - bw) / 2, inner = bw - 130;
      drawLogo(ctx, W / 2, 125, 73, "center");
      drawBox(ctx, bx, 268, bw, 687);
      label(ctx, copy.eyebrow, W / 2, 393, { size: 38, tracking: 0.06, align: "center" });
      const { lines, size } = fit(ctx, copy.title, { weight: 400, size: 100, min: 56, maxWidth: inner, maxLines: 1, tracking: -0.015 });
      ctx.fillStyle = COLOR.ink;
      drawLines(ctx, lines, W / 2, 522, size, "center");
      divider(ctx, bx + 70, bx + bw - 70, 592);
      label(ctx, copy.label, W / 2, 678, { size: 26, tracking: 0.08, align: "center", color: COLOR.ink });
      drawPills(ctx, pillsOf(copy), { x: W / 2, top: 717, maxWidth: inner, align: "center", h: 66, size: 26, padX: 24, gap: 18, rowGap: 18 });
    },
  },
  partner: {
    horizontal(ctx) {
      const h = 63, gap = 46;
      const ph = h * 0.95 * state.partnerScale / 100, pw = markWidth(ctx, state.partner, ph), dw = h * LOGO_RATIO;
      font(ctx, 300, 44, SANS);
      const xw = ctx.measureText("×").width;
      let x = W / 2 - (dw + gap + xw + gap + pw) / 2;
      drawLogo(ctx, x, 540 - h / 2, h);
      x += dw + gap;
      font(ctx, 300, 44, SANS);
      ctx.fillStyle = COLOR.ink; ctx.textAlign = "left";
      el(ctx, () => ctx.fillText("×", x, 540 + 15));
      drawMark(ctx, state.partner, x + xw + gap, 540, ph);
    },
    vertical(ctx) {
      drawLogo(ctx, W / 2, 340, 90, "center");
      font(ctx, 300, 60, SANS);
      ctx.fillStyle = COLOR.ink; ctx.textAlign = "center";
      el(ctx, () => ctx.fillText("×", W / 2, 540 + 21));
      const h = 82 * state.partnerScale / 100, w = markWidth(ctx, state.partner, h);
      drawMark(ctx, state.partner, W / 2 - w / 2, 690, h);
    },
    promo(ctx, copy) {
      const bw = wide() ? 1300 : 890, bx = (W - bw) / 2, inner = bw - 150;
      drawBox(ctx, bx, 120, bw, 835);
      const h = 56, gap = 26, ph = h * 0.95 * state.partnerScale / 100, pw = markWidth(ctx, state.partner, ph), dw = h * LOGO_RATIO;
      font(ctx, 300, 40, SANS);
      const xw = ctx.measureText("×").width;
      let x = W / 2 - (dw + gap + xw + gap + pw) / 2;
      drawLogo(ctx, x, 240 - h / 2, h);
      x += dw + gap;
      font(ctx, 300, 40, SANS);
      ctx.fillStyle = COLOR.ink; ctx.textAlign = "left";
      el(ctx, () => ctx.fillText("×", x, 240 + 14));
      drawMark(ctx, state.partner, x + xw + gap, 240, ph);
      divider(ctx, bx + 70, bx + bw - 70, 324);
      const { lines, size } = fit(ctx, copy.headline, { weight: 500, size: 132, min: 64, maxWidth: inner, maxLines: 2, tracking: -0.01 });
      ctx.fillStyle = COLOR.ink;
      const last = drawLines(ctx, lines, W / 2, 480 + (lines.length === 1 ? 60 : 0), size, "center");
      label(ctx, copy.label, W / 2, last + 85, { size: 26, tracking: 0.08, align: "center", color: COLOR.ink });
      drawPills(ctx, pillsOf(copy), { x: W / 2, top: last + 122, maxWidth: inner, align: "center", h: 62, size: 26, padX: 24, gap: 18, rowGap: 18 });
    },
  },
};

function eventWithSpeakers(ctx, copy, count) {
  // Landscape: everything 1.25× larger, growing from the top-left margin.
  if (wide()) {
    const k = 1.25, ox = 90, oy = 60;
    ctx.translate(ox * (1 - k), oy * (1 - k));
    ctx.scale(k, k);
  }
  drawLogo(ctx, 90, 128, 60);
  label(ctx, copy.eyebrow, 90, 275, { size: 26, tracking: 0.1 });
  // Speakers sit in a row, left to right, right under the pills.
  const { lines, size } = fit(ctx, copy.headline, { weight: 400, size: 64, min: 36, maxWidth: wide() ? 1000 : 900, maxLines: 3, tracking: -0.01 });
  ctx.fillStyle = COLOR.ink;
  const last = drawLines(ctx, lines, 90, 370, size * 1.2, "left");
  const bottom = drawPills(ctx, pillsOf(copy), { x: 90, top: last + 68, maxWidth: wide() ? 1000 : 900, h: 60, size: 26, padX: 32, gap: 18, rowGap: 22 });
  state.speakers.slice(0, count).forEach((sp, i) => {
    const x = 90 + i * (wide() ? 500 : 470), top = bottom + 60, tx = x + 170;
    drawPhoto(ctx, sp.img, x, top, 150);
    font(ctx, 400, 40, SANS, -0.4);
    const names = wrap(ctx, sp.name, wide() ? (count > 1 ? 300 : 640) : count > 1 ? 270 : 640);
    const lastName = top + 103 + (names.length > 1 ? 12 : 0), firstName = lastName - 42 * (names.length - 1);
    // The role sits just above the first line of the name.
    label(ctx, sp.label, tx, firstName - 46, { size: 18, tracking: 0.18 });
    font(ctx, 400, 40, SANS, -0.4);
    ctx.fillStyle = COLOR.ink;
    drawLines(ctx, names, tx, firstName, 42, "left");
    font(ctx, 400, 21, SANS);
    ctx.fillStyle = "rgba(244, 247, 246, 0.85)";
    el(ctx, () => ctx.fillText(sp.title, tx, lastName + 34));
  });
}

function draw(canvas, template, variant, t = textTime()) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  drawBackground(ctx);
  drawFrame(ctx);
  ctx.textBaseline = "alphabetic";
  reveal.i = 0;
  reveal.t = t;
  LAYOUTS[template][variant](ctx, state.copy[template]);
  reveal.count = reveal.i;
  ctx.restore();
}

// Seconds since the text entrance started: from the start of a recording, otherwise from the
// last time an animation was picked or replayed.
let textStart = 0, textFixed = null;
function textTime() {
  if (state.textAnim === "none") return Infinity;
  if (textFixed !== null) return textFixed;
  if (recording) return (performance.now() - recording.begin) / 1000;
  return (performance.now() - textStart) / 1000;
}
function replayText() {
  textStart = performance.now();
  animate();
}

// ---- Images ----
const IMG = { logo: null };
function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}
// SVGs without a width and height draw at a default size, so give them their viewBox's.
async function imageFromFile(file) {
  if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
    let svg = await file.text();
    const vb = /viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    if (vb) svg = svg.replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${vb[1]}" height="${vb[2]}">`);
    return loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  }
  return loadImage(URL.createObjectURL(file));
}

// ---- Controls ----
const form = document.getElementById("controls");
const mainCanvas = document.getElementById("main");

const variantInfo = () => TEMPLATES[state.template].variants[state.variant[state.template]];

function syncControls() {
  const t = state.template, info = variantInfo(), copy = state.copy[t];
  form.querySelectorAll("[data-group]").forEach((g) => {
    const v = state[g.dataset.group];
    g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === v)));
  });
  const vs = document.getElementById("variants");
  vs.replaceChildren(...Object.entries(TEMPLATES[t].variants).map(([key, v]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = v.name; b.dataset.value = key;
    b.setAttribute("aria-pressed", String(key === state.variant[t]));
    b.onclick = () => { state.variant[t] = key; syncControls(); render(); };
    return b;
  }));
  // Show only the fields this layout uses.
  form.querySelectorAll("[data-field]").forEach((el) => { el.hidden = !info.fields.includes(el.dataset.field); });
  ["eyebrow", "title", "headline", "label", "pills"].forEach((k) => { form.elements[k].value = copy[k] ?? ""; });
  showLogo(document.getElementById("partnerPreview"), state.partner);
  for (const k of ["partnerScale", "cohostScale"]) {
    form.elements[k].value = state[k];
    document.getElementById(`${k}Value`).textContent = `${state[k]}%`;
  }
  form.elements.cohostLabel.value = state.cohostLabel;
  form.elements.seed.value = state.seed;
  form.elements.shade.value = state.shade;
  document.getElementById("seedValue").textContent = state.seed;
  document.getElementById("shadeValue").textContent = `${state.shade}%`;
  form.querySelectorAll("[data-bg]").forEach((el) => { el.hidden = !el.dataset.bg.split(" ").includes(state.bg); });
  form.elements.speed.value = state.speed;
  document.getElementById("speedValue").textContent = `${state.speed}×`;
  form.elements.clip.value = state.clip;
  document.getElementById("clipValue").textContent = `${state.clip}s`;
  const video = document.getElementById("video");
  video.hidden = !moving() || !VIDEO.type;
  document.getElementById("replay").hidden = state.textAnim === "none";
  video.disabled = !!recording;
  video.textContent = recording ? `Recording… ${recording.left}s` : `Download ${VIDEO.label}`;
  animate();
  document.querySelectorAll("#speakers .entry").forEach((el, i) => { el.hidden = i >= (info.speakers || 0); });
}

// Cohost and speaker cards.
function entry(title, inputs, onImage, onClear) {
  const box = document.createElement("div");
  box.className = "entry";
  const top = document.createElement("div");
  top.className = "entry-top";
  top.append(title);
  const row = document.createElement("div");
  row.className = "file-row";
  const up = document.createElement("label");
  up.className = "btn ghost small file";
  up.textContent = onImage.label;
  const file = document.createElement("input");
  file.type = "file"; file.accept = onImage.accept; file.hidden = true;
  file.onchange = async () => { if (file.files[0]) { await onImage.set(await imageFromFile(file.files[0])); render(); } file.value = ""; };
  up.append(file);
  const clear = document.createElement("button");
  clear.type = "button"; clear.className = "btn ghost small"; clear.textContent = onClear.label;
  clear.onclick = () => { onClear.run(); render(); };
  row.append(up, clear);
  box.append(top, ...inputs, row);
  return box;
}
function textInput(value, placeholder, set) {
  const i = document.createElement("input");
  i.type = "text"; i.value = value; i.placeholder = placeholder;
  i.oninput = () => { set(i.value); render(); };
  return i;
}
// A logo preview on the post color, or an empty box until a logo is added.
function showLogo(preview, mark) {
  if (preview.firstChild?.src === mark.img?.src) return;
  preview.replaceChildren();
  if (mark.img) {
    const img = new Image();
    img.src = mark.img.src;
    img.alt = mark.name;
    preview.append(img);
  } else preview.append(Object.assign(document.createElement("span"), { textContent: "No logo" }));
  preview.classList.toggle("empty", !mark.img);
}

// Cohost cards: a preview of the logo on the post color, then choose, upload or remove it.
document.getElementById("cohosts").append(...state.cohosts.map((m, i) => {
  const box = document.createElement("div");
  box.className = "entry";
  const top = document.createElement("div");
  top.className = "entry-top";
  top.append(`Cohost ${i + 1}`);
  const preview = document.createElement("div");
  preview.className = "logo-preview";
  const show = () => showLogo(preview, m);
  const row = document.createElement("div");
  row.className = "file-row";
  const pick = document.createElement("button");
  pick.type = "button"; pick.className = "btn small"; pick.textContent = "Choose logo";
  pick.onclick = () => chooseLogo((img, n) => { m.img = img; m.name = n; show(); render(); });
  const up = document.createElement("label");
  up.className = "btn ghost small file";
  up.textContent = "Upload logo";
  const file = document.createElement("input");
  file.type = "file"; file.accept = "image/svg+xml,image/png"; file.hidden = true;
  file.onchange = async () => {
    const f = file.files[0];
    if (f) { m.img = await imageFromFile(f); m.name = f.name.replace(/\.[^.]+$/, ""); show(); render(); }
    file.value = "";
  };
  up.append(file);
  const clear = document.createElement("button");
  clear.type = "button"; clear.className = "btn ghost small"; clear.textContent = "Remove logo";
  clear.onclick = () => { m.img = null; m.name = ""; show(); render(); };
  row.append(pick, up, clear);
  box.append(top, preview, row);
  m.show = show;
  show();
  return box;
}));
document.getElementById("speakers").append(...state.speakers.map((sp, i) => entry(`Speaker ${i + 1}`,
  [textInput(sp.label, "Role, like Instructor", (v) => { sp.label = v; }),
   textInput(sp.name, "Name", (v) => { sp.name = v; }),
   textInput(sp.title, "Title", (v) => { sp.title = v; })],
  { label: "Upload photo", accept: "image/*", set: (img) => { sp.img = img; } },
  { label: "Remove photo", run: () => { sp.img = null; } })));

form.querySelectorAll("[data-group] button").forEach((b) => {
  b.addEventListener("click", () => {
    const group = b.closest("[data-group]").dataset.group;
    state[group] = b.dataset.value;
    if (group === "textAnim") textStart = performance.now();
    if (group === "format") setFormat();
    syncControls();
    render();
  });
});
form.addEventListener("input", (e) => {
  const { name, value } = e.target;
  if (["eyebrow", "title", "headline", "label", "pills"].includes(name)) state.copy[state.template][name] = value;
  else if (name === "cohostLabel") state.cohostLabel = value;
  else if (["seed", "shade", "speed", "clip", "partnerScale", "cohostScale"].includes(name)) { state[name] = +value; syncControls(); }
  else return;
  render();
});
form.querySelectorAll("[data-image]").forEach((input) => {
  input.addEventListener("change", async () => {
    const f = input.files[0];
    if (!f) return;
    const img = await imageFromFile(f);
    if (input.dataset.image === "partner") { state.partner.img = img; state.partner.name = f.name.replace(/\.[^.]+$/, ""); }
    input.value = "";
    syncControls();
    render();
  });
});
form.querySelector('[data-clear="partner"]').onclick = () => { state.partner.img = null; state.partner.name = ""; syncControls(); render(); };
document.getElementById("partnerLibrary").onclick = () => chooseLogo((img, name) => {
  state.partner.img = img;
  state.partner.name = name;
  syncControls();
  render();
});

// Each section folds open or closed from its heading.
form.querySelectorAll("fieldset").forEach((fs) => {
  const legend = fs.querySelector("legend");
  const body = document.createElement("div");
  body.className = "section-body";
  body.append(...[...fs.children].filter((c) => c !== legend));
  fs.append(body);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "section-toggle";
  toggle.setAttribute("aria-expanded", "true");
  toggle.append(...legend.childNodes);
  legend.append(toggle);
  toggle.onclick = () => {
    const open = fs.classList.toggle("collapsed") === false;
    toggle.setAttribute("aria-expanded", String(open));
  };
});

// Logo library: pick a logo from logos/ (see logos.js); `apply` gets the loaded image and the brand name.
const library = document.getElementById("library");
let libraryApply = null;
function chooseLogo(apply) {
  libraryApply = apply;
  const grid = library.querySelector(".library-grid"), search = library.querySelector("input");
  if (!grid.children.length) {
    grid.append(...LOGO_LIBRARY.map(({ name, file }) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.name = name.toLowerCase();
      b.innerHTML = `<div class="tile"><img loading="lazy" alt=""></div><span></span>`;
      b.querySelector("img").src = `logos/${file}`;
      b.querySelector("span").textContent = name;
      b.onclick = async () => {
        const img = await loadImage(`logos/${file}`);
        library.close();
        libraryApply?.(img, name);
      };
      return b;
    }));
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      for (const b of grid.children) b.hidden = !!q && !b.dataset.name.includes(q);
    };
  }
  search.value = "";
  search.oninput();
  library.showModal();
  search.focus();
}
library.querySelector("[data-close]").onclick = () => library.close();
library.addEventListener("click", (e) => { if (e.target === library) library.close(); });
document.getElementById("replay").onclick = replayText;

// ---- Previews ----
function setFormat() {
  W = FORMATS[state.format];
  document.body.classList.toggle("landscape", wide());
}
function sizeCanvas(c) {
  if (c.width !== W) c.width = W;
  if (c.height !== H) c.height = H;
}
// The selected layout large, the template's other layouts small beside it; click one to switch.
let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (state.bg === "animated") {
      // Read the WebGL frame back once, then every post draws from the copy. Over the last seconds
      // of the clip the terrain crossfades into the frames just before the start, so the clip loops.
      const pass = 320 / state.speed, fade = Math.min(3, state.clip / 4), into = animTime - (state.clip - fade);
      const frame = (s) => TerrainGL.draw(state.seed, (((s / pass) % 1) + 1) % 1, TERRAIN, W, H, state.motion, THEMES[state.theme], state.style === "outline");
      const gl = frame(animTime);
      if (gl) {
        if (animFrame?.width !== W) animFrame = Object.assign(document.createElement("canvas"), { width: W, height: H });
        const fctx = animFrame.getContext("2d");
        fctx.globalAlpha = 1;
        fctx.drawImage(gl, 0, 0);
        if (into > 0) {
          fctx.globalAlpha = into / fade;
          fctx.drawImage(frame(animTime - state.clip), 0, 0);
          fctx.globalAlpha = 1;
        }
      }
    }
    const t = state.template, v = state.variant[t];
    sizeCanvas(mainCanvas);
    draw(mainCanvas, t, v);
    document.getElementById("mainLabel").innerHTML = `<b>${TEMPLATES[t].name}</b> · ${TEMPLATES[t].variants[v].name} · ${W} × ${H}`;
  });
}

// ---- Animation ----
// While the terrain moves, while the text is entering, or while recording, every frame redraws the posts.
let animFrame = null, animTime = 0, animStart = 0, animating = false, animFixed = false;
const moving = () => state.bg === "animated" || state.textAnim !== "none";
const busy = () => state.bg === "animated" || !!recording || textTime() < revealEnd() + 0.05;
function animate() {
  if (animating || !busy()) return;
  animating = true;
  animStart = performance.now() - animTime * 1000;
  const step = (now) => {
    if (state.bg === "animated" && !recording && !animFixed) animTime = ((now - animStart) / 1000) % state.clip;
    render();
    if (busy()) requestAnimationFrame(step);
    else { animating = false; render(); }
  };
  requestAnimationFrame(step);
}

// Video export: the best format this browser can record. Chrome and Safari record MP4; others WebM.
const VIDEO = (() => {
  const types = ["video/mp4;codecs=avc1.640028", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const type = window.MediaRecorder ? types.find((t) => MediaRecorder.isTypeSupported(t)) : null;
  return { type, label: type?.startsWith("video/mp4") ? "MP4" : "WebM", ext: type?.startsWith("video/mp4") ? "mp4" : "webm" };
})();

// Records in real time from the start: one clip of the moving terrain, which loops seamlessly,
// or with a still background, a short clip of the text entering.
let recording = null;
document.getElementById("video").onclick = async () => {
  if (recording || !VIDEO.type) return;
  const t = state.template, v = state.variant[t];
  const length = state.bg === "animated" ? state.clip : Math.max(TEXT_ANIM.clip, Math.ceil(revealEnd() + 2));
  const recorder = new MediaRecorder(mainCanvas.captureStream(60), { mimeType: VIDEO.type, videoBitsPerSecond: 10_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((resolve) => { recorder.onstop = resolve; });
  recording = { left: length, begin: performance.now() };
  syncControls();
  recorder.start();
  const begin = recording.begin;
  await new Promise((resolve) => {
    const step = (now) => {
      const elapsed = (now - begin) / 1000;
      if (state.bg === "animated") animTime = Math.min(elapsed, length) % length;
      recording.left = Math.max(0, Math.ceil(length - elapsed));
      document.getElementById("video").textContent = `Recording… ${recording.left}s`;
      if (elapsed >= length) resolve(); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  recorder.stop();
  await done;
  recording = null;
  animStart = performance.now();
  syncControls();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(chunks, { type: VIDEO.type }));
  a.download = `${fileName(t, v)}.${VIDEO.ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
};

document.getElementById("download").onclick = () => {
  const t = state.template, v = state.variant[t];
  draw(mainCanvas, t, v, Infinity);
  mainCanvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName(t, v)}.png`;
    a.click();
  }, "image/png");
};

const fileName = (t, v) => `digitalocean-${t}-${v}${wide() ? "-landscape" : ""}`;

// Open a layout directly with #template/layout, like #event/speakers.
function fromHash() {
  const [t, v] = location.hash.slice(1).split("/");
  if (TEMPLATES[t]) { state.template = t; if (TEMPLATES[t].variants[v]) state.variant[t] = v; }
}
addEventListener("hashchange", () => { fromHash(); syncControls(); render(); });

(async () => {
  if (location.search.includes("solo")) document.body.classList.add("solo");
  if (location.search.includes("bg=generated")) state.bg = "terrain";
  if (location.search.includes("bg=animated")) state.bg = "animated";
  if (location.search.includes("motion=rotate")) state.motion = "rotate";
  const theme = /[?&]theme=(algae|lilac)/.exec(location.search);
  if (theme) state.theme = theme[1];
  if (location.search.includes("style=filled")) state.style = "filled";
  if (location.search.includes("format=landscape")) state.format = "landscape";
  setFormat();
  const anim = /[?&]anim=(fade|rise)/.exec(location.search);
  if (anim) state.textAnim = anim[1];
  const tt = /[?&]tt=([\d.]+)/.exec(location.search);
  if (tt) textFixed = +tt[1];
  const at = /[?&]t=([\d.]+)/.exec(location.search);
  if (at) { animTime = +at[1] * state.clip; animFixed = true; }
  fromHash();
  IMG.logo = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(LOGOS.digitalocean.replace(/width="[^"]*" height="[^"]*"/, 'width="1261" height="210"')));
  await Promise.all(state.cohosts.filter((m) => m.file).map(async (m) => { m.img = await loadImage(`logos/${m.file}`); m.show(); }));
  state.partner.img = await loadImage(`logos/${state.partner.file}`);
  await Promise.all(["400 40px Inter", "500 40px Inter", "600 40px Inter", "300 40px Inter", '400 20px "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
  syncControls();
  render();
})();
