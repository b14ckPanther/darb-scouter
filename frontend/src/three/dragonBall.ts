import * as THREE from 'three'

export type BallTone = 'amber' | 'stone'

const v = (r: number, g: number, b: number) => new THREE.Vector3(r, g, b)
const PALETTES = {
  amber: { deep: v(0.42, 0.08, 0), mid: v(1, 0.42, 0.04), hot: v(1, 0.86, 0.5), rim: v(1, 0.55, 0.15), core: new THREE.Color('#ffb04a'), star: '#e0182e', starGlow: '#9a0416' },
  stone: { deep: v(0.04, 0.035, 0.06), mid: v(0.2, 0.18, 0.26), hot: v(0.36, 0.33, 0.44), rim: v(0.55, 0.5, 0.7), core: new THREE.Color('#3a3450'), star: '#4a2630', starGlow: '#000000' },
}

function starShape(r: number) {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r
    const a = (Math.PI / 5) * i + Math.PI / 2
    const x = Math.cos(a) * rad
    const y = Math.sin(a) * rad
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

/** A layered glass Dragon Ball: lit interior, floating 3D stars, fresnel shell. */
export function makeDragonBall(stars: number, tone: BallTone = 'amber', segments = 128) {
  const P = PALETTES[tone]
  const group = new THREE.Group()
  // The ball is three layers, so the stars always read:
  // 1) interior: back faces only, an orange core lit from within (we look INTO it)
  // 2) stars floating inside
  // 3) shell: front faces, fresnel rim, two specular highlights, glass tint
  const interior = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uCharge: { value: 0 }, uTime: { value: 0 }, uDeep: { value: P.deep }, uMid: { value: P.mid }, uHot: { value: P.hot } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position;
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uCharge; uniform float uTime; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uHot; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float facing = abs(dot(vN, vV));               // 1 at the back centre, 0 at the silhouette
        vec3 deep = uDeep, mid = uMid, hot = uHot;
        vec3 c = mix(deep, mid, smoothstep(.0,.65,facing));
        c = mix(c, hot, smoothstep(.7,1.,facing) * (.35 + .35*uCharge));
        // slow caustic ripples
        float rip = sin(vP.x*9. + uTime*.8) * sin(vP.y*7. - uTime*.6) * sin(vP.z*8. + uTime*.5);
        c += uMid * rip * .06;
        gl_FragColor = vec4(c * (.82 + .3*uCharge), 1.);
      }`,
  })
  const shell = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uCharge: { value: 0 }, uKey: { value: new THREE.Vector3(-0.55, 0.6, 0.6).normalize() }, uRim: { value: P.rim } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uCharge; uniform vec3 uKey; uniform vec3 uRim; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1. - max(dot(vN, vV), 0.), 3.);
        vec3 h = normalize(uKey + vV);
        float spec = pow(max(dot(vN, h), 0.), 180.) * 2.2;                       // sharp key highlight
        float soft = pow(max(dot(vN, normalize(vec3(.5,-.55,.65) + vV)), 0.), 18.) * .35; // soft bounce
        vec3 rim = mix(uRim, vec3(1.,.95,.85), f);
        vec3 col = rim * f * 1.4 + vec3(1.) * spec + vec3(1.,.8,.55) * soft;
        float a = clamp(f * .9 + spec + soft + .06, 0., 1.);
        gl_FragColor = vec4(col, a);
      }`,
  })
  const sphereGeo = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75))
  group.add(new THREE.Mesh(sphereGeo, interior))
  const sphere = new THREE.Mesh(sphereGeo, shell)
  sphere.renderOrder = 2
  group.add(sphere)

  // soft inner glow sprite for charge
  const coreMat = new THREE.MeshBasicMaterial({ color: P.core, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), coreMat)
  group.add(core)

  // stars, suspended inside, facing the viewer
  const starMat = new THREE.MeshStandardMaterial({ color: P.star, emissive: P.starGlow, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.1 })
  const nStars = Math.min(7, Math.max(1, stars))
  const starR = nStars === 1 ? 0.3 : nStars <= 3 ? 0.22 : nStars === 4 ? 0.19 : 0.15
  const starGeo = new THREE.ExtrudeGeometry(starShape(starR), { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.015, bevelSegments: 3 })
  starGeo.center()
  const layout: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-0.18, 0.12], [0.18, -0.12]],
    3: [[0, 0.2], [-0.2, -0.13], [0.2, -0.13]],
    4: [[-0.19, 0.19], [0.19, 0.19], [-0.19, -0.19], [0.19, -0.19]],
    5: [[0, 0.26], [-0.25, 0.06], [0.25, 0.06], [-0.16, -0.24], [0.16, -0.24]],
    6: [[-0.18, 0.24], [0.18, 0.24], [-0.3, 0], [0.3, 0], [-0.15, -0.24], [0.15, -0.24]],
    7: [[0, 0.3], [-0.24, 0.16], [0.24, 0.16], [0, 0], [-0.26, -0.16], [0.26, -0.16], [0, -0.3]],
  }
  for (const [x, y] of layout[nStars]) {
    const m = new THREE.Mesh(starGeo, starMat)
    m.position.set(x * 1.35, y * 1.35, 0.05)
    group.add(m)
  }


  return {
    group,
    update(charge: number, t: number) {
      coreMat.opacity = 0.12 * charge
      interior.uniforms.uCharge.value = charge
      interior.uniforms.uTime.value = t
      shell.uniforms.uCharge.value = charge
      starMat.emissiveIntensity = 0.5 + 0.6 * charge
    },
    dispose() {
      ;[sphereGeo, starGeo, core.geometry].forEach((g) => g.dispose())
      ;[interior, shell, starMat, coreMat].forEach((m) => m.dispose())
    },
  }
}
