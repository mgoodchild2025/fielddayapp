// Game Night tour — a scroll-driven, first-person run through nine rec-sports
// venues (tunnel → gate → volleyball → soccer → basketball → beach → hockey →
// podium → finale). Everything is drawn procedurally: court lines are flat
// additive ribbons, scoreboards are canvas textures, no image assets.
//
// The DOM (chapter cards, HUD, buttons) is rendered by GameNightTour; this
// module only reads it, drives the camera from the page's scroll position, and
// returns a cleanup that tears every listener and GPU resource down.
//
// Loaded with a dynamic import so three.js ships only with /tour.

import * as THREE from 'three'

export interface TourFonts {
  /** CSS font-family stacks (from next/font) — canvas text uses them directly. */
  display: string
  hud: string
  body: string
}

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void
type LineOpts = { y?: number; o?: number; g?: string; halo?: boolean }
interface Batch { color: number; opacity: number; group?: string; pos: number[]; idx: number[]; n: number }
interface Fade { mat: THREE.Material; base: number }
interface Panel {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  mat: THREE.MeshBasicMaterial
  redraw(fn: Draw): void
}

const TOUR_SECONDS = 54
const SEG = 70
// Where the eye goes in each chapter (x of the venue beside the run).
const FOCUS_X = [0, 0.5, 6, 19.5, 9, 6, 14.5, 7, 8]
const MARK_H = 5.1

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function startTour(root: HTMLElement, fonts: TourFonts): () => void {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches
  const MOBILE = matchMedia('(max-width: 720px), (pointer: coarse)').matches
  const DISPLAY = fonts.display
  const MONO = fonts.hud

  const chapters = [...root.querySelectorAll<HTMLElement>('.chapter')]
  const N = chapters.length
  const anchorZ = (i: number) => -i * SEG
  const hudLabel = root.querySelector<HTMLElement>('.meter-label')!
  const hudFill = root.querySelector<HTMLElement>('.meter-fill')!
  const dock = root.querySelector<HTMLButtonElement>('[data-tour-play="dock"]')!
  const doc = document.documentElement

  let disposed = false
  let raf = 0
  const cleanups: (() => void)[] = []
  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    window.addEventListener(type, fn, opts)
    cleanups.push(() => window.removeEventListener(type, fn, opts))
  }

  // ── Scroll position → a continuous chapter number ────────────────────────
  let tops: { top: number; h: number }[] = []
  const measure = () => { tops = chapters.map((c) => ({ top: c.offsetTop, h: c.offsetHeight })) }
  measure()
  const maxScroll = () => Math.max(1, doc.scrollHeight - innerHeight)
  function chapterFloat() {
    const mid = scrollY + innerHeight * 0.5
    for (let i = 0; i < N; i++) {
      const { top, h } = tops[i]
      if (mid < top + h) return Math.min(N - 1, Math.max(0, i + (mid - top) / h - 0.5))
    }
    return N - 1
  }

  // ── HUD + active chapter (works with or without WebGL) ───────────────────
  let lastActive = -1
  function updateHud(f: number) {
    const active = Math.min(N - 1, Math.max(0, Math.round(f)))
    hudFill.style.width = `${(scrollY / maxScroll()) * 100}%`
    if (active === lastActive) return
    lastActive = active
    root.toggleAttribute('data-hero', active === 0)
    chapters.forEach((c, i) => c.toggleAttribute('data-active', i === active))
    root.style.setProperty('--accent', getComputedStyle(chapters[active]).getPropertyValue('--accent').trim())
    const num = document.createElement('b')
    num.textContent = String(active + 1).padStart(2, '0')
    hudLabel.replaceChildren(num, ` / ${String(N).padStart(2, '0')} · ${chapters[active].dataset.label ?? ''}`)
  }

  // ── Autoplay: runs the tour hands-free (and makes screen-recording easy) ─
  let autoplay = false
  let autoPos = 0
  function setPlayLabels() {
    const label = dock.querySelector('.lbl')
    const icon = dock.querySelector('span[aria-hidden]')
    if (label) label.textContent = autoplay ? 'Pause tour' : scrollY >= maxScroll() - 2 ? 'Replay tour' : 'Play the tour'
    if (icon) icon.className = autoplay ? 'bars' : 'tri'
  }
  function startAuto() {
    if (scrollY >= maxScroll() - 2) window.scrollTo(0, 0)
    autoPos = scrollY
    autoplay = true
    setPlayLabels()
  }
  function stopAuto() {
    if (!autoplay) return
    autoplay = false
    setPlayLabels()
  }
  const toggle = () => (autoplay ? stopAuto() : startAuto())
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-tour-play]')) {
    b.addEventListener('click', toggle)
    cleanups.push(() => b.removeEventListener('click', toggle))
  }
  // Any manual scroll takes over — except a tap on the tour buttons themselves,
  // whose touchstart would otherwise stop the tour just before the click restarts it.
  const takeOver = (e: Event) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-tour-play]')) stopAuto()
  }
  on('wheel', takeOver, { passive: true })
  on('touchstart', takeOver, { passive: true })
  on('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) stopAuto()
  })
  on('scroll', () => { if (!autoplay) setPlayLabels() }, { passive: true })

  function stepAutoplay(dt: number) {
    if (!autoplay) return
    autoPos = Math.min(maxScroll(), autoPos + (maxScroll() / TOUR_SECONDS) * dt)
    window.scrollTo(0, autoPos)
    if (autoPos >= maxScroll() - 1) stopAuto()
  }

  // ── WebGL, or the text tour on a static glow ─────────────────────────────
  const canvas = root.querySelector<HTMLCanvasElement>('canvas.scene')!
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: false, powerPreference: 'high-performance' })
  } catch {
    root.classList.add('no-webgl')
    let last = performance.now()
    const tick = (t: number) => {
      stepAutoplay(Math.min(0.05, (t - last) / 1000)); last = t
      updateHud(chapterFloat())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      cleanups.forEach((fn) => fn())
    }
  }

  // The scene was tuned without colour management (hex in = pixels out, with
  // additive glow blended in display space) — keep it that way.
  THREE.ColorManagement.enabled = false
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2))
  renderer.setSize(innerWidth, innerHeight, false)

  const NIGHT = new THREE.Color(0x05070d)
  const DUSK = new THREE.Color(0x2a1109)
  const background = NIGHT.clone()
  const fog = new THREE.Fog(NIGHT.clone(), 18, 150)
  const scene = new THREE.Scene()
  scene.background = background
  scene.fog = fog
  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 900)

  // ── Flat glowing line batches ─────────────────────────────────────────────
  // Every court marking is a flat ribbon. Ribbons of the same colour share one
  // geometry, so a whole venue costs a handful of draw calls — important on a
  // phone. Each ribbon is drawn twice: a crisp core and a wide faint halo, which
  // with additive blending reads as a glow without any post-processing.
  const batches = new Map<string, Batch>()
  const groups: Record<string, Fade[]> = {}
  const fadeGroup = (name: string) => (groups[name] ??= [])
  function batch(color: number, opacity: number, group?: string) {
    const k = `${color}|${opacity}|${group ?? ''}`
    let b = batches.get(k)
    if (!b) { b = { color, opacity, group, pos: [], idx: [], n: 0 }; batches.set(k, b) }
    return b
  }
  function quad(b: Batch, ax: number, az: number, bx: number, bz: number, w: number, y: number) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1
    const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2)
    const i = b.n
    b.pos.push(ax + nx, y, az + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz)
    b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
    b.n += 4
  }
  function line(ax: number, az: number, bx: number, bz: number, w: number, color: number, o: LineOpts = {}) {
    const y = o.y ?? 0.03
    const op = o.o ?? 0.95
    quad(batch(color, op, o.g), ax, az, bx, bz, w, y)
    if (o.halo !== false) quad(batch(color, +(op * 0.17).toFixed(3), o.g), ax, az, bx, bz, w * 5, y - 0.004)
  }
  function rect(x0: number, z0: number, x1: number, z1: number, w: number, color: number, o?: LineOpts) {
    line(x0, z0, x1, z0, w, color, o); line(x1, z0, x1, z1, w, color, o)
    line(x1, z1, x0, z1, w, color, o); line(x0, z1, x0, z0, w, color, o)
  }
  function arc(cx: number, cz: number, r: number, a0: number, a1: number, w: number, color: number, o?: LineOpts, segs = 40) {
    for (let s = 0; s < segs; s++) {
      const t0 = a0 + ((a1 - a0) * s) / segs, t1 = a0 + ((a1 - a0) * (s + 1)) / segs
      line(cx + r * Math.cos(t0), cz + r * Math.sin(t0), cx + r * Math.cos(t1), cz + r * Math.sin(t1), w, color, o)
    }
  }
  const circle = (cx: number, cz: number, r: number, w: number, color: number, o?: LineOpts, segs = 48) =>
    arc(cx, cz, r, 0, Math.PI * 2, w, color, o, segs)
  function fill(x0: number, z0: number, x1: number, z1: number, color: number, opacity: number, g?: string) {
    quad(batch(color, opacity, g), x0, (z0 + z1) / 2, x1, (z0 + z1) / 2, Math.abs(z1 - z0), 0.01)
  }
  function flush() {
    for (const b of batches.values()) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
      geo.setIndex(b.idx)
      const mat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: b.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      scene.add(new THREE.Mesh(geo, mat))
      if (b.group) fadeGroup(b.group).push({ mat, base: b.opacity })
    }
    batches.clear()
  }

  // ── Solid bits: posts, frames, hoops ─────────────────────────────────────
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  const solidMats = new Map<string, THREE.MeshBasicMaterial>()
  function beam(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, opacity = 1) {
    const k = `${color}|${opacity}`
    let mat = solidMats.get(k)
    if (!mat) { mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }); solidMats.set(k, mat) }
    const m = new THREE.Mesh(boxGeo, mat)
    m.position.set(x, y, z); m.scale.set(sx, sy, sz)
    scene.add(m)
    return m
  }
  function net(x0: number, x1: number, z: number, y0: number, y1: number, cols: number, rows: number, color: number, opacity = 0.55) {
    const pts: number[] = []
    for (let c = 0; c <= cols; c++) { const x = x0 + ((x1 - x0) * c) / cols; pts.push(x, y0, z, x, y1, z) }
    for (let r = 0; r <= rows; r++) { const y = y0 + ((y1 - y0) * r) / rows; pts.push(x0, y, z, x1, y, z) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })))
  }

  // ── Soft glow sprite (floodlights, the sun, tunnel mouth) ────────────────
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.7)')
    grd.addColorStop(0.45, 'rgba(255,255,255,0.16)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()
  function flare(x: number, y: number, z: number, size: number, color: number, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    s.position.set(x, y, z); s.scale.set(size, size, 1)
    scene.add(s)
    return s
  }

  // ── Canvas panels: scoreboards, schedules, standings, signs ──────────────
  function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
  }
  function panelBase(g: CanvasRenderingContext2D, w: number, h: number, accent: string) {
    g.clearRect(0, 0, w, h)
    rr(g, 6, 6, w - 12, h - 12, 28); g.fillStyle = 'rgba(8,12,20,0.86)'; g.fill()
    g.lineWidth = 4; g.strokeStyle = accent; g.shadowColor = accent; g.shadowBlur = 24; g.stroke(); g.shadowBlur = 0
  }
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  function makePanel(w: number, h: number, draw: Draw, pw: number, ph: number): Panel {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d')!
    draw(g, w, h)
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = maxAniso
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat)
    scene.add(mesh)
    return { mesh, mat, redraw(fn) { fn(g, w, h); tex.needsUpdate = true } }
  }

  // ── The world ────────────────────────────────────────────────────────────
  const venues: Record<string, number> = {}
  chapters.forEach((c, i) => { venues[c.dataset.venue ?? String(i)] = anchorZ(i) })
  const ZEND = anchorZ(N - 1)

  // Animated pieces, assigned inside buildWorld.
  let tunnelMouth: THREE.Sprite | undefined
  let volleyBall: THREE.Mesh | undefined
  let scoreboard: Panel | undefined
  let tiles: (Panel & { baseY: number })[] = []
  let jumbo: THREE.Group | undefined
  let sun: THREE.Sprite | undefined
  let sunCore: THREE.Sprite | undefined
  let payPanel: Panel | undefined
  let champ: THREE.Sprite | undefined
  let medal: THREE.Group | undefined
  let medalY = 0
  let finaleMark: THREE.Mesh | undefined
  let markW = MARK_H * (1480 / 520)

  function buildWorld() {
    // Floor and a faint survey grid: gives the run a sense of speed.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 1100), new THREE.MeshBasicMaterial({ color: 0x070b14 }))
    floor.rotation.x = -Math.PI / 2; floor.position.set(20, -0.01, ZEND / 2); scene.add(floor)
    for (let z = 40; z > ZEND - 120; z -= 6) line(-40, z, 80, z, 0.03, 0x3b4a66, { o: 0.16, halo: false, y: 0.005 })
    for (let x = -40; x <= 80; x += 6) line(x, 40, x, ZEND - 120, 0.03, 0x3b4a66, { o: 0.16, halo: false, y: 0.005 })

    // Floodlight towers down both sides of the run.
    for (let z = -40; z > ZEND - 60; z -= 36) {
      for (const x of [-11, 44]) {
        beam(x, 9, z, 0.35, 18, 0.35, 0x1b2436)
        beam(x, 18.4, z, 3.2, 1.2, 0.5, 0xfff1d6)
        flare(x, 18.4, z + 0.4, 9, 0xfff1d6, 0.85)
      }
    }

    // 1 · Tunnel: frames that switch on in sequence at load.
    const tz = venues.tunnel
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x1a2233 })
    for (let k = 0; k < 22; k++) {
      const z = tz + 16 - k * 2.3
      const g = `tun${Math.min(5, Math.floor(k / 4))}`
      line(-3.2, z, 3.2, z, 0.06, 0xffe2b0, { y: 4.2, g, o: 0.5, halo: false })
      line(-3.2, z + 0.02, -3.2, z - 0.02, 0.06, 0xffe2b0, { g })
      line(3.2, z + 0.02, 3.2, z - 0.02, 0.06, 0xffe2b0, { g })
      line(-2.6, z, -2.6, z - 1.6, 0.12, 0x22d39a, { g, o: 0.9 })
      line(2.6, z, 2.6, z - 1.6, 0.12, 0x22d39a, { g, o: 0.9 })
      const top = new THREE.Mesh(boxGeo, frameMat)
      top.position.set(0, 4.3, z); top.scale.set(7, 0.2, 0.3); scene.add(top)
      for (const x of [-3.4, 3.4]) { const s = new THREE.Mesh(boxGeo, frameMat); s.position.set(x, 2.15, z); s.scale.set(0.2, 4.3, 0.3); scene.add(s) }
      const stripMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0 })
      const strip = new THREE.Mesh(boxGeo, stripMat)
      strip.position.set(0, 4.15, z); strip.scale.set(5.6, 0.06, 0.06); scene.add(strip)
      fadeGroup(`${g}s`).push({ mat: stripMat, base: 0.9 })
    }
    tunnelMouth = flare(0, 2.2, tz - 36, 26, 0xfff1d6, 0)

    // 2 · Registration arch with a waiver QR code.
    const gz = venues.gate
    beam(-3.8, 3.2, gz, 0.5, 6.4, 0.5, 0x0e1a1a); beam(3.8, 3.2, gz, 0.5, 6.4, 0.5, 0x0e1a1a); beam(0, 6.5, gz, 8.1, 0.5, 0.5, 0x0e1a1a)
    line(-3.8, gz, 3.8, gz, 0.1, 0x22d39a, { y: 6.8 })
    for (const x of [-3.8, 3.8]) for (let y = 0.6; y < 6.4; y += 0.9) beam(x, y, gz + 0.3, 0.55, 0.06, 0.06, 0x22d39a)
    line(-3.8, gz + 0.3, 3.8, gz + 0.3, 0.14, 0x22d39a, { o: 0.9 })
    const sign = makePanel(1024, 200, (g, w, h) => {
      panelBase(g, w, h, '#22d39a')
      g.fillStyle = '#22d39a'; g.font = `900 110px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('REGISTRATION OPEN', w / 2, h / 2 + 6)
    }, 7.4, 1.45)
    sign.mesh.position.set(0, 7.7, gz + 0.2)
    const qr = makePanel(512, 640, (g, w, h) => {
      panelBase(g, w, h, '#22d39a')
      const cells = 25, size = 16, ox = (w - cells * size) / 2, oy = 70
      g.fillStyle = '#eef2f7'
      let seed = 7
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
      const finder = (cx: number, cy: number) => {
        g.fillRect(ox + cx * size, oy + cy * size, 7 * size, 7 * size)
        g.fillStyle = '#080c14'; g.fillRect(ox + (cx + 1) * size, oy + (cy + 1) * size, 5 * size, 5 * size)
        g.fillStyle = '#eef2f7'; g.fillRect(ox + (cx + 2) * size, oy + (cy + 2) * size, 3 * size, 3 * size)
      }
      for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
        const inFinder = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)
        if (!inFinder && rnd() > 0.52) g.fillRect(ox + x * size, oy + y * size, size, size)
      }
      finder(0, 0); finder(18, 0); finder(0, 18)
      g.fillStyle = '#22d39a'; g.font = `600 44px ${MONO}`; g.textAlign = 'center'
      g.fillText('SCAN TO SIGN', w / 2, oy + cells * size + 80)
      g.fillStyle = '#a3adbd'; g.font = `500 28px ${MONO}`
      g.fillText('WAIVER · 2026 SEASON', w / 2, oy + cells * size + 125)
    }, 2.3, 2.9)
    qr.mesh.position.set(5.2, 2.4, gz + 5); qr.mesh.rotation.y = -0.35

    // 3 · Volleyball: 9 × 18 court beside the run, net, scoreboard.
    const vz = venues.volleyball, VC = 0x7cd8ff
    rect(1.5, vz - 9, 10.5, vz + 9, 0.08, VC)
    line(1.5, vz, 10.5, vz, 0.08, VC)
    line(1.5, vz - 3, 10.5, vz - 3, 0.06, VC, { o: 0.7 }); line(1.5, vz + 3, 10.5, vz + 3, 0.06, VC, { o: 0.7 })
    beam(0.9, 1.25, vz, 0.12, 2.5, 0.12, 0xcfe9ff); beam(11.1, 1.25, vz, 0.12, 2.5, 0.12, 0xcfe9ff)
    net(1, 11, vz, 1.45, 2.43, 40, 6, VC, 0.5)
    beam(6, 2.43, vz, 10, 0.05, 0.05, 0xffffff)
    volleyBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.9 }))
    scene.add(volleyBall)
    scoreboard = makePanel(1024, 512, () => {}, 6.4, 3.2)
    scoreboard.mesh.position.set(7.2, 5.6, vz - 11); scoreboard.mesh.rotation.y = -0.22
    drawScore(18, 17)

    // 4 · Soccer: mown stripes, full markings, fixtures rising off the grass.
    const sz = venues.soccer, SC = 0xe8f6ec
    for (let k = 0; k < 8; k += 2) fill(1.5, sz + 28 - k * 7, 37.5, sz + 21 - k * 7, 0x1f8a4c, 0.07)
    rect(1.5, sz - 28, 37.5, sz + 28, 0.1, SC)
    line(1.5, sz, 37.5, sz, 0.1, SC)
    circle(19.5, sz, 5.5, 0.1, SC)
    rect(10, sz + 28, 29, sz + 20, 0.1, SC, { o: 0.85 }); rect(10, sz - 28, 29, sz - 20, 0.1, SC, { o: 0.85 })
    rect(15, sz + 28, 24, sz + 25, 0.08, SC, { o: 0.7 }); rect(15, sz - 28, 24, sz - 25, 0.08, SC, { o: 0.7 })
    for (const end of [sz + 28, sz - 28]) {
      const back = end > sz ? end + 1.6 : end - 1.6
      beam(16.4, 1.2, end, 0.14, 2.4, 0.14, 0xffffff); beam(22.6, 1.2, end, 0.14, 2.4, 0.14, 0xffffff); beam(19.5, 2.4, end, 6.3, 0.14, 0.14, 0xffffff)
      net(16.4, 22.6, back, 0, 2.4, 18, 7, SC, 0.28)
    }
    const fixtures = [
      ['WK 4 · FRI 7:00 PM', 'FIELD 2', 'STRIKERS', 'ROVERS'],
      ['WK 4 · FRI 8:15 PM', 'FIELD 1', 'UNITED FC', 'THE KEEPERS'],
      ['WK 5 · FRI 7:00 PM', 'FIELD 3', 'ROVERS', 'NORTH END'],
    ]
    tiles = fixtures.map((f, i) => {
      const p = makePanel(1024, 360, (g, w, h) => {
        panelBase(g, w, h, '#8fe6a8')
        g.fillStyle = '#8fe6a8'; g.font = `600 44px ${MONO}`; g.textBaseline = 'top'
        g.fillText(f[0], 48, 44); g.textAlign = 'right'; g.fillStyle = '#a3adbd'; g.fillText(f[1], w - 48, 44); g.textAlign = 'left'
        g.fillStyle = '#eef2f7'; g.font = `900 96px ${DISPLAY}`
        g.fillText(f[2], 48, 130); g.fillStyle = '#8fe6a8'; g.font = `700 60px ${DISPLAY}`; g.fillText('VS', 48, 238)
        g.fillStyle = '#eef2f7'; g.font = `900 96px ${DISPLAY}`; g.fillText(f[3], 140, 222)
      }, 4.6, 1.62)
      p.mesh.position.set(9 + i * 7, 0, sz + 6 - i * 9); p.mesh.rotation.y = -0.3
      return { ...p, baseY: 3.2 + i * 0.9 }
    })

    // 5 · Basketball: keys, arcs, hoops, a jumbotron with the standings.
    const bz = venues.basketball, BC = 0xffa53d
    rect(1.5, bz - 14, 16.5, bz + 14, 0.08, BC)
    line(1.5, bz, 16.5, bz, 0.08, BC); circle(9, bz, 1.8, 0.08, BC)
    for (const dir of [1, -1]) {
      const base = bz + dir * 14
      rect(6.55, base, 11.45, base - dir * 5.8, 0.08, BC, { o: 0.9 })
      fill(6.55, base, 11.45, base - dir * 5.8, 0xffa53d, 0.05)
      circle(9, base - dir * 5.8, 1.8, 0.07, BC, { o: 0.8 })
      arc(9, base - dir * 1.575, 6.75, dir > 0 ? Math.PI : 0, dir > 0 ? Math.PI * 2 : Math.PI, 0.08, BC, {}, 50)
      beam(9, 3.4, base - dir * 1.2, 1.8, 1.05, 0.05, 0xffffff, 0.35)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff7a1a }))
      rim.rotation.x = Math.PI / 2; rim.position.set(9, 3.05, base - dir * 1.575); scene.add(rim)
      beam(9, 1.6, base + dir * 0.3, 0.12, 3.2, 0.12, 0x2a3346)
    }
    const standing = makePanel(1024, 640, (g, w, h) => {
      panelBase(g, w, h, '#ffa53d')
      g.fillStyle = '#ffa53d'; g.font = `900 92px ${DISPLAY}`; g.textBaseline = 'top'; g.fillText('STANDINGS', 56, 40)
      g.fillStyle = '#a3adbd'; g.font = `600 32px ${MONO}`; g.textAlign = 'right'; g.fillText('W–L   STRK', w - 56, 70); g.textAlign = 'left'
      const rows = [['1', 'HOOP DREAMS', '9–1', 'W5'], ['2', 'FAST BREAK', '8–2', 'W2'], ['3', 'BACKBOARD', '6–4', 'L1'], ['4', 'NOTHING BUT NET', '5–5', 'W1']]
      rows.forEach((r, i) => {
        const y = 170 + i * 108
        g.fillStyle = i === 0 ? 'rgba(255,165,61,0.16)' : 'rgba(255,255,255,0.04)'; rr(g, 40, y - 12, w - 80, 92, 16); g.fill()
        g.fillStyle = i === 0 ? '#ffa53d' : '#eef2f7'; g.font = `900 64px ${DISPLAY}`; g.fillText(r[0], 64, y)
        g.fillStyle = '#eef2f7'; g.fillText(r[1], 130, y)
        g.font = `600 44px ${MONO}`; g.textAlign = 'right'; g.fillText(r[2], w - 230, y + 12)
        g.fillStyle = r[3].startsWith('W') ? '#22d39a' : '#ff6b7a'; g.fillText(r[3], w - 64, y + 12); g.textAlign = 'left'
      })
    }, 6, 3.75)
    jumbo = new THREE.Group()
    for (let s = 0; s < 4; s++) {
      const face = new THREE.Mesh(standing.mesh.geometry, standing.mat)
      face.position.set(Math.sin((s * Math.PI) / 2) * 3.02, 0, Math.cos((s * Math.PI) / 2) * 3.02)
      face.rotation.y = (s * Math.PI) / 2
      jumbo.add(face)
    }
    scene.remove(standing.mesh)
    jumbo.add(new THREE.Mesh(new THREE.BoxGeometry(6, 3.9, 6), new THREE.MeshBasicMaterial({ color: 0x0b1019 })))
    jumbo.position.set(9, 8.6, bz - 9); scene.add(jumbo)
    beam(9, 12.9, bz - 9, 0.08, 4.6, 0.08, 0x2a3346)

    // 6 · Beach: a sunset, sand, a net — and an e-transfer landing.
    const ez = venues.beach, EC = 0xffd08a
    rect(1.5, ez - 9, 10.5, ez + 9, 0.12, EC, { o: 0.85 })
    line(1.5, ez, 10.5, ez, 0.08, EC, { o: 0.6 })
    beam(0.9, 1.25, ez, 0.14, 2.5, 0.14, 0xffe0b0); beam(11.1, 1.25, ez, 0.14, 2.5, 0.14, 0xffe0b0)
    net(1, 11, ez, 1.45, 2.43, 36, 6, EC, 0.5)
    sun = flare(34, 7, ez - 150, 90, 0xff9d4d, 0)
    sunCore = flare(34, 7, ez - 150, 40, 0xffe0a8, 0)
    payPanel = makePanel(1024, 520, (g, w, h) => {
      panelBase(g, w, h, '#ffc56b')
      g.textBaseline = 'top'
      g.fillStyle = '#22d39a'; g.font = `600 40px ${MONO}`; g.fillText('● E-TRANSFER RECEIVED', 56, 50)
      g.fillStyle = '#eef2f7'; g.font = `900 150px ${DISPLAY}`; g.fillText('$96.05', 56, 120)
      g.fillStyle = '#a3adbd'; g.font = `600 36px ${MONO}`
      g.fillText('SEASON PASS · SAND SHARKS', 56, 300)
      g.fillStyle = '#ffc56b'; g.fillText('INCL. HST 13%  $11.05', 56, 360)
      g.fillStyle = '#a3adbd'; g.textAlign = 'right'; g.fillText('RECORDED BY ADMIN', w - 56, 430); g.textAlign = 'left'
    }, 5.2, 2.64)
    payPanel.mesh.position.set(7.5, 4.2, ez - 8); payPanel.mesh.rotation.y = -0.25

    // 7 · Hockey: rink boards, lines, circles — and the bracket on the ice.
    const hz = venues.hockey, HL = 0xbfe9ff, RED = 0xff4d5e, BLUE = 0x4d8bff
    const x0 = 1.5, x1 = 27.5, z0 = hz - 28, z1 = hz + 28, R = 7
    fill(x0, z0, x1, z1, 0x9fd8ff, 0.035)
    line(x0 + R, z0, x1 - R, z0, 0.12, HL); line(x0 + R, z1, x1 - R, z1, 0.12, HL)
    line(x0, z0 + R, x0, z1 - R, 0.12, HL); line(x1, z0 + R, x1, z1 - R, 0.12, HL)
    arc(x0 + R, z0 + R, R, Math.PI, Math.PI * 1.5, 0.12, HL, {}, 16); arc(x1 - R, z0 + R, R, Math.PI * 1.5, Math.PI * 2, 0.12, HL, {}, 16)
    arc(x1 - R, z1 - R, R, 0, Math.PI * 0.5, 0.12, HL, {}, 16); arc(x0 + R, z1 - R, R, Math.PI * 0.5, Math.PI, 0.12, HL, {}, 16)
    line(x0, hz, x1, hz, 0.22, RED); line(x0, hz + 9, x1, hz + 9, 0.2, BLUE); line(x0, hz - 9, x1, hz - 9, 0.2, BLUE)
    line(x0 + 2, z1 - 4, x1 - 2, z1 - 4, 0.07, RED, { o: 0.8 }); line(x0 + 2, z0 + 4, x1 - 2, z0 + 4, 0.07, RED, { o: 0.8 })
    circle((x0 + x1) / 2, hz, 3.8, 0.07, BLUE, { o: 0.8 })
    for (const [fx, fz] of [[8, z1 - 11], [21, z1 - 11], [8, z0 + 11], [21, z0 + 11]]) circle(fx, fz, 3.8, 0.07, RED, { o: 0.7 })
    // Bracket: 8 → 4 → 2 → champion, laid on the ice so the rounds run away
    // from you and converge on the champion's glow — revealed round by round.
    const BG = 0x22d39a, GOLD = 0xffc84a
    const rz = [hz + 3, hz - 3, hz - 9, hz - 15, hz - 21]
    let xs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 4 + i * 3.1)
    for (let r = 0; r < 4; r++) {
      const g = `br${r}`, col = r === 3 ? GOLD : BG, w = r === 3 ? 0.24 : 0.16
      const next: number[] = []
      for (let i = 0; i < xs.length; i += 2) {
        const a = xs[i], b = xs[i + 1] ?? xs[i], m = (a + b) / 2
        if (r < 3) {
          line(a, rz[r], a, rz[r] - 3, w, col, { g }); line(b, rz[r], b, rz[r] - 3, w, col, { g })
          line(a, rz[r] - 3, b, rz[r] - 3, w, col, { g }); line(m, rz[r] - 3, m, rz[r + 1], w, col, { g })
        } else line(a, rz[r], a, rz[r + 1], w, col, { g })
        next.push(m)
      }
      if (r < 3) xs = next
    }
    champ = flare(xs[0], 0.8, rz[4], 7, GOLD, 0)
    for (const end of [z1 - 4, z0 + 4]) {
      beam(12.9, 0.6, end, 0.1, 1.2, 0.1, RED); beam(16.1, 0.6, end, 0.1, 1.2, 0.1, RED); beam(14.5, 1.2, end, 3.3, 0.1, 0.1, RED)
    }

    // 8 · Podium: 1-2-3 lit from within under gold spotlights, confetti falling.
    const pz = venues.podium - 8
    const METAL: Record<string, [string, string]> = { '1': ['#ffd66b', '#b8860b'], '2': ['#eef2f7', '#8d99ab'], '3': ['#f0a868', '#8a4f22'] }
    // A pool of light on the floor so the stage reads against the night.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc84a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }))
    pool.rotation.x = -Math.PI / 2; pool.position.set(8.2, 0.02, pz); pool.scale.set(19, 13, 1); scene.add(pool)
    const blocks: [number, number, string][] = [[8.2, 2.2, '1'], [5.6, 1.5, '2'], [10.8, 1.0, '3']]
    for (const [x, h, n] of blocks) {
      const [hi, lo] = METAL[n]
      beam(x, h / 2, pz, 2.4, h, 2.4, 0x26324a)
      beam(x, h + 0.03, pz, 2.46, 0.06, 2.46, 0xffc84a, 0.75)
      rect(x - 1.2, pz - 1.2, x + 1.2, pz + 1.2, 0.07, 0xffe29a, { y: h + 0.07 })
      // Front face: lit metal gradient with the place number.
      const face = makePanel(256, Math.round((256 * h) / 2.4), (g, w, hh) => {
        const grd = g.createLinearGradient(0, 0, 0, hh)
        grd.addColorStop(0, hi); grd.addColorStop(1, lo)
        g.fillStyle = grd; g.fillRect(0, 0, w, hh)
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, 6)
        g.fillStyle = '#0b1019'; g.font = `900 ${Math.min(190, hh * 0.8)}px ${DISPLAY}`
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, w / 2, hh / 2 + 8)
      }, 2.4, h)
      face.mesh.position.set(x, h / 2, pz + 1.21)
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 12, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      cone.position.set(x, h + 6, pz); scene.add(cone)
      flare(x, h + 12, pz, 6, 0xfff0c0, 1)
      flare(x, h + 0.2, pz + 1.3, 3.2, 0xffd97a, 0.35)
    }
    // The gold medal spins over first place.
    medal = new THREE.Group()
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 40), new THREE.MeshBasicMaterial({ color: 0xffc84a }))
    disc.rotation.x = Math.PI / 2
    medal.add(disc, new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })))
    const star = makePanel(256, 256, (g, w) => {
      g.clearRect(0, 0, w, w); g.fillStyle = '#9a6a00'; g.beginPath()
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 44 : 104, a = -Math.PI / 2 + (k * Math.PI) / 5; g.lineTo(w / 2 + r * Math.cos(a), w / 2 + r * Math.sin(a)) }
      g.closePath(); g.fill()
    }, 0.9, 0.9)
    scene.remove(star.mesh)
    const front = star.mesh, back = star.mesh.clone()
    front.position.z = 0.06; back.position.z = -0.06; back.rotation.y = Math.PI
    const ribbon = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x22d39a }))
    ribbon.scale.set(0.34, 1.1, 0.02); ribbon.position.set(0, 1.05, 0)
    medal.add(front, back, ribbon)
    medalY = 4.2
    medal.position.set(8.2, medalY, pz); scene.add(medal)
    flare(8.2, 4.2, pz - 0.3, 4.5, 0xffd97a, 0.55)
    const banner = makePanel(512, 768, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.beginPath(); g.moveTo(20, 20); g.lineTo(w - 20, 20); g.lineTo(w - 20, h - 150); g.lineTo(w / 2, h - 20); g.lineTo(20, h - 150); g.closePath()
      g.fillStyle = '#0f7a5a'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#ffc84a'; g.stroke()
      g.fillStyle = '#ffc84a'; g.textAlign = 'center'; g.font = `900 150px ${DISPLAY}`; g.fillText('2026', w / 2, 230)
      g.fillStyle = '#eef2f7'; g.font = `900 92px ${DISPLAY}`; g.fillText('GOLD', w / 2, 360); g.fillText('CHAMPS', w / 2, 460)
    }, 2.2, 3.3)
    banner.mesh.position.set(13.8, 5.2, pz - 3.5); banner.mesh.rotation.y = -0.35

    // 9 · Finale: an emerald ring and the wordmark.
    const fz = venues.finale
    circle(8, fz - 12, 9, 0.16, 0x22d39a, { g: 'ring' }, 80)
    circle(8, fz - 12, 5.5, 0.08, 0x22d39a, { g: 'ring', o: 0.6 }, 64)
    // Canvas sized to the measured text plus room for the glow, so the plane
    // is the word and placeFinale() can frame it exactly.
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = `900 400px ${DISPLAY}`
    const markPx = Math.ceil(probe.measureText('FIELDDAY').width) + 160
    markW = (MARK_H * markPx) / 520
    const mark = makePanel(markPx, 520, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.font = `900 400px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.shadowColor = '#22d39a'; g.shadowBlur = 60; g.fillStyle = '#22d39a'; g.fillText('FIELDDAY', w / 2, h / 2 + 20)
      g.shadowBlur = 0; g.fillStyle = '#eafff6'; g.fillText('FIELDDAY', w / 2, h / 2 + 20)
    }, markW, MARK_H)
    mark.mat.fog = false
    finaleMark = mark.mesh

    flush()
  }

  let lastScore = ''
  function drawScore(home: number, away: number) {
    const key = `${home}-${away}`
    if (key === lastScore || !scoreboard) return
    lastScore = key
    scoreboard.redraw((g, w, h) => {
      panelBase(g, w, h, '#7cd8ff')
      g.textBaseline = 'top'; g.fillStyle = '#7cd8ff'; g.font = `600 38px ${MONO}`
      g.fillText('● LIVE · SET 3', 52, 40); g.textAlign = 'right'; g.fillStyle = '#a3adbd'; g.fillText('SETS 1–1', w - 52, 40)
      g.textAlign = 'center'; g.fillStyle = '#a3adbd'; g.font = `600 40px ${MONO}`
      g.fillText('HOME', w * 0.27, 120); g.fillText('AWAY', w * 0.73, 120)
      g.fillStyle = '#eef2f7'; g.font = `900 250px ${DISPLAY}`
      g.fillText(String(home), w * 0.27, 175); g.fillText(String(away), w * 0.73, 175)
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(w / 2 - 2, 150, 4, 280)
      g.textAlign = 'left'
    })
  }

  // ── Particles ────────────────────────────────────────────────────────────
  let dust: THREE.Points | undefined
  let confetti: THREE.Points | undefined
  function buildParticles() {
    const pts = (count: number, fillFn: (i: number, p: Float32Array, c: Float32Array) => void, material: THREE.PointsMaterial) => {
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) fillFn(i, pos, col)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const p = new THREE.Points(g, material); scene.add(p); return p
    }
    const pm = (size: number, attenuate = true, useFog = true, opacity = 0.9) =>
      new THREE.PointsMaterial({ size, sizeAttenuation: attenuate, vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: useFog })
    const scale = MOBILE ? 0.5 : 1

    // Stars
    pts(Math.round(900 * scale), (i, p, c) => {
      p[i * 3] = Math.random() * 300 - 100; p[i * 3 + 1] = 30 + Math.random() * 90; p[i * 3 + 2] = 60 - Math.random() * (Math.abs(ZEND) + 260)
      const b = 0.5 + Math.random() * 0.5; c[i * 3] = b; c[i * 3 + 1] = b; c[i * 3 + 2] = b * 1.05
    }, pm(1.6, false, false, 0.8))

    dust = pts(Math.round(700 * scale), (i, p, c) => {
      p[i * 3] = Math.random() * 50 - 12; p[i * 3 + 1] = Math.random() * 12; p[i * 3 + 2] = 10 - Math.random() * 90
      c[i * 3] = 1; c[i * 3 + 1] = 0.9; c[i * 3 + 2] = 0.75
    }, pm(0.06, true, true, 0.55))

    // Sand
    const ez = venues.beach
    pts(Math.round(2600 * scale), (i, p, c) => {
      p[i * 3] = Math.random() * 40 - 6; p[i * 3 + 1] = Math.random() * 0.08; p[i * 3 + 2] = ez + 35 - Math.random() * 70
      const w = 0.7 + Math.random() * 0.3; c[i * 3] = w; c[i * 3 + 1] = w * 0.72; c[i * 3 + 2] = w * 0.42
    }, pm(0.07, true, true, 0.8))

    const pz = venues.podium - 8
    const palette = [[1, 0.78, 0.29], [0.13, 0.83, 0.6], [0.93, 0.95, 0.97], [0.49, 0.85, 1]]
    confetti = pts(Math.round(500 * scale), (i, p, c) => {
      p[i * 3] = 3 + Math.random() * 12; p[i * 3 + 1] = Math.random() * 14; p[i * 3 + 2] = pz + 6 - Math.random() * 14
      const k = palette[i % palette.length]; c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]
    }, pm(0.11, true, true, 0.95))
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  const venueIndex = (name: string) => chapters.findIndex((c) => c.dataset.venue === name)
  const local = (name: string, f: number) => f - venueIndex(name)   // 0 = centred on that chapter
  const portrait = () => innerWidth / innerHeight < 0.8

  // Aim at the venue: a gentle glance on wide screens, a full turn on a
  // phone (portrait sees only ~±17°), lifted so the court clears the card.
  function aim(f: number, z: number) {
    const fi = Math.min(N - 2, Math.floor(f)), ft = smooth(0, 1, f - fi)
    const focus = FOCUS_X[fi] + (FOCUS_X[fi + 1] - FOCUS_X[fi]) * ft
    const tall = portrait()
    return {
      eyeY: tall ? 2.5 : 1.72,
      lookX: tall ? focus * 0.8 : focus * 0.42,
      lookY: tall ? 0.1 : 1.35,
      lookZ: z - (tall ? 14 : 22),
      fov: tall ? 82 : 66,
    }
  }

  // Frame the wordmark into whatever space the finale card leaves free when the
  // run comes to rest: beside the card on wide screens, above it on narrow ones.
  // Solved from the resting camera, so it lands clear of the card at any size,
  // and re-solved whenever the layout it depends on changes.
  let finaleKey = ''
  const finaleCard = root.querySelector<HTMLElement>('.chapter.finale > .card')
  function placeFinale() {
    if (!finaleMark || !finaleCard) return
    const rect = finaleCard.getBoundingClientRect()
    const cardTop = rect.top + (maxScroll() - scrollY)
    const key = `${innerWidth}x${innerHeight}|${Math.round(cardTop)}|${Math.round(rect.right)}`
    if (key === finaleKey) return
    finaleKey = key
    const hud = 76, pad = 24
    const side = innerWidth - rect.right - pad * 2 > innerWidth * 0.4
    const box = side
      ? { x0: rect.right + pad, x1: innerWidth - pad, y0: hud, y1: innerHeight * 0.75 }
      : { x0: pad, x1: innerWidth - pad, y0: hud, y1: cardTop - 16 }
    const wPx = Math.max(60, Math.min(box.x1 - box.x0, ((box.y1 - box.y0) * markW) / MARK_H) * 0.9)
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2

    const zEnd = 6 - (N - 1) * SEG
    const p = aim(N - 1, zEnd)
    const rest = new THREE.PerspectiveCamera(p.fov, innerWidth / innerHeight, 0.1, 900)
    rest.position.set(0, p.eyeY, zEnd); rest.lookAt(p.lookX, p.lookY, p.lookZ)
    rest.updateMatrixWorld(); rest.updateProjectionMatrix()
    const tanH = Math.tan(THREE.MathUtils.degToRad(p.fov / 2)) * rest.aspect
    const depth = markW / ((wPx / innerWidth) * 2 * tanH)
    const dir = new THREE.Vector3((cx / innerWidth) * 2 - 1, 1 - (cy / innerHeight) * 2, 0.5).unproject(rest).sub(rest.position).normalize()
    const fwd = new THREE.Vector3(); rest.getWorldDirection(fwd)
    finaleMark.position.copy(rest.position).addScaledVector(dir, depth / dir.dot(fwd))
    finaleMark.quaternion.copy(rest.quaternion)
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  let camZ = 6, bootAt = 0, lastT = 0
  const tmpColor = new THREE.Color()
  function frame(t: number) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t
    if (!bootAt) bootAt = t
    stepAutoplay(dt)

    const f = chapterFloat()
    updateHud(f)
    if (f > N - 2.5) placeFinale()

    // Camera: continuous run normally; one cut per chapter under reduced motion.
    const target = REDUCE ? anchorZ(Math.round(f)) + 6 : 6 + f * -SEG
    if (REDUCE) camZ = target
    else camZ += (target - camZ) * (1 - Math.pow(0.001, dt))
    const speed = Math.abs(target - camZ)
    const moving = Math.min(1, speed * 0.6)
    const bob = REDUCE ? 0 : Math.sin(camZ * 1.15) * 0.07 * moving
    const sway = REDUCE ? 0 : Math.sin(camZ * 0.575) * 0.05 * moving
    const p = aim(f, camZ)
    camera.position.set(sway, p.eyeY + bob, camZ)
    camera.lookAt(p.lookX, p.lookY + bob * 0.3, p.lookZ)
    camera.rotation.z += sway * 0.12
    const fov = REDUCE ? p.fov : p.fov + Math.min(12, speed * 1.1)
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix() }

    // Tunnel lights: flicker on, stage by stage, once at load.
    const since = (t - bootAt) / 1000
    for (let s = 0; s < 6; s++) {
      const start = 0.25 + s * 0.22
      const lit = REDUCE || since > start + 0.35 ? 1 : since < start ? 0 : Math.sin((since - start) * 90 + s) > -0.2 ? 1 : 0.15
      for (const m of groups[`tun${s}`] ?? []) m.mat.opacity = m.base * lit
      for (const m of groups[`tun${s}s`] ?? []) m.mat.opacity = m.base * lit
    }
    if (tunnelMouth) tunnelMouth.material.opacity = (REDUCE ? 1 : smooth(1.2, 2.2, since)) * (0.55 + 0.45 * smooth(-0.2, 0.9, f))

    // Volleyball: the ball arcs over the net; the score ticks as you pass.
    if (volleyBall) {
      const k = REDUCE ? 0.4 : ((t / 1000) * 0.45) % 1
      volleyBall.position.set(6 + Math.sin(k * Math.PI * 2) * 0.6, 1.3 + Math.sin(k * Math.PI) * 3.4, venues.volleyball + 6 - k * 12)
      volleyBall.rotation.x += dt * 3; volleyBall.rotation.y += dt * 2
    }
    const vp = smooth(-0.8, 0.5, local('volleyball', f))
    drawScore(18 + Math.round(vp * 7), 17 + Math.round(vp * 5))

    // Soccer: this week's fixtures rise off the grass.
    const ls = local('soccer', f)
    tiles.forEach((p, i) => {
      const r = REDUCE ? 1 : smooth(-1 + i * 0.18, -0.2 + i * 0.18, ls)
      p.mesh.position.y = p.baseY - 3.2 + r * 3.2
      p.mat.opacity = r
    })

    // Basketball: the jumbotron turns slowly. Podium: the medal spins and bobs.
    if (jumbo && !REDUCE) jumbo.rotation.y += dt * 0.28
    if (medal && !REDUCE) { medal.rotation.y += dt * 1.1; medal.position.y = medalY + Math.sin(t / 700) * 0.12 }

    // Beach: dusk washes in; the sun rises; the payment lands.
    const lb = local('beach', f)
    const dusk = smooth(-1.1, -0.2, lb) * (1 - smooth(0.6, 1.3, lb))
    tmpColor.copy(NIGHT).lerp(DUSK, dusk)
    background.copy(tmpColor); fog.color.copy(tmpColor)
    if (sun) sun.material.opacity = dusk * 0.85
    if (sunCore) sunCore.material.opacity = dusk
    if (payPanel) payPanel.mat.opacity = REDUCE ? 1 : smooth(-0.7, 0.05, lb)

    // Hockey: the bracket lights up round by round.
    const lh = local('hockey', f)
    for (let s = 0; s < 4; s++) {
      const r = REDUCE ? 1 : smooth(-0.9 + s * 0.28, -0.6 + s * 0.28, lh)
      for (const m of groups[`br${s}`] ?? []) m.mat.opacity = m.base * r
    }
    if (champ) champ.material.opacity = (REDUCE ? 1 : smooth(0.1, 0.4, lh)) * (0.75 + 0.25 * Math.sin(t / 250))

    // Podium: confetti falls while you're close.
    if (confetti && Math.abs(local('podium', f)) < 1.6 && !REDUCE) {
      const a = confetti.geometry.attributes.position
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * (1.2 + (i % 5) * 0.25)
        if (y < 0) y += 14
        a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t / 700 + i) * dt * 0.3)
      }
      a.needsUpdate = true
    }

    // Finale ring breathes.
    const ring = REDUCE ? 1 : 0.75 + 0.25 * Math.sin(t / 600)
    for (const m of groups.ring ?? []) m.mat.opacity = m.base * ring

    // Dust hangs around the runner.
    if (dust) {
      const a = dust.geometry.attributes.position
      for (let i = 0; i < a.count; i++) {
        let z = a.getZ(i)
        if (z > camZ + 12) z -= 90; else if (z < camZ - 78) z += 90
        if (!REDUCE) a.setY(i, (a.getY(i) + dt * 0.08) % 12)
        a.setZ(i, z)
      }
      a.needsUpdate = true
    }

    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    measure()
    placeFinale()
  }
  on('resize', resize)

  // Canvas text needs the web fonts loaded first; fall back after 1.8s.
  const faces = [`900 100px ${DISPLAY}`, `600 40px ${MONO}`, `400 20px ${fonts.body}`]
  Promise.race([
    Promise.all(faces.map((f) => document.fonts.load(f))).catch(() => {}),
    new Promise((r) => setTimeout(r, 1800)),
  ]).then(() => {
    if (disposed) return
    buildWorld()
    buildParticles()
    resize()
    raf = requestAnimationFrame(frame)
  })

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    cleanups.forEach((fn) => fn())
    // Free every GPU resource: client navigation keeps the tab (and the
    // WebGL context budget) alive, so leaking here would add up.
    const seen = new Set<{ dispose(): void }>()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) seen.add(m.geometry)
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      for (const mat of mats) {
        seen.add(mat)
        const map = (mat as THREE.MeshBasicMaterial).map
        if (map) seen.add(map)
      }
    })
    seen.add(boxGeo); seen.add(glowTex)
    seen.forEach((r) => r.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
    THREE.ColorManagement.enabled = true
  }
}
