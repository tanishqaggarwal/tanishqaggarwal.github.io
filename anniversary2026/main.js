// A year of memories as one isometric lap of the Earth around the sun.
// Isometric map: screenX = (x - z) cos 30°, screenY = (x + z) sin 30° (y grows downward, so the near side sits lower).

import { openVault } from './vault.js';

const SVG = 'http://www.w3.org/2000/svg';
const STYLES = ['calendar-circle', 'sun-blush', 'constellation'];
const YEAR_MS = 365.2422 * 24 * 60 * 60 * 1000;
const VB = { w: 800, h: 640 };
const CX = 400;
const CY = 320;
const R = 252;
const CAM_STORY = 0;
const SUN_INTRO = 1.72;
const START_THETA = (3 * Math.PI) / 4;
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const SMILE = 'M -13 6 Q 0 19 13 6';
const SMILE_BIG = 'M -15 4 Q 0 24 15 4';
const TILTS = [-2.2, 1.7, -1.3, 2.1, -1.6];

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const scene = document.getElementById('scene');
const titleSlot = document.getElementById('title-slot');
const rememberSlot = document.getElementById('remember-slot');
const titlePop = document.getElementById('title');
const rememberForm = document.getElementById('remember-form');
const rememberBtn = document.getElementById('remember');
const passwordInput = document.getElementById('password');
const passwordHint = document.getElementById('password-hint');
const story = document.getElementById('story');
const dateLine = document.getElementById('date-line');
const blurb = document.getElementById('blurb');
const polaroid = document.getElementById('polaroid');
const polaroidCard = document.getElementById('polaroid-card');
const frame = document.getElementById('frame');
const photo = document.getElementById('photo');
const emptyPhoto = document.getElementById('empty-photo');
const photoNav = document.getElementById('photo-nav');
const photoDots = document.getElementById('photo-dots');
const photoPrev = document.getElementById('photo-prev');
const photoNext = document.getElementById('photo-next');
const caption = document.getElementById('caption');
const actions = document.getElementById('actions');
const nextBtn = document.getElementById('next');
const againBtn = document.getElementById('again');
const steps = [dateLine, blurb, polaroid, actions];

const state = {
  mode: 'intro',
  index: 0,
  theta: START_THETA,
  sunScale: 0.12,
  camY: 0,
  orbitReveal: 0,
  earthPop: 0,
  flight: null,
  wind: 0,
  introT0: 0,
};

const tweens = [];
const laterIds = [];
const orbitPaths = [];
const dots = [];

let milestones = [];
let originMs = 0;
let styleName = 'calendar-circle';
let vault = null;
let unlocked = false;
let unlocking = false;
let memoriesBuilt = false;
let checkGeneration = 0;
let camera;
let sun;
let rays;
let rightArm;
let smile;
let eyeR;
let mover;
let earthBody;
let wind;
let sunShadow;
let orbitBack;
let orbitFront;
let dotsGroup;
let starsGroup;
let fxLayer;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function wait(ms) {
  const dur = reduce ? 0 : ms;
  return new Promise((resolve) => {
    const id = setTimeout(resolve, dur);
    laterIds.push(id);
  });
}

function clearLater() {
  laterIds.splice(0).forEach(clearTimeout);
}

function tweenTo(key, to, ms, ease = easeOutCubic) {
  for (let i = tweens.length - 1; i >= 0; i -= 1) {
    if (tweens[i].key === key) tweens.splice(i, 1)[0].resolve();
  }
  const from = state[key];
  const dur = reduce ? 0 : ms;
  if (dur <= 0) {
    state[key] = to;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    tweens.push({ key, from, to, t0: performance.now(), dur, ease, resolve });
  });
}

