// Builds every SVG sheet in assets/ from the words in this file.
// All type is converted to outlines, so the sheets look the same on every machine
// and need nothing from the network once they are committed.
//
//   npm install && npm run build
//
// Fonts (OFL) are fetched once into .fonts/, which is git-ignored.

import * as fontkit from "fontkit";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = join(ROOT, ".fonts");
const OUT = join(ROOT, "assets");

/* ───────────────────────────── fonts ───────────────────────────── */

const OFL = "https://raw.githubusercontent.com/google/fonts/main/ofl";
const FONT_FILES = {
  "Fraunces.ttf": `${OFL}/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf`,
  "Fraunces-Italic.ttf": `${OFL}/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf`,
  "GeistMono.ttf": `${OFL}/geistmono/GeistMono%5Bwght%5D.ttf`,
  "ShipporiMincho-Regular.ttf": `${OFL}/shipporimincho/ShipporiMincho-Regular.ttf`,
  "ShipporiMincho-SemiBold.ttf": `${OFL}/shipporimincho/ShipporiMincho-SemiBold.ttf`,
};

mkdirSync(FONT_DIR, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const [name, url] of Object.entries(FONT_FILES)) {
  const file = join(FONT_DIR, name);
  if (existsSync(file)) continue;
  console.log("fetching", name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${name}: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const open = (name) => fontkit.openSync(join(FONT_DIR, name));
const fr = open("Fraunces.ttf");
const fri = open("Fraunces-Italic.ttf");
const F = {
  disp: fr.getVariation({ wght: 360, opsz: 144, SOFT: 0, WONK: 0 }),
  dispI: fri.getVariation({ wght: 340, opsz: 144, SOFT: 0, WONK: 1 }),
  text: fr.getVariation({ wght: 400, opsz: 20, SOFT: 0, WONK: 0 }),
  textI: fri.getVariation({ wght: 400, opsz: 20, SOFT: 0, WONK: 0 }),
  mono: open("GeistMono.ttf").getVariation({ wght: 430 }),
  jp: open("ShipporiMincho-Regular.ttf"),
  jpB: open("ShipporiMincho-SemiBold.ttf"),
};
const FKEY = { disp: "d", dispI: "e", text: "t", textI: "u", mono: "m", jp: "j", jpB: "k" };

/* ───────────────────────────── palette ───────────────────────────── */

const INKS = [
  { jp: "藍", name: "Indigo", day: "#214085", night: "#4f7dff" },
  { jp: "朱", name: "Vermilion", day: "#e04521", night: "#ff5a2e" },
  { jp: "山吹", name: "Yamabuki", day: "#f2ad1a", night: "#ffc23a" },
  { jp: "藤", name: "Wisteria", day: "#8566c2", night: "#a98bf0" },
  { jp: "若竹", name: "Bamboo", day: "#339978", night: "#45c99c" },
  { jp: "桜", name: "Sakura", day: "#ed809e", night: "#ff9db8" },
];

const THEMES = {
  day: {
    name: "day",
    bg: "#f3efe6",
    deep: "#e9e3d6",
    fg: "#17140f",
    soft: "#5d574c",
    line: "rgba(23,20,15,.16)",
    shu: "#d9381e",
    blend: "multiply",
    ink: (i) => INKS[i].day,
    inkAlpha: 1,
  },
  night: {
    name: "night",
    bg: "#17140f",
    deep: "#211c15",
    fg: "#f3efe6",
    soft: "#a59d8c",
    line: "rgba(243,239,230,.18)",
    shu: "#e8492a",
    blend: "screen",
    ink: (i) => INKS[i].night,
    inkAlpha: 0.72,
  },
};

/* ───────────────────────────── helpers ───────────────────────────── */

const r = (n) => +n.toFixed(1);
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, "0")).join("");
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glyphD(glyph) {
  let d = "";
  for (const c of glyph.path.commands) {
    const a = c.args.map((v) => Math.round(v));
    if (c.command === "moveTo") d += `M${a[0]} ${a[1]}`;
    else if (c.command === "lineTo") d += `L${a[0]} ${a[1]}`;
    else if (c.command === "quadraticCurveTo") d += `Q${a[0]} ${a[1]} ${a[2]} ${a[3]}`;
    else if (c.command === "bezierCurveTo") d += `C${a[0]} ${a[1]} ${a[2]} ${a[3]} ${a[4]} ${a[5]}`;
    else if (c.command === "closePath") d += "Z";
  }
  return d;
}

const layoutCache = new Map();
function layout(fk, str, feat) {
  const key = fk + "|" + (feat ? feat.join() : "") + "|" + str;
  let run = layoutCache.get(key);
  if (!run) {
    run = F[fk].layout(str, feat);
    for (const g of run.glyphs) if (g.id === 0) console.warn(`  ! missing glyph in ${fk}: "${str}"`);
    layoutCache.set(key, run);
  }
  return run;
}

function measure(str, fk, size, track = 0) {
  const f = F[fk];
  const run = layout(fk, str);
  let w = 0;
  for (const p of run.positions) w += p.xAdvance;
  return ((w + track * f.unitsPerEm * Math.max(0, run.glyphs.length - 1)) * size) / f.unitsPerEm;
}

