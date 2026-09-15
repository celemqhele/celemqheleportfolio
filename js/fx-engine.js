// fx-engine.js — Mqhele Cele portfolio 3D background engine
// Liquid domain-warped fbm backdrop + real platform logos as flat billboard sprites.
// Consumes `fx:set` CustomEvents ({goals:[], platforms:[]}) from the calculator.
// Loaded as an ES module. Depends on the three.js import map declared in HTML.
//
// No em dashes in output. No build step.

import * as THREE from 'three';

const MOBILE = window.matchMedia && window.matchMedia('(max-width: 900px)');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

// ---- brand registry ----------------------------------------------------
// platform -> logo asset + liquid palette (deep/mid/bright). Full-color
// transparent logos are rasterized to canvas billboards by the engine.
const PLAT_BRANDS = {
  meta:     { file: 'assets/logos/meta.svg',     deep: '#05204C', mid: '#0866FF', accent: '#6DB4FF' },
  boosting: { file: 'assets/logos/boosting.svg', deep: '#062A4A', mid: '#0096FF', accent: '#7DC4FF' },
  google:   { file: 'assets/logos/google.svg',   deep: '#0B2336', mid: '#4285F4', accent: '#FBBC05' },
  linkedin: { file: 'assets/logos/linkedin.svg', deep: '#041E33', mid: '#0A66C2', accent: '#5AA1E6' },
  tiktok:   { file: 'assets/logos/tiktok.svg',   deep: '#3D0A23', mid: '#FE2C55', accent: '#25F4EE' },
  tiktokboost: { file: 'assets/logos/tiktok.svg', deep: '#2F0A1F', mid: '#FE2C55', accent: '#7DE2E0' },
};

// goal -> motion speed factor (the palette is driven by platforms now).
const GOAL_SPEED = {
  engagement: 1.15,
  leads:      1.3,
  sales:      1.5,
  traffic:    1.0,
  awareness:  0.9,
  whatsapp:   1.05,
  video:      1.25,
  other:      1.0,
};

