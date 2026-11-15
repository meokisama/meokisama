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
  "DelaGothicOne-Regular.ttf": `${OFL}/delagothicone/DelaGothicOne-Regular.ttf`,
  "MochiyPopOne-Regular.ttf": `${OFL}/mochiypopone/MochiyPopOne-Regular.ttf`,
  "MPLUSRounded1c-Medium.ttf": `${OFL}/mplusrounded1c/MPLUSRounded1c-Medium.ttf`,
  "MPLUSRounded1c-ExtraBold.ttf": `${OFL}/mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf`,
  "DotGothic16-Regular.ttf": `${OFL}/dotgothic16/DotGothic16-Regular.ttf`,
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
const F = {
  pop: open("DelaGothicOne-Regular.ttf"), // titles
  cute: open("MochiyPopOne-Regular.ttf"), // sound effects
  body: open("MPLUSRounded1c-Medium.ttf"),
  bold: open("MPLUSRounded1c-ExtraBold.ttf"),
  px: open("DotGothic16-Regular.ttf"), // game windows
  mono: open("GeistMono.ttf").getVariation({ wght: 500 }),
  jp: open("ShipporiMincho-Regular.ttf"), // the printed page
  jpB: open("ShipporiMincho-SemiBold.ttf"),
};
const FKEY = { pop: "p", cute: "c", body: "b", bold: "e", px: "x", mono: "m", jp: "j", jpB: "k" };

/* ───────────────────────────── palette ───────────────────────────── */

const K = "#1a1423"; // the ink every outline is drawn in
const C = {
  pink: "#ff5fa2",
  cyan: "#29c5f6",
  yellow: "#ffd23f",
  purple: "#8b6cff",
  mint: "#3ddbb4",
  red: "#ff4d5e",
  white: "#ffffff",
};
const POP = [C.pink, C.yellow, C.cyan, C.purple, C.mint, C.red];