function wrap(str, fk, size, maxW) {
  const words = str.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (cur && measure(next, fk, size) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A single SVG document with a shared pool of glyph outlines. */
class Doc {
  constructor(w, h, label) {
    this.w = w;
    this.h = h;
    this.label = label;
    this.glyphs = new Map();
    this.defs = [];
    this.css = [];
    this.body = [];
    this.n = 0;
  }
  id(p = "x") {
    return p + (this.n++).toString(36);
  }
  add(...s) {
    this.body.push(...s);
  }
  ref(fk, glyph) {
    const id = FKEY[fk] + glyph.id.toString(36);
    if (!this.glyphs.has(id)) this.glyphs.set(id, glyphD(glyph));
    return this.glyphs.get(id) ? id : null;
  }
  /** Horizontal run of text. Returns the markup; width via measure(). */
  text(str, { font = "text", size = 16, x = 0, y = 0, anchor = "start", fill, track = 0, attrs = "", stroke } = {}) {
    const f = F[font];
    const s = size / f.unitsPerEm;
    const run = layout(font, str);
    let pen = 0;
    let uses = "";
    run.glyphs.forEach((g, i) => {
      const p = run.positions[i];
      const id = this.ref(font, g);
      if (id) uses += `<use href="#${id}" x="${Math.round(pen + p.xOffset)}"${p.yOffset ? ` y="${Math.round(p.yOffset)}"` : ""}/>`;
      pen += p.xAdvance + track * f.unitsPerEm;
    });
    const w = (pen - (run.glyphs.length ? track * f.unitsPerEm : 0)) * s;
    const ox = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    const paint = stroke
      ? ` fill="none" stroke="${stroke}" stroke-width="${r(1.2 / s)}"`
      : fill
        ? ` fill="${fill}"`
        : "";
    return `<g transform="translate(${r(ox)} ${r(y)}) scale(${s.toFixed(4)} -${s.toFixed(4)})"${paint}${attrs ? " " + attrs : ""}>${uses}</g>`;
  }
  /** Mixed-font line: segs = [[str, font, extra]], laid out left to right. */
  line(segs, { size, x, y, anchor = "start" }) {
    const widths = segs.map(([str, font]) => measure(str, font, size));
    const total = widths.reduce((a, b) => a + b, 0);
    let pen = anchor === "middle" ? x - total / 2 : anchor === "end" ? x - total : x;
    const out = [];
    const spans = [];
    segs.forEach(([str, font, extra = {}], i) => {
      out.push(this.text(str, { font, size, x: pen, y, ...extra }));
      spans.push({ x: pen, w: widths[i] });
      pen += widths[i];
    });
    return { svg: out.join(""), spans, w: total };
  }
  /** Vertical column of Japanese, top to bottom, centred on x. */
  vtext(str, { font = "jp", size = 24, x = 0, y = 0, pitch, fill, attrs = "", each } = {}) {
    const f = F[font];
    const s = size / f.unitsPerEm;
    pitch = pitch ?? size * 1.12;
    let uses = "";
    [...str].forEach((ch, i) => {
      const plain = layout(font, ch).glyphs[0];
      const vert = layout(font, ch, ["vert"]).glyphs[0];
      const id = this.ref(font, vert);
      if (!id) return;
      let dx = -f.unitsPerEm / 2;
      let dy = -(i * pitch) / s - f.unitsPerEm * 0.88;
      if (vert.id === plain.id && "、。".includes(ch)) {
        dx += f.unitsPerEm * 0.6;
        dy += f.unitsPerEm * 0.6;
      }
      uses += `<use href="#${id}" x="${Math.round(dx)}" y="${Math.round(dy)}"${each ? " " + each(i, ch) : ""}/>`;
    });
    return `<g transform="translate(${r(x)} ${r(y)}) scale(${s.toFixed(4)} -${s.toFixed(4)})"${fill ? ` fill="${fill}"` : ""}${attrs ? " " + attrs : ""}>${uses}</g>`;
  }
  render() {
    const glyphs = [...this.glyphs].filter(([, d]) => d).map(([id, d]) => `<path id="${id}" d="${d}"/>`).join("");
    const css =
      this.css.join("") +
      "@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}" role="img" aria-label="${esc(this.label)}">` +
      `<title>${esc(this.label)}</title><defs>${glyphs}${this.defs.join("")}</defs><style>${css}</style>${this.body.join("")}</svg>\n`
    );
  }
  save(name) {
    const out = this.render();
    writeFileSync(join(OUT, name), out);
    console.log(`  ${name.padEnd(26)} ${(out.length / 1024).toFixed(1)} kB`);
  }
}

/* ───────────────────────────── ink ───────────────────────────── */

/** Closed organic outline through n points, as cubic béziers. */
function blobD(pts) {
  const n = pts.length;
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d + "Z";
}

/** A blot that slowly changes shape and wanders. */
function blot({ cx, cy, rad, seed, n = 9, jit = 0.3, wobble = 0.22, drift = 0.18, frames = 4, dur = 26, attrs = "" }) {
  const rnd = rng(seed);
  const base = Array.from({ length: n }, () => 1 + (rnd() * 2 - 1) * jit);
  const phase = rnd() * Math.PI * 2;
  const shapes = [];
  for (let k = 0; k < frames; k++) {
    const ox = k ? (rnd() * 2 - 1) * rad * drift : 0;
    const oy = k ? (rnd() * 2 - 1) * rad * drift : 0;
    const pts = base.map((b, i) => {
      const a = phase + (i / n) * Math.PI * 2 + (k ? (rnd() - 0.5) * 0.3 : 0);
      const rr = rad * b * (1 + (k ? (rnd() * 2 - 1) * wobble : 0));
      return [cx + ox + Math.cos(a) * rr, cy + oy + Math.sin(a) * rr];
    });
    shapes.push(blobD(pts));
  }
  shapes.push(shapes[0]);
  const times = shapes.map((_, i) => r(i / (shapes.length - 1))).join(";");
  const splines = shapes.slice(1).map(() => ".45 0 .55 1").join(";");
  return `<path d="${shapes[0]}" ${attrs}><animate attributeName="d" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="${times}" keySplines="${splines}" values="${shapes.join(";")}"/></path>`;
}

/** Three layered blots of one colour: bleed, body and a pooled core. */
function ink(doc, { cx, cy, rad, color, seed, blend, alpha = 1, dur = 28 }) {
  const g = doc.id("g");
  doc.defs.push(
    `<radialGradient id="${g}"><stop offset="0" stop-color="${color}" stop-opacity=".9"/><stop offset=".55" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
  );
  return (
    `<g style="mix-blend-mode:${blend}" opacity="${alpha}">` +
    blot({ cx, cy, rad: rad * 1.5, seed, dur: dur * 1.3, jit: 0.22, attrs: `fill="url(#${g})" opacity=".5"` }) +
    blot({ cx, cy, rad, seed: seed + 11, dur, attrs: `fill="${color}" opacity=".5"` }) +
    blot({ cx: cx + rad * 0.12, cy: cy - rad * 0.1, rad: rad * 0.56, seed: seed + 23, dur: dur * 0.8, jit: 0.36, attrs: `fill="${color}" opacity=".42"` }) +
    `</g>`
  );
}

function grain(doc, w, h, opacity = 0.5) {
  const id = doc.id("n");
  doc.defs.push(
    `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .09  0 0 0 0 .08  0 0 0 0 .06  0 0 0 .55 -.2"/></filter>`,
  );
  return `<rect width="${w}" height="${h}" filter="url(#${id})" opacity="${opacity}"/>`;
}

function seal(doc, x, y, size, T, attrs = "") {
  const q = size / 2;
  const fs = size * 0.36;
  const paper = THEMES.day.bg;
  const glyph = (ch, cx, cy) => doc.text(ch, { font: "jpB", size: fs, x: cx, y: cy + fs * 0.36, anchor: "middle", fill: paper });
  return (
    `<g transform="translate(${x} ${y})"><g ${attrs}>` +
    `<rect width="${size}" height="${size}" rx="${r(size * 0.14)}" fill="${T.shu}"/>` +
    `<rect x="${r(size * 0.07)}" y="${r(size * 0.07)}" width="${r(size * 0.86)}" height="${r(size * 0.86)}" rx="${r(size * 0.09)}" fill="none" stroke="${paper}" stroke-opacity=".55" stroke-width="1"/>` +
    glyph("メ", q + size * 0.2, q - size * 0.2) +
    glyph("オ", q + size * 0.2, q + size * 0.2) +
    glyph("キ", q - size * 0.2, q - size * 0.2) +
    glyph("印", q - size * 0.2, q + size * 0.2) +
    `</g></g>`
  );
}

const MARK =
  "M11.06.64C10.6 1.49.07 21.35.44 21.33c.5-.01 1.01 0 1.5.04.2.01.27-.09.35-.23C2.8 20.16 10.25 6.16 11.04 4.74c.78 1.42 8.17 15.42 8.67 16.4.08.14.15.24.35.23.5-.02.99-.04 1.49-.04.38.02-10.05-19.83-10.49-20.69ZM18.16 21.38c-.17-.37-.43-.82-.68-1.28-.14-.25-.17-.3-.67-.3-1.24 0-3.53-.02-5.75-.04-2.22.02-4.49.04-5.71.04-.5 0-.53.06-.66.3-.25.46-.5.9-.67 1.28.25 0 3.67 0 7.05-.02 3.39.02 6.82.02 7.09.02Z";

function mark(x, y, size, T) {
  return `<g transform="translate(${x} ${y})"><rect width="${size}" height="${size}" rx="${r(size * 0.2)}" fill="${T.shu}"/><path transform="translate(${r(size * 0.2)} ${r(size * 0.21)}) scale(${r(size / 37)})" fill="${THEMES.day.bg}" d="${MARK}"/></g>`;
}

/* ───────────────────────────── hero ───────────────────────────── */

function hero(T) {
  const W = 1200, H = 640;
  const doc = new Doc(W, H, "Meoki. I see sound and hear colour. 音を見て、色を聴く。");
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect width="${W}" height="${H}" rx="24"/></clipPath>`);
  doc.css.push(
    `.rise{animation:rise 1.5s cubic-bezier(.16,1,.3,1) both}@keyframes rise{from{transform:translateY(170px)}}`,
    `.fade{animation:fade 1.4s ease both}@keyframes fade{from{opacity:0}}`,
    `.ch{animation:ch .9s cubic-bezier(.16,1,.3,1) both}@keyframes ch{from{opacity:0;transform:translateY(-60px)}}`,
    `.stamp{transform-box:fill-box;transform-origin:center;animation:stamp .55s cubic-bezier(.2,1.5,.4,1) 2.9s both}@keyframes stamp{from{opacity:0;transform:scale(1.9) rotate(-16deg)}}`,
    `.b{transform-box:fill-box;transform-origin:50% 100%;animation:eq 1.1s ease-in-out infinite alternate}@keyframes eq{from{transform:scaleY(.1)}to{transform:scaleY(1)}}`,
    `.wave{animation:wave 2.6s linear infinite}@keyframes wave{to{transform:translateX(-64px)}}`,
    `.drop{transform-box:fill-box;transform-origin:center;animation:drop 7s cubic-bezier(.2,.7,.3,1) infinite}@keyframes drop{0%{transform:scale(.05);opacity:0}8%{opacity:.7}60%,100%{transform:scale(1);opacity:0}}`,
  );

  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${T.bg}"/>`);

  // the ink
  const spots = [
    [5, 560, 565, 118, 31], // sakura, low and left, behind the words
    [2, 770, 480, 112, 32], // yamabuki
    [4, 660, 118, 86, 33], // bamboo
    [0, 838, 262, 150, 34], // indigo
    [3, 1010, 110, 100, 35], // wisteria
    [1, 940, 478, 116, 36], // vermilion
  ];
  const soft = doc.id("f");
  doc.defs.push(`<filter id="${soft}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="5"/></filter>`);
  doc.add(`<g filter="url(#${soft})">`);
  spots.forEach(([i, cx, cy, rad, seed], k) =>
    doc.add(ink(doc, { cx, cy, rad, color: T.ink(i), seed, blend: T.blend, alpha: T.inkAlpha, dur: 22 + k * 3 })),
  );
  doc.add(`</g>`);
  // drops falling into the wash
  [[850, 300, 90, 0], [980, 180, 64, 2.4], [760, 450, 60, 4.6]].forEach(([cx, cy, rad, delay]) =>
    doc.add(`<circle class="drop" cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${T.fg}" stroke-opacity=".5" stroke-width="1.2" style="animation-delay:${delay}s"/>`),
  );
  doc.add(grain(doc, W, H, T.name === "day" ? 0.5 : 0.35));

  // top rule
  const mono = { font: "mono", size: 12.5, track: 0.14, fill: T.soft };
  doc.add(
    `<g class="fade">`,
    mark(56, 44, 34, T),
    doc.text("MEOKI", { ...mono, x: 104, y: 66, fill: T.fg }),
    doc.text("HOÀNG ĐÌNH SÁNG", { ...mono, x: 176, y: 66 }),
    doc.text("SAIGON  10.78°N 106.70°E", { ...mono, x: W - 56, y: 66, anchor: "end" }),
    `<line x1="56" y1="96" x2="${W - 56}" y2="96" stroke="${T.line}"/>`,
    `</g>`,
  );

  // headline
  const size = 124;
  const lines = [
    { y: 268, segs: [["I see ", "disp"], ["sound", "dispI"]] },
    { y: 396, segs: [["& hear ", "disp"], ["colour", "dispI"], [".", "disp"]] },
  ];
  const period = 720;
  const grad = doc.id("g");
  const stops = [0, 1, 2, 3, 4, 5, 0].map((i, k) => `<stop offset="${r(k / 6)}" stop-color="${i === 2 && T.name === "day" ? "#d98e0a" : T.ink(i)}"/>`).join("");
  const su = F.dispI.unitsPerEm / size;
  doc.defs.push(
    `<linearGradient id="${grad}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Math.round(period * su)}" y2="0" spreadMethod="repeat">${stops}<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${Math.round(period * su)} 0" dur="9s" repeatCount="indefinite"/></linearGradient>`,
  );
  lines.forEach((ln, i) => {
    const c = doc.id("c");
    doc.defs.push(`<clipPath id="${c}"><rect x="0" y="${ln.y - size * 0.92}" width="${W}" height="${size * 1.24}"/></clipPath>`);
    const segs = ln.segs.map(([s, f]) => [s, f, s === "colour" ? { fill: `url(#${grad})` } : {}]);
    const { svg, spans } = doc.line(segs, { size, x: 52, y: ln.y });
    doc.add(`<g clip-path="url(#${c})"><g class="rise" fill="${T.fg}" style="animation-delay:${0.25 + i * 0.16}s">${svg}</g></g>`);
    if (i === 0) {
      // sound, drawn as a travelling wave
      const { x, w } = spans[1];
      const wc = doc.id("c");
      doc.defs.push(`<clipPath id="${wc}"><rect x="${r(x + 4)}" y="${ln.y + 4}" width="${r(w - 6)}" height="30"/></clipPath>`);
      let d = `M${r(x - 10)} ${ln.y + 19}`;
      for (let k = 0; k < Math.ceil(w / 32) + 5; k++) d += `q8 ${k % 2 ? 9 : -9} 16 0t16 0`;
      doc.add(`<g clip-path="url(#${wc})" class="fade" style="animation-delay:1.3s"><path class="wave" d="${d}" fill="none" stroke="${T.shu}" stroke-width="2.6" stroke-linecap="round"/></g>`);
    }
  });

  // standfirst
  const sub = [
    "Software engineer in Ho Chi Minh City, working somewhere",
    "between language, light and code.",
  ];
  doc.add(`<g class="fade" style="animation-delay:1.1s" fill="${T.soft}">`);
  sub.forEach((s, i) => doc.add(doc.text(s, { font: "text", size: 21, x: 58, y: 468 + i * 30 })));
  doc.add(`</g>`);

  // the line in Japanese, set vertically, and the seal
  const cols = ["音を見て、", "色を聴く。"];
  let k = 0;
  cols.forEach((c, ci) => {
    doc.add(
      doc.vtext(c, {
        font: "jpB",
        size: 40,
        x: 1118 - ci * 62,
        y: 138 + ci * 44,
        fill: T.fg,
        each: () => `class="ch" style="animation-delay:${(1.2 + k++ * 0.13).toFixed(2)}s"`,
      }),
    );
  });
  doc.add(seal(doc, 1089, 388, 58, T, `class="stamp"`));

  // sound you can see
  const n = 104, bw = 6.2, gap = (W - 112 - n * bw) / (n - 1);
  const rnd = rng(9);
  doc.add(`<g class="fade" style="animation-delay:1.5s">`);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const env = 0.28 + 0.72 * Math.abs(Math.sin(t * 5.1 + 0.6) * Math.cos(t * 2.3 - 0.4)) * (0.6 + 0.4 * Math.sin(t * 13));
    const h = 10 + 62 * Math.max(0.12, env) * (0.7 + rnd() * 0.3);
    const seg = Math.min(4.999, t * 5), a = Math.floor(seg);
    const col = mix(T.ink(a), T.ink(a + 1), seg - a);
    doc.add(
      `<rect class="b" x="${r(56 + i * (bw + gap))}" y="${r(H - h)}" width="${bw}" height="${r(h)}" rx="2" fill="${col}" style="animation-duration:${(0.55 + rnd() * 0.9).toFixed(2)}s;animation-delay:-${(rnd() * 2).toFixed(2)}s"/>`,
    );
  }
  doc.add(`</g>`, `</g>`);
  doc.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="23.5" fill="none" stroke="${T.line}"/>`);
  doc.save(`hero-${T.name}.svg`);
}

/* ───────────────────────────── section headings ───────────────────────────── */

function heading(T, no, jp, en, slug) {
  const W = 1200, H = 76;
  const doc = new Doc(W, H, `${no} ${jp} ${en}`);
  doc.css.push(
    `.p{transform-box:fill-box;transform-origin:center;animation:p 3.2s ease-in-out infinite}@keyframes p{50%{transform:scale(2.1);opacity:.25}}`,
    `.l{stroke-dasharray:1200;animation:l 9s cubic-bezier(.6,0,.2,1) infinite}@keyframes l{0%{stroke-dashoffset:1200}35%,100%{stroke-dashoffset:0}}`,
  );
  const y = 52;
  let x = 2;
  doc.add(doc.text(no, { font: "mono", size: 13, x, y: y - 2, fill: T.shu, track: 0.1 }));
  x += 38;
  doc.add(doc.text(jp, { font: "jpB", size: 34, x, y, fill: T.fg }));
  x += measure(jp, "jpB", 34) + 18;
  doc.add(doc.text(en, { font: "dispI", size: 34, x, y, fill: T.soft }));
  x += measure(en, "dispI", 34) + 28;
  doc.add(
    `<line x1="${r(x)}" y1="${y - 11}" x2="${W - 14}" y2="${y - 11}" stroke="${T.line}"/>`,
    `<line class="l" x1="${r(x)}" y1="${y - 11}" x2="${W - 14}" y2="${y - 11}" stroke="${T.shu}" stroke-opacity=".55"/>`,
    `<circle class="p" cx="${W - 8}" cy="${y - 11}" r="3.5" fill="${T.shu}"/>`,
    `<circle cx="${W - 8}" cy="${y - 11}" r="3.5" fill="${T.shu}"/>`,
  );
  doc.save(`h-${slug}-${T.name}.svg`);
}

/* ───────────────────────────── works ───────────────────────────── */

const WORKS = [
  {
    slug: "aozora", numeral: "壱", title: "Aozora", jp: "青空", kind: "Desktop app", year: "2026",
    tagline: "An EPUB reader made for people learning Japanese. Hover a word for the dictionary, send it to Anki, and let VOICEVOX read the page aloud.",
    stack: ["Electron", "React", "TypeScript", "SQLite"],
    theme: { bg: "#dbe7f1", fg: "#12202e", wash: "#8fb9de" },
  },
  {
    slug: "moe2d", numeral: "弐", title: "moe2d", kind: "Open-source library", year: "2026",
    tagline: "Live2D characters that live on your web pages.",
    stack: ["TypeScript", "WebGL", "React", "npm"],
    theme: { bg: "#f1e1ee", fg: "#2d1436", wash: "#d79bd6" },
  },
  {
    slug: "gloss", numeral: "参", title: "Gloss", kind: "Tray app", year: "2026",
    tagline: "Select text anywhere. Press a hotkey. Read it in your language.",
    stack: ["Tauri 2", "Rust", "React"],
    theme: { bg: "#17140f", fg: "#f3efe6", wash: "#e2421f", dark: true },
  },
  {
    slug: "tmw-archive", numeral: "肆", title: "TMW Archive", jp: "書庫", kind: "Community library", year: "2026",
    tagline: "The books are on the shelf. The key is on Discord.",
    stack: ["Next.js", "PostgreSQL", "Meilisearch", "discord.js"],
    theme: { bg: "#e3ead9", fg: "#16240f", wash: "#8fb36a" },
  },
  {
    slug: "ranobe-hub", numeral: "伍", title: "Ranobe Hub", kind: "Web platform", year: "2025",
    tagline: "One tidy shelf for every light novel I get asked to share.",
    stack: ["Next.js", "Express", "MongoDB"],
    theme: { bg: "#f6e3d0", fg: "#2e1a0b", wash: "#f0a560" },
  },
  {
    slug: "ranobe-blog", numeral: "陸", title: "Ranobe Blog", kind: "Publication", year: "2024",
    tagline: "A quiet corner of the internet for light-novel thoughts.",
    stack: ["Next.js", "MDX", "Keystatic", "Tailwind"],
    theme: { bg: "#efe9d3", fg: "#26220f", wash: "#d9c26a" },
  },
  {
    slug: "toolkit-engine", numeral: "漆", title: "Toolkit Engine", kind: "Industrial software", year: "2025",
    tagline: "The control desk for buildings that think. Its sibling, Rhythm Glow, turns music into colour and sends it down the same wire.",
    stack: ["Electron", "React", "UDP", "Microsoft Store"],
    theme: { bg: "#131b33", fg: "#e9edf7", wash: "#3d6bff", dark: true },
  },
];

const ART = {
  aozora(doc, t, b) {
    // a page of vertical text, read aloud with a karaoke highlight
    const cols = ["吾輩は猫である。", "名前はまだ無い。", "どこで生れたか", "とんと見当がつかぬ。", "何でも薄暗い", "じめじめした所で", "ニャーニャー泣いて", "いた事だけは", "記憶している。"];
    const size = 23, pitch = 28, colGap = 41;
    const pw = cols.length * colGap + 34, ph = 10 * pitch + 44;
    const px = b.x, py = b.y + (b.h - ph) / 2;
    const total = cols.join("").length, T = 30, step = (T * 0.8) / total;
    doc.css.push(
      `.k{animation:k ${T}s linear infinite}@keyframes k{0%{opacity:.26;fill:${t.fg}}.8%{opacity:1;fill:#d9381e}5%{fill:#d9381e}9%{fill:${t.fg}}84%{opacity:1}90%,100%{opacity:.26}}`,
      `.bob{animation:bob 5s ease-in-out infinite}@keyframes bob{50%{transform:translateY(-7px)}}`,
      `.v{transform-box:fill-box;transform-origin:50% 50%;animation:v .9s ease-in-out infinite alternate}@keyframes v{from{transform:scaleY(.2)}}`,
    );
    doc.add(
      `<rect x="${px + 5}" y="${py + 7}" width="${pw}" height="${ph}" rx="10" fill="${t.fg}" opacity=".1"/>`,
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10" fill="#f8fbfd"/>`,
    );
    let k = 0;
    cols.forEach((c, ci) => {
      const x = px + pw - 17 - colGap / 2 - ci * colGap;
      doc.add(`<line x1="${x + colGap / 2}" y1="${py + 18}" x2="${x + colGap / 2}" y2="${py + ph - 18}" stroke="${t.fg}" stroke-opacity=".07"/>`);
      doc.add(
        doc.vtext(c, {
          size, pitch, x, y: py + 22, fill: t.fg,
          each: () => `class="k" style="animation-delay:${(k++ * step - T).toFixed(2)}s"`,
        }),
      );
    });
    // dictionary popup for 猫
    const cx = px + pw + 22, cy = py + 22 + 3 * pitch - 34, cw = b.x + b.w - cx, chh = 178;
    doc.add(
      `<g class="bob">`,
      `<path d="M${cx - 9} ${cy + 46}l10-8v16z" fill="#fff"/>`,
      `<rect x="${cx + 4}" y="${cy + 6}" width="${cw}" height="${chh}" rx="12" fill="${t.fg}" opacity=".12"/>`,
      `<rect x="${cx}" y="${cy}" width="${cw}" height="${chh}" rx="12" fill="#fff"/>`,
      doc.text("猫", { font: "jpB", size: 44, x: cx + 18, y: cy + 58, fill: t.fg }),
      doc.text("ねこ", { font: "jp", size: 15, x: cx + 72, y: cy + 38, fill: "#d9381e" }),
      doc.text("neko", { font: "mono", size: 11.5, x: cx + 72, y: cy + 58, fill: t.fg, attrs: `opacity=".55"` }),
      `<line x1="${cx + 18}" y1="${cy + 78}" x2="${cx + cw - 18}" y2="${cy + 78}" stroke="${t.fg}" stroke-opacity=".12"/>`,
      doc.text("a cat", { font: "textI", size: 21, x: cx + 18, y: cy + 108, fill: t.fg }),
      `<rect x="${cx + 18}" y="${cy + 128}" width="74" height="28" rx="14" fill="${t.fg}"/>`,
      doc.text("+ ANKI", { font: "mono", size: 11, track: 0.1, x: cx + 55, y: cy + 146, anchor: "middle", fill: "#fff" }),
    );
    for (let i = 0; i < 7; i++)
      doc.add(`<rect class="v" x="${cx + 104 + i * 6}" y="${cy + 132}" width="3" height="20" rx="1.5" fill="${mix(t.wash, t.fg, 0.35)}" style="animation-delay:-${(i * 0.23).toFixed(2)}s;animation-duration:${(0.5 + (i % 3) * 0.2).toFixed(1)}s"/>`);
    doc.add(`</g>`);
  },

  moe2d(doc, t, b) {
    // a little character that blinks and follows the pointer
    const cx = b.x + b.w - 150, cy = b.y + b.h / 2 + 8;
    doc.css.push(
      `.cur{animation:cur 10s cubic-bezier(.5,0,.3,1) infinite}@keyframes cur{0%,100%{transform:translate(0,0)}22%{transform:translate(-150px,46px)}45%{transform:translate(-250px,-44px)}70%{transform:translate(-80px,-66px)}86%{transform:translate(40px,50px)}}`,
      `.look{animation:look 10s cubic-bezier(.5,0,.3,1) infinite}@keyframes look{0%,100%{transform:translate(4px,1px)}22%{transform:translate(-5px,4px)}45%{transform:translate(-8px,-3px)}70%{transform:translate(-2px,-5px)}86%{transform:translate(6px,4px)}}`,
      `.blink{transform-box:fill-box;transform-origin:center;animation:blink 4.6s infinite}@keyframes blink{0%,91%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}`,
      `.sway{transform-box:fill-box;transform-origin:50% 100%;animation:sway 3.4s ease-in-out infinite alternate}@keyframes sway{from{transform:rotate(-9deg)}to{transform:rotate(11deg)}}`,
      `.hop{animation:hop 3.4s ease-in-out infinite}@keyframes hop{50%{transform:translateY(-5px)}}`,
    );
    const body = mix(t.wash, "#ffffff", 0.25);
    doc.add(
      `<ellipse cx="${cx}" cy="${cy + 78}" rx="66" ry="7" fill="${t.fg}" opacity=".12"/>`,
      `<g class="hop">`,
      `<path class="sway" d="M${cx - 2} ${cy - 66}c-4-18 8-30 22-28-8 4-12 12-10 26z" fill="${mix(t.wash, t.fg, 0.2)}"/>`,
      blot({ cx, cy: cy + 4, rad: 74, seed: 77, n: 10, jit: 0.06, wobble: 0.07, drift: 0.02, dur: 7, attrs: `fill="${body}"` }),
      `<ellipse cx="${cx - 24}" cy="${cy - 30}" rx="20" ry="10" fill="#fff" opacity=".45" transform="rotate(-24 ${cx - 24} ${cy - 30})"/>`,
      `<g class="look">`,
      ...[-27, 27].map(
        (dx) =>
          `<g class="blink"><ellipse cx="${cx + dx}" cy="${cy}" rx="10.5" ry="15" fill="${t.fg}"/><circle cx="${cx + dx + 3.5}" cy="${cy - 6}" r="4" fill="#fff"/><circle cx="${cx + dx - 3}" cy="${cy + 6}" r="1.8" fill="#fff" opacity=".8"/></g>`,
      ),
      `<path d="M${cx - 8} ${cy + 22}q4 6 8 0q4 6 8 0" fill="none" stroke="${t.fg}" stroke-width="2.2" stroke-linecap="round"/>`,
      `</g>`,
      `<ellipse cx="${cx - 46}" cy="${cy + 18}" rx="11" ry="6" fill="#ed809e" opacity=".6"/>`,
      `<ellipse cx="${cx + 46}" cy="${cy + 18}" rx="11" ry="6" fill="#ed809e" opacity=".6"/>`,
      `</g>`,
      `<g class="cur"><path transform="translate(${cx - 110} ${cy - 10})" d="M0 0v22l6-5.5 4.2 9.5 4-1.8-4.2-9.3H18z" fill="${t.fg}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></g>`,
    );
  },

  gloss(doc, t, b) {
    // select a phrase, a translation appears beside it
    const size = 27, x0 = b.x + 150, y0 = b.y + 44;
    const pre = "窓から", sel = "木漏れ日", post = "が差し込む。";
    const sx = x0 + measure(pre, "jp", size), sw = measure(sel, "jp", size);
    const T = 9;
    doc.css.push(
      `.sel{transform-box:fill-box;transform-origin:0 50%;animation:sel ${T}s cubic-bezier(.6,0,.2,1) infinite}@keyframes sel{0%,6%{transform:scaleX(0);opacity:1}20%,88%{transform:scaleX(1);opacity:1}95%,100%{transform:scaleX(1);opacity:0}}`,
      `.pop{animation:pop ${T}s cubic-bezier(.16,1,.3,1) infinite}@keyframes pop{0%,24%{opacity:0;transform:translateY(10px)}32%,88%{opacity:1;transform:none}95%,100%{opacity:0;transform:none}}`,
      `.key{animation:key ${T}s infinite}@keyframes key{0%,19%,29%,100%{opacity:.35}22%,26%{opacity:1}}`,
      `.car{animation:car 1s steps(1) infinite}@keyframes car{50%{opacity:0}}`,
    );
    doc.add(
      `<rect class="sel" x="${r(sx - 3)}" y="${y0 - size + 2}" width="${r(sw + 6)}" height="${size + 8}" rx="4" fill="${t.wash}" opacity=".5"/>`,
      doc.text(pre + sel + post, { font: "jp", size, x: x0, y: y0, fill: t.fg }),
    );
    // keycaps
    const keys = ["Ctrl", "Alt", "T"];
    let kx = b.x + 4;
    doc.add(`<g class="key">`);
    keys.forEach((k) => {
      const w = measure(k, "mono", 11.5) + 20;
      doc.add(
        `<rect x="${r(kx)}" y="${y0 - 22}" width="${r(w)}" height="27" rx="6" fill="none" stroke="${t.fg}" stroke-opacity=".7"/>`,
        doc.text(k, { font: "mono", size: 11.5, x: kx + w / 2, y: y0 - 4.5, anchor: "middle", fill: t.fg }),
      );
      kx += w + 6;
    });
    doc.add(`</g>`);
    const pw = 318, ph = 92, px = sx - 6, py = y0 + 24;
    doc.add(
      `<g class="pop">`,
      `<path d="M${r(sx + 20)} ${py + 1}l9-9 9 9z" fill="#2a241b"/>`,
      `<rect x="${r(px)}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="#2a241b" stroke="${t.fg}" stroke-opacity=".14"/>`,
      doc.text("JA → EN", { font: "mono", size: 10.5, track: 0.14, x: px + 18, y: py + 26, fill: t.wash }),
      doc.text("sunlight filtering through leaves", { font: "textI", size: 19.5, x: px + 18, y: py + 54, fill: t.fg }),
      doc.text("komorebi · noun", { font: "mono", size: 10.5, track: 0.06, x: px + 18, y: py + 76, fill: t.fg, attrs: `opacity=".5"` }),
      `<rect class="car" x="${r(px + 18 + measure("sunlight filtering through leaves", "textI", 19.5) + 4)}" y="${py + 38}" width="2" height="20" fill="${t.wash}"/>`,
      `</g>`,
    );
  },

  "tmw-archive"(doc, t, b) {
    // a shelf, and a key that lasts an hour
    const rnd = rng(21);
    const base = b.y + b.h - 6;
    doc.css.push(
      `.pick{animation:pick 17s cubic-bezier(.3,0,.2,1) infinite}@keyframes pick{0%,7%,100%{transform:none}2.5%,4.5%{transform:translateY(-20px)}}`,
      `.ring{animation:ring 24s linear infinite}@keyframes ring{to{stroke-dashoffset:-239}}`,
      `.bell{transform-box:fill-box;transform-origin:50% 0;animation:bell 6s ease-in-out infinite}@keyframes bell{0%,30%,100%{transform:rotate(0)}5%{transform:rotate(14deg)}10%{transform:rotate(-11deg)}15%{transform:rotate(7deg)}20%{transform:rotate(-4deg)}}`,
    );
    let x = b.x + 2;
    const tones = [t.fg, mix(t.wash, t.fg, 0.55), mix(t.wash, t.fg, 0.25), t.wash, "#339978", mix(t.wash, "#ffffff", 0.35), "#d9381e"];
    let i = 0;
    const limit = b.x + b.w - 150;
    while (x < limit) {
      const w = 15 + Math.floor(rnd() * 14), h = 78 + Math.floor(rnd() * 66);
      let tone = tones[Math.floor(rnd() * (tones.length - 1))];
      if (i === 6) tone = tones[6];
      const light = tone === t.fg || tone === tones[1] || tone === "#d9381e" || tone === "#339978";
      doc.add(
        `<g class="pick" style="animation-delay:${(((i * 7) % 17) - 17).toFixed(1)}s">`,
        `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="2.5" fill="${tone}"/>`,
        `<rect x="${x + 3}" y="${base - h + 12}" width="${w - 6}" height="2" fill="${light ? "#fff" : t.fg}" opacity=".5"/>`,
        `<rect x="${x + w / 2 - 1}" y="${base - h + 24}" width="2" height="${Math.round(h * 0.34)}" fill="${light ? "#fff" : t.fg}" opacity=".4"/>`,
        `<rect x="${x + 3}" y="${base - 14}" width="${w - 6}" height="2" fill="${light ? "#fff" : t.fg}" opacity=".5"/>`,
        `</g>`,
      );
      x += w + 3;
      i++;
    }
    doc.add(`<rect x="${b.x - 6}" y="${base}" width="${limit - b.x + 22}" height="4" rx="2" fill="${t.fg}"/>`);
    const cx = b.x + b.w - 62, cy = b.y + b.h / 2 + 4;
    doc.add(
      `<circle cx="${cx}" cy="${cy}" r="46" fill="${mix(t.bg, "#ffffff", 0.5)}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="${t.fg}" stroke-opacity=".14" stroke-width="5"/>`,
      `<circle class="ring" cx="${cx}" cy="${cy}" r="38" fill="none" stroke="#d9381e" stroke-width="5" stroke-linecap="round" stroke-dasharray="239" transform="rotate(-90 ${cx} ${cy})"/>`,
      `<g class="bell">` + doc.text("鍵", { font: "jpB", size: 30, x: cx, y: cy + 4, anchor: "middle", fill: t.fg }) + `</g>`,
      doc.text("60 MIN", { font: "mono", size: 9.5, track: 0.12, x: cx, y: cy + 22, anchor: "middle", fill: t.fg, attrs: `opacity=".6"` }),
    );
  },

  "ranobe-hub"(doc, t, b) {
    // covers arriving on the shelf
    const cols = 8, rows = 2, cw = 46, chh = 66, gx = 12, gy = 14;
    const x0 = b.x + b.w - cols * (cw + gx) + gx, y0 = b.y + (b.h - rows * (chh + gy) + gy) / 2;
    const tones = ["#214085", "#e04521", "#f2ad1a", "#8566c2", "#339978", "#ed809e", t.fg, "#f0a560"];
    doc.css.push(
      `.cov{transform-box:fill-box;transform-origin:50% 100%;animation:cov 8s cubic-bezier(.16,1,.3,1) infinite}@keyframes cov{0%{opacity:0;transform:translateY(16px) rotate(4deg)}7%,82%{opacity:1;transform:none}90%,100%{opacity:0;transform:translateY(-10px)}}`,
    );
    const rnd = rng(5);
    for (let rI = 0; rI < rows; rI++)
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * (cw + gx), y = y0 + rI * (chh + gy);
        const tone = tones[(c * 3 + rI * 5 + Math.floor(rnd() * 2)) % tones.length];
        const hh = 18 + Math.floor(rnd() * 22);
        doc.add(
          `<g class="cov" style="animation-delay:${((c + rI * 2.5) * 0.22 - 8).toFixed(2)}s">`,
          `<rect x="${x + 3}" y="${y + 4}" width="${cw}" height="${chh}" rx="4" fill="${t.fg}" opacity=".14"/>`,
          `<rect x="${x}" y="${y}" width="${cw}" height="${chh}" rx="4" fill="${tone}"/>`,
          `<rect x="${x}" y="${y}" width="${cw}" height="${hh}" rx="4" fill="#fff" opacity=".28"/>`,
          `<rect x="${x + 7}" y="${y + chh - 16}" width="${cw - 20}" height="2.5" rx="1" fill="#fff" opacity=".8"/>`,
          `<rect x="${x + 7}" y="${y + chh - 10}" width="${cw - 28}" height="2.5" rx="1" fill="#fff" opacity=".55"/>`,
          `</g>`,
        );
      }
  },

  "ranobe-blog"(doc, t, b) {
    // an essay inking itself in, and a mascot who watches you read
    const pw = 330, ph = b.h - 6, px = b.x + b.w - pw, py = b.y + 3;
    doc.css.push(
      `.ln{transform-box:fill-box;transform-origin:0 50%;animation:ln 11s cubic-bezier(.6,0,.2,1) infinite}@keyframes ln{0%{transform:scaleX(0);opacity:1}9%,84%{transform:scaleX(1);opacity:1}91%{transform:scaleX(1);opacity:0}100%{transform:scaleX(0);opacity:0}}`,
      `.eye{animation:eye 5.5s cubic-bezier(.6,0,.3,1) infinite}@keyframes eye{0%,100%{transform:translate(-3px,-1px)}45%{transform:translate(3px,-1px)}55%{transform:translate(3px,1.5px)}}`,
      `.peek{animation:peek 11s cubic-bezier(.3,1.3,.5,1) infinite}@keyframes peek{0%,8%{transform:translateY(34px)}16%,86%{transform:none}94%,100%{transform:translateY(34px)}}`,
    );
    const clip = doc.id("c");
    doc.defs.push(`<clipPath id="${clip}"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10"/></clipPath>`);
    doc.add(
      `<rect x="${px + 5}" y="${py + 6}" width="${pw}" height="${ph}" rx="10" fill="${t.fg}" opacity=".1"/>`,
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10" fill="#fbf8ea"/>`,
      doc.text("読", { font: "jpB", size: 50, x: px + 20, y: py + 62, fill: "#d9381e" }),
    );
    const widths = [176, 138, 0, 290, 270, 284, 190];
    const tx = [86, 86, 0, 20, 20, 20, 20];
    let y = py + 28;
    widths.forEach((w, i) => {
      if (!w) return void (y += 16);
      const head = i < 2;
      doc.add(
        `<rect class="ln" x="${px + tx[i]}" y="${y}" width="${w}" height="${head ? 11 : 6.5}" rx="3" fill="${t.fg}" opacity="${head ? 0.9 : 0.34}" style="animation-delay:${(i * 0.5 - 11).toFixed(1)}s"/>`,
      );
      y += head ? 22 : 17;
    });
    const mx = px + pw - 62, my = py + ph - 20;
    doc.add(
      `<g clip-path="url(#${clip})"><g class="peek">`,
      `<path d="M${mx - 34} ${my + 30}v-22q0-26 34-26t34 26v22z" fill="${t.fg}"/>`,
      `<path d="M${mx - 32} ${my - 4}l4-24 18 12zM${mx + 32} ${my - 4}l-4-24-18 12z" fill="${t.fg}"/>`,
      `<ellipse cx="${mx - 13}" cy="${my + 4}" rx="7.5" ry="8.5" fill="#fbf8ea"/><ellipse cx="${mx + 13}" cy="${my + 4}" rx="7.5" ry="8.5" fill="#fbf8ea"/>`,
      `<g class="eye"><ellipse cx="${mx - 13}" cy="${my + 5}" rx="3.2" ry="5" fill="${t.fg}"/><ellipse cx="${mx + 13}" cy="${my + 5}" rx="3.2" ry="5" fill="${t.fg}"/></g>`,
      `</g></g>`,
    );
  },

  "toolkit-engine"(doc, t, b) {
    // a light matrix driven by a spectrum
    const cols = 28, rows = 7, s = 13, g = 6;
    const x0 = b.x + b.w - cols * (s + g) + g, y0 = b.y + (b.h - rows * (s + g) + g) / 2;
    doc.css.push(
      `.c{transform-box:fill-box;transform-origin:center;animation:c 2.6s ease-in-out infinite}@keyframes c{0%,100%{opacity:.1;transform:scale(.78)}50%{opacity:1;transform:scale(1)}}`,
    );
    for (let c = 0; c < cols; c++) {
      const hue = Math.round(215 + (c / cols) * 290) % 360;
      const col = `hsl(${hue} 92% 64%)`;
      for (let rI = 0; rI < rows; rI++) {
        const d = (Math.sin(c * 0.42) * 0.9 + c * 0.09 + (rows - rI) * 0.24) % 2.6;
        doc.add(
          `<rect class="c" x="${r(x0 + c * (s + g))}" y="${r(y0 + rI * (s + g))}" width="${s}" height="${s}" rx="3.5" fill="${col}" style="animation-delay:-${(d + 2.6).toFixed(2)}s"/>`,
        );
      }
    }
  },
};

