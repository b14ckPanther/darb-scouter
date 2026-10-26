import { useEffect, useRef } from 'react'

export type Uniforms = Record<string, number | [number, number] | [number, number, number] | number[]>

const VERT = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }'

/**
 * A full-bleed fragment shader on a raw WebGL canvas: cheap, one job, pauses off-screen.
 * `uniforms` is read every frame from a ref, so callers can mutate it without re-rendering.
 * Adds uTime (s) and uRes (px) automatically. Calls onFail when WebGL is unavailable.
 */
export function useShaderCanvas(frag: string, uniforms: { current: Uniforms }, onFail?: () => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  const fail = useRef(onFail)
  fail.current = onFail

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: true })
    if (!gl) {
      fail.current?.()
      return
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
      return s
    }
    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, 'precision highp float;\nuniform float uTime; uniform vec2 uRes;\nvarying vec2 vUv;\n' + frag))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error')
    } catch (e) {
      console.warn('[scouter] shader failed:', e)
      fail.current?.()
      return
    }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uRes = gl.getUniformLocation(prog, 'uRes')
    const locs = new Map<string, WebGLUniformLocation | null>()

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let visible = true
    const t0 = performance.now()
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 1.75)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    const draw = (now: number) => {
      gl.uniform1f(uTime, reduce ? 4 : (now - t0) / 1000)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      for (const [k, v] of Object.entries(uniforms.current)) {
        if (!locs.has(k)) locs.set(k, gl.getUniformLocation(prog, k))
        const l = locs.get(k)
        if (!l) continue
        if (typeof v === 'number') gl.uniform1f(l, v)
        else if (v.length === 2) gl.uniform2fv(l, v)
        else if (v.length === 3) gl.uniform3fv(l, v)
        else gl.uniform1fv(l, v)
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const loop = (now: number) => {
      draw(now)
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(loop)
    }
    size()
    raf = requestAnimationFrame(loop)
    const ro = new ResizeObserver(() => {
      size()
      if (reduce) draw(performance.now())
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      const was = visible
      visible = e.isIntersecting
      if (visible && !was && !reduce) raf = requestAnimationFrame(loop)
    })
    io.observe(canvas)
    const onVis = () => {
      if (!document.hidden && visible && !reduce) raf = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', onVis)
    const onLost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
      fail.current?.()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [frag, uniforms])

  return ref
}