const THEMES = {
  day: { name: "day", paper: "#fff8ef", ink: K, soft: "#6b6078", tone: C.pink, tone2: C.cyan, lines: 0.1 },
  night: { name: "night", paper: "#15102b", ink: "#f7f2ff", soft: "#b3a8cf", tone: C.purple, tone2: C.pink, lines: 0.13 },
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

/** Largest size at which str fits maxW, capped at size. */
const fit = (str, fk, size, maxW) => Math.min(size, (size * maxW) / measure(str, fk, size));

/** A single SVG document with a shared pool of glyph outlines. */
class Doc {
  constructor(w, h, label) {
    this.w = w;
    this.h = h;
    this.label = label;
    this.glyphs = new Map();
    this.defs = [];
    this.css = [];
    this.cssSeen = new Set();
    this.body = [];
    this.n = 0;
  }
  id(p = "x") {
    return p + (this.n++).toString(36);
  }
  add(...s) {
    this.body.push(...s);
  }
  /** Add a rule once, however many times it is asked for. */
  style(...rules) {
    for (const rule of rules) if (!this.cssSeen.has(rule)) (this.cssSeen.add(rule), this.css.push(rule));
  }
  ref(fk, glyph) {
    const id = FKEY[fk] + glyph.id.toString(36);
    if (!this.glyphs.has(id)) this.glyphs.set(id, glyphD(glyph));
    return this.glyphs.get(id) ? id : null;
  }
  /**
   * Horizontal run of text.
   * outline: [colour, px] draws a stroke behind the fill. each(i): extra attributes per glyph.
   */
  text(str, { font = "body", size = 16, x = 0, y = 0, anchor = "start", fill, track = 0, attrs = "", stroke, outline, each } = {}) {
    const f = F[font];
    const s = size / f.unitsPerEm;
    const run = layout(font, str);
    let pen = 0;
    let uses = "";
    run.glyphs.forEach((g, i) => {
      const p = run.positions[i];
      const id = this.ref(font, g);
      if (id) uses += `<use href="#${id}" x="${Math.round(pen + p.xOffset)}"${p.yOffset ? ` y="${Math.round(p.yOffset)}"` : ""}${each ? " " + each(i) : ""}/>`;
      pen += p.xAdvance + track * f.unitsPerEm;
    });
    const w = (pen - (run.glyphs.length ? track * f.unitsPerEm : 0)) * s;
    const ox = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    let paint = "";
    if (stroke) paint = ` fill="none" stroke="${stroke}" stroke-width="${r(1.6 / s)}" stroke-linejoin="round"`;
    else {
      if (fill) paint += ` fill="${fill}"`;
      if (outline) paint += ` stroke="${outline[0]}" stroke-width="${r(outline[1] / s)}" stroke-linejoin="round" paint-order="stroke"`;
    }
    return `<g transform="translate(${r(ox)} ${r(y)}) scale(${s.toFixed(4)} -${s.toFixed(4)})"${paint}${attrs ? " " + attrs : ""}>${uses}</g>`;
  }
  /** Text with a hard offset shadow and an outline, the way a manga title is lettered. */
  title(str, { shadow = C.pink, off = 6, line = K, lw = 8, ...o }) {
    return (
      this.text(str, { ...o, x: (o.x ?? 0) + off, y: (o.y ?? 0) + off, fill: shadow, outline: [line, lw] }) +
      this.text(str, { ...o, outline: [line, lw] })
    );
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

/* ───────────────────────────── manga kit ───────────────────────────── */

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

/** A blob that slowly changes shape. */
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

/** Screentone: dots that shrink as fn(u, v) falls from 1 to 0. */
function halftone(x0, y0, w, h, color, fn, { step = 15, max = 6.2, opacity = 1 } = {}) {
  let out = "";
  let row = 0;
  for (let y = 0; y <= h; y += step * 0.866, row++)
    for (let x = row % 2 ? step / 2 : 0; x <= w; x += step) {
      const rad = max * Math.max(0, Math.min(1, fn(x / w, y / h)));
      if (rad > 0.7) out += `<circle cx="${r(x0 + x)}" cy="${r(y0 + y)}" r="${r(rad)}"/>`;
    }
  return `<g fill="${color}" opacity="${opacity}">${out}</g>`;
}

/** 集中線: wedges that converge on a point. */
function speedLines(cx, cy, R, { n = 64, seed = 1, inner = [0.42, 0.7], spread = 0.022 } = {}) {
  const rnd = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.06;
    const da = spread * (0.4 + rnd());
    const ri = R * lerp(inner[0], inner[1], rnd());
    d += `M${r(cx + Math.cos(a - da) * R)} ${r(cy + Math.sin(a - da) * R)}L${r(cx + Math.cos(a + da) * R)} ${r(cy + Math.sin(a + da) * R)}L${r(cx + Math.cos(a) * ri)} ${r(cy + Math.sin(a) * ri)}Z`;
  }
  return d;
}

function burst(cx, cy, r1, r2, n) {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r2 : r1;
    d += `${i ? "L" : "M"}${r(cx + Math.cos(a) * rr)} ${r(cy + Math.sin(a) * rr)}`;
  }
  return d + "Z";
}

const SPARK = "M0-10Q1.6-1.6 10 0 1.6 1.6 0 10-1.6 1.6-10 0-1.6-1.6 0-10Z";
const PETAL = "M0 0C5-9 15-8 14 3 13 12 3 13 0 0Z";
const NOTE = "M6-26v20.5a7 5.4-18 1 1-3-4.3V-30l15-4v7z";

function sparkle(doc, x, y, s, color, delay = 0) {
  doc.style(`.sp{transform-box:fill-box;transform-origin:center;animation:sp 2.4s ease-in-out infinite}@keyframes sp{0%,100%{transform:scale(.2) rotate(0);opacity:0}50%{transform:scale(1) rotate(45deg);opacity:1}}`);
  return `<g transform="translate(${x} ${y}) scale(${s})"><path class="sp" d="${SPARK}" fill="${color}" stroke="${K}" stroke-width="${r(1.6 / s)}" stroke-linejoin="round" style="animation-delay:-${delay}s"/></g>`;
}

/**
 * The mascot: a cat in headphones, because the name starts with mèo and the motto is about sound.
 * Drawn around the centre of its head; about 170 wide and 240 tall at scale 1.
 */
function mascot(doc, x, y, s, { bust = false, wave = false, hoodie = C.pink } = {}) {
  doc.style(
    `.hop{animation:hop 2.8s ease-in-out infinite}@keyframes hop{50%{transform:translateY(-7px)}}`,
    `.blink{transform-box:fill-box;transform-origin:center;animation:blink 4.4s infinite}@keyframes blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.06)}}`,
    `.ear{transform-box:fill-box;transform-origin:30% 100%;animation:ear 5.2s ease-in-out infinite}@keyframes ear{0%,78%,100%{transform:rotate(0)}82%{transform:rotate(13deg)}86%{transform:rotate(-4deg)}90%{transform:rotate(9deg)}}`,
    `.tail{transform-box:fill-box;transform-origin:0 100%;animation:tail 2.8s ease-in-out infinite alternate}@keyframes tail{from{transform:rotate(-12deg)}to{transform:rotate(14deg)}}`,
    `.wave{transform-box:fill-box;transform-origin:20% 90%;animation:wave 1.1s ease-in-out infinite alternate}@keyframes wave{from{transform:rotate(-18deg)}to{transform:rotate(22deg)}}`,
    `.led{animation:led 1.2s steps(1) infinite}@keyframes led{50%{opacity:.25}}`,
  );
  const iris = doc.id("g");
  doc.defs.push(`<linearGradient id="${iris}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3df5"/><stop offset=".55" stop-color="${C.purple}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient>`);
  const st = `stroke="${K}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
  const eye = (dx) =>
    `<g class="blink"><ellipse cx="${dx}" cy="6" rx="16" ry="21" fill="${K}"/><ellipse cx="${dx}" cy="9" rx="11.5" ry="15.5" fill="url(#${iris})"/><circle cx="${dx - 5}" cy="-3" r="6.5" fill="#fff"/><circle cx="${dx + 6}" cy="15" r="2.8" fill="#fff"/></g>`;
  const ear = (m, cls) =>
    `<g transform="scale(${m} 1)"><g${cls ? ` class="ear"` : ""}><path d="M-74-22-66-100-14-60Z" fill="#fff" ${st}/><path d="M-63-42-59-82-34-62Z" fill="${C.pink}"/></g></g>`;
  const cup = (m) =>
    `<g transform="scale(${m} 1)"><rect x="-103" y="-30" width="28" height="60" rx="13" fill="${C.cyan}" ${st}/><rect x="-94" y="-12" width="9" height="24" rx="4.5" fill="#fff" opacity=".7"/><circle class="led" cx="-89.5" cy="20" r="3" fill="${C.yellow}"/></g>`;
  let body = "";
  if (!bust)
    body =
      `<g class="tail"><path d="M36 150q74 6 62-56-6-26-30-16" fill="none" stroke="${K}" stroke-width="20" stroke-linecap="round"/><path d="M36 150q74 6 62-56-6-26-30-16" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/></g>` +
      (wave ? `<g class="wave"><ellipse cx="66" cy="92" rx="14" ry="24" fill="#fff" ${st} transform="rotate(28 66 92)"/></g>` : "") +
      `<path d="M-52 164v-46q0-52 52-52t52 52v46z" fill="${hoodie}" ${st}/>` +
      `<path d="M-20 122h40v20q0 8-8 8h-24q-8 0-8-8z" fill="none" stroke="${K}" stroke-width="3.5" stroke-linejoin="round" opacity=".55"/>` +
      `<ellipse cx="-24" cy="164" rx="17" ry="11" fill="#fff" ${st}/><ellipse cx="24" cy="164" rx="17" ry="11" fill="#fff" ${st}/>`;
  else body = `<path d="M-70 190v-72q0-52 70-52t70 52v72z" fill="${hoodie}" ${st}/><path d="M-14 72 0 96 14 72" fill="none" stroke="${K}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return (
    `<g transform="translate(${x} ${y}) scale(${s})"><g class="hop">` +
    body +
    ear(1, false) +
    ear(-1, true) +
    `<ellipse cx="0" cy="0" rx="84" ry="70" fill="#fff" ${st}/>` +
    `<path d="M-4-68q-8-26 16-34-8 14-2 34z" fill="#fff" ${st}/>` +
    `<path d="M-86-8a88 92 0 0 1 172 0" fill="none" stroke="${K}" stroke-width="16" stroke-linecap="round"/>` +
    `<path d="M-86-8a88 92 0 0 1 172 0" fill="none" stroke="${C.cyan}" stroke-width="7" stroke-linecap="round"/>` +
    cup(1) +
    cup(-1) +
    eye(-33) +
    eye(33) +
    `<ellipse cx="-56" cy="32" rx="12" ry="7" fill="${C.pink}" opacity=".6"/><ellipse cx="56" cy="32" rx="12" ry="7" fill="${C.pink}" opacity=".6"/>` +
    `<path d="M-11 31q5.5 9 11 0q5.5 9 11 0" fill="none" stroke="${K}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M0 26l-3.5-4h7z" fill="${C.pink}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>` +
    `</g></g>`
  );
}

