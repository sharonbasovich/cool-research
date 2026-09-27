import { BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineSegments, PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import { makeRng } from '../lab/sim';
import { type Episode, countPlus, makeEpisode } from './episode';

const RED = new Color('#b3312c');
const BLUE = new Color('#1f5a96');
const HOLD_START = 2600;
const DAY_MS = 1900;
const HOLD_END = 4200;
const FADE_MS = 900;
const FLIP_SPREAD = 700;
const FLIP_MS = 520;

const nodeVertex = /* glsl */ `
  attribute vec3 color;
  attribute float pulse;
  uniform float uScale;
  uniform float uNear;
  uniform float uFar;
  varying vec3 vColor;
  varying float vPulse;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uScale * (1.0 + 1.6 * pulse) / -mv.z;
    vColor = color;
    vPulse = pulse;
    vDepth = smoothstep(uFar, uNear, -mv.z);
  }`;

const nodeFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vPulse;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.36, d);
    float halo = smoothstep(0.5, 0.0, d) * vPulse;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.35 * halo), (core * (0.35 + 0.6 * vDepth) + halo * 0.45) * uOpacity);
  }`;

export interface HudState {
  day: number;
  plus: number;
  n: number;
  majority: 1 | -1;
  phase: 'start' | 'running' | 'done' | 'stuck';
}

export interface Background {
  setPlaying(playing: boolean): void;
  dispose(): void;
}

function ballLayout(n: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = 2 * rng() - 1;
    const phi = 2 * Math.PI * rng();
    const s = Math.sqrt(1 - z * z);
    const r = 0.62 + 0.38 * Math.pow(rng(), 0.6);
    pos[3 * i] = r * s * Math.cos(phi);
    pos[3 * i + 1] = r * z * 0.92;
    pos[3 * i + 2] = r * s * Math.sin(phi);
  }
  return pos;
}

export function startBackground(
  canvas: HTMLCanvasElement,
  onHud: (s: HudState) => void,
  opts: { playing: boolean },
): Background | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  const group = new Group();
  scene.add(group);

  const nodeMat = new ShaderMaterial({
    vertexShader: nodeVertex,
    fragmentShader: nodeFragment,
    uniforms: { uScale: { value: 30 }, uOpacity: { value: 0 }, uNear: { value: 3 }, uFar: { value: 5 } },
    transparent: true,
    depthWrite: false,
  });
  const edgeMat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });

  let nodes: Points | null = null;
  let edges: LineSegments | null = null;
  let ep: Episode;
  let edgeList: Int32Array;
  let from: Float32Array;
  let to: Float32Array;
  let mix: Float32Array;
  let delay: Float32Array;
  let seed = (Date.now() & 0xffff) + 1;
  let day = 0;
  let clock = 0;
  let dayStart = 0;
  let phase: 'fadein' | 'hold' | 'day' | 'end' | 'fadeout' = opts.playing ? 'fadein' : 'hold';
  let phaseT = 0;
  let playing = opts.playing;

  function hud(): void {
    const op = ep.days[day];
    const done = day === ep.days.length - 1;
    onHud({
      day,
      plus: countPlus(op),
      n: ep.graph.n,
      majority: ep.majority,
      phase: day === 0 ? 'start' : done ? (ep.unanimous ? 'done' : 'stuck') : 'running',
    });
  }

  function colorOf(o: number, out: Float32Array, i: number): void {
    const c = o > 0 ? RED : BLUE;
    out[3 * i] = c.r;
    out[3 * i + 1] = c.g;
    out[3 * i + 2] = c.b;
  }

  function build(): void {
    if (nodes) {
      group.remove(nodes);
      nodes.geometry.dispose();
    }
    if (edges) {
      group.remove(edges);
      edges.geometry.dispose();
    }
    ep = makeEpisode(seed++);
    const { n, offsets, adj } = ep.graph;
    const pos = ballLayout(n, seed * 31);
    from = new Float32Array(n * 3);
    to = new Float32Array(n * 3);
    mix = new Float32Array(n).fill(1);
    delay = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      colorOf(ep.days[0][v], from, v);
      colorOf(ep.days[0][v], to, v);
    }
    const ng = new BufferGeometry();
    ng.setAttribute('position', new BufferAttribute(pos, 3));
    ng.setAttribute('color', new BufferAttribute(to.slice(), 3));
    ng.setAttribute('pulse', new BufferAttribute(new Float32Array(n), 1));
    nodes = new Points(ng, nodeMat);

    edgeList = new Int32Array(ep.graph.edges * 2);
    let k = 0;
    for (let v = 0; v < n; v++) for (let i = offsets[v]; i < offsets[v + 1]; i++) if (adj[i] > v) {
      edgeList[k++] = v;
      edgeList[k++] = adj[i];
    }
    const ePos = new Float32Array(edgeList.length * 3);
    for (let j = 0; j < edgeList.length; j++) ePos.set(pos.subarray(3 * edgeList[j], 3 * edgeList[j] + 3), 3 * j);
    const eg = new BufferGeometry();
    eg.setAttribute('position', new BufferAttribute(ePos, 3));
    eg.setAttribute('color', new BufferAttribute(new Float32Array(edgeList.length * 3), 3));
    edges = new LineSegments(eg, edgeMat);
    group.add(edges, nodes);
    day = 0;
    syncColors(0);
    hud();
  }

  function advance(): void {
    const prev = ep.days[day];
    day++;
    const cur = ep.days[day];
    const rng = makeRng(seed * 977 + day);
    const colors = (nodes as Points).geometry.getAttribute('color').array as Float32Array;
    for (let v = 0; v < prev.length; v++) {
      if (prev[v] === cur[v]) continue;
      from.set(colors.subarray(3 * v, 3 * v + 3), 3 * v);
      colorOf(cur[v], to, v);
      mix[v] = 0;
      delay[v] = rng() * FLIP_SPREAD;
    }
    dayStart = clock;
    hud();
  }

  function syncColors(t: number): void {
    if (!nodes || !edges) return;
    const cAttr = nodes.geometry.getAttribute('color') as BufferAttribute;
    const pAttr = nodes.geometry.getAttribute('pulse') as BufferAttribute;
    const colors = cAttr.array as Float32Array;
    const pulse = pAttr.array as Float32Array;
    for (let v = 0; v < mix.length; v++) {
      if (mix[v] >= 1 && pulse[v] === 0) continue;
      const u = Math.min(1, Math.max(0, (t - dayStart - delay[v]) / FLIP_MS));
      mix[v] = u;
      const e = u * u * (3 - 2 * u);
      for (let c = 0; c < 3; c++) colors[3 * v + c] = from[3 * v + c] + (to[3 * v + c] - from[3 * v + c]) * e;
      pulse[v] = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
    }
    cAttr.needsUpdate = true;
    pAttr.needsUpdate = true;
    const eAttr = edges.geometry.getAttribute('color') as BufferAttribute;
    const ec = eAttr.array as Float32Array;
    for (let j = 0; j < edgeList.length; j++) {
      const v = 3 * edgeList[j];
      ec[3 * j] = colors[v];
      ec[3 * j + 1] = colors[v + 1];
      ec[3 * j + 2] = colors[v + 2];
    }
    eAttr.needsUpdate = true;
  }

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = w < 700;
    const dist = narrow ? 4.6 : 4;
    const shift = narrow ? 0 : -Math.min(1.35, 0.6 * camera.aspect);
    camera.position.set(shift, narrow ? -0.4 : -0.1, dist);
    camera.lookAt(shift, narrow ? -0.4 : -0.1, 0);
    nodeMat.uniforms.uNear.value = dist - 1;
    nodeMat.uniforms.uFar.value = dist + 1;
    camera.updateProjectionMatrix();
    nodeMat.uniforms.uScale.value = 17 * renderer.getPixelRatio() * Math.min(1.2, h / 800);
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent): void => {
    pointer.tx = e.clientX / window.innerWidth - 0.5;
    pointer.ty = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  build();

  let last = performance.now();
  let angle = 0;
  let raf = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(64, now - last);
    last = now;
    if (playing) {
      clock += dt;
      phaseT += dt;
      angle += dt * 0.00007;
    }
    if (playing) {
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
    }
    group.rotation.set(0.28 + pointer.y * 0.375, angle + pointer.x * 0.6, 0);

    let fade = 1;
    if (phase === 'fadein') {
      fade = Math.min(1, phaseT / FADE_MS);
      if (phaseT >= FADE_MS) [phase, phaseT] = ['hold', 0];
    } else if (phase === 'hold' && phaseT >= HOLD_START) {
      [phase, phaseT] = ['day', 0];
      advance();
    } else if (phase === 'day' && phaseT >= DAY_MS) {
      phaseT = 0;
      if (day < ep.days.length - 1) advance();
      else phase = 'end';
    } else if (phase === 'end' && phaseT >= HOLD_END) {
      [phase, phaseT] = ['fadeout', 0];
    } else if (phase === 'fadeout') {
      fade = 1 - Math.min(1, phaseT / FADE_MS);
      if (phaseT >= FADE_MS) {
        build();
        [phase, phaseT] = ['fadein', 0];
        fade = 0;
      }
    }
    nodeMat.uniforms.uOpacity.value = fade;
    edgeMat.opacity = 0.08 * fade;
    syncColors(clock);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setPlaying(p) {
      playing = p;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      renderer.dispose();
    },
  };
}
