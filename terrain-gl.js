// Animated terrain: the generated terrain drawn with WebGL, flying slowly forward.
// The hills repeat every PERIOD world units along the direction of travel, and the camera moves
// exactly one PERIOD per loop, so the last frame meets the first and videos loop seamlessly.
// Same look as the still version: flat-shaded faces, wire edges, darker and fainter with distance.
window.TerrainGL = (() => {
  const PERIOD = 8; // world units; every noise frequency below fits a whole number of times into it
  const STEP = 1 / 32; // grid spacing, so PERIOD is a whole number of rows (256)
  // World units either side of the camera; landscape views see further to the sides.
  const halfWidth = (aspect, T) => (aspect > 1 ? (T.far * aspect) / (2 * T.focal) + 0.3 : 2.6);
  // Rotate: the terrain turns once per loop around a point ahead of the camera. Its patch reaches
  // RADIUS from that point, enough to fill the view at every angle.
  const PIVOT_Z = 2.2, radius = (aspect) => (aspect > 1 ? 5 : 3.6);
  let gl, canvas, program, buffers = new Map();

  // Value noise that wraps every `pz` lattice cells along z.
  function hash2(a, b, seed) {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const wrap = (n, p) => ((n % p) + p) % p;
  function noise(x, z, seed, pz) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const z0 = wrap(zi, pz), z1 = wrap(zi + 1, pz);
    const a = hash2(xi, z0, seed), b = hash2(xi + 1, z0, seed), c = hash2(xi, z1, seed), d = hash2(xi + 1, z1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // Base frequency 0.5 and 1.0 fit 4 and 8 cells into PERIOD; each octave doubles both.
  function fbm(x, z, seed) {
    let s = 0, amp = 0.55, f = 1;
    for (let o = 0; o < 5; o++) { s += amp * noise(x * 0.5 * f, z * 0.5 * f, seed + o * 17, 4 * f); amp *= 0.48; f *= 2; }
    return s;
  }
  function ridged(x, z, seed) {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { s += amp * (1 - Math.abs(2 * noise(x * f, z * f, seed + 40 + o * 13, 8 * f) - 1)) ** 2; amp *= 0.5; f *= 2; }
    return s;
  }

  // The mesh for one seed: flat triangles with their normal and corner (for the wire edges).
  // Forward: a long strip ahead of the camera. Rotate: a square patch around the pivot.
  function mesh(seed, T, motion, aspect) {
    const rotate = motion === "rotate", R = radius(aspect), HW = halfWidth(aspect, T);
    const x0 = rotate ? -R : -HW, z0 = rotate ? PIVOT_Z - R : 0;
    const rows = Math.ceil((rotate ? R * 2 : PERIOD + T.far + 0.5) / STEP), cols = Math.ceil((rotate ? R * 2 : HW * 2) / STEP);
    const per = PERIOD / STEP;
    const pt = (i, j) => {
      const jw = wrap(j, per);
      const x = x0 + i * STEP + (hash2(i, jw, seed) - 0.5) * T.jitter * STEP;
      const z = z0 + j * STEP + (hash2(jw, i, seed + 9) - 0.5) * T.jitter * STEP;
      // A valley that wanders from side to side, once per PERIOD.
      const crease = Math.exp(-((x + 0.3 - 0.45 * Math.sin((2 * Math.PI * z) / PERIOD)) ** 2) / 0.1) * 0.2;
      const hills = (1 - T.ridge) * fbm(x, z, seed) + T.ridge * ridged(x, z, seed);
      const y = (hills - 0.42) * T.lift - crease + (hash2(i, jw, seed + 23) - 0.5) * T.spike;
      return [x, y, z];
    };
    const grid = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) grid.push(pt(i, j));
    const at = (i, j) => grid[j * (cols + 1) + i];
    const data = new Float32Array(rows * cols * 2 * 3 * 9);
    let k = 0;
    const tri = (p, q, r) => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      [p, q, r].forEach((v, c) => { data.set([v[0], v[1], v[2], nx / l, ny / l, nz / l, c === 0, c === 1, c === 2], k); k += 9; });
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      tri(a, b, d); tri(a, d, c);
    }
    return data;
  }

  const VS = `#version 300 es
  in vec3 pos; in vec3 nrm; in vec3 bary;
  uniform float camZ, camY, focal, horizon, nearZ, farZ, angle, pivotZ, aspect;
  out vec3 vN; out vec3 vB; out float vZ;
  void main() {
    // Turn the terrain (and its normals) around the pivot; angle is 0 when flying forward.
    float c = cos(angle), s = sin(angle);
    vec2 p = pos.xz - vec2(0.0, pivotZ);
    vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + vec2(0.0, pivotZ);
    vec3 w = vec3(r.x, pos.y, r.y);
    float dz = w.z - camZ;
    // Pinhole camera looking along +z with the horizon above the frame, as in the still version.
    gl_Position = vec4(w.x * 2.0 * focal / aspect, dz * (1.0 - 2.0 * horizon) - (camY - w.y) * 2.0 * focal,
                       ((dz - nearZ) / (farZ - nearZ) * 2.0 - 1.0) * dz, dz);
    vN = vec3(c * nrm.x - s * nrm.z, nrm.y, s * nrm.x + c * nrm.z); vB = bary; vZ = dz;
  }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vN; in vec3 vB; in float vZ;
  uniform vec3 light, fillBase, fillLit, wireBase, wireLit, bg; uniform float nearZ, farZ, px, outline;
  out vec4 color;
  void main() {
    float lit = max(0.0, dot(normalize(vN), light));
    float shade = pow(lit, 1.4);
    float near = pow(clamp((farZ - vZ) / (farZ - nearZ), 0.0, 1.0), 1.6);
    float k = shade * (0.2 + 0.8 * near);
    vec3 fill = mix(fillBase + fillLit * k, bg, outline) / 255.0;
    vec3 wire = (wireBase + wireLit * lit) / 255.0;
    float alpha = (0.06 + 0.8 * near) * (0.24 + 0.76 * shade);
    vec3 d = vB / fwidth(vB);
    float edge = min(d.x, min(d.y, d.z));
    float w = 1.0 * px;
    float line = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, edge);
    color = vec4(mix(fill, wire, alpha * line), 1.0);
  }`;

  function setup() {
    canvas = document.createElement("canvas");
    gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) return false;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    program = gl.createProgram();
    gl.attachShader(program, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    return true;
  }

  function buffer(seed, T, motion, aspect) {
    const key = `${seed}-${motion}-${aspect > 1}`;
    if (buffers.has(key)) return buffers.get(key);
    const data = mesh(seed, T, motion, aspect);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    [["pos", 0], ["nrm", 3], ["bary", 6]].forEach(([name, off]) => {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, off * 4);
    });
    const b = { vao, count: data.length / 9 };
    buffers.set(key, b);
    return b;
  }

  // Draws the terrain `progress` (0–1) of the way through the loop, flying forward or turning,
  // in the theme's colors (RGB 0–255). With `outline`, faces take the background color and only the lines show.
  // Returns the canvas, or null without WebGL.
  function draw(seed, progress, T, w, h, motion, C, outline) {
    if (!gl && !setup()) return null;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const aspect = w / h;
    const b = buffer(seed, T, motion, aspect);
    const rotate = motion === "rotate";
    const u = (n) => gl.getUniformLocation(program, n);
    const L = T.light, ll = Math.hypot(...L);
    gl.viewport(0, 0, w, h);
    gl.clearColor(C.bg[0] / 255, C.bg[1] / 255, C.bg[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(u("camZ"), rotate ? 0 : progress * PERIOD);
    gl.uniform1f(u("angle"), rotate ? progress * 2 * Math.PI : 0);
    gl.uniform1f(u("pivotZ"), PIVOT_Z);
    gl.uniform1f(u("camY"), T.camY);
    gl.uniform1f(u("focal"), T.focal);
    gl.uniform1f(u("horizon"), T.horizon);
    gl.uniform1f(u("nearZ"), T.near);
    gl.uniform1f(u("farZ"), T.far);
    gl.uniform1f(u("px"), h / 1080);
    gl.uniform1f(u("aspect"), aspect);
    gl.uniform3f(u("light"), L[0] / ll, L[1] / ll, L[2] / ll);
    gl.uniform3f(u("fillBase"), ...C.fill);
    gl.uniform3f(u("fillLit"), ...C.fillLit);
    gl.uniform3f(u("wireBase"), ...C.wire);
    gl.uniform3f(u("wireLit"), ...C.wireLit);
    gl.uniform3f(u("bg"), ...C.bg);
    gl.uniform1f(u("outline"), outline ? 1 : 0);
    gl.bindVertexArray(b.vao);
    gl.drawArrays(gl.TRIANGLES, 0, b.count);
    return canvas;
  }

  return { draw };
})();