/** Skewed band of colour with text on it, like the strip across a light-novel cover. */
function band(doc, str, { x, y, h = 50, size = 26, font = "bold", fill = K, color = "#fff", pad = 20, skew = 12 }) {
  const w = measure(str, font, size) + pad * 2;
  return {
    w: w + skew,
    svg:
      `<path d="M${r(x + skew)} ${y}h${r(w)}l${-skew} ${h}h${r(-w)}z" fill="${fill}"/>` +
      doc.text(str, { font, size, x: x + pad + skew / 2, y: y + h / 2 + size * 0.36, fill: color }),
  };
}

/* ───────────────────────────── hero ───────────────────────────── */

function hero(T) {
  const W = 1200, H = 680;
  const day = T.name === "day";
  const doc = new Doc(W, H, "Meoki. I see sound and hear colour. 音を見て、色を聴く。");
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="24"/></clipPath>`);
  doc.style(
    `.pop{transform-box:fill-box;transform-origin:50% 100%;animation:pop .7s cubic-bezier(.2,1.6,.4,1) both}@keyframes pop{from{transform:scale(0) rotate(-14deg);opacity:0}}`,
    `.jig{transform-box:fill-box;transform-origin:center;animation:jig 3.6s ease-in-out infinite}@keyframes jig{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-6px) rotate(1.5deg)}}`,
    `.fade{animation:fade .9s ease both}@keyframes fade{from{opacity:0;transform:translateY(12px)}}`,
    `.la{animation:la 1s steps(1) infinite}.lb{animation:la 1s steps(1) -.5s infinite}@keyframes la{0%{visibility:visible}50%{visibility:hidden}}`,
    `.spin{transform-box:fill-box;transform-origin:center;animation:spin 48s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`,
    `.sfx{transform-box:fill-box;transform-origin:center;animation:sfx .9s steps(2) infinite}@keyframes sfx{50%{transform:rotate(3deg) scale(1.04)}}`,
    `.b{transform-box:fill-box;transform-origin:50% 100%;animation:eq 1.1s ease-in-out infinite alternate}@keyframes eq{from{transform:scaleY(.12)}to{transform:scaleY(1)}}`,
    `.fall{animation:fall 9s linear infinite}@keyframes fall{0%{transform:translate(0,-60px) rotate(0)}100%{transform:translate(-190px,760px) rotate(540deg)}}`,
    `.note{animation:note 4s ease-out infinite}@keyframes note{0%{transform:translate(0,0) scale(.4);opacity:0}15%{opacity:1}100%{transform:translate(36px,-150px) scale(1.1) rotate(18deg);opacity:0}}`,
    `.tick{animation:tick 30s linear infinite}`,
  );

  const mx = 905, my = 300;
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${T.paper}"/>`);
  // screentone in the corners
  doc.add(
    halftone(620, 0, 580, 420, T.tone, (u, v) => Math.pow(u, 1.3) * (1 - v) * 1.5, { opacity: day ? 0.55 : 0.6 }),
    halftone(0, 380, 520, 300, T.tone2, (u, v) => (1 - u) * Math.pow(v, 1.4) * 1.4, { opacity: day ? 0.5 : 0.45 }),
  );
  // speed lines, two alternating sets
  doc.add(
    `<path class="la" d="${speedLines(mx, my, 760, { seed: 3 })}" fill="${T.ink}" opacity="${T.lines}"/>`,
    `<path class="lb" d="${speedLines(mx, my, 760, { seed: 8 })}" fill="${T.ink}" opacity="${T.lines}"/>`,
  );
  // the burst behind the mascot
  doc.add(
    `<path class="spin" d="${burst(mx, my + 20, 250, 205, 22)}" fill="${C.yellow}" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>`,
    `<circle cx="${mx}" cy="${my + 20}" r="168" fill="#fff" opacity=".55"/>`,
  );
  // petals
  const rnd = rng(12);
  for (let i = 0; i < 13; i++) {
    const px = 260 + rnd() * 1060, sc = 0.8 + rnd() * 0.9, dur = 7 + rnd() * 7;
    doc.add(`<g transform="translate(${r(px)} 0) scale(${r(sc)})"><path class="fall" d="${PETAL}" fill="${i % 4 ? "#ffa3c8" : "#ffd0e2"}" stroke="${K}" stroke-width="1.2" style="animation-duration:${dur.toFixed(1)}s;animation-delay:-${(rnd() * dur).toFixed(1)}s"/></g>`);
  }
  // mascot, music and sparkles
  doc.add(mascot(doc, mx, my, 1.42, { wave: true }));
  [[-150, -30, C.pink, 0], [156, -60, C.cyan, 1.3], [-120, -110, C.purple, 2.6], [120, -130, C.pink, 3.4]].forEach(([dx, dy, col, delay]) =>
    doc.add(`<g transform="translate(${mx + dx} ${my + dy})"><path class="note" d="${NOTE}" fill="${col}" stroke="${K}" stroke-width="2.5" stroke-linejoin="round" style="animation-delay:-${delay}s"/></g>`),
  );
  [[640, 150, 1.8, C.yellow, 0], [1130, 120, 2.4, "#fff", 0.7], [1150, 470, 1.6, C.cyan, 1.4], [690, 520, 2.2, C.pink, 1.9], [560, 250, 1.3, C.cyan, 0.4], [1010, 70, 1.4, C.pink, 1.1]].forEach(([x, y, s, col, d]) =>
    doc.add(sparkle(doc, x, y, s, col, d)),
  );
  // sound effects
  doc.add(
    `<g transform="rotate(9 1060 100)"><g class="sfx">${doc.title("ニャーン", { font: "cute", size: 46, x: 968, y: 112, fill: C.pink, shadow: K, off: 4, lw: 7 })}</g></g>`,
    `<g transform="rotate(10 1090 590)"><g class="sfx" style="animation-delay:-.4s">${doc.title("キラッ", { font: "cute", size: 40, x: 1040, y: 590, fill: C.cyan, shadow: K, off: 3, lw: 6 })}</g></g>`,
  );

  // top line
  doc.add(`<g class="fade">`);
  const tag = band(doc, "PROFILE  Vol.3", { x: 52, y: 44, h: 34, size: 14, font: "pop", fill: T.ink, color: T.paper, pad: 14, skew: 8 });
  doc.add(tag.svg, doc.text("HOÀNG ĐÌNH SÁNG  ·  SAIGON", { font: "mono", size: 12.5, track: 0.14, x: 52 + tag.w + 16, y: 66, fill: T.soft }), `</g>`);

  // the name, one letter at a time
  const name = "MEOKI";
  const size = fit(name, "pop", 178, 560);
  let pen = 52;
  [...name].forEach((ch, i) => {
    const w = measure(ch, "pop", size);
    doc.add(
      `<g class="pop" style="animation-delay:${(0.15 + i * 0.09).toFixed(2)}s"><g class="jig" style="animation-delay:-${(i * 0.45).toFixed(2)}s">` +
        doc.title(ch, { font: "pop", size, x: pen, y: 250, fill: day ? "#fff" : T.ink, shadow: POP[i % POP.length], off: 9, lw: 9 }) +
        `</g></g>`,
    );
    pen += w + 4;
  });
  // katakana sticker
  doc.add(
    `<g class="pop" style="animation-delay:.75s"><g transform="rotate(-9 560 118)">` +
      `<rect x="486" y="92" width="150" height="50" rx="10" fill="${C.yellow}" stroke="${K}" stroke-width="4"/>` +
      doc.text("メオキ", { font: "pop", size: 30, x: 561, y: 128, anchor: "middle", fill: K }) +
      `</g></g>`,
  );

  // catch copy
  doc.add(`<g class="fade" style="animation-delay:.7s">`);
  const b1 = band(doc, "音を見て、色を聴く。", { x: 48, y: 292, h: 56, size: 30, font: "bold", fill: T.ink, color: T.paper });
  doc.add(b1.svg);
  const b2 = band(doc, "I see sound & hear colour.", { x: 48 + b1.w - 8, y: 300, h: 44, size: 19, font: "bold", fill: C.pink, color: K, pad: 16 });
  doc.add(b2.svg, `</g>`);
  // the long light-novel title
  doc.add(`<g class="fade" style="animation-delay:.95s">`);
  ["〜サイゴンのエンジニアが日本語とラノベのために", "　ソフトを作り続けている件〜"].forEach((ln, i) =>
    doc.add(doc.text(ln, { font: "bold", size: 21, x: 56, y: 396 + i * 32, fill: T.ink })),
  );
  wrap("Software engineer in Ho Chi Minh City, working somewhere between language, light and code.", "body", 17.5, 500).forEach((ln, i) =>
    doc.add(doc.text(ln, { font: "body", size: 17.5, x: 58, y: 478 + i * 26, fill: T.soft })),
  );
  doc.add(`</g>`);

  // sound you can see
  const n = 46, bw = 8, gap = 4.2;
  const rn = rng(9);
  doc.add(`<g class="fade" style="animation-delay:1.2s">`);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const env = 0.3 + 0.7 * Math.abs(Math.sin(t * 5.1 + 0.6) * Math.cos(t * 2.3 - 0.4));
    const h = 12 + 56 * env * (0.7 + rn() * 0.3);
    doc.add(`<rect class="b" x="${r(56 + i * (bw + gap))}" y="${r(622 - h)}" width="${bw}" height="${r(h)}" rx="2.5" fill="${POP[Math.floor(t * 5.99)]}" stroke="${K}" stroke-width="1.6" style="animation-duration:${(0.5 + rn() * 0.9).toFixed(2)}s;animation-delay:-${(rn() * 2).toFixed(2)}s"/>`);
  }
  doc.add(`</g>`);

  // ticker
  const items = ["LIGHT NOVELS", "日本語勉強中", "OPEN SOURCE", "積ん読", "FULL-STACK", "ラノベ", "MADE IN SAIGON", "音と色"];
  let one = "", tp = 0;
  items.forEach((it, i) => {
    one += doc.text(it, { font: "pop", size: 22, x: tp, y: 660, fill: i % 2 ? C.yellow : "#fff" });
    tp += measure(it, "pop", 22) + 22;
    one += `<path transform="translate(${r(tp)} 652) scale(1.1)" d="${SPARK}" fill="${POP[i % POP.length]}"/>`;
    tp += 34;
  });
  doc.style(`@keyframes tick{to{transform:translateX(-${r(tp)}px)}}`);
  doc.add(
    `<rect x="0" y="622" width="${W}" height="60" fill="${K}"/>`,
    `<g class="tick">${one}<g transform="translate(${r(tp)} 0)">${one}</g><g transform="translate(${r(tp * 2)} 0)">${one}</g></g>`,
    `</g>`,
    `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="24" fill="none" stroke="${day ? K : "#3b2f66"}" stroke-width="5"/>`,
  );
  doc.save(`hero-${T.name}.svg`);
}