function workCard(work, wide) {
  const W = wide ? 1200 : 600, H = wide ? 440 : 440;
  const t = work.theme;
  const doc = new Doc(W, H, `${work.title}. ${work.tagline}`);
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect width="${W}" height="${H}" rx="22"/></clipPath>`);
  const P = 36;
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${t.bg}"/>`);
  // the wash behind the picture
  const blend = t.dark ? "screen" : "multiply";
  doc.add(
    ink(doc, { cx: W - (wide ? 330 : 150), cy: wide ? 210 : 130, rad: wide ? 210 : 150, color: t.wash, seed: work.slug.length * 13, blend, alpha: t.dark ? 0.5 : 0.75, dur: 20 }),
  );

  // text block, measured from the bottom up
  const textW = wide ? 470 : W - P * 2;
  const tagSize = 17.5, lead = 25;
  const tag = wrap(work.tagline, "text", tagSize, textW);
  let x = P;
  const chipY = H - 34;
  doc.add(`<g>`);
  work.stack.forEach((s) => {
    const w = measure(s.toUpperCase(), "mono", 10.5, 0.1) + 22;
    doc.add(
      `<rect x="${r(x)}" y="${chipY - 16}" width="${r(w)}" height="24" rx="12" fill="none" stroke="${t.fg}" stroke-opacity=".3"/>`,
      doc.text(s.toUpperCase(), { font: "mono", size: 10.5, track: 0.1, x: x + 11, y: chipY, fill: t.fg, attrs: `opacity=".8"` }),
    );
    x += w + 6;
  });
  doc.add(`</g>`);
  const tagBottom = chipY - 38;
  tag.forEach((ln, i) =>
    doc.add(doc.text(ln, { font: "text", size: tagSize, x: P, y: tagBottom - (tag.length - 1 - i) * lead, fill: t.fg, attrs: `opacity=".78"` })),
  );
  const titleSize = wide ? 76 : 56;
  const titleY = tagBottom - (tag.length - 1) * lead - 36;
  doc.add(doc.text(work.title, { font: "disp", size: titleSize, x: P - 2, y: titleY, fill: t.fg }));
  if (work.jp)
    doc.add(doc.text(work.jp, { font: "jp", size: titleSize * 0.36, x: P + measure(work.title, "disp", titleSize) + 14, y: titleY - titleSize * 0.02, fill: t.fg, attrs: `opacity=".55"` }));

  // header row
  doc.add(
    `<circle cx="${P + 16}" cy="${P + 14}" r="17" fill="none" stroke="${t.fg}" stroke-opacity=".35"/>`,
    doc.text(work.numeral, { font: "jpB", size: 17, x: P + 16, y: P + 20, anchor: "middle", fill: t.fg }),
  );
  const meta = `${work.kind}  ·  ${work.year}`.toUpperCase();
  if (wide) doc.add(doc.text(meta, { font: "mono", size: 11.5, track: 0.14, x: P + 46, y: P + 18, fill: t.fg, attrs: `opacity=".65"` }));
  else doc.add(doc.text(meta, { font: "mono", size: 11.5, track: 0.14, x: W - P, y: P + 18, anchor: "end", fill: t.fg, attrs: `opacity=".65"` }));

  // the picture
  const box = wide
    ? { x: 560, y: 36, w: W - 560 - P, h: H - 72 }
    : { x: P, y: 80, w: W - P * 2, h: titleY - titleSize * 0.82 - 80 - 14 };
  ART[work.slug](doc, t, box);

  doc.add(`</g>`);
  doc.add(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" fill="none" stroke="${t.dark ? "rgba(243,239,230,.16)" : "rgba(23,20,15,.1)"}"/>`);
  doc.save(`work-${work.slug}.svg`);
}