function hexToV3(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const SIMPLEX_SRC = `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec2 permute2(vec2 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

// Simplex 3D noise, after Ashima Arts / Ian McEwan (webgl-noise, MIT).
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0,0.5,1.0,2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute( i.z + vec4(0.0, i1.z, i2.z, 1.0))
                           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p){
  float v = 0.0;
  float a = 0.6;
  for (int i = 0; i < 3; i++){
    v += a * snoise(p);
    p = p * 2.0 + vec3(7.31, 13.7, 3.6);
    a *= 0.55;
  }
  return v;
}
`;

// Fullscreen liquid backdrop. Rendered first, behind the logo sprites.
class LiquidLayer {
  constructor(renderer, reduced) {
    const u = {
      uTime:   { value: 0 },
      uScroll: { value: 0 },
      uA:      { value: new THREE.Vector3(...hexToV3('#05204C')) },
      uB:      { value: new THREE.Vector3(...hexToV3('#0866FF')) },
      uC:      { value: new THREE.Vector3(...hexToV3('#6DB4FF')) },
      uFalloff: { value: 0.0 },
    };
    this.target = {
      uA: hexToV3('#05204C'),
      uB: hexToV3('#0866FF'),
      uC: hexToV3('#6DB4FF'),
      speed: 1.0,
      falloff: 0.0,
    };
    this.uniforms = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uScroll;
        uniform vec3 uA;
        uniform vec3 uB;
        uniform vec3 uC;
        uniform float uFalloff;
        ${SIMPLEX_SRC}

        void main(){
          vec2 uv = vUv;
          vec2 p = uv * 2.1 - 1.1;
          p.x += 0.5;
          p.y -= 0.2;
          float t = uTime * 0.12;

          // Domain warping (Inigo Quilez style) for organic liquid folds.
          vec3 q = vec3(p * 1.25, t * 0.45 + uScroll * 0.08);
          float f1 = fbm(q);
          vec3 q2 = vec3(p * 1.6 + vec2(f1 * 1.25, f1 * 0.9), t * 0.6);
          float f2 = fbm(q2 + uScroll * 0.05);
          float n = f2 * 0.65 + f1 * 0.35;

          // Radial desk-fade so edges stay calm.
          n += uFalloff * 0.6;
          float r = length(p * 0.9);
          float edge = smoothstep(0.05, 0.85, n * 0.5 + 0.5);

          vec3 col = mix(uA, uB, clamp(edge * 1.3, 0.0, 1.0));
          col = mix(col, uC, clamp((n + 1.0) * 0.55, 0.0, 1.0));
          // Brighter body + softer vignette so brand colors actually show.
          col *= 0.72 + 0.28 * clamp(n * 0.6 + 0.6, 0.0, 1.0);
          float vig = smoothstep(1.25, 0.25, r);
          col *= 0.7 + 0.3 * vig;

          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    const geo = new THREE.BufferGeometry();
    // Fullscreen triangle.
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.reduced = reduced;
    if (reduced) this.mesh.visible = true;
  }

  // Palette is driven by the selected platforms' brand colors.
  setPalette(platforms) {
    const list = (platforms || []).filter((p) => PLAT_BRANDS[p]);
    const active = list.length ? list : ['meta'];
    const mean = (key) => {
      let r = 0, g = 0, b = 0;
      for (const p of active) {
        const c = hexToV3(PLAT_BRANDS[p][key]);
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = active.length;
      return [r / n, g / n, b / n];
    };
    this.target.uA = mean('deep');
    this.target.uB = mean('mid');
    this.target.uC = mean('accent');
    this.target.falloff = 0.0;
  }

  // Goals drive motion speed only.
  setSpeed(goals) {
    const active = (goals || []).length ? goals : ['engagement'];
    let sum = 0;
    for (const g of active) sum += GOAL_SPEED[g] || GOAL_SPEED.other;
    this.target.speed = sum / active.length;
  }

  // Back-compat alias: goals alone set speed, palette stays platform-driven.
  setGoals(goals) {
    this.setSpeed(goals);
  }

  // Palette follows the logos actually on screen, weighted by their opacity.
  // Multiple visible brands blend into a hybrid palette automatically.
  setWeighted(weights) {
    const active = (weights || []).filter((x) => PLAT_BRANDS[x.brand]);
    if (!active.length) return;
    let sumW = 0;
    const acc = { deep: [0, 0, 0], mid: [0, 0, 0], accent: [0, 0, 0] };
    for (const { brand, w } of active) {
      const p = PLAT_BRANDS[brand];
      sumW += w;
      for (const key of ['deep', 'mid', 'accent']) {
        const c = hexToV3(p[key]);
        acc[key][0] += c[0] * w;
        acc[key][1] += c[1] * w;
        acc[key][2] += c[2] * w;
      }
    }
    if (sumW <= 0) return;
    this.target.uA = [acc.deep[0] / sumW, acc.deep[1] / sumW, acc.deep[2] / sumW];
    this.target.uB = [acc.mid[0] / sumW, acc.mid[1] / sumW, acc.mid[2] / sumW];
    this.target.uC = [acc.accent[0] / sumW, acc.accent[1] / sumW, acc.accent[2] / sumW];
    this.target.falloff = active.length > 1 ? 0.06 : 0.0;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    // Lerp uniforms toward targets.
    const k = 1 - Math.exp(-dt * 1.4);
    for (const key of ['uA', 'uB', 'uC']) {
      const c = this.uniforms[key].value;
      const t = this.target[key];
      c.lerp(new THREE.Vector3(t[0], t[1], t[2]), k);
    }
    this.uniforms.uFalloff.value += (this.target.falloff - this.uniforms.uFalloff.value) * k;
  }

  setScroll(y) {
    this.uniforms.uScroll.value = y;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ---- brand flood --------------------------------------------------------
// Rasterizes the platform logos and drifts them past the frame as flat,
// camera-facing billboards. Each brand enters from outside one frame edge,
// fades in as it crosses the edge, glides across, and fades out past the
// opposite edge. Deselected brands drift out naturally and are removed.
class BrandPool {
  constructor(engine) {
    this.engine = engine;
    this.cache = new Map();        // brand -> Promise<CanvasTexture>
    this.mats = new Map();         // brand -> base SpriteMaterial (cloned per sprite)
    this.instances = [];
    this.active = new Set();
    this.maxInstances = MOBILE.matches ? 9 : 18;
    this.spawnAcc = MOBILE.matches ? 1.8 : 3.2;
    this.crossLen = 1.9;
    this.palKey = '';
  }

  rasterize(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = 512;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const scale = size / Math.max(w, h);
        const dw = Math.max(1, Math.round(w * scale));
        const dh = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const g = canvas.getContext('2d');
        g.clearRect(0, 0, size, size);
        g.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        resolve(tex);
      };
      img.onerror = () => reject(new Error('logo load failed: ' + file));
      img.src = file;
    });
  }

  load(brand) {
    if (this.cache.has(brand)) return this.cache.get(brand);
    const cfg = PLAT_BRANDS[brand];
    if (!cfg) return Promise.resolve(null);
    const p = this.rasterize(cfg.file)
      .then((tex) => {
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        });
        this.mats.set(brand, mat);
        return tex;
      })
      .catch((e) => {
        console.warn('brand load failed:', brand, e);
        return null;
      });
    this.cache.set(brand, p);
    return p;
  }

  setActive(brands) {
    this.active = new Set((brands || []).filter((b) => PLAT_BRANDS[b]));
    for (const b of this.active) this.load(b);
  }

  // Feed the liquid the weights of the brands actually visible this frame.
  // Uses a quantized key so the palette only re-targets when the mix shifts.
  applyPalette(liquid) {
    const w = {};
    for (const inst of this.instances) {
      if (inst.alpha > 0.02) w[inst.brand] = (w[inst.brand] || 0) + inst.alpha;
    }
    const keys = Object.keys(w);
    if (!keys.length) return;
    const key = keys.sort().map((b) => b + Math.round(w[b] * 4)).join('|');
    if (key !== this.palKey) {
      this.palKey = key;
      liquid.setWeighted(keys.map((brand) => ({ brand, w: w[brand] })));
    }
  }

  update(dt, time) {
    if (!this.active) return;

    // Grow/shrink toward the wanted instance count by letting sprites
    // finish their cross-fade; deselected brands are marked dying so they
    // fade out fast instead of finishing the whole crossing.
    for (const inst of this.instances) {
      if (!this.active.has(inst.brand)) inst.dying = true;
    }

    // Spawn up to the cap from the ready brands.
    this.spawnAcc += dt * (this.maxInstances / 14);
    const ready = [...this.active].filter((b) => this.mats.has(b));
    while (this.spawnAcc >= 1 && this.instances.length < this.maxInstances && ready.length) {
      this.spawnAcc -= 1;
      this.spawn(ready[Math.floor(Math.random() * ready.length)]);
    }

    const cam = this.engine.camera;
    const fovHalf = Math.tan((cam.fov * Math.PI) / 360);
    const camZ = cam.position.z;

    const next = [];
    for (const inst of this.instances) {
      const dist = camZ - inst.z;
      const halfW = fovHalf * cam.aspect * dist;
      const halfH = fovHalf * dist;

      const speed = inst.dying ? inst.cruise * 2.4 : inst.cruise;
      inst.x += (inst.side * speed) * dt;
      inst.y0 += inst.vy * dt;
      inst.age += dt;

      if (inst.dying) {
        inst.alpha = Math.max(0, 1 - (inst.age - inst.dieT) * 2.2);
        if (inst.alpha <= 0.01) {
          this._remove(inst);
          continue;
        }
      } else {
        // Fade in just past the entering edge, fade out well before the far
        // edge, then vanish past it. The logo is fully opaque mid-frame.
        const enter = inst.side === 1
          ? smoothstep(-halfW, -halfW + this.crossLen, inst.x)
          : 1 - smoothstep(halfW - this.crossLen, halfW, inst.x);
        const exit = inst.side === 1
          ? 1 - smoothstep(halfW - this.crossLen, halfW + 0.15, inst.x)
          : smoothstep(-halfW, -halfW + this.crossLen + 0, inst.x);
        inst.alpha = Math.min(1, enter) * Math.min(1, exit);
        if (inst.alpha <= 0.01 && (inst.x > halfW + 2.4 || inst.x < -halfW - 2.4)) {
          this._remove(inst);
          continue;
        }
      }

      const sway = Math.sin(time * inst.swayFreq + inst.swayPhase) * inst.swayAmp;
      const pulse = 0.94 + 0.12 * Math.sin(time * 0.5 + inst.seed);
      const s = inst.baseScale * pulse;
      inst.sprite.position.set(inst.x, inst.y0 + sway, inst.z);
      inst.sprite.scale.set(s, s, 1);
      inst.sprite.material.rotation = Math.sin(time * 0.3 + inst.seed) * 0.07;
      inst.sprite.material.opacity = inst.alpha;

      // Keep inside the vertical desk band.
      if (inst.y0 > halfH * 1.4) inst.vy -= dt * 0.2;
      if (inst.y0 < -halfH * 1.4) inst.vy += dt * 0.2;

      next.push(inst);
    }
    this.instances = next;
  }

  spawn(brand) {
    const mat = this.mats.get(brand);
    if (!mat) return;
    const sprite = new THREE.Sprite(mat.clone());
    sprite.material.opacity = 0;
    sprite.renderOrder = 1;
    sprite.visible = true;
    this.scene.add(sprite);

    const side = Math.random() < 0.5 ? 1 : -1; // 1 enters from the left
    const z = -1.4 - Math.random() * 1.8;
    const cam = this.engine.camera;
    const halfW = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect * (cam.position.z - z);
    const x0 = -side * (halfW + 1.2 + Math.random() * 1.4);
    const y0 = (Math.random() - 0.5) * 4.4;

    this.instances.push({
      brand,
      sprite,
      side,
      z,
      x: x0,
      y0,
      age: 0,
      dieT: 1 + Math.random() * 0.5,
      dying: false,
      alpha: 0,
      seed: Math.random() * 100,
      cruise: 0.5 + Math.random() * 0.34,
      vy: (Math.random() - 0.5) * 0.14,
      baseScale: 0.3 + Math.random() * 0.34,  // small billboards, ~5-10% of screen height
      swayFreq: 0.5 + Math.random() * 1.1,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 0.12 + Math.random() * 0.3,
    });
  }

  _remove(inst) {
    this.scene.remove(inst.sprite);
    if (inst.sprite.material) {
      inst.sprite.material.map = null;
      inst.sprite.material.dispose();
    }
  }

  setScene(scene) {
    this.scene = scene;
  }

  dispose() {
    for (const inst of this.instances) this._remove(inst);
    this.instances = [];
    for (const mat of this.mats.values()) {
      if (mat.map) mat.map.dispose();
      mat.map = null;
      mat.dispose();
    }
    this.mats.clear();
    this.cache.clear();
  }
}