/* ───────────────────────────── chapter headings ───────────────────────────── */

function heading(T, no, jp, en, slug) {
  const W = 1200, H = 84;
  const doc = new Doc(W, H, `第${no}章 ${jp} ${en}`);
  doc.style(
    `.sp2{transform-box:fill-box;transform-origin:center;animation:sp2 5s linear infinite}@keyframes sp2{to{transform:rotate(360deg)}}`,
    `.dash{animation:dash 1.2s linear infinite}@keyframes dash{to{stroke-dashoffset:-28}}`,
  );
  const y = 56;
  const tag = band(doc, `第${no}章`, { x: 0, y: 22, h: 44, size: 22, font: "pop", fill: C.pink, color: K, pad: 14, skew: 10 });
  let x = tag.w + 16;
  doc.add(
    `<path d="M14 26h${r(tag.w - 10)}l-10 44h${r(-(tag.w - 10))}z" fill="${T.ink}"/>`,
    tag.svg,
    doc.text(jp, { font: "pop", size: 34, x, y, fill: T.ink }),
  );
  x += measure(jp, "pop", 34) + 16;
  doc.add(doc.text(en.toUpperCase(), { font: "mono", size: 13, track: 0.2, x, y: y - 4, fill: T.soft }));
  x += measure(en.toUpperCase(), "mono", 13, 0.2) + 22;
  doc.add(
    `<line class="dash" x1="${r(x)}" y1="${y - 10}" x2="${W - 40}" y2="${y - 10}" stroke="${T.ink}" stroke-width="3" stroke-dasharray="14 14" stroke-linecap="round" opacity=".5"/>`,
    `<g transform="translate(${W - 18} ${y - 10}) scale(1.7)"><path class="sp2" d="${SPARK}" fill="${C.yellow}" stroke="${T.name === "day" ? K : "none"}" stroke-width="1.2" stroke-linejoin="round"/></g>`,
  );
  doc.save(`h-${slug}-${T.name}.svg`);
}

/* ───────────────────────────── about, as a visual novel ───────────────────────────── */

const ABOUT =
  "Hi, I'm Hoàng Đình Sáng, Meoki online. I build quiet, useful software for the things I love: Japanese, light novels, and interfaces that feel alive. Designer since 2016, security graduate, full-stack engineer by day. After hours I learn Japanese, read from a tsundoku pile that never gets shorter, and open-source the tools I wanted for my own reading.";