/* ───────────────────────────── toolbox ───────────────────────────── */

const TOOLBOX = [
  { title: "Languages", jp: "言語", items: ["TypeScript", "JavaScript", "Rust", "Python", "C / C++", "Lua"] },
  { title: "Interface", jp: "画面", items: ["React", "Next.js", "Tailwind", "GSAP", "WebGL", "shadcn/ui"] },
  { title: "Desktop & systems", jp: "基盤", items: ["Electron", "Tauri", "Node.js", "PostgreSQL", "Prisma", "Docker"] },
  { title: "Design", jp: "意匠", items: ["Figma", "Photoshop", "Illustrator", "Lightroom", "After Effects"] },
];
const MARQUEE = [
  ["TypeScript", "Electron", "React", "Rust", "Next.js", "WebGL"],
  ["Figma", "Tauri", "Node.js", "GSAP", "Python", "Tailwind"],
];

function toolbox(T) {
  const W = 1200, H = 560;
  const doc = new Doc(W, H, "Toolbox: " + TOOLBOX.map((c) => `${c.title}: ${c.items.join(", ")}`).join(". "));
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect width="${W}" height="${H}" rx="22"/></clipPath>`);
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${T.bg}"/>`);
  doc.add(
    ink(doc, { cx: 1120, cy: 60, rad: 120, color: T.ink(3), seed: 91, blend: T.blend, alpha: T.inkAlpha * 0.6, dur: 24 }),
    ink(doc, { cx: 60, cy: 330, rad: 100, color: T.ink(4), seed: 92, blend: T.blend, alpha: T.inkAlpha * 0.5, dur: 27 }),
  );
  doc.css.push(
    `.it{animation:it 12s ease-in-out infinite}@keyframes it{0%,100%{opacity:.62}4%,10%{opacity:1}16%{opacity:.62}}`,
    `.dot{animation:dot 12s ease-in-out infinite}@keyframes dot{0%,100%{opacity:0;transform:translateX(-6px)}4%,10%{opacity:1;transform:none}16%{opacity:0}}`,
  );
  const P = 56, colW = (W - P * 2) / 4;
  TOOLBOX.forEach((col, ci) => {
    const x = P + ci * colW;
    doc.add(
      doc.text(col.jp, { font: "jpB", size: 40, x, y: 92, fill: T.fg }),
      doc.text(col.title.toUpperCase(), { font: "mono", size: 11, track: 0.14, x: x + 96, y: 88, fill: T.soft }),
      `<line x1="${x}" y1="116" x2="${x + colW - 34}" y2="116" stroke="${T.line}"/>`,
    );
    col.items.forEach((it, i) => {
      const y = 156 + i * 34;
      const delay = (((ci * 3 + i * 2) % 12) - 12).toFixed(1);
      doc.add(
        `<circle class="dot" cx="${x + 4}" cy="${y - 7}" r="3" fill="${T.shu}" style="animation-delay:${delay}s"/>`,
        `<g class="it" fill="${T.fg}" style="animation-delay:${delay}s">` +
          // Fraunces builds "+" from a rotated component that fontkit misplaces, so borrow the mono one
          doc.line(it.split(/([+]+)/).filter(Boolean).map((p) => [p, p[0] === "+" ? "mono" : "text"]), { size: 22, x: x + 18, y }).svg +
          `</g>`,
      );
    });
  });
  doc.add(`<line x1="0" y1="376" x2="${W}" y2="376" stroke="${T.line}"/>`);
  // two rows of type drifting past each other
  MARQUEE.forEach((row, ri) => {
    const size = 62, y = 446 + ri * 76;
    let one = "", pen = 0;
    row.forEach((it, i) => {
      const outline = (i + ri) % 2 === 1;
      one += doc.text(it, { font: outline ? "dispI" : "disp", size, x: pen, y, ...(outline ? { stroke: T.fg } : { fill: T.fg }) });
      pen += measure(it, outline ? "dispI" : "disp", size) + 30;
      one += `<circle cx="${r(pen)}" cy="${y - 19}" r="5" fill="${T.ink((i + ri * 3) % 6)}"/>`;
      pen += 35;
    });
    const kf = `m${ri}`;
    doc.css.push(
      `.${kf}{animation:${kf} ${46 + ri * 8}s linear infinite${ri ? " reverse" : ""}}@keyframes ${kf}{to{transform:translateX(-${r(pen)}px)}}`,
    );
    doc.add(`<g class="${kf}" opacity="${ri ? 0.5 : 0.9}">${one}<g transform="translate(${r(pen)} 0)">${one}</g></g>`);
  });
  doc.add(`</g>`, `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" fill="none" stroke="${T.line}"/>`);
  doc.save(`toolbox-${T.name}.svg`);
}