function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i -= 1) {
    const tw = tweens[i];
    const t = Math.min(1, (now - tw.t0) / tw.dur);
    state[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(t);
    if (t >= 1) {
      state[tw.key] = tw.to;
      tweens.splice(i, 1);
      tw.resolve();
    }
  }
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function easeOutBack(t) {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function parseDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function ordinal(day) {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

function formatDate(iso) {
  const ms = parseDate(iso);
  const month = new Date(ms).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = Number(iso.slice(8, 10));
  return `${month} ${ordinal(day)}, ${iso.slice(0, 4)}`;
}

function wobble(theta) {
  return 1 + 0.018 * Math.sin(theta * 5) + 0.011 * Math.sin(theta * 11 + 0.8);
}

function project(theta) {
  const w = wobble(theta);
  const x = Math.cos(theta) * w;
  const z = Math.sin(theta) * w;
  const depth = x + z;
  return {
    sx: CX + (x - z) * COS30 * R,
    sy: CY + depth * SIN30 * R,
    depth,
  };
}

function thetaFor(dateMs) {
  return START_THETA + ((dateMs - originMs) / YEAR_MS) * Math.PI * 2;
}

function heartD(scale) {
  let d = '';
  for (let i = 0; i <= 42; i += 1) {
    const t = (i / 42) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3 * scale;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

function pathFromPoints(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`).join(' ');
}

function armDash(path) {
  const len = path.getTotalLength();
  path.dataset.len = String(len || 0);
  if (len > 1) {
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
  }
  orbitPaths.push(path);
}

function replay(node) {
  node.classList.remove('play', 'bye', 'settled');
  void node.offsetWidth;
  node.classList.add('play');
}

function bye(node) {
  node.classList.remove('play', 'settled');
  void node.offsetWidth;
  node.classList.add('bye');
}

function bindPop(node) {
  node.addEventListener('animationend', (event) => {
    if (event.target !== node) return;
    if (!node.classList.contains('play')) return;
    node.classList.remove('play');
    node.classList.add('settled');
  });
}

function readSafeInsets() {
  const probe = document.getElementById('safe-probe');
  if (!probe) return { top: 0, bottom: 0 };
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  };
}

function layoutIntro() {
  if (state.mode !== 'intro' || !sun) return;
  const box = sun.getBoundingClientRect();
  if (!box.width) return;
  const safe = readSafeInsets();
  const viewport = window.visualViewport;
  const visibleTop = viewport ? viewport.offsetTop : 0;
  const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const titleH = titlePop.offsetHeight || 0;
  const btnH = rememberForm.offsetHeight || 0;
  const topLimit = Math.max(safe.top, visibleTop) + 8;
  const bottomLimit = visibleBottom - Math.max(10, safe.bottom + 8);
  titleSlot.style.left = `${box.left + box.width / 2}px`;
  titleSlot.style.top = `${Math.max(topLimit, box.top - titleH - 12)}px`;
  rememberSlot.style.left = `${box.left + box.width / 2}px`;
  const btnTop = box.bottom + 14;
  rememberSlot.style.top = `${Math.min(btnTop, bottomLimit - btnH)}px`;
}

function buildScene() {
  const defs = el('defs', {}, scene);
  const clip = el('clipPath', { id: 'earth-clip' }, defs);
  el('circle', { r: 16 }, clip);

  camera = el('g', { id: 'camera' }, scene);
  starsGroup = el('g', { id: 'stars' }, camera);
  buildStars();

  orbitBack = el('g', { id: 'orbit-back' }, camera);
  sunShadow = el('ellipse', { id: 'sun-shadow', cx: CX, cy: CY + 28, rx: 40, ry: 13 }, camera);
  sun = buildSun(camera);
  orbitFront = el('g', { id: 'orbit-front' }, camera);
  buildOrbit();

  dotsGroup = el('g', { id: 'dots' }, camera);
  fxLayer = el('g', { id: 'fx' }, camera);

  mover = el('g', { id: 'mover' }, camera);
  el('ellipse', { id: 'shadow', cx: 0, cy: 13, rx: 11, ry: 4.2 }, mover);
  wind = buildWind(mover);
  earthBody = buildEarthBody(mover);
}

function buildMemories() {
  if (memoriesBuilt) return;
  memoriesBuilt = true;
  milestones.forEach((milestone, index) => {
    const p = project(thetaFor(milestone.dateMs));
    const dot = milestone.anniversary
      ? el('path', {
        class: 'dot heart-dot',
        d: heartD(0.32),
        transform: `translate(${p.sx.toFixed(1)} ${(p.sy + 1).toFixed(1)})`,
      }, dotsGroup)
      : el('circle', {
        class: 'dot',
        cx: p.sx.toFixed(1),
        cy: p.sy.toFixed(1),
        r: 5.5,
      }, dotsGroup);
    dot.dataset.index = String(index);
    dots.push(dot);
    if (milestone.anniversary) {
      buildCircleMark(p, index);
      buildConstellation(p, index);
    }
  });
  paintDots(0);
}

function buildStars() {
  let seed = 20251013;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 18; i += 1) {
    const x = 36 + rand() * (VB.w - 72);
    const y = 28 + rand() * (VB.h - 80);
    const dx = x - CX;
    const dy = y - CY;
    if (dx * dx + dy * dy < 150 * 150) continue;
    el('circle', { class: 'bg-star', cx: x.toFixed(1), cy: y.toFixed(1), r: rand() > 0.7 ? 2.1 : 1.3 }, starsGroup);
  }
}

function buildSun(parent) {
  const g = el('g', { id: 'sun' }, parent);
  el('circle', { class: 'sun-glow', r: 50 }, g);
  rays = el('g', { id: 'rays' }, g);
  const lengths = [30, 18, 26, 16, 28, 20, 24, 15, 27, 19, 22, 17];
  for (let i = 0; i < lengths.length; i += 1) {
    const angle = (i / lengths.length) * Math.PI * 2;
    const r0 = 40;
    const r1 = r0 + lengths[i];
    const x1 = Math.cos(angle) * r0;
    const y1 = Math.sin(angle) * r0;
    const x2 = Math.cos(angle) * r1;
    const y2 = Math.sin(angle) * r1;
    const attrs = {
      x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2),
    };
    el('line', { ...attrs, class: 'ray-ink' }, rays);
    el('line', { ...attrs, class: 'ray' }, rays);
  }
  const blush = el('g', { class: 'blush-rays' }, rays);
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + 0.18;
    const r0 = 42;
    const r1 = r0 + (i % 2 ? 14 : 20);
    el('line', {
      class: 'blush-ray',
      x1: (Math.cos(angle) * r0).toFixed(2),
      y1: (Math.sin(angle) * r0).toFixed(2),
      x2: (Math.cos(angle) * r1).toFixed(2),
      y2: (Math.sin(angle) * r1).toFixed(2),
    }, blush);
  }
  el('circle', { id: 'sun-body', class: 'sun-body', r: 34 }, g);
  el('ellipse', { class: 'cheek', cx: -14, cy: 8, rx: 5.6, ry: 3.4 }, g);
  el('ellipse', { class: 'cheek', cx: 14, cy: 8, rx: 5.6, ry: 3.4 }, g);
  el('circle', { class: 'eye', cx: -9, cy: -3, r: 2.7 }, g);
  eyeR = el('ellipse', { id: 'eye-r', class: 'eye', cx: 9, cy: -3, rx: 2.7, ry: 2.7 }, g);
  smile = el('path', { id: 'smile', class: 'smile', d: SMILE }, g);

  const arms = el('g', { id: 'arms' }, g);
  const left = el('g', { transform: 'translate(-32 8)' }, arms);
  el('path', { class: 'arm-line', d: 'M0 0 C -12 -2, -22 -8, -28 -5' }, left);
  el('circle', { class: 'hand', cx: -31, cy: -4, r: 5.2 }, left);
  rightArm = el('g', { id: 'arm-right', transform: 'translate(32 8)' }, arms);
  el('path', { class: 'arm-line', d: 'M0 0 C 12 -2, 22 -8, 28 -5' }, rightArm);
  el('circle', { class: 'hand', cx: 31, cy: -4, r: 5.2 }, rightArm);
  return g;
}

function buildOrbit() {
  const samples = [];
  const total = 240;
  for (let i = 0; i <= total; i += 1) {
    samples.push(project((i / total) * Math.PI * 2));
  }
  const runs = [];
  let current = [samples[0]];
  let near = samples[0].depth >= 0;
  for (let i = 1; i < samples.length; i += 1) {
    const sign = samples[i].depth >= 0;
    if (sign !== near) {
      current.push(samples[i]);
      runs.push({ near, pts: current });
      current = [samples[i]];
      near = sign;
    } else {
      current.push(samples[i]);
    }
  }
  if (current.length) runs.push({ near, pts: current });

  for (const run of runs) {
    const parent = run.near ? orbitFront : orbitBack;
    const d = pathFromPoints(run.pts);
    const highlight = el('path', { class: 'orbit-highlight', d }, parent);
    const ink = el('path', { class: 'orbit-ink', d }, parent);
    armDash(highlight);
    armDash(ink);
  }
}

function buildWind(parent) {
  const g = el('g', { id: 'wind', class: 'wind' }, parent);
  const wisps = [
    { d: 'M -12 -2 C -22 -12, -34 -10, -54 -18', w: 3.6, flow: false },
    { d: 'M -12 1 C -24 -2, -36 3, -58 -1', w: 3.1, flow: true },
    { d: 'M -12 4 C -22 12, -36 10, -52 18', w: 3.4, flow: false },
    { d: 'M -14 0 C -20 6, -30 -4, -40 2', w: 2.3, flow: true },
  ];
  wisps.forEach((wisp, index) => {
    el('path', {
      class: wisp.flow ? 'wisp flowing' : 'wisp',
      d: wisp.d,
      'stroke-width': wisp.w,
      style: `animation-delay:${index * -0.14}s`,
    }, g);
  });
  el('path', {
    class: 'wind-heart',
    d: heartD(0.15),
    transform: 'translate(-48 -16)',
  }, g);
  return g;
}

function buildEarthBody(parent) {
  const body = el('g', { id: 'earth-body' }, parent);
  const land = el('g', { 'clip-path': 'url(#earth-clip)' }, body);
  el('circle', { class: 'ocean', r: 16 }, land);
  el('ellipse', { class: 'land', cx: -5, cy: -3, rx: 7, ry: 4.6 }, land);
  el('ellipse', { class: 'land', cx: 6, cy: 4, rx: 5.2, ry: 3.4 }, land);
  el('ellipse', { class: 'land deep', cx: -2, cy: 6.5, rx: 3.3, ry: 2.2 }, land);
  el('circle', { class: 'shine', cx: -7, cy: -7, r: 3 }, land);
  el('circle', { class: 'earth-edge', r: 16 }, body);
  el('circle', { class: 'eye', cx: -5, cy: -1, r: 1.25 }, body);
  el('circle', { class: 'eye', cx: 5, cy: -1, r: 1.25 }, body);
  el('path', { class: 'earth-smile', d: 'M -4 4 Q 0 7.5 4 4' }, body);
  const hat = el('g', { class: 'party-hat' }, body);
  el('path', { class: 'hat-cone', d: 'M -8 -12 L 0 -31 L 8 -12 Z' }, hat);
  el('circle', { class: 'hat-pom', cx: 0, cy: -32.5, r: 3.3 }, hat);
  return body;
}

function markerLoop(x, y) {
  const pts = [];
  const rot = -0.18;
  for (let i = 0; i <= 64; i += 1) {
    const t = (i / 64) * Math.PI * 2;
    const w = 1 + 0.05 * Math.sin(3 * t + 0.5);
    const px = Math.cos(t) * 42 * w;
    const py = Math.sin(t) * 33 * w;
    const rx = px * Math.cos(rot) - py * Math.sin(rot);
    const ry = px * Math.sin(rot) + py * Math.cos(rot);
    pts.push(`${i ? 'L' : 'M'}${(x + rx).toFixed(2)} ${(y + ry).toFixed(2)}`);
  }
  return `${pts.join(' ')} Z`;
}

function buildCircleMark(p, index) {
  const g = el('g', {
    class: 'fx',
    'data-fx': 'calendar-circle',
    'data-index': String(index),
  }, fxLayer);
  const path = el('path', { class: 'mark-loop', d: markerLoop(p.sx, p.sy) }, g);
  const len = path.getTotalLength();
  path.style.setProperty('--len', `${len}px`);
  el('path', {
    class: 'mark-heart',
    d: heartD(0.22),
    transform: `translate(${(p.sx + 30).toFixed(1)} ${(p.sy - 28).toFixed(1)})`,
  }, g);
}

function sparkle(x, y, parent, delay) {
  const outer = 7;
  const inner = 2.5;
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? outer : inner;
    pts.push(`${(x + Math.cos(angle) * rad).toFixed(2)},${(y + Math.sin(angle) * rad).toFixed(2)}`);
  }
  const star = el('polygon', { class: 'star', points: pts.join(' ') }, parent);
  star.style.animationDelay = `${delay}s`;
  return star;
}

function buildConstellation(p, index) {
  const g = el('g', {
    class: 'fx',
    'data-fx': 'constellation',
    'data-index': String(index),
  }, fxLayer);
  const stars = [];
  for (let i = 0; i < 7; i += 1) {
    const t = -Math.PI / 2 + (i / 7) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    stars.push({ x: p.sx + hx * 2.15, y: p.sy + hy * 1.55 });
  }
  let d = `M ${stars[0].x.toFixed(1)} ${stars[0].y.toFixed(1)}`;
  for (let i = 1; i < stars.length; i += 1) {
    d += ` L ${stars[i].x.toFixed(1)} ${stars[i].y.toFixed(1)}`;
  }
  d += ' Z';
  const path = el('path', { class: 'const-line', d }, g);
  const len = path.getTotalLength();
  path.style.setProperty('--len', `${len}px`);
  stars.forEach((star, i) => sparkle(star.x, star.y, g, i * 0.07));
}

function paintDots(current) {
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-past', current >= 0 && index < current);
    dot.classList.toggle('is-now', index === current);
    dot.classList.toggle('is-future', current < 0 || index > current);
  });
}

function clearSteps() {
  steps.forEach((step) => step.classList.remove('play'));
}

function doodleFor(milestone, index) {
  if (milestone.anniversary) return DOODLE_CAKE;
  return DOODLES[index % DOODLES.length];
}

let gallery = [];
let galleryAt = 0;
let galleryTitle = '';
let gallerySizes = [];
let galleryCaptions = [];

function photoList(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function captionList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function captionFor(index) {
  if (galleryCaptions.length === 1) return galleryCaptions[0];
  return galleryCaptions[index] || '';
}

function showCaption(index) {
  const text = captionFor(index);
  caption.textContent = text;
  caption.hidden = !text;
}

function applyFrameSize(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return;
  const portrait = h > w;
  polaroidCard.classList.toggle('is-portrait', portrait);
  polaroidCard.classList.toggle('is-landscape', !portrait);
  frame.style.aspectRatio = `${w} / ${h}`;
}

function setPhoto(milestone, index) {
  gallery = photoList(milestone.photo);
  galleryAt = 0;
  galleryTitle = milestone.title || '';
  gallerySizes = Array.isArray(milestone.photoSize) ? milestone.photoSize : [];
  galleryCaptions = captionList(milestone.caption);
  if (!gallery.length) {
    photo.hidden = true;
    photo.removeAttribute('src');
    emptyPhoto.hidden = true;
    emptyPhoto.replaceChildren();
    polaroidCard.classList.remove('has-more', 'is-portrait', 'is-landscape');
    frame.style.aspectRatio = '';
    photoNav.hidden = true;
    photoDots.replaceChildren();
    showCaption(0);
    return;
  }
  emptyPhoto.innerHTML = doodleFor(milestone, index);
  showGalleryImage();
}

function showGalleryImage() {
  const src = gallery[galleryAt] || '';
  const several = gallery.length > 1;
  polaroidCard.classList.toggle('has-more', several);
  photoNav.hidden = !several;
  photoDots.replaceChildren();
  gallery.forEach((_, dotIndex) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = dotIndex === galleryAt ? 'photo-dot is-on' : 'photo-dot';
    dot.setAttribute('aria-label', `Picture ${dotIndex + 1} of ${gallery.length}`);
    dot.addEventListener('click', () => {
      galleryAt = dotIndex;
      showGalleryImage();
    });
    photoDots.appendChild(dot);
  });
  const size = gallerySizes[galleryAt];
  if (Array.isArray(size)) applyFrameSize(size[0], size[1]);
  showCaption(galleryAt);
  photo.onload = () => {
    applyFrameSize(photo.naturalWidth, photo.naturalHeight);
    photo.hidden = false;
    emptyPhoto.hidden = true;
  };
  photo.onerror = () => {
    photo.hidden = true;
    emptyPhoto.hidden = false;
  };
  if (!src) {
    photo.hidden = true;
    photo.removeAttribute('src');
    emptyPhoto.hidden = false;
    return;
  }
  photo.alt = gallery.length > 1
    ? `Photo ${galleryAt + 1} of ${gallery.length} for ${galleryTitle}`
    : `Photo for ${galleryTitle}`;
  photo.hidden = true;
  emptyPhoto.hidden = true;
  photo.src = src;
}

function stepGallery(direction) {
  if (gallery.length < 2) return;
  galleryAt = (galleryAt + direction + gallery.length) % gallery.length;
  showGalleryImage();
}

function placeStory() {
  const earth = document.getElementById('earth-body');
  if (!earth) return;
  const box = earth.getBoundingClientRect();
  const midX = box.left + box.width / 2;
  const midY = box.top + box.height / 2;
  const cardOnLeft = midX >= window.innerWidth / 2;
  story.classList.toggle('side-left', cardOnLeft);
  story.classList.toggle('side-right', !cardOnLeft);
  // Earth at the top or bottom of the ellipse sits near the middle of the screen.
  // Shift the card up or down on its side so it stays off the planet.
  const nearMiddle = Math.abs(midX - window.innerWidth / 2) < Math.min(140, window.innerWidth * 0.2);
  story.classList.toggle('pin-top', nearMiddle && midY > window.innerHeight * 0.5);
  story.classList.toggle('pin-bottom', nearMiddle && midY <= window.innerHeight * 0.5);
}

function showStory(index) {
  const milestone = milestones[index];
  state.index = index;
  dateLine.textContent = `${formatDate(milestone.date)}: ${milestone.title}`;
  blurb.textContent = milestone.text || '';
  const hasPhoto = photoList(milestone.photo).length > 0;
  const anyCaption = captionList(milestone.caption).some((text) => text);
  polaroid.hidden = !hasPhoto && !anyCaption;
  polaroidCard.classList.toggle('no-photo', !hasPhoto);
  polaroidCard.style.transform = hasPhoto ? `rotate(${TILTS[index % TILTS.length]}deg)` : 'none';
  setPhoto(milestone, index);
  const last = index >= milestones.length - 1;
  nextBtn.hidden = last;
  againBtn.hidden = !last;
  placeStory();
  story.hidden = false;
  story.classList.remove('is-leaving');
  clearSteps();
  const gap = reduce ? 0 : 460;
  let shown = 0;
  steps.forEach((step) => {
    if (step.hidden) return;
    const id = setTimeout(() => step.classList.add('play'), gap * shown);
    shown += 1;
    laterIds.push(id);
  });
  const celebrate = Boolean(milestone.anniversary);
  stage.classList.toggle('mode-anniversary', celebrate);
  syncSky(celebrate);
  paintDots(index);
  if (celebrate && styleName === 'sun-blush') burstAtEarth();
}

function syncSky(celebrate) {
  const milestone = milestones[state.index];
  const on = celebrate && milestone?.anniversary;
  scene.querySelectorAll('.fx').forEach((node) => {
    const match = on
      && node.dataset.fx === styleName
      && Number(node.dataset.index) === state.index;
    node.classList.toggle('fx-on', match);
    if (match) restartFx(node);
  });
  const blush = on && styleName === 'sun-blush';
  sun.classList.toggle('blushing', blush);
  smile.setAttribute('d', blush ? SMILE_BIG : SMILE);
}

function restartFx(node) {
  node.classList.remove('fx-on');
  node.getBoundingClientRect();
  node.classList.add('fx-on');
}

function burstAtEarth() {
  const p = project(state.theta);
  const colors = ['#ff5d7a', '#ffc53d', '#4eacd6', '#7ec87a', '#fffdf8'];
  const g = el('g', { class: 'burst', transform: `translate(${p.sx.toFixed(1)} ${p.sy.toFixed(1)})` }, fxLayer);
  const pieces = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 + 0.15;
    const dist = 24 + (i % 5) * 9;
    let node;
    if (i % 5 === 0) {
      node = el('path', { d: heartD(0.16), fill: '#ff5d7a' }, g);
      pieces.push({ kind: 'heart', node, angle, dist });
    } else {
      node = el('circle', { r: i % 3 === 0 ? 2.5 : 1.7, fill: colors[i % colors.length] }, g);
      pieces.push({ kind: 'dot', node, angle, dist });
    }
  }
  const t0 = performance.now();
  const tick = (now) => {
    const t = (now - t0) / 950;
    if (t >= 1) {
      g.remove();
      return;
    }
    const eased = 1 - (1 - t) ** 2;
    pieces.forEach((piece) => {
      const x = Math.cos(piece.angle) * piece.dist * eased;
      const y = Math.sin(piece.angle) * piece.dist * eased + t * t * 16;
      if (piece.kind === 'heart') {
        piece.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      } else {
        piece.node.setAttribute('cx', x.toFixed(1));
        piece.node.setAttribute('cy', y.toFixed(1));
      }
      piece.node.setAttribute('opacity', (1 - t).toFixed(2));
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function clearBursts() {
  scene.querySelectorAll('.burst').forEach((node) => node.remove());
}

function updateFlight(now) {
  if (!state.flight) {
    state.wind = 0;
    return;
  }
  const flight = state.flight;
  const t = Math.min(1, (now - flight.t0) / flight.dur);
  const eased = easeOutCubic(t);
  state.theta = flight.from + (flight.to - flight.from) * eased;
  const prev = easeOutCubic(Math.max(0, t - 0.03));
  state.wind = (eased - prev) / 0.03;
  if (t >= 1) state.flight = null;
}

function updateWave(now) {
  if (!rightArm || state.mode !== 'intro') return;
  const t = (now - state.introT0) / 1000;
  const damp = Math.max(0, 1 - t / 2.8);
  const angle = Math.sin(t * 8) * 24 * damp;
  rightArm.setAttribute('transform', `translate(32 8) rotate(${angle.toFixed(2)})`);
}

function updateWink(now) {
  if (!eyeR) return;
  let ry = 2.7;
  if (state.mode === 'intro') {
    const t = (now - state.introT0) / 1000;
    for (const center of [0.72, 1.18]) {
      const distance = Math.abs(t - center);
      if (distance < 0.12) ry = 2.7 * (distance / 0.12);
    }
  }
  eyeR.setAttribute('ry', ry.toFixed(2));
}

function ensureDashLengths() {
  for (const path of orbitPaths) {
    if (Number(path.dataset.len) > 1) continue;
    const len = path.getTotalLength();
    if (len > 1) {
      path.dataset.len = String(len);
      path.style.strokeDasharray = `${len}`;
    }
  }
}

function render(now) {
  ensureDashLengths();
  camera.setAttribute('transform', `translate(0 ${state.camY.toFixed(2)})`);
  sun.setAttribute('transform', `translate(${CX} ${CY}) scale(${state.sunScale.toFixed(3)})`);
  rays.setAttribute('transform', `rotate(${((now * 0.004) % 360).toFixed(2)})`);
  sunShadow.setAttribute('opacity', (state.orbitReveal * 0.22).toFixed(3));

  const reveal = Math.max(0, Math.min(1, state.orbitReveal));
  orbitBack.style.opacity = reveal < 0.01 ? '0' : String(0.58 * Math.min(1, reveal * 1.4));
  orbitFront.style.opacity = reveal < 0.01 ? '0' : String(Math.min(1, reveal * 1.3));
  for (const path of orbitPaths) {
    const len = Number(path.dataset.len) || 0;
    path.style.strokeDashoffset = String(len * (1 - reveal));
  }
  starsGroup.style.opacity = String(reveal);
  dotsGroup.style.opacity = String(Math.max(0, (reveal - 0.45) / 0.55));

  const point = project(state.theta);
  const ahead = project(state.theta + 0.04);
  const vx = ahead.sx - point.sx;
  const vy = ahead.sy - point.sy;
  const mag = Math.hypot(vx, vy) || 1;
  const depthN = Math.max(0, Math.min(1, (point.depth / 1.5 + 1) / 2));
  const depthScale = 0.86 + depthN * 0.22;
  const bob = state.mode === 'reading' ? Math.sin(now / 380) * 2.5 : 0;
  const pop = Math.max(0, state.earthPop);
  mover.setAttribute('transform', `translate(${point.sx.toFixed(2)} ${(point.sy + bob).toFixed(2)}) scale(${(depthScale * pop).toFixed(3)})`);

  const flying = Boolean(state.flight);
  const lean = flying ? (vx / mag) * 11 * Math.min(1, state.wind / 2) : 0;
  earthBody.setAttribute('transform', `rotate(${lean.toFixed(2)})`);
  const deg = Math.atan2(vy, vx) * 180 / Math.PI;
  wind.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
  const windOpacity = flying ? Math.max(0, Math.min(1, state.wind / 1.35)) : 0;
  wind.style.opacity = windOpacity.toFixed(3);
  wind.classList.toggle('on', windOpacity > 0.08);

  updateWave(now);
  updateWink(now);
  if (state.mode === 'intro') layoutIntro();
}

function loop(now) {
  stepTweens(now);
  updateFlight(now);
  render(now);
  requestAnimationFrame(loop);
}

function applyConfig(config) {
  const queryStyle = new URLSearchParams(location.search).get('style');
  styleName = STYLES.includes(queryStyle) ? queryStyle : config.anniversaryStyle;
  if (!STYLES.includes(styleName)) styleName = 'calendar-circle';
  stage.dataset.style = styleName;
  const couple = (config.couple || 'X & Y').trim();
  titlePop.textContent = `${couple}'s one year together\u00A0:)`;
  document.title = `${couple}'s one year together`;
  milestones = (config.milestones || [])
    .map((milestone) => ({ ...milestone, dateMs: parseDate(milestone.date) }))
    .filter((milestone) => milestone.dateMs != null && milestone.title)
    .sort((a, b) => a.dateMs - b.dateMs);
  if (!milestones.length) throw new Error('No memories in the vault.');
  originMs = milestones[0].dateMs;
  state.theta = thetaFor(originMs);
}

async function decompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'application/octet-stream';
}

function unpackStory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(0);
  const story = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + jsonLength)));
  let offset = 4 + jsonLength;
  const photos = [];
  while (offset + 4 <= bytes.length) {
    const length = view.getUint32(offset);
    offset += 4;
    const chunk = bytes.slice(offset, offset + length);
    offset += length;
    photos.push(URL.createObjectURL(new Blob([chunk], { type: imageType(chunk) })));
  }
  for (const milestone of story.milestones || []) {
    if (Array.isArray(milestone.photo)) {
      milestone.photo = milestone.photo.map((item) => photos[item] || '').filter(Boolean);
    } else if (typeof milestone.photo === 'number') {
      milestone.photo = photos[milestone.photo] ? [photos[milestone.photo]] : [];
    } else {
      milestone.photo = [];
    }
  }
  return story;
}

