// fx-engine.js — Mqhele Cele portfolio 3D background engine
// Liquid domain-warped fbm backdrop + floating 3D platform brand marks.
// Consumes `fx:set` CustomEvents ({goals:[], platforms:[]}) from the calculator.
// Loaded as an ES module. Depends on the three.js import map declared in HTML.
//
// No em dashes in output. No build step.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MOBILE = window.matchMedia && window.matchMedia('(max-width: 900px)');
const PREFER_DARK = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

// ---- theme registry ----------------------------------------------------
// goal -> [deep, mid, bright] palette colors + motion speed factor.
const GOAL_THEMES = {
  engagement: { colors: ['#041428', '#0857E5', '#3B82F6'], speed: 1.0 },
  leads:      { colors: ['#031A12', '#059669', '#34D399'], speed: 1.2 },
  sales:      { colors: ['#1A0F02', '#D97706', '#FBBF24'], speed: 1.5 },
  traffic:    { colors: ['#12042A', '#7C3AED', '#A78BFA'], speed: 1.0 },
  awareness:  { colors: ['#021A1E', '#0891B2', '#22D3EE'], speed: 0.8 },
  whatsapp:   { colors: ['#03150F', '#16A34A', '#4ADE80'], speed: 1.1 },
  video:      { colors: ['#1C0404', '#DC2626', '#F87171'], speed: 1.4 },
  other:      { colors: ['#0B0D10', '#52525B', '#A1A1AA'], speed: 1.0 },
};

// platform -> brand GLB + accent tint for emission.
const PLAT_BRANDS = {
  meta:     { file: 'assets/3d/meta.glb',      tint: 0x0866FF },
  boosting: { file: 'assets/3d/boosting.glb',  tint: 0x5B9FFF },
  google:   { file: 'assets/3d/google.glb',    tint: 0x4285F4 },
  linkedin: { file: 'assets/3d/linkedin.glb',  tint: 0x0A66C2 },
  tiktok:   { file: 'assets/3d/tiktok.glb',    tint: 0x25F4EE },
};