function about(T) {
  const W = 1200, H = 400;
  const day = T.name === "day";
  const doc = new Doc(W, H, ABOUT);
  const clip = doc.id("c"), sky = doc.id("g");
  doc.defs.push(
    `<clipPath id="${clip}"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="22"/></clipPath>`,
    `<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1">${day ? `<stop offset="0" stop-color="#8fd8ff"/><stop offset=".7" stop-color="#ffe3f0"/><stop offset="1" stop-color="#fff2c9"/>` : `<stop offset="0" stop-color="#1b1147"/><stop offset=".7" stop-color="#4a2a7a"/><stop offset="1" stop-color="#b0457f"/>`}</linearGradient>`,
  );
  const T_ = 26, step = 0.04;
  doc.style(
    `.tw{animation:tw ${T_}s linear infinite both}@keyframes tw{0%{opacity:0}.3%,90%{opacity:1}93%,100%{opacity:0}}`,
    `.nx{animation:nx .8s ease-in-out infinite alternate}@keyframes nx{to{transform:translateY(6px)}}`,
    `.cl{animation:cl 60s linear infinite}@keyframes cl{to{transform:translateX(-1400px)}}`,
    `.st{animation:st 3s ease-in-out infinite}@keyframes st{50%{opacity:.15}}`,
  );
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="url(#${sky})"/>`);
  const rnd = rng(7);
  if (day) {
    // clouds drifting
    const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".9"><ellipse cx="0" cy="0" rx="60" ry="22"/><ellipse cx="-30" cy="-14" rx="30" ry="20"/><ellipse cx="14" cy="-22" rx="38" ry="26"/><ellipse cx="50" cy="-6" rx="28" ry="16"/></g>`;
    const row = cloud(140, 70, 1) + cloud(520, 110, 0.7) + cloud(900, 56, 1.2) + cloud(1240, 120, 0.8);
    doc.add(`<g class="cl">${row}<g transform="translate(1400 0)">${row}</g></g>`);
  } else {
    for (let i = 0; i < 60; i++)
      doc.add(`<circle class="st" cx="${r(rnd() * W)}" cy="${r(rnd() * 240)}" r="${r(0.7 + rnd() * 1.6)}" fill="#fff" style="animation-delay:-${(rnd() * 3).toFixed(1)}s"/>`);
    doc.add(`<circle cx="1060" cy="84" r="38" fill="#fff3c4"/><circle cx="1046" cy="76" r="34" fill="#2a1a5a" opacity=".35"/>`);
  }
  doc.add(halftone(0, 150, W, 250, "#fff", (u, v) => v * 0.9, { opacity: day ? 0.5 : 0.12, step: 16 }));
  // the character sprite
  doc.add(mascot(doc, 160, 232, 1.5, { bust: true, hoodie: day ? C.pink : C.purple }));
  doc.add(sparkle(doc, 292, 96, 2, C.yellow, 0.3), sparkle(doc, 44, 150, 1.4, "#fff", 1.2));

  // the text window
  const bx = 300, by = 128, bw = 860, bh = 236;
  doc.add(
    `<rect x="${bx + 7}" y="${by + 7}" width="${bw}" height="${bh}" rx="18" fill="${K}" opacity=".35"/>`,
    `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="18" fill="#191330" fill-opacity=".93" stroke="#fff" stroke-width="4"/>`,
    `<rect x="${bx + 8}" y="${by + 8}" width="${bw - 16}" height="${bh - 16}" rx="12" fill="none" stroke="${C.pink}" stroke-width="1.5" opacity=".8"/>`,
  );
  // name plate
  doc.add(
    `<rect x="${bx + 24}" y="${by - 26}" width="150" height="46" rx="12" fill="${C.pink}" stroke="#fff" stroke-width="4"/>`,
    doc.text("メオキ", { font: "pop", size: 25, x: bx + 99, y: by + 6, anchor: "middle", fill: K }),
  );
  ["AUTO", "SKIP", "LOG", "SAVE"].forEach((b, i) =>
    doc.add(doc.text(b, { font: "px", size: 13, x: bx + bw - 232 + i * 54, y: by + 32, fill: i === 0 ? C.yellow : "#fff", attrs: `opacity="${i === 0 ? 1 : 0.5}"` })),
  );
  // typed lines
  const size = 21, lines = wrap(ABOUT, "body", size, bw - 72);
  let k = 0;
  lines.forEach((ln, i) => {
    doc.add(
      doc.text(ln, {
        font: "body", size, x: bx + 36, y: by + 72 + i * 33, fill: "#fff",
        each: () => `class="tw" style="animation-delay:${(k++ * step).toFixed(2)}s"`,
      }),
    );
    k += 4; // a breath at the line break
  });
  doc.add(`<path class="nx" d="M${bx + bw - 50} ${by + bh - 40}h20l-10 13z" fill="${C.yellow}"/>`);
  doc.add(`</g>`, `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="22" fill="none" stroke="${day ? K : "#3b2f66"}" stroke-width="5"/>`);
  doc.save(`about-${T.name}.svg`);
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

const SFX = {
  aozora: "ペラッ",
  moe2d: "ぷにっ",
  gloss: "ピコン!",
  "tmw-archive": "ガチャ",
  "ranobe-hub": "ずらり",
  "ranobe-blog": "カキカキ",
  "toolkit-engine": "ピカッ",
};

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
      doc.text("a cat", { font: "body", size: 21, x: cx + 18, y: cy + 108, fill: t.fg }),
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
      doc.text("sunlight filtering through leaves", { font: "body", size: 19.5, x: px + 18, y: py + 54, fill: t.fg }),
      doc.text("komorebi · noun", { font: "mono", size: 10.5, track: 0.06, x: px + 18, y: py + 76, fill: t.fg, attrs: `opacity=".5"` }),
      `<rect class="car" x="${r(px + 18 + measure("sunlight filtering through leaves", "body", 19.5) + 4)}" y="${py + 38}" width="2" height="20" fill="${t.wash}"/>`,
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