function showPasswordHint(message) {
  passwordHint.textContent = message;
}

function hidePasswordField() {
  passwordInput.value = '';
  passwordInput.hidden = true;
  passwordInput.disabled = true;
}

function showPasswordField() {
  passwordInput.hidden = false;
  passwordInput.disabled = false;
}

function shakePassword() {
  rememberForm.classList.remove('shake');
  void rememberForm.offsetWidth;
  rememberForm.classList.add('shake');
}

async function checkPassword(typed, revealWrong) {
  if (!vault) {
    showPasswordHint("The sealed story didn't load.");
    return false;
  }
  if (!typed) {
    if (revealWrong) {
      showPasswordHint('It needs the password.');
      shakePassword();
    }
    return false;
  }
  const generation = ++checkGeneration;
  unlocking = true;
  try {
    const compressed = await openVault(typed, vault);
    if (generation !== checkGeneration || passwordInput.value !== typed) return false;
    if (!unlocked) {
      applyConfig(unpackStory(await decompress(compressed)));
      buildMemories();
      unlocked = true;
    }
    passwordInput.classList.remove('is-wrong');
    passwordInput.classList.add('is-ok');
    showPasswordHint('');
    return true;
  } catch (error) {
    if (generation !== checkGeneration || passwordInput.value !== typed) return false;
    unlocked = false;
    passwordInput.classList.remove('is-ok');
    if (revealWrong) {
      passwordInput.classList.add('is-wrong');
      showPasswordHint("That isn't the one.");
      shakePassword();
    }
    return false;
  } finally {
    if (generation === checkGeneration) unlocking = false;
  }
}

