import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { canUseWebGL } from './heroScene'
import { makeDragonBall } from './dragonBall'

/** Seven Black Star Dragon Balls on a slow tilted orbit through GT space. */
export type JourneyControls = {
  setEarned(earned: boolean[]): void
  /** Flash and lift one ball when it is earned. index 0..6 */
  celebrate(index: number): void
  dispose(): void
}

const NEBULA = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.1; a*=.5; } return v; }
  void main(){
    vec2 p = vUv - .5;
    float t = uTime * .015;
    float n = fbm(p*3. + vec2(t, -t*.6));
    float m = fbm(p*5. - vec2(t*.7, t) + n);
    vec3 void_ = vec3(.03,.012,.06), violet = vec3(.24,.06,.34), crimson = vec3(.5,.06,.14);
    vec3 col = mix(void_, violet, smoothstep(.35,.85,n));
    col = mix(col, crimson, smoothstep(.62,.95,m) * .55);
    col *= smoothstep(.95,.2,length(p*vec2(1.,1.4)));
    gl_FragColor = vec4(col,1.);
  }`

export function createJourneyScene(canvas: HTMLCanvasElement, onFail: (why: string) => void = () => {}): JourneyControls {
  if (!canUseWebGL()) throw new Error('WebGL unavailable')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)
  camera.position.set(0, 3.6, 15)
  camera.lookAt(0, 1.1, 0)

  const nebMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,.999,1.); }',
    fragmentShader: NEBULA,
    depthWrite: false,
  })
  const neb = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nebMat)
  neb.frustumCulled = false
  neb.renderOrder = -1
  scene.add(neb)

  // stars
  const N = 1400
  const sp = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const r = 30 + Math.random() * 60
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const starMat = new THREE.PointsMaterial({ color: '#fbe8ff', size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  // orbit ring
  const ringGeo = new THREE.TorusGeometry(5.2, 0.008, 6, 256)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#f5c6d6', transparent: true, opacity: 0.25 })
  const orbit = new THREE.Group()
  orbit.rotation.x = -0.32
  orbit.rotation.z = 0.08
  scene.add(orbit)
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = Math.PI / 2
  orbit.add(ring)

  const key = new THREE.DirectionalLight('#fff0dc', 2)
  key.position.set(-4, 6, 8)
  scene.add(key)
  scene.add(new THREE.AmbientLight('#7a4aa0', 0.6))

  // two balls per slot (amber + stone), toggled by earned state, so swapping tone is free
  const slots = Array.from({ length: 7 }, (_, i) => {
    const holder = new THREE.Group()
    const lit = makeDragonBall(i + 1, 'amber', 64)
    const dark = makeDragonBall(i + 1, 'stone', 64)
    holder.add(lit.group, dark.group)
    lit.group.visible = false
    holder.scale.setScalar(0.62)
    orbit.add(holder)
    const glow = new THREE.PointLight('#ff9a2e', 0, 4, 1.5)
    holder.add(glow)
    return { holder, lit, dark, glow, earned: false, pulse: 0 }
  })

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.6, 0.82)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const resize = () => {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.position.z = w / h < 0.9 ? 30 : 15
    camera.setViewOffset(w, h, w / h < 0.9 ? 0 : -w * 0.1, w / h < 0.9 ? -h * 0.1 : 0, w, h)
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = 0
  let running = true
  const t0 = performance.now()
  const loop = () => {
    raf = requestAnimationFrame(loop)
    if (!running) return
    const t = reduce ? 0 : (performance.now() - t0) / 1000
    nebMat.uniforms.uTime.value = t
    stars.rotation.y = t * 0.006
    slots.forEach((s, i) => {
      const a = (i / 7) * Math.PI * 2 + t * 0.07
      s.holder.position.set(Math.cos(a) * 5.2, Math.sin(t * 0.8 + i) * 0.12 + s.pulse * 0.8, Math.sin(a) * 5.2)
      s.holder.rotation.y = Math.sin(t * 0.4 + i) * 0.4
      s.pulse *= 0.96
      const charge = s.earned ? 0.5 + 0.5 * s.pulse : 0
      s.lit.update(charge, t)
      s.dark.update(0, t)
      s.glow.intensity = s.earned ? 1.5 + 8 * s.pulse : 0
    })
    bloom.strength = 0.45 + 0.6 * Math.max(...slots.map((s) => s.pulse))
    try {
      composer.render()
    } catch (e) {
      running = false
      onFail(e instanceof Error ? e.message : String(e))
    }
  }
  loop()

  const onVis = () => (running = !document.hidden)
  document.addEventListener('visibilitychange', onVis)
  const onLost = (e: Event) => {
    e.preventDefault()
    running = false
    onFail('WebGL context lost')
  }
  canvas.addEventListener('webglcontextlost', onLost)

  return {
    setEarned(earned) {
      slots.forEach((s, i) => {
        s.earned = !!earned[i]
        s.lit.group.visible = s.earned
        s.dark.group.visible = !s.earned
      })
    },
    celebrate(i) {
      if (slots[i]) slots[i].pulse = 1
    },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      slots.forEach((s) => {
        s.lit.dispose()
        s.dark.dispose()
      })
      ;[starGeo, ringGeo, neb.geometry].forEach((g) => g.dispose())
      ;[starMat, ringMat, nebMat].forEach((m) => m.dispose())
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
      // free the GPU context once the canvas has really left the page; a StrictMode
      // remount reuses the same canvas immediately, and a lost context can't be reused
      setTimeout(() => {
        if (!canvas.isConnected) renderer.forceContextLoss()
      }, 0)
    },
  }
}