function workCard(work, index, wide) {
  const W = wide ? 1200 : 600, H = 470;
  const iw = W - 14, ih = H - 14; // the card itself; the rest is its shadow
  const t = work.theme;
  const doc = new Doc(W, H, `${work.title}. ${work.tagline}`);
  const clip = doc.id("c"), tone = doc.id("p"), fade = doc.id("g"), mask = doc.id("m");
  doc.defs.push(
    `<clipPath id="${clip}"><rect x="2" y="2" width="${iw}" height="${ih}" rx="20"/></clipPath>`,
    `<pattern id="${tone}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="7" cy="7" r="3.4" fill="${t.wash}"/></pattern>`,
    `<radialGradient id="${fade}" cx="${wide ? 0.72 : 0.78}" cy=".2" r="${wide ? 0.55 : 0.75}"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    `<mask id="${mask}"><rect width="${W}" height="${H}" fill="url(#${fade})"/></mask>`,
  );
  doc.style(`.sfx{transform-box:fill-box;transform-origin:center;animation:sfx 1s steps(2) infinite}@keyframes sfx{50%{transform:rotate(4deg) scale(1.05)}}`);
  const P = 34;
  doc.add(
    `<rect x="12" y="12" width="${iw}" height="${ih}" rx="20" fill="${t.dark ? t.wash : K}"/>`,
    `<g clip-path="url(#${clip})">`,
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>`,
    `<rect width="${W}" height="${H}" fill="url(#${tone})" mask="url(#${mask})" opacity="${t.dark ? 0.55 : 0.8}"/>`,
  );

  // text block, measured from the bottom up
  const textW = wide ? 480 : iw - P * 2;
  const tagSize = 17, lead = 25;
  const tag = wrap(work.tagline, "body", tagSize, textW);
  let x = P;
  const chipY = ih - 30;
  work.stack.forEach((s) => {
    const w = measure(s.toUpperCase(), "mono", 10.5, 0.1) + 22;
    doc.add(
      `<rect x="${r(x)}" y="${chipY - 16}" width="${r(w)}" height="24" rx="12" fill="${t.fg}"/>`,
      doc.text(s.toUpperCase(), { font: "mono", size: 10.5, track: 0.1, x: x + 11, y: chipY, fill: t.bg }),
    );
    x += w + 6;
  });
  const tagBottom = chipY - 36;
  tag.forEach((ln, i) =>
    doc.add(doc.text(ln, { font: "body", size: tagSize, x: P, y: tagBottom - (tag.length - 1 - i) * lead, fill: t.fg, attrs: `opacity=".85"` })),
  );
  const titleSize = fit(work.title, "pop", wide ? 66 : 44, textW - (work.jp ? 70 : 0));
  const titleY = tagBottom - (tag.length - 1) * lead - 34;
  doc.add(doc.title(work.title, { font: "pop", size: titleSize, x: P, y: titleY, fill: t.dark ? t.fg : "#fff", shadow: t.wash, off: 4, lw: 6, line: K }));
  const tw = measure(work.title, "pop", titleSize);
  if (work.jp) doc.add(doc.text(work.jp, { font: "bold", size: titleSize * 0.4, x: P + tw + 16, y: titleY - 2, fill: t.fg, attrs: `opacity=".7"` }));

  // header row: episode number and kind
  const ep = band(doc, `第${work.numeral}話`, { x: P - 6, y: P - 6, h: 34, size: 17, font: "pop", fill: t.fg, color: t.bg, pad: 13, skew: 8 });
  doc.add(ep.svg);
  const meta = `${work.kind}  ·  ${work.year}`.toUpperCase();
  if (wide) doc.add(doc.text(meta, { font: "mono", size: 11.5, track: 0.14, x: P + ep.w + 10, y: P + 16, fill: t.fg, attrs: `opacity=".75"` }));
  else doc.add(doc.text(meta, { font: "mono", size: 11.5, track: 0.14, x: iw - P, y: P + 16, anchor: "end", fill: t.fg, attrs: `opacity=".75"` }));

  // the picture
  const box = wide
    ? { x: 560, y: 40, w: iw - 560 - P, h: ih - 80 }
    : { x: P, y: 84, w: iw - P * 2, h: titleY - titleSize * 0.86 - 84 - 12 };
  ART[work.slug](doc, t, box);

  // the sound it makes
  const sfx = SFX[work.slug], ss = wide ? 44 : 30;
  const sw = measure(sfx, "cute", ss);
  const sx = wide ? 462 - sw / 2 : iw - P - sw, sy = wide ? 150 : titleY - 2;
  if (wide || P + tw + (work.jp ? titleSize * 0.4 * 2 + 30 : 0) + 24 < sx)
    doc.add(
      `<g transform="rotate(-8 ${r(sx + sw / 2)} ${sy - ss / 3})"><g class="sfx" style="animation-delay:-${(index * 0.13).toFixed(2)}s">` +
        doc.title(sfx, { font: "cute", size: ss, x: sx, y: sy, fill: POP[index % POP.length], shadow: K, off: 3, lw: 5 }) +
        `</g></g>`,
    );

  doc.add(`</g>`, `<rect x="2" y="2" width="${iw}" height="${ih}" rx="20" fill="none" stroke="${K}" stroke-width="4"/>`);
  doc.save(`work-${work.slug}.svg`);
}

/* ───────────────────────────── status screen ───────────────────────────── */

const TOOLBOX = [
  { title: "Languages", jp: "言語", items: ["TypeScript", "JavaScript", "Rust", "Python", "C / C++", "Lua"] },
  { title: "Interface", jp: "画面", items: ["React", "Next.js", "Tailwind", "GSAP", "WebGL", "shadcn/ui"] },
  { title: "Desktop & systems", jp: "基盤", items: ["Electron", "Tauri", "Node.js", "PostgreSQL", "Prisma", "Docker"] },
  { title: "Design", jp: "意匠", items: ["Figma", "Photoshop", "Illustrator", "Lightroom", "After Effects"] },
];

