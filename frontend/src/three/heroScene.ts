import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { makeDragonBall } from './dragonBall'

/**
 * The hero: a real glass Dragon Ball floating in a ki field, seen through a scouter lens.
 * One canvas, one job. Returns controls the HUD timeline drives.
 */
export type HeroControls = {
  /** 0 = dormant, 1 = fully charged. Drives core glow, bloom and field energy. */
  setCharge(v: number): void
  /** 0..1 lens lock: chromatic aberration + scanline intensity. */
  setLens(v: number): void
  /** Impact pulse for the over-9,000 moment. */
  impact(): void
  setPointer(x: number, y: number): void
  dispose(): void
}

const FIELD_FRAG = /* glsl */ `
  uniform float uTime; uniform float uCharge; uniform vec2 uRes;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
  void main(){
    vec2 uv = vUv; vec2 p = (uv - .5) * vec2(uRes.x/uRes.y, 1.);
    float r = length(p);
    float t = uTime * .06;
    // domain-warped energy, drifting upward like rising ki
    vec2 q = vec2(fbm(p*2.2 + vec2(0., -t*3.)), fbm(p*2.2 + vec2(5.2, -t*2.4)));
    float f = fbm(p*2.6 + q*1.8 + vec2(0., -t*4.));
    vec3 night  = vec3(.012,.016,.04);
    vec3 violet = vec3(.16,.04,.24);
    vec3 ember  = vec3(1.,.42,.08);
    vec3 col = mix(night, violet, smoothstep(.25,.85,f) * .9);
    // energy veins near the ball, scaled by charge
    float veins = smoothstep(.62,.9,f) * smoothstep(.95,.1,r);
    col += ember * veins * (.12 + .55*uCharge);
    // core halo
    col += ember * .35 * uCharge * exp(-r*r*9.);
    col *= smoothstep(1.25,.15,r); // vignette
    gl_FragColor = vec4(col,1.);
  }`