/* ───────────────────────────── path ───────────────────────────── */

const PATH = [
  { year: "2016", title: "Freelance graphic designer", body: "The first creations turned into the first cash. Every stumble since has been paving the same road." },
  { year: "2019", title: "University of Information Technology, VNU-HCM", body: "Four years of security, malware and networks. Web development crept in on the side and never left." },
  { year: "2023", title: "Cybersecurity engineering intern, then graduate", body: "Theory met production. Left with a degree and a preference for building things over breaking them." },
  { year: "2024", title: "Software engineer, full-stack", body: "A real job, with real deadlines. Desktop apps that talked to actual hardware, and shipping taught me what lectures could not." },
  { year: "Now", title: "Full-stack web, and open source after hours", body: "Shareholder value by day. By night Aozora, moe2d, Gloss: tools for Japanese, light novels, and software that feels alive." },
];

function pathSheet(T) {
  const W = 1200, P = 56, colW = (W - P * 2) / PATH.length, tw = colW - 30;
  const blocks = PATH.map((p) => ({ ...p, t: wrap(p.title, "text", 18.5, tw), b: wrap(p.body, "text", 14.5, tw) }));
  const tall = Math.max(...blocks.map((b) => b.t.length * 25 + b.b.length * 21.5));
  const lineY = 150, H = Math.round(lineY + 50 + tall + 46);
  const doc = new Doc(W, H, "Path: " + PATH.map((p) => `${p.year}, ${p.title}`).join(". "));
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect width="${W}" height="${H}" rx="22"/></clipPath>`);
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${T.bg}"/>`);
  doc.add(
    ink(doc, { cx: 1090, cy: H - 20, rad: 130, color: T.ink(1), seed: 61, blend: T.blend, alpha: T.inkAlpha * 0.55, dur: 25 }),
    ink(doc, { cx: 150, cy: 30, rad: 100, color: T.ink(2), seed: 62, blend: T.blend, alpha: T.inkAlpha * 0.5, dur: 29 }),
  );
  const D = 15, span = W - P * 2 - 30;
  doc.css.push(
    `.run{animation:run ${D}s cubic-bezier(.45,0,.55,1) infinite}@keyframes run{0%{transform:translateX(0);opacity:0}4%{opacity:1}80%{transform:translateX(${span}px);opacity:1}86%,100%{transform:translateX(${span}px);opacity:0}}`,
    `.trail{stroke-dasharray:${span};animation:trail ${D}s cubic-bezier(.45,0,.55,1) infinite}@keyframes trail{0%{stroke-dashoffset:${span};opacity:1}80%{stroke-dashoffset:0;opacity:1}92%,100%{stroke-dashoffset:0;opacity:0}}`,
    `.nd{transform-box:fill-box;transform-origin:center;animation:nd ${D}s ease-out infinite}@keyframes nd{0%{transform:scale(1);opacity:.9}9%{transform:scale(3.4);opacity:0}100%{transform:scale(3.4);opacity:0}}`,
    `.yr{animation:yr ${D}s ease infinite}@keyframes yr{0%{fill:${T.shu}}14%,100%{fill:${T.fg}}}`,
    `.now{transform-box:fill-box;transform-origin:center;animation:now 2.4s ease-out infinite}@keyframes now{from{transform:scale(1);opacity:.8}to{transform:scale(3.6);opacity:0}}`,
  );
  const x0 = P + 8;
  doc.add(
    `<line x1="${x0}" y1="${lineY}" x2="${W - P}" y2="${lineY}" stroke="${T.line}" stroke-width="1.5"/>`,
    `<line class="trail" x1="${x0}" y1="${lineY}" x2="${x0 + span}" y2="${lineY}" stroke="${T.shu}" stroke-width="2" stroke-linecap="round"/>`,
  );
  // when the runner passes each stop (inverse of ease-in-out, close enough by sampling)
  const ease = (t) => {
    // cubic-bezier(.45,0,.55,1) sampled
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      const bx = 3 * (1 - m) * (1 - m) * m * 0.45 + 3 * (1 - m) * m * m * 0.55 + m * m * m;
      bx < t ? (lo = m) : (hi = m);
    }
    const m = (lo + hi) / 2;
    return 3 * (1 - m) * m * m + m * m * m;
  };
  const when = (frac) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      ease(m) < frac ? (lo = m) : (hi = m);
    }
    return ((lo + hi) / 2) * D * 0.8;
  };
  blocks.forEach((p, i) => {
    const x = x0 + i * colW;
    const at = when((i * colW) / span);
    const delay = (at - D).toFixed(2);
    doc.add(
      doc.text(p.year, { font: i === blocks.length - 1 ? "dispI" : "disp", size: 60, x: x - 3, y: lineY - 34, fill: T.fg, attrs: `class="yr" style="animation-delay:${delay}s"` }),
      `<circle class="nd" cx="${x}" cy="${lineY}" r="6" fill="${T.shu}" style="animation-delay:${delay}s"/>`,
      i === blocks.length - 1 ? `<circle class="now" cx="${x}" cy="${lineY}" r="6" fill="${T.shu}"/>` : "",
      `<circle cx="${x}" cy="${lineY}" r="6" fill="${T.bg}" stroke="${T.fg}" stroke-width="1.6"/>`,
      `<circle cx="${x}" cy="${lineY}" r="2.4" fill="${i === blocks.length - 1 ? T.shu : T.fg}"/>`,
    );
    let y = lineY + 50;
    p.t.forEach((ln) => {
      doc.add(doc.text(ln, { font: "text", size: 18.5, x, y, fill: T.fg }));
      y += 25;
    });
    y += 6;
    p.b.forEach((ln) => {
      doc.add(doc.text(ln, { font: "text", size: 14.5, x, y, fill: T.soft }));
      y += 21.5;
    });
  });
  doc.add(`<circle class="run" cx="${x0}" cy="${lineY}" r="5" fill="${T.shu}"/>`);
  doc.add(`</g>`, `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" fill="none" stroke="${T.line}"/>`);
  doc.save(`path-${T.name}.svg`);
}