async function onRemember() {
  if (state.mode !== 'intro' || unlocking) return;
  if (!unlocked) {
    await checkPassword(passwordInput.value, true);
    return;
  }
  hidePasswordField();
  state.mode = 'transition';
  stage.classList.remove('is-intro');
  bye(titlePop);
  bye(rememberForm);
  await wait(300);
  titleSlot.style.visibility = 'hidden';
  rememberSlot.style.visibility = 'hidden';
  state.theta = thetaFor(milestones[0].dateMs);
  const draw = tweenTo('orbitReveal', 1, 1050, easeInOut);
  tweenTo('sunScale', 1, 720, easeInOut);
  tweenTo('camY', CAM_STORY, 820, easeInOut);
  await wait(700);
  await tweenTo('earthPop', 1, 460, easeOutBack);
  await draw;
  state.mode = 'reading';
  showStory(0);
}

async function onNext() {
  if (state.mode !== 'reading') return;
  const dest = state.index + 1;
  if (dest >= milestones.length) return;
  state.mode = 'flying';
  clearLater();
  clearBursts();
  stage.classList.remove('mode-anniversary');
  syncSky(false);
  story.classList.add('is-leaving');
  await wait(230);
  story.hidden = true;
  story.classList.remove('is-leaving');
  clearSteps();
  paintDots(-1);
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-past', index < dest);
    dot.classList.toggle('is-now', false);
    dot.classList.toggle('is-future', index >= dest);
  });

  const from = state.theta;
  let to = thetaFor(milestones[dest].dateMs);
  while (to < from - 1e-4) to += Math.PI * 2;
  const span = to - from;
  if (span < 0.004 || reduce) {
    state.theta = to;
  } else {
    const dur = Math.min(2400, Math.max(1000, span * 650));
    state.flight = { from, to, t0: performance.now(), dur };
    await wait(dur + 30);
    state.theta = to;
    state.flight = null;
  }
  state.wind = 0;
  state.mode = 'reading';
  showStory(dest);
}