const LENS_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse; uniform float uTime; uniform float uLens; uniform float uImpact; uniform vec2 uRes;
  varying vec2 vUv;
  void main(){
    vec2 uv = vUv;
    vec2 c = uv - .5;
    // impact shake
    uv += uImpact * .012 * vec2(sin(uTime*90.), cos(uTime*77.));
    // lens: chromatic aberration grows toward edges
    float ca = (.001 + .0035*uLens + .02*uImpact) * dot(c,c) * 4.;
    vec3 col;
    col.r = texture2D(tDiffuse, uv + c*ca).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - c*ca).b;
    // green scouter tint, only as much as the lock
    vec3 lensTint = vec3(.55,1.,.7);
    col = mix(col, col*lensTint + vec3(0.,.02,.008), .16*uLens);
    // scanlines + rolling bar
    float scan = .5 + .5*sin(vUv.y*uRes.y*1.35);
    col *= 1. - .05*uLens*scan;
    float band = exp(-pow((fract(vUv.y - uTime*.08) - .5)*140., 2.));
    col += vec3(.02,.07,.04) * uLens * band;
    // grain
    float g = fract(sin(dot(vUv*uRes + uTime, vec2(12.9898,78.233))) * 43758.5453);
    col += (g-.5) * .018;
    gl_FragColor = vec4(col + uImpact*vec3(.9,1.,.9)*.35, 1.);
  }`

let webglSupport: boolean | null = null

/** Probes once per page, then frees the probe context so it doesn't count toward the browser's cap. */
export function canUseWebGL(): boolean {
  if (webglSupport !== null) return webglSupport
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    webglSupport = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglSupport = false
  }
  return webglSupport
}

export function createHeroScene(canvas: HTMLCanvasElement, stars = 4, onFail: (why: string) => void = () => {}): HeroControls {
  if (!canUseWebGL()) throw new Error('WebGL unavailable')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 0.95
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0, 7)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.06)
  scene.environment = envRT.texture

  // --- ki field backdrop (fullscreen quad behind everything)
  const fieldMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCharge: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.999,1.); }',
    fragmentShader: FIELD_FRAG,
    depthWrite: false,
  })
  const field = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fieldMat)
  field.frustumCulled = false
  field.renderOrder = -1
  scene.add(field)

  // --- the ball
  const ball = new THREE.Group()
  scene.add(ball)
  const db = makeDragonBall(stars, 'amber')
  ball.add(db.group)
  const coreLight = new THREE.PointLight('#ff8a1c', 0, 6, 1.6)
  ball.add(coreLight)

  // key + rim lights
  const key = new THREE.DirectionalLight('#fff3dc', 2.2)
  key.position.set(-3, 4, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#7cffb0', 1.4)
  rim.position.set(4, -1, -3)
  scene.add(rim)
  const fill = new THREE.DirectionalLight('#b06bff', 0.8)
  fill.position.set(3, 3, 2)
  scene.add(fill)

  // --- rising ki motes
  const N = 900
  const pos = new Float32Array(N * 3)
  const seeds = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 1.2 + Math.random() * 2.6
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = (Math.random() - 0.5) * 6
    pos[i * 3 + 2] = Math.sin(a) * r - 1
    seeds[i] = Math.random()
  }
  const motesGeo = new THREE.BufferGeometry()
  motesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  motesGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  const motesMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCharge: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uCharge; uniform float uPx; varying float vA;
      void main(){
        vec3 p = position;
        float speed = .25 + aSeed*.6 + uCharge*1.4;
        p.y = mod(p.y + uTime*speed + 3., 6.) - 3.;
        p.x += sin(uTime*.7 + aSeed*20.) * .08;
        vec4 mv = modelViewMatrix * vec4(p,1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.5 + aSeed*3.5) * (1. + uCharge) * uPx * (6. / -mv.z);
        vA = smoothstep(3., 1.5, abs(p.y)) * (.25 + .75*uCharge);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,.0,d);
        gl_FragColor = vec4(mix(vec3(1.,.55,.15), vec3(1.,.95,.7), a*a), a*vA); }`,
  })
  const motes = new THREE.Points(motesGeo, motesMat)
  scene.add(motes)

  // --- post
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.92)
  composer.addPass(bloom)
  const lens = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uLens: { value: 0 },
      uImpact: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: LENS_FRAG,
  })
  composer.addPass(lens)
  composer.addPass(new OutputPass())

  // --- state
  let charge = 0
  let chargeTarget = 0
  let impactV = 0
  const pointer = new THREE.Vector2()
  const pointerTarget = new THREE.Vector2()

  const resize = () => {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    // keep the ball a comfortable size on tall phones
    camera.position.z = w / h < 0.8 ? 9.5 : 7
    camera.updateProjectionMatrix()
    fieldMat.uniforms.uRes.value.set(w, h)
    lens.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio())
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()

  let raf = 0
  let running = true
  const t0 = performance.now()
  const loop = () => {
    raf = requestAnimationFrame(loop)
    if (!running) return
    const t = (performance.now() - t0) / 1000
    charge += (chargeTarget - charge) * 0.05
    impactV *= 0.9
    pointer.lerp(pointerTarget, 0.06)

    ball.rotation.y = Math.sin(t * 0.35) * 0.35 + pointer.x * 0.45
    ball.rotation.x = Math.sin(t * 0.5) * 0.08 - pointer.y * 0.25
    ball.position.y = Math.sin(t * 0.9) * 0.08
    camera.position.x = pointer.x * 0.35
    camera.position.y = pointer.y * 0.2
    camera.lookAt(0, 0, 0)

    db.update(charge, t)
    coreLight.intensity = 0.6 + 4 * charge
    bloom.strength = 0.25 + 0.35 * charge + 1.6 * impactV
    fieldMat.uniforms.uTime.value = t
    fieldMat.uniforms.uCharge.value = charge
    motesMat.uniforms.uTime.value = t
    motesMat.uniforms.uCharge.value = charge
    lens.uniforms.uTime.value = t
    lens.uniforms.uImpact.value = impactV
    try {
      composer.render()
    } catch (e) {
      running = false
      cancelAnimationFrame(raf)
      onFail(e instanceof Error ? e.message : String(e))
    }
  }
  loop()

  const onVis = () => {
    running = !document.hidden
  }
  document.addEventListener('visibilitychange', onVis)
  const onLost = (e: Event) => {
    e.preventDefault()
    running = false
    onFail('WebGL context lost')
  }
  canvas.addEventListener('webglcontextlost', onLost)

  return {
    setCharge: (v) => {
      chargeTarget = Math.max(0, Math.min(1, v))
    },
    setLens: (v) => {
      lens.uniforms.uLens.value = Math.max(0, Math.min(1, v))
    },
    impact: () => {
      impactV = 1
    },
    setPointer: (x, y) => {
      pointerTarget.set(x, y)
    },
    dispose: () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      ;[motesGeo, field.geometry].forEach((g) => g.dispose())
      db.dispose()
      ;[fieldMat, motesMat].forEach((m) => m.dispose())
      envRT.dispose()
      pmrem.dispose()
      bloom.dispose()
      lens.dispose()
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