// ---- main engine --------------------------------------------------------
class FxEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.reduced = REDUCED.matches;
    this.mobile = MOBILE.matches;
    this.lite = !!opts.lite;
    this.paused = false;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !this.reduced,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      document.body.classList.add('fx-fallback');
      canvas.style.display = 'none';
      return;
    }
    this.scene = new THREE.Scene();
    const w = (this.w = window.innerWidth);
    const h = (this.h = window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 40);
    this.camera.position.z = 3.4;

    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile || this.lite ? 1.5 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.liquid = new LiquidLayer(this.renderer, this.reduced);
    this.scene.add(this.liquid.mesh);

    this.brands = new BrandPool(this);
    this.brands.setScene(this.scene);

    const initial = opts.initial || {};
    const goals = initial.goals || ['engagement'];
    const platforms = initial.platforms || ['meta'];
    this.liquid.setPalette(platforms);
    this.liquid.setSpeed(goals);
    this.brands.setActive(platforms);

    this.time = 0;
    this.last = performance.now();
    this.onFxSet = (e) => this.setTheme(e.detail || {});
    window.addEventListener('fx:set', this.onFxSet, { passive: true });
    window.addEventListener('scroll', this._onScroll = () => this.liquid.setScroll(window.scrollY), { passive: true });
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (!this.paused) { this.last = performance.now(); this.loop(); }
    });

    if (this.reduced) {
      const apply = () => {
        this.brands.setActive(this.brands.active);
        this.brands.update(0.6, 0); // place a few static sprites mid-frame
        this.renderer.render(this.scene, this.camera);
      };
      const p = [...platforms];
      Promise.all(p.map((b) => this.brands.load(b))).then(apply).catch(apply);
      return;
    }

    this.loop();
  }

  setTheme({ goals, platforms }) {
    if (goals) this.liquid.setSpeed(goals);
    if (platforms) {
      this.liquid.setPalette(platforms);
      this.brands.setActive(platforms);
      if (this.reduced) {
        this.brands.update(0.6, 0);
        this.renderer.render(this.scene, this.camera);
      }
    }
    if (!REDUCED.matches) this.liquid.mesh.visible = true;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile || this.lite ? 1.5 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
  }

  loop() {
    if (this.paused) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.06);
    this.last = now;
    this.time += dt;

    if (!this.reduced) {
      this.liquid.update(dt, this.time);
      this.brands.update(dt, this.time);
      this.brands.applyPalette(this.liquid);
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(() => this.loop());
  }

  destroy() {
    window.removeEventListener('fx:set', this.onFxSet);
    window.removeEventListener('scroll', this._onScroll);
    this.liquid.dispose();
    this.brands.dispose();
    this.renderer.dispose();
  }
}

let _engine = null;
export function init(canvas, opts) {
  if (!_engine && canvas) _engine = new FxEngine(canvas, opts);
  return _engine;
}
export function sync(detail) {
  if (_engine) _engine.setTheme(detail || {});
}
export function getEngine() {
  return _engine;
}

export default { init, sync, getEngine };