async function onAgain() {
  if (state.mode !== 'reading') return;
  state.mode = 'transition';
  clearLater();
  clearBursts();
  story.classList.add('is-leaving');
  await wait(220);
  story.hidden = true;
  story.classList.remove('is-leaving');
  clearSteps();
  stage.classList.remove('mode-anniversary');
  syncSky(false);
  state.flight = null;
  await Promise.all([
    tweenTo('earthPop', 0, 260, easeInOut),
    tweenTo('orbitReveal', 0, 520, easeInOut),
    tweenTo('camY', 0, 640, easeInOut),
    tweenTo('sunScale', SUN_INTRO, 680, easeOutBack),
  ]);
  state.theta = thetaFor(milestones[0].dateMs);
  state.index = 0;
  paintDots(0);
  state.introT0 = performance.now();
  stage.classList.add('is-intro');
  state.mode = 'intro';
  titleSlot.style.visibility = 'visible';
  rememberSlot.style.visibility = 'visible';
  if (unlocked) hidePasswordField();
  replay(titlePop);
  await wait(520);
  replay(rememberForm);
}

async function init() {
  bindPop(titlePop);
  bindPop(rememberForm);
  titlePop.textContent = 'One year together\u00A0:)';
  document.title = 'One year together';
  try {
    const response = await fetch('vault.bin', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    vault = await response.arrayBuffer();
    if (vault.byteLength < 68) throw new Error('incomplete vault');
  } catch (error) {
    vault = null;
  }

  buildScene();
  state.introT0 = performance.now();
  render(state.introT0);
  requestAnimationFrame(loop);
  await tweenTo('sunScale', SUN_INTRO, 740, easeOutBack);

  titleSlot.style.visibility = 'visible';
  replay(titlePop);
  await wait(560);
  rememberSlot.style.visibility = 'visible';
  replay(rememberForm);
  if (!vault) showPasswordHint('The sealed story didn\'t load.');
  if (document.fonts?.ready) document.fonts.ready.then(layoutIntro);
}

rememberForm.addEventListener('submit', (event) => {
  event.preventDefault();
  onRemember();
});
let passwordCheckTimer = 0;
passwordInput.addEventListener('input', () => {
  passwordInput.classList.remove('is-wrong', 'is-ok');
  unlocked = false;
  clearTimeout(passwordCheckTimer);
  const typed = passwordInput.value;
  if (!typed) return;
  passwordCheckTimer = setTimeout(() => {
    checkPassword(typed, false);
  }, 250);
});
photoPrev.addEventListener('click', () => stepGallery(-1));
photoNext.addEventListener('click', () => stepGallery(1));
nextBtn.addEventListener('click', onNext);
againBtn.addEventListener('click', onAgain);
window.addEventListener('resize', () => {
  layoutIntro();
  if (!story.hidden) placeStory();
});

const FONT = 'Shantell Sans, Chalkboard SE, cursive';
const DOODLE_MET = `
<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="160" height="120" fill="#d7f2ff"/>
  <rect y="78" width="160" height="42" fill="#d7f0c8"/>
  <circle cx="58" cy="58" r="16" fill="#ffd7a8" stroke="#2a241e" stroke-width="2.4"/>
  <circle cx="104" cy="58" r="16" fill="#f3c39a" stroke="#2a241e" stroke-width="2.4"/>
  <circle cx="53" cy="56" r="1.7" fill="#2a241e"/><circle cx="63" cy="56" r="1.7" fill="#2a241e"/>
  <circle cx="99" cy="56" r="1.7" fill="#2a241e"/><circle cx="109" cy="56" r="1.7" fill="#2a241e"/>
  <path d="M52 63 Q58 68 64 63" fill="none" stroke="#2a241e" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M98 63 Q104 68 110 63" fill="none" stroke="#2a241e" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M74 52 C74 46 86 46 86 52 C86 58 80 62 80 62 C80 62 74 58 74 52 Z" fill="#ff8aa0" stroke="#2a241e" stroke-width="1.5"/>
</svg>`;

const DOODLE_CAKE = `
<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="160" height="120" fill="#fff1d6"/>
  <rect x="38" y="58" width="84" height="36" rx="6" fill="#ff8aa0" stroke="#2a241e" stroke-width="2.4"/>
  <rect x="38" y="58" width="84" height="12" fill="#fffdf8" stroke="#2a241e" stroke-width="2.2"/>
  <rect x="76" y="34" width="8" height="24" rx="2" fill="#7ec87a" stroke="#2a241e" stroke-width="2"/>
  <ellipse cx="80" cy="32" rx="6" ry="8" fill="#ffc53d" stroke="#2a241e" stroke-width="1.8"/>
  <path d="M52 78 q6 4 12 0 q6 4 12 0 q6 4 12 0 q6 4 12 0 q6 4 12 0" fill="none" stroke="#fffdf8" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const DOODLE_FLOWER = `
<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="160" height="120" fill="#e7f8e4"/>
  <path d="M80 108 V62" stroke="#3e8f45" stroke-width="3" stroke-linecap="round"/>
  <circle cx="80" cy="48" r="8" fill="#ffc53d" stroke="#2a241e" stroke-width="2"/>
  <circle cx="80" cy="30" r="9" fill="#ff8aa0" stroke="#2a241e" stroke-width="2"/>
  <circle cx="98" cy="42" r="9" fill="#ff8aa0" stroke="#2a241e" stroke-width="2"/>
  <circle cx="92" cy="60" r="9" fill="#ffb3c2" stroke="#2a241e" stroke-width="2"/>
  <circle cx="68" cy="60" r="9" fill="#ffb3c2" stroke="#2a241e" stroke-width="2"/>
  <circle cx="62" cy="42" r="9" fill="#ff8aa0" stroke="#2a241e" stroke-width="2"/>
</svg>`;

const DOODLE_HILLS = `
<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="160" height="120" fill="#d7f2ff"/>
  <circle cx="118" cy="36" r="14" fill="#ffc53d" stroke="#2a241e" stroke-width="2.3"/>
  <path d="M0 92 Q40 60 80 92 T160 86 V120 H0 Z" fill="#b7e3a4" stroke="#2a241e" stroke-width="2.3"/>
  <path d="M0 104 Q36 84 70 104 T150 100 V120 H0 Z" fill="#8fd18a" stroke="#2a241e" stroke-width="2.3"/>
</svg>`;

const DOODLES = [DOODLE_MET, DOODLE_FLOWER, DOODLE_HILLS, DOODLE_MET];

init();