function hexToV3(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
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
  float a = 0.55;
  for (int i = 0; i < 4; i++){
    v += a * snoise(p);
    p = p * 2.02 + vec3(7.31, 13.7, 3.6);
    a *= 0.55;
  }
  return v;
}
`;

// Fullscreen liquid backdrop. Rendered first, behind brands.
class LiquidLayer {
  constructor(renderer, reduced) {
    const u = {
      uTime:   { value: 0 },
      uScroll: { value: 0 },
      uA:      { value: new THREE.Vector3(...hexToV3('#041428')) },
      uB:      { value: new THREE.Vector3(...hexToV3('#0857E5')) },
      uC:      { value: new THREE.Vector3(...hexToV3('#3B82F6')) },
      uFalloff: { value: 0.0 },
    };
    this.target = {
      uA: hexToV3('#041428'),
      uB: hexToV3('#0857E5'),
      uC: hexToV3('#3B82F6'),
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

          // Radial desk-fade so edges stay dark and calm.
          n += uFalloff * 0.6;
          float r = length(p * 0.9);
          float edge = smoothstep(0.05, 0.85, n * 0.5 + 0.5);

          vec3 col = mix(uA, uB, clamp(edge * 1.35, 0.0, 1.0));
          col = mix(col, uC, clamp((n + 1.0) * 0.62, 0.0, 1.0));
          col *= 0.55 + 0.45 * clamp(n * 0.7 + 0.6, 0.0, 1.0);

          // Vignette.
          float vig = smoothstep(1.25, 0.25, r);
          col *= 0.55 + 0.45 * vig;

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

  setGoals(goals) {
    const active = goals.length ? goals.map((g) => GOAL_THEMES[g] || GOAL_THEMES.other) : [GOAL_THEMES.engagement];
    const avg = active.reduce((acc, t) => acc + t.speed, 0) / active.length;
    const mean = (idx) => {
      let r = 0, g = 0, b = 0;
      for (const t of active) {
        const c = hexToV3(t.colors[idx]);
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = active.length;
      return [r / n, g / n, b / n];
    };
    this.target.uA = mean(0);
    this.target.uB = mean(1);
    this.target.uC = mean(2);
    this.target.speed = avg;
    this.target.falloff = active.length > 1 ? 0.12 : 0.0;
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
// Floats cloned GLB brand marks around the stage, fading in and out.
class BrandPool {
  constructor(loader) {
    this.loader = loader;
    this.cache = new Map();
    this.instances = [];
    this.roots = new Map(); // brand -> loaded Object3D (template)
    this.maxInstances = MOBILE.matches ? 4 : 9;
    this.round = 0;
  }

  load(brand) {
    if (this.cache.has(brand)) return this.cache.get(brand);
    const cfg = PLAT_BRANDS[brand];
    if (!cfg) return Promise.resolve(null);
    const p = this.loader
      .loadAsync(cfg.file)
      .then((gltf) => {
        this.roots.set(brand, gltf.scene);
        return gltf.scene;
      })
      .catch((e) => {
        console.warn('brand load failed:', brand, e);
        return null;
      });
    this.cache.set(brand, p);
    return p;
  }

  setActive(brands) {
    this.active = new Set(brands.filter((b) => PLAT_BRANDS[b]));
    for (const b of this.active) this.load(b);
  }

  update(dt, time) {
    if (!this.active) return;
    const targets = new Set(this.active);
    // Despawn instances of deselected brands.
    this.instances = this.instances.filter((inst) => {
      if (targets.has(inst.brand)) return true;
      inst.life -= dt * 1.6;
      if (inst.life <= 0) {
        this.scene.remove(inst.object);
        inst.object.traverse((o) => { if (o.material) o.material.dispose(); });
        return false;
      }
      return true;
    });

    // Spawn new instances up to per-brand + global caps.
    const count = this.instances.length;
    const cap = this.lite ? 6 : (MOBILE.matches ? 14 : 20);
    if (count < cap) {
      this.round = (this.round + 1) % (5 * targets.size || 1);
      if (this.round % 5 === 0) {
        const brand = [...targets][Math.floor(this.round / 5) % targets.size || 0];
        if (brand) this.spawn(brand);
      }
    }

    for (const inst of this.instances) {
      inst.age += dt;
      inst.life -= dt;
      if (inst.life <= 0) {
        inst.alpha = Math.max(0, inst.alpha - dt * 0.9);
      }
      const fadeIn = Math.min(1, inst.age * 1.6);
      const fadeOut = inst.life < 0 ? 0 : 1;
      inst.alpha = Math.min(fadeIn, inst.life < 0 ? Math.max(0, inst.life * 1.6) : 1);
      inst.object.position.x += inst.vx * dt;
      inst.object.position.y += inst.vy * dt;
      inst.object.position.z += inst.vz * dt;
      const sway = Math.sin(time * inst.swayFreq + inst.swayPhase) * inst.swayAmp;
      inst.object.position.x += sway * dt;
      inst.vx = inst.vx * (1 - dt * 0.1);
      inst.vy = inst.vy * (1 - dt * 0.1);
      inst.object.rotation.x += inst.rx * dt;
      inst.object.rotation.y += inst.ry * dt;
      const scale = inst.baseScale * (0.9 + 0.25 * Math.sin(time * 0.4 + inst.seed));
      inst.object.scale.setScalar(scale);

      // Fade instance materials.
      inst.object.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.opacity = inst.alpha;
          o.material.transparent = true;
          o.material.depthWrite = false;
        }
      });

      // Respawn out-of-bounds.
      if (Math.abs(inst.object.position.x) > 6 || Math.abs(inst.object.position.y) > 5) {
        inst.life = Math.min(inst.life, 5);
      }
    }
  }

  spawn(brand) {
    const tmpl = this.roots.get(brand);
    if (!tmpl) return;
    const cfg = PLAT_BRANDS[brand];
    const obj = tmpl.clone(true);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material ? o.material.clone() : o.material;
        if (o.material.color) o.material.color.set(cfg.tint).multiplyScalar(1.6);
        if (o.material.emissive) o.material.emissive.set(cfg.tint);
        o.material.depthWrite = false;
      }
    });
    const side = Math.random() < 0.5 ? -1 : 1;
    obj.position.set(side * (2.4 + Math.random() * 2.2), (Math.random() - 0.5) * 3.2, -2 - Math.random() * 2.5);
    obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    this.scene.add(obj);
    this.instances.push({
      brand,
      object: obj,
      age: 0,
      life: 8 + Math.random() * 8,
      alpha: 0,
      seed: Math.random() * 100,
      baseScale: 0.55 + Math.random() * 0.75,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.14,
      vz: (Math.random() - 0.5) * 0.05,
      rx: (Math.random() - 0.5) * 0.3,
      ry: (Math.random() - 0.5) * 0.3,
      swayFreq: 0.6 + Math.random() * 1.2,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 0.15 + Math.random() * 0.35,
    });
  }

  setScene(scene) {
    this.scene = scene;
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

    const dpr = this.mobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, this.lite ? 1.5 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x111122, 1.1);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(2, 3, 2);
    this.scene.add(hemi, dir);

    this.liquid = new LiquidLayer(this.renderer, this.reduced);
    this.scene.add(this.liquid.mesh);

    this.brands = new BrandPool(new GLTFLoader());
    this.brands.setScene(this.scene);

    const initial = opts.initial || {};
    const goals = initial.goals || ['engagement'];
    const platforms = initial.platforms || ['meta'];
    this.liquid.setGoals(goals);
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

    this.loop();
    if (this.reduced) this.renderer.render(this.scene, this.camera);
  }

  setTheme({ goals, platforms }) {
    if (goals) this.liquid.setGoals(goals);
    if (platforms) this.brands.setActive(platforms);
    if (!REDUCED.matches) this.liquid.mesh.visible = true;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = this.mobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
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
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(() => this.loop());
  }

  destroy() {
    window.removeEventListener('fx:set', this.onFxSet);
    window.removeEventListener('scroll', this._onScroll);
    this.liquid.dispose();
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