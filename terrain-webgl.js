// WebGL Terrain Animation for DO Social Self-Serve
// Adapted from SF Screen Wall

export function initTerrainAnimation(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });

  if (!gl) {
    console.warn('WebGL2 not available');
    return null;
  }

  const R = 108;  // terrain radius
  const N = 100;  // grid resolution (reduced from 168 for performance)
  const MAXH = 30;
  const ORBIT_R = 150;
  const CAM_Y = 50;
  const LOOK_Y = 5;

  // Terrain generation
  function hash(x, y) {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  const sm = t => t * t * (3 - 2 * t);

  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const tx = sm(x - ix), ty = sm(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    const t = a + (b - a) * tx, u = c + (d - c) * tx;
    return t + (u - t) * ty;
  }

  function fbm(x, y, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * vnoise(x * f, y * f);
      n += a;
      a *= 0.5;
      f *= 2.02;
    }
    return s / n;
  }

  function heightAt(x, z) {
    const r = Math.hypot(x, z) / R;
    if (r >= 1) return 0;
    const dome = Math.pow(Math.max(0, 1 - r * r), 1.22);
    const f = fbm(x * 0.0165 + 11, z * 0.0165 - 7, 5);
    let ridge = 1 - Math.abs(2 * fbm(x * 0.0295 - 31, z * 0.0295 + 19, 4) - 1);
    ridge = Math.pow(ridge, 1.7);
    return dome * (0.30 + 0.80 * f + 0.55 * ridge) * MAXH;
  }

  function buildMesh() {
    const step = (2 * R) / N;
    const vx = new Float32Array((N + 1) * (N + 1));
    const vz = new Float32Array((N + 1) * (N + 1));
    const vy = new Float32Array((N + 1) * (N + 1));

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const k = j * (N + 1) + i;
        const edge = (i === 0 || j === 0 || i === N || j === N) ? 0 : 1;
        const jx = (hash(i * 7 + 3, j * 13 + 5) - 0.5) * step * 0.78 * edge;
        const jz = (hash(i * 17 + 29, j * 5 + 41) - 0.5) * step * 0.78 * edge;
        const x = -R + i * step + jx;
        const z = -R + j * step + jz;
        vx[k] = x;
        vz[k] = z;
        vy[k] = heightAt(x, z);
      }
    }

    const tris = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1;
        const c = a + (N + 1), d = c + 1;
        const cxm = (vx[a] + vx[d]) * 0.5, czm = (vz[a] + vz[d]) * 0.5;
        if (Math.hypot(cxm, czm) > R * 0.995) continue;
        if (hash(i * 3 + 1, j * 11 + 2) > 0.5) {
          tris.push(a, b, d, a, d, c);
        } else {
          tris.push(a, b, c, b, d, c);
        }
      }
    }

    const n = tris.length;
    const pos = new Float32Array(n * 3);
    const bary = new Float32Array(n * 3);
    const B = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    for (let t = 0; t < n; t++) {
      const k = tris[t];
      pos[t * 3] = vx[k];
      pos[t * 3 + 1] = vy[k];
      pos[t * 3 + 2] = vz[k];
      const b = B[t % 3];
      bary[t * 3] = b[0];
      bary[t * 3 + 1] = b[1];
      bary[t * 3 + 2] = b[2];
    }

    return { pos, bary, count: n };
  }

  // Shaders
  const VS = `#version 300 es
  in vec3 aPos;
  in vec3 aBary;
  uniform mat4 uMVP, uMV;
  out vec3 vBary;
  out float vDepth;
  out float vH;
  void main() {
    vec4 mv = uMV * vec4(aPos, 1.0);
    vDepth = -mv.z;
    vH = aPos.y;
    vBary = aBary;
    gl_Position = uMVP * vec4(aPos, 1.0);
  }`;

  const BG_CHUNK = `
  uniform vec2 uRes;
  uniform vec3 uDark, uWarm, uCool;
  uniform float uGlow, uCenter;

  vec3 glowTerm(vec2 frag, float fall) {
    float yN = frag.y / uRes.y;
    float d = yN - uCenter;
    float up = clamp(d / 0.42, 0.0, 1.0);
    float lo = clamp(1.0 + d / fall, 0.0, 1.0);
    float inten = pow(1.0 - up, 2.2) * lo;
    return mix(uWarm, uCool, smoothstep(0.0, 0.32, up)) * inten;
  }

  vec3 bgAt(vec2 frag) {
    return uDark + glowTerm(frag, 0.16) * uGlow;
  }`;

  const BG_VS = `#version 300 es
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const BG_FS = `#version 300 es
  precision highp float;
  ${BG_CHUNK}
  out vec4 frag;
  void main() {
    frag = vec4(bgAt(gl_FragCoord.xy), 1.0);
  }`;

  const FS = `#version 300 es
  precision highp float;
  ${BG_CHUNK}
  in vec3 vBary;
  in float vDepth;
  in float vH;
  uniform float uNear, uFar, uMaxH, uLW;
  uniform vec3 uLineLo, uLineHi, uFill;
  out vec4 frag;

  void main() {
    vec3 d = fwidth(vBary);
    vec3 a = smoothstep(vec3(0.0), d * uLW, vBary);
    float edge = 1.0 - min(min(a.x, a.y), a.z);

    float fog = 1.0 - clamp((vDepth - uNear) / (uFar - uNear), 0.0, 1.0);
    fog = pow(fog, 1.45);

    float hN = clamp(vH / uMaxH, 0.0, 1.0);
    vec3 line = mix(uLineLo, uLineHi, pow(hN, 0.75));

    vec3 fillC = uFill + glowTerm(gl_FragCoord.xy, 0.60) * uGlow * 0.75;
    vec3 col = mix(fillC, line, edge);
    col = mix(bgAt(gl_FragCoord.xy), col, fog);
    frag = vec4(col, 1.0);
  }`;

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  const prog = link(VS, FS);
  const bgProg = link(BG_VS, BG_FS);
  const bgVao = gl.createVertexArray();

  gl.useProgram(prog);

  const mesh = buildMesh();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  for (const [name, data] of [['aPos', mesh.pos], ['aBary', mesh.bary]]) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  }

  const U = n => gl.getUniformLocation(prog, n);
  const uMVP = U('uMVP'), uMV = U('uMV');
  const hex = h => [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255
  ];

  gl.uniform3fv(U('uLineLo'), hex('#104B55'));
  gl.uniform3fv(U('uLineHi'), hex('#6FE0ED'));
  gl.uniform3fv(U('uFill'), hex('#000404'));
  gl.uniform1f(U('uMaxH'), MAXH * 0.92);

  const GLOW = {
    uDark: hex('#0B0F0A'),
    uWarm: hex('#879B42'),
    uCool: hex('#6FE0ED'),
    uGlow: 0.42,
    uCenter: 0.56
  };

  for (const p of [prog, bgProg]) {
    gl.useProgram(p);
    for (const [k, v] of Object.entries(GLOW)) {
      const loc = gl.getUniformLocation(p, k);
      Array.isArray(v) ? gl.uniform3fv(loc, v) : gl.uniform1f(loc, v);
    }
  }

  gl.useProgram(prog);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(...hex('#0B0F0A'), 1);

  // Matrix math
  const mul = (a, b) => {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          s += a[k * 4 + j] * b[i * 4 + k];
        }
        o[i * 4 + j] = s;
      }
    }
    return o;
  };

  function perspective(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2),
      o = new Float32Array(16);
    o[0] = t / asp;
    o[5] = t;
    o[10] = (f + n) / (n - f);
    o[11] = -1;
    o[14] = (2 * f * n) / (n - f);
    return o;
  }

  function lookAt(e, c, up) {
    const z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]];
    let l = Math.hypot(...z);
    z[0] /= l;
    z[1] /= l;
    z[2] /= l;
    const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
    l = Math.hypot(...x) || 1;
    x[0] /= l;
    x[1] /= l;
    x[2] /= l;
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]),
      -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]),
      -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]),
      1
    ]);
  }

  let W = canvas.width;
  let H = canvas.height;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(canvas.clientWidth * dpr);
    H = canvas.height = Math.round(canvas.clientHeight * dpr);
    gl.viewport(0, 0, W, H);

    for (const p of [prog, bgProg]) {
      gl.useProgram(p);
      gl.uniform2f(gl.getUniformLocation(p, 'uRes'), W, H);
    }
    gl.useProgram(prog);
    gl.uniform1f(U('uLW'), dpr > 1.5 ? 1.15 : 1.35);
  }

  resize();

  let time = 0;

  function render() {
    const mt = time * 0.01; // Slower orbit for social posts
    const az = (mt / 12) * Math.PI * 2; // 12 second orbit
    const bob = Math.sin(az) * 7;
    const eye = [Math.sin(az) * ORBIT_R, CAM_Y + bob, Math.cos(az) * ORBIT_R];
    const view = lookAt(eye, [0, LOOK_Y, 0], [0, 1, 0]);
    const proj = perspective((34 * Math.PI) / 180, W / H, 1, 520);

    gl.uniform1f(U('uNear'), ORBIT_R - R * 1.05);
    gl.uniform1f(U('uFar'), ORBIT_R + R * 1.35);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(bgProg);
    gl.bindVertexArray(bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Terrain
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(uMV, false, view);
    gl.uniformMatrix4fv(uMVP, false, mul(proj, view));
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);

    time++;
  }

  return { render, resize };
}