function status() {
  const W = 1200, H = 600;
  const doc = new Doc(W, H, "Status. " + TOOLBOX.map((c) => `${c.title}: ${c.items.join(", ")}`).join(". "));
  const clip = doc.id("c"), bg = doc.id("g"), scan = doc.id("p");
  doc.defs.push(
    `<clipPath id="${clip}"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="22"/></clipPath>`,
    `<linearGradient id="${bg}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1250"/><stop offset="1" stop-color="#3a1466"/></linearGradient>`,
    `<pattern id="${scan}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000"/></pattern>`,
  );
  const D = 14;
  doc.style(
    `.cur{animation:cur ${D}s steps(1) infinite}@keyframes cur{0%{opacity:1}7%,100%{opacity:0}}`,
    `.hl{animation:hl ${D}s steps(1) infinite}@keyframes hl{0%{fill:${C.yellow}}7%,100%{fill:#fff}}`,
    `.exp{transform-box:fill-box;transform-origin:0 50%;animation:exp 6s cubic-bezier(.3,0,.2,1) infinite}@keyframes exp{0%{transform:scaleX(.05)}85%,100%{transform:scaleX(1)}}`,
    `.inf{animation:inf 1.2s linear infinite}@keyframes inf{to{transform:translateX(-24px)}}`,
    `.bl{animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:0}}`,
    `.lv{transform-box:fill-box;transform-origin:center;animation:lv 6s ease infinite}@keyframes lv{0%,84%,100%{transform:scale(1)}88%{transform:scale(1.25)}}`,
    `.grid{animation:grid 8s linear infinite}@keyframes grid{to{transform:translate(-40px,-40px)}}`,
  );
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="url(#${bg})"/>`);
  // drifting grid
  let grid = "";
  for (let i = -1; i < 32; i++) grid += `M${i * 40} -40V${H + 40}`;
  for (let j = -1; j < 18; j++) grid += `M-40 ${j * 40}H${W + 40}`;
  doc.add(`<path class="grid" d="${grid}" stroke="#fff" stroke-opacity=".06" fill="none"/>`);

  const win = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#0f0b2e" fill-opacity=".86" stroke="#fff" stroke-width="4"/><rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="7" fill="none" stroke="${C.cyan}" stroke-width="1.5" opacity=".7"/>`;
  const px = (str, x, y, size = 19, fill = "#fff", extra = {}) => doc.text(str, { font: "px", size, x, y, fill, ...extra });

  // title bar
  doc.add(px("STATUS", 44, 56, 26, C.yellow), px("ステータス", 150, 56, 22, "#fff", { attrs: `opacity=".7"` }));
  doc.add(px("PLAY TIME  2016 →", W - 44, 56, 16, "#fff", { anchor: "end", attrs: `opacity=".6"` }));

  // left: the character
  const lx = 36, ly = 78, lw = 380, lh = 400;
  doc.add(win(lx, ly, lw, lh));
  const pc = doc.id("c"), pg = doc.id("g");
  doc.defs.push(
    `<clipPath id="${pc}"><rect x="${lx + 26}" y="${ly + 26}" width="128" height="128" rx="8"/></clipPath>`,
    `<linearGradient id="${pg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient>`,
  );
  doc.add(
    `<rect x="${lx + 26}" y="${ly + 26}" width="128" height="128" rx="8" fill="url(#${pg})"/>`,
    `<g clip-path="url(#${pc})">${mascot(doc, lx + 90, ly + 96, 0.72, { bust: true })}</g>`,
    `<rect x="${lx + 26}" y="${ly + 26}" width="128" height="128" rx="8" fill="none" stroke="#fff" stroke-width="3"/>`,
    px("メオキ", lx + 174, ly + 62, 30),
    px("MEOKI", lx + 174, ly + 88, 16, "#fff", { attrs: `opacity=".6"` }),
    `<g class="lv">${px("LV", lx + 174, ly + 138, 20, C.yellow)}${px("10", lx + 208, ly + 140, 36, C.yellow)}</g>`,
  );
  // bars
  const bar = (label, y, inner) =>
    px(label, lx + 28, y + 13, 16, "#fff", { attrs: `opacity=".8"` }) +
    `<rect x="${lx + 118}" y="${y}" width="232" height="16" rx="4" fill="#000" fill-opacity=".5" stroke="#fff" stroke-width="2"/>` +
    inner(lx + 121, y + 3, 226, 10);
  const stripes = doc.id("p"), bc = doc.id("c");
  doc.defs.push(
    `<pattern id="${stripes}" width="24" height="10" patternUnits="userSpaceOnUse"><path d="M0 10 10 0h12L12 10z" fill="${C.pink}"/></pattern>`,
    `<clipPath id="${bc}"><rect x="${lx + 121}" y="${ly + 219}" width="226" height="10" rx="2"/></clipPath>`,
  );
  doc.add(
    bar("EXP", ly + 180, (x, y, w, h) => `<rect class="exp" x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${C.mint}"/>`),
    bar("積ん読", ly + 216, (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${C.yellow}"/><g clip-path="url(#${bc})"><rect class="inf" x="${x}" y="${y}" width="${w + 48}" height="${h}" fill="url(#${stripes})"/></g>`),
  );
  [
    ["職業", "Full-stack Engineer"],
    ["拠点", "Saigon, Vietnam"],
    ["属性", "音 ・ 色"],
    ["称号", "積ん読マスター"],
  ].forEach(([k, v], i) => {
    const y = ly + 280 + i * 30;
    doc.add(px(k, lx + 28, y, 17, C.cyan), px(v, lx + 100, y, 17));
  });

  // right: skills
  const rx = 432, rw = W - rx - 36;
  doc.add(win(rx, ly, rw, lh));
  doc.add(px("SKILLS", rx + 28, ly + 44, 18, C.yellow), px("スキル", rx + 104, ly + 44, 16, "#fff", { attrs: `opacity=".6"` }));
  const colW = (rw - 56) / 4;
  let idx = 0;
  const total = TOOLBOX.reduce((a, c) => a + c.items.length, 0);
  TOOLBOX.forEach((col, ci) => {
    const x = rx + 28 + ci * colW;
    doc.add(
      px(col.jp, x, ly + 92, 26, C.pink),
      px(col.title.toUpperCase(), x, ly + 114, 12.5, "#fff", { attrs: `opacity=".55"` }),
      `<path d="M${x} ${ly + 126}h${colW - 22}" stroke="#fff" stroke-opacity=".3" stroke-width="2" stroke-dasharray="4 4"/>`,
    );
    col.items.forEach((it, i) => {
      const y = ly + 162 + i * 34;
      const delay = ((idx++ / total) * D - D).toFixed(2);
      doc.add(
        `<path class="cur" d="M${x} ${y - 14}l10 7-10 7z" fill="${C.yellow}" style="animation-delay:${delay}s"/>`,
        px(it, x + 18, y, fit(it, "px", 21, colW - 40), null, { attrs: `class="hl" style="animation-delay:${delay}s"` }),
      );
    });
  });

  // bottom: the command menu
  const cy = 494;
  doc.add(win(36, cy, W - 72, 78));
  doc.add(px("どうする？", 64, cy + 47, 20));
  const cmds = [["つくる", "MAKE"], ["よむ", "READ"], ["まなぶ", "LEARN"], ["ねる", "SLEEP"]];
  doc.style(`.cm{animation:cm 8s steps(1) infinite}@keyframes cm{0%{opacity:1}25%,100%{opacity:0}}`);
  cmds.forEach(([jp, en], i) => {
    const x = 260 + i * 228;
    doc.add(
      `<path class="cm" d="M${x} ${cy + 30}l12 9-12 9z" fill="${C.yellow}" style="animation-delay:${i * 2 - 8}s"/>`,
      px(jp, x + 22, cy + 47, 22),
      px(en, x + 22 + measure(jp, "px", 22) + 12, cy + 46, 13, "#fff", { attrs: `opacity=".5"` }),
    );
  });
  doc.add(`<rect width="${W}" height="${H}" fill="url(#${scan})" opacity=".1"/>`);
  doc.add(`</g>`, `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="22" fill="none" stroke="${K}" stroke-width="5"/>`);
  doc.save("status.svg");
}

/* ───────────────────────────── contact ───────────────────────────── */

const CHIPS = [
  { slug: "site", label: "Web", handle: "meoki.vn", fill: C.yellow },
  { slug: "mail", label: "Mail", handle: "hi@meoki.vn", fill: C.pink },
  { slug: "x", label: "X", handle: "@meokiiii", fill: C.cyan },
  { slug: "instagram", label: "Instagram", handle: "@meokisama", fill: "#c3b3ff" },
  { slug: "discord", label: "Discord", handle: "meoki", fill: C.mint },
  { slug: "facebook", label: "Facebook", handle: "slytherinnn", fill: "#ffffff" },
];

function chip(c) {
  const H = 60, bh = 50;
  const lw = measure(c.label.toUpperCase(), "pop", 11);
  const hw = measure(c.handle, "bold", 20);
  const bw = Math.ceil(20 + lw + 12 + hw + 44);
  const W = bw + 10;
  const doc = new Doc(W, H, `${c.label}: ${c.handle}`);
  doc.style(`.a{animation:a 2.8s cubic-bezier(.6,0,.3,1) infinite}@keyframes a{0%,55%{transform:none;opacity:1}75%{transform:translate(9px,-9px);opacity:0}76%{transform:translate(-9px,9px);opacity:0}100%{transform:none;opacity:1}}`);
  const ax = bw - 26, ay = bh / 2 + 2;
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect x="${ax - 9}" y="${ay - 9}" width="18" height="18"/></clipPath>`);
  doc.add(
    `<rect x="7" y="8" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.purple}" stroke="${K}" stroke-width="3"/>`,
    `<rect x="2" y="2" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${c.fill}" stroke="${K}" stroke-width="3"/>`,
    doc.text(c.label.toUpperCase(), { font: "pop", size: 11, x: 22, y: bh / 2 + 6, fill: K, attrs: `opacity=".6"` }),
    doc.text(c.handle, { font: "bold", size: 20, x: 22 + lw + 12, y: bh / 2 + 9, fill: K }),
    `<g clip-path="url(#${clip})"><path class="a" d="M${ax - 5} ${ay + 5}l10-10m-8 0h8v8" fill="none" stroke="${K}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  );
  doc.save(`chip-${c.slug}.svg`);
}

/* ───────────────────────────── to be continued ───────────────────────────── */

function colophon() {
  const W = 1200, H = 440;
  const doc = new Doc(W, H, "つづく。 To be continued. 好きこそ物の上手なれ。 What you love, you get good at. hi@meoki.vn");
  const clip = doc.id("c");
  doc.defs.push(`<clipPath id="${clip}"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="24"/></clipPath>`);
  doc.style(
    `.la{animation:la 1s steps(1) infinite}.lb{animation:la 1s steps(1) -.5s infinite}@keyframes la{0%{visibility:visible}50%{visibility:hidden}}`,
    `.go{animation:go 1.4s cubic-bezier(.5,0,.3,1) infinite}@keyframes go{50%{transform:translateX(14px)}}`,
    `.jig{transform-box:fill-box;transform-origin:center;animation:jig 3.6s ease-in-out infinite}@keyframes jig{50%{transform:translateY(-6px) rotate(-1.5deg)}}`,
    `.bl{animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:0}}`,
  );
  const bg = "#15102b", mx = 1000, my = 215;
  doc.add(`<g clip-path="url(#${clip})">`, `<rect width="${W}" height="${H}" fill="${bg}"/>`);
  doc.add(
    halftone(0, 200, 640, 240, C.purple, (u, v) => (1 - u) * v * 1.5, { opacity: 0.6 }),
    halftone(700, 0, 500, 200, C.pink, (u, v) => u * (1 - v) * 1.3, { opacity: 0.5 }),
    `<path class="la" d="${speedLines(mx, my, 900, { seed: 5, inner: [0.3, 0.6] })}" fill="#fff" opacity=".1"/>`,
    `<path class="lb" d="${speedLines(mx, my, 900, { seed: 6, inner: [0.3, 0.6] })}" fill="#fff" opacity=".1"/>`,
    `<circle cx="${mx}" cy="${my + 20}" r="150" fill="${C.yellow}" stroke="${K}" stroke-width="5"/>`,
    `<circle cx="${mx}" cy="${my + 20}" r="126" fill="#fff" opacity=".5"/>`,
    mascot(doc, mx, my - 6, 1.05, { wave: true, hoodie: C.cyan }),
  );
  [[820, 90, 2, C.yellow, 0], [1150, 330, 1.8, C.cyan, 0.9], [1140, 80, 1.3, "#fff", 1.6], [840, 360, 1.4, C.pink, 0.5]].forEach(([x, y, s, col, d]) => doc.add(sparkle(doc, x, y, s, col, d)));

  doc.add(doc.text("NEXT EPISODE", { font: "mono", size: 12.5, track: 0.2, x: 56, y: 66, fill: C.yellow }));
  doc.add(`<g class="jig">${doc.title("つづく", { font: "pop", size: 128, x: 50, y: 196, fill: "#fff", shadow: C.pink, off: 8, lw: 9 })}</g>`);
  doc.add(
    doc.text("TO BE CONTINUED", { font: "pop", size: 24, x: 56, y: 248, fill: C.yellow }),
    `<g class="go"><path d="M${56 + measure("TO BE CONTINUED", "pop", 24) + 18} 229h30v-9l20 17-20 17v-9h-30z" fill="${C.yellow}"/></g>`,
  );
  doc.add(
    doc.text("「好きこそ物の上手なれ。」", { font: "bold", size: 25, x: 44, y: 308, fill: "#fff" }),
    doc.text("What you love, you get good at.", { font: "body", size: 17, x: 58, y: 338, fill: "#b3a8cf" }),
  );
  const mail = band(doc, "hi@meoki.vn", { x: 50, y: 362, h: 46, size: 23, font: "bold", fill: C.pink, color: K, pad: 18 });
  doc.add(mail.svg, `<rect class="bl" x="${r(50 + mail.w + 8)}" y="372" width="4" height="26" fill="${C.pink}"/>`);
  doc.add(doc.text("© 2026 HOÀNG ĐÌNH SÁNG  ·  DRAWN IN SVG  ·  MADE IN SAIGON", { font: "mono", size: 10.5, track: 0.14, x: W - 44, y: H - 26, anchor: "end", fill: "#b3a8cf" }));
  doc.add(`</g>`, `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="24" fill="none" stroke="#3b2f66" stroke-width="5"/>`);
  doc.save("colophon.svg");
}

/* ───────────────────────────── build ───────────────────────────── */

console.log("building sheets");
for (const T of Object.values(THEMES)) {
  hero(T);
  about(T);
  heading(T, "1", "自己紹介", "About", "about");
  heading(T, "2", "作品", "Selected works", "works");
  heading(T, "3", "ステータス", "Status", "status");
  heading(T, "4", "連絡", "Contact", "contact");
}
WORKS.forEach((w, i) => workCard(w, i, i === 0));
status();
CHIPS.forEach(chip);
colophon();
console.log("done");