/* ───────────────────────────── contact ───────────────────────────── */

const CHIPS = [
  { slug: "site", label: "Web", handle: "meoki.vn", primary: true },
  { slug: "mail", label: "Mail", handle: "hi@meoki.vn" },
  { slug: "x", label: "X", handle: "@meokiiii" },
  { slug: "instagram", label: "Instagram", handle: "@meokisama" },
  { slug: "discord", label: "Discord", handle: "meoki" },
  { slug: "facebook", label: "Facebook", handle: "slytherinnn" },
];

function chip(c) {
  const H = 52;
  const lw = measure(c.label.toUpperCase(), "mono", 10.5, 0.14);
  const hw = measure(c.handle, "text", 20);
  const W = Math.ceil(22 + lw + 14 + hw + 46);
  const doc = new Doc(W, H, `${c.label}: ${c.handle}`);
  const bg = c.primary ? "#d9381e" : "#17140f", fg = "#f3efe6";
  doc.css.push(`.a{animation:a 2.8s cubic-bezier(.6,0,.3,1) infinite}@keyframes a{0%,55%{transform:none;opacity:1}75%{transform:translate(9px,-9px);opacity:0}76%{transform:translate(-9px,9px);opacity:0}100%{transform:none;opacity:1}}`);
  const ax = W - 30, ay = H / 2;
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect x="${ax - 9}" y="${ay - 9}" width="18" height="18"/></clipPath>`);
  doc.add(
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${H / 2 - 0.5}" fill="${bg}" stroke="${fg}" stroke-opacity="${c.primary ? 0 : 0.24}"/>`,
    doc.text(c.label.toUpperCase(), { font: "mono", size: 10.5, track: 0.14, x: 22, y: H / 2 + 4, fill: fg, attrs: `opacity=".6"` }),
    doc.text(c.handle, { font: "text", size: 20, x: 22 + lw + 14, y: H / 2 + 6.5, fill: fg }),
    `<g clip-path="url(#${clip})"><path class="a" d="M${ax - 5} ${ay + 5}l10-10m-8 0h8v8" fill="none" stroke="${fg}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  );
  doc.save(`chip-${c.slug}.svg`);
}

/* ───────────────────────────── colophon ───────────────────────────── */

function colophon() {
  const T = THEMES.night;
  const W = 1200, H = 460;
  const doc = new Doc(W, H, "好きこそ物の上手なれ。 What you love, you get good at. hi@meoki.vn");
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect width="${W}" height="${H}" rx="24"/></clipPath>`);
  doc.css.push(
    `.ch{animation:glow 7s ease-in-out infinite}@keyframes glow{0%,100%{opacity:.55}12%,30%{opacity:1}45%{opacity:.55}}`,
    `.tw{animation:tw 4s ease-in-out infinite}@keyframes tw{50%{opacity:.15}}`,
    `.car{animation:car 1.1s steps(1) infinite}@keyframes car{50%{opacity:0}}`,
  );
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${T.bg}"/>`);
  // the same ink, rendered as light
  const soft = doc.id("f");
  doc.defs.push(`<filter id="${soft}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="6"/></filter>`);
  doc.add(`<g filter="url(#${soft})">`);
  [
    [0, 760, 330, 190, 41], [3, 980, 120, 150, 42], [1, 1010, 420, 150, 43],
    [4, 520, 470, 130, 44], [5, 250, 500, 120, 45], [2, 860, 520, 100, 46],
  ].forEach(([i, cx, cy, rad, seed], k) =>
    doc.add(ink(doc, { cx, cy, rad, color: T.ink(i), seed, blend: "screen", alpha: 0.62, dur: 21 + k * 3 })),
  );
  doc.add(`</g>`);
  const rnd = rng(3);
  for (let i = 0; i < 46; i++)
    doc.add(`<circle class="tw" cx="${r(rnd() * W)}" cy="${r(rnd() * H)}" r="${r(0.6 + rnd() * 1.3)}" fill="${T.fg}" opacity="${r(0.25 + rnd() * 0.5)}" style="animation-delay:-${(rnd() * 4).toFixed(1)}s;animation-duration:${(2.5 + rnd() * 4).toFixed(1)}s"/>`);
  doc.add(grain(doc, W, H, 0.3));

  doc.add(doc.text("SAY HELLO", { font: "mono", size: 12, track: 0.16, x: 56, y: 72, fill: T.soft }));
  const l1 = doc.line([["What you ", "disp"], ["love,", "dispI"]], { size: 86, x: 52, y: 196 });
  const l2 = doc.line([["you get ", "disp"], ["good at.", "dispI"]], { size: 86, x: 52, y: 288 });
  doc.add(`<g fill="${T.fg}">${l1.svg}${l2.svg}</g>`);

  const mail = "hi@meoki.vn";
  doc.add(
    doc.text(mail, { font: "text", size: 30, x: 56, y: 372, fill: T.fg }),
    `<line x1="56" y1="384" x2="${r(56 + measure(mail, "text", 30))}" y2="384" stroke="${T.shu}" stroke-width="2"/>`,
    `<rect class="car" x="${r(56 + measure(mail, "text", 30) + 8)}" y="346" width="3" height="30" fill="${T.shu}"/>`,
  );
  // the proverb, vertical
  let k = 0;
  ["好きこそ物の", "上手なれ。"].forEach((c, ci) =>
    doc.add(
      doc.vtext(c, {
        font: "jpB", size: 38, x: 1112 - ci * 60, y: 64 + ci * 42, fill: T.fg,
        each: () => `class="ch" style="animation-delay:${(k++ * 0.32 - 7).toFixed(2)}s"`,
      }),
    ),
  );
  doc.add(seal(doc, 1024, 338, 56, T));
  doc.add(
    `<line x1="56" y1="${H - 62}" x2="${W - 56}" y2="${H - 62}" stroke="${T.line}"/>`,
    doc.text("© 2026 HOÀNG ĐÌNH SÁNG", { font: "mono", size: 11, track: 0.14, x: 56, y: H - 34, fill: T.soft }),
    doc.text("SET IN FRAUNCES & SHIPPORI MINCHO  ·  DRAWN IN SVG  ·  MADE IN SAIGON", { font: "mono", size: 11, track: 0.14, x: W - 56, y: H - 34, anchor: "end", fill: T.soft }),
  );
  doc.add(`</g>`, `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="23.5" fill="none" stroke="${T.line}"/>`);
  doc.save("colophon.svg");
}

/* ───────────────────────────── build ───────────────────────────── */

console.log("building sheets");
for (const T of Object.values(THEMES)) {
  hero(T);
  heading(T, "01", "自己紹介", "About", "about");
  heading(T, "02", "作品", "Selected works", "works");
  heading(T, "03", "道具", "Toolbox", "toolbox");
  heading(T, "04", "道のり", "Path", "path");
  heading(T, "05", "連絡", "Contact", "contact");
  toolbox(T);
  pathSheet(T);
}
WORKS.forEach((w, i) => workCard(w, i === 0));
CHIPS.forEach(chip);
colophon();
console.log("done");
