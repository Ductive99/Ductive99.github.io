// ============================================
// Nebula site script: navigation, filters, the pixel clock,
// dithered images and the generative space art (nebula-design.md).
// ============================================
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One dot, in CSS px (changes with the breakpoint)
  function dot() { return parseFloat(getComputedStyle(root).getPropertyValue('--d')) || 2; }

  // ============================================
  // Mobile menu
  // ============================================
  var menuBtn = document.getElementById('menu-btn');
  var nav = document.getElementById('site-nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });
  }

  // ============================================
  // Key hints: an element with data-key="x" is clicked when x is pressed
  // ============================================
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    var target = e.target;
    if (target.closest && target.closest('input, textarea, select, [contenteditable]')) return;
    var key = e.key.toLowerCase();
    if (key === 'enter' && target.closest && target.closest('a, button')) return;
    var el = document.querySelector('[data-key="' + CSS.escape(key) + '"]');
    if (!el) return;
    e.preventDefault();
    el.click();
  });

  // ============================================
  // Tag / category filters: <div data-filter=".item"> with <button data-value>
  // ============================================
  document.querySelectorAll('[data-filter]').forEach(function (bar) {
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-value]');
      if (!btn) return;
      bar.querySelectorAll('button[data-value]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn);
      });
      var value = btn.getAttribute('data-value');
      document.querySelectorAll(bar.getAttribute('data-filter')).forEach(function (item) {
        var tags = (item.getAttribute('data-tags') || '').split(',');
        item.hidden = value !== 'all' && tags.indexOf(value) === -1;
      });
    });
  });

  // ============================================
  // Big clock digits, drawn from the ROM font's 8x8 glyphs (spec 4.1)
  // ============================================
  var GLYPHS = {
    '0': [60, 102, 110, 118, 102, 102, 60], '1': [24, 24, 56, 24, 24, 24, 126],
    '2': [60, 102, 6, 12, 48, 96, 126], '3': [60, 102, 6, 28, 6, 102, 60],
    '4': [6, 14, 30, 102, 127, 6, 6], '5': [126, 96, 124, 6, 6, 102, 60],
    '6': [60, 102, 96, 124, 102, 102, 60], '7': [126, 102, 12, 24, 24, 24, 24],
    '8': [60, 102, 102, 60, 102, 102, 60], '9': [60, 102, 102, 62, 6, 102, 60],
    ':': [0, 0, 24, 0, 0, 24, 0]
  };
  var RAMP = ['#ffffff', '#ffffff', '#ffffff', '#9f9f9f', '#9f9f9f', '#67b6bd', '#7869c4'];

  // Draws text into a <canvas class="big">. data-px = dots per glyph pixel (5), data-fit shrinks it to its container.
  function drawBig(cv, text) {
    var d = dot(), s = +cv.getAttribute('data-px') || 5;
    if (cv.hasAttribute('data-fit')) {
      var room = cv.parentElement.clientWidth / d - 2;
      s = Math.max(2, Math.min(s, Math.floor(room / (text.length * 8))));
    }
    var w = text.length * 8 * s + 2, h = 7 * s + 2;
    cv.width = w;
    cv.height = h;
    cv.style.width = w * d + 'px';
    cv.style.height = h * d + 'px';
    cv.style.marginLeft = -s * d + 'px'; // the glyphs' first column is blank
    var ctx = cv.getContext('2d');
    // Blue shadow 2 dots down and right, then the chrome ramp on top
    for (var pass = 0; pass < 2; pass++) {
      var off = pass ? 0 : 2;
      for (var i = 0; i < text.length; i++) {
        var g = GLYPHS[text[i]];
        if (!g) continue;
        for (var y = 0; y < 7; y++) {
          ctx.fillStyle = pass ? RAMP[y] : '#40318d';
          for (var x = 0; x < 8; x++) {
            if (g[y] & (128 >> x)) ctx.fillRect((i * 8 + x) * s + off, y * s + off, s, s);
          }
        }
      }
    }
    cv.setAttribute('aria-label', text);
    cv._text = text;
  }
  window.drawBig = drawBig;

  document.querySelectorAll('canvas.big[data-text]').forEach(function (cv) {
    drawBig(cv, cv.getAttribute('data-text'));
  });

  window.addEventListener('resize', function () {
    document.querySelectorAll('canvas.big').forEach(function (cv) {
      if (cv._text) drawBig(cv, cv._text);
    });
  });

  var pathEl = document.querySelector('[data-path]');
  if (pathEl) pathEl.textContent = 'Nothing at ' + location.pathname;

  // ============================================
  // Year readout in the bottom bar: ten segments, like the battery meter
  // ============================================
  var year = document.querySelector('[data-year-meter]');
  if (year) {
    var now = new Date(), y = now.getFullYear();
    var share = (now - new Date(y, 0, 1)) / (new Date(y + 1, 0, 1) - new Date(y, 0, 1));
    year.querySelectorAll('.meter i').forEach(function (seg, i) {
      seg.classList.toggle('on', i < Math.round(share * 10));
    });
    year.querySelector('[data-year]').textContent = y;
    year.querySelector('[data-year-value]').textContent = Math.floor(share * 100) + '%';
    year.title = Math.floor(share * 100) + '% of ' + y + ' has passed';
    year.hidden = false;
  }

  // ============================================
  // Images reduced to the 16 colours with 4x4 ordered dithering, one image pixel per dot
  // ============================================
  var PALETTE = [
    [0, 0, 0], [255, 255, 255], [136, 57, 50], [103, 182, 189], [139, 63, 150], [85, 160, 73], [64, 49, 141], [191, 206, 114],
    [139, 84, 41], [87, 66, 0], [184, 105, 98], [80, 80, 80], [120, 120, 120], [148, 224, 137], [120, 105, 196], [159, 159, 159]
  ];
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function nearest(r, g, b) {
    var best = PALETTE[0], bestD = Infinity;
    for (var i = 0; i < PALETTE.length; i++) {
      var c = PALETTE[i], dr = r - c[0], dg = g - c[1], db = b - c[2];
      var dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (dist < bestD) { bestD = dist; best = c; }
    }
    return best;
  }

  function dither(img) {
    var cv = img._dither || document.createElement('canvas');
    var shown = img._dither || img;
    var d = dot(), w = Math.round(shown.clientWidth / d), h = Math.round(shown.clientHeight / d);
    if (!w || !h || !img.naturalWidth) return;
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var scale = Math.max(w / img.naturalWidth, h / img.naturalHeight); // object-fit: cover
    var sw = w / scale, sh = h / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    try {
      var data = ctx.getImageData(0, 0, w, h), px = data.data;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4, t = ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * 72;
          var c = nearest(px[i] + t, px[i + 1] + t, px[i + 2] + t);
          px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
        }
      }
      ctx.putImageData(data, 0, 0);
    } catch (err) {
      return; // cross-origin image: keep the original
    }
    if (!img._dither) {
      cv.className = 'dithered';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', img.alt);
      img.after(cv);
      img.hidden = true;
      img._dither = cv;
      new ResizeObserver(function () { dither(img); }).observe(cv);
    }
  }

  document.querySelectorAll('img.dither').forEach(function (img) {
    if (img.complete && img.naturalWidth) dither(img);
    else img.addEventListener('load', function () { dither(img); }, { once: true });
  });

  // ============================================
  // Space art: nebula, stars and the wireframe planet (spec 5).
  // Drawn at the art resolution (1 art pixel = 2 dots) and scaled up without smoothing.
  // ============================================
  var VERT = '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 uRes;      // art resolution',
    'uniform float uTime;    // seconds',
    'uniform float uReveal;  // 0..1, Bayer dissolve',
    'uniform vec4 uVoid;     // text box in art px (x0, y0, x1, y1), y down',
    'uniform vec3 uPlanet;   // centre and radius in art px; radius 0 = none',
    'uniform vec2 uSeed;     // noise offset: picks the composition',
    'uniform float uSide;    // where clouds gather: 1 right, -1 left, 0 both edges',
    'uniform float uDensity; // shifts the cloud cover',
    'uniform vec2 uSpark[4];',
    'out vec4 outColor;',
    'const float PI = 3.14159265;',
    'const vec3 BLACK = vec3(0.0), WHITE = vec3(1.0), LGREY = vec3(0.624);',
    'const vec3 CYAN = vec3(0.404, 0.714, 0.741), PURPLE = vec3(0.545, 0.247, 0.588), GREEN = vec3(0.333, 0.627, 0.286);',
    'const vec3 BLUE = vec3(0.251, 0.192, 0.553), YELLOW = vec3(0.749, 0.808, 0.447), LGREEN = vec3(0.580, 0.878, 0.537);',
    'const vec3 LBLUE = vec3(0.471, 0.412, 0.769);',
    'float bayer4(vec2 p) {',
    '  ivec2 i = ivec2(mod(p, 4.0));',
    '  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);',
    '  return (m[i.y * 4 + i.x] + 0.5) / 16.0;',
    '}',
    'float bayer8(vec2 p) {',
    '  ivec2 i = ivec2(mod(floor(p / 4.0), 2.0));',
    '  const float m2[4] = float[4](0., 2., 3., 1.);',
    '  return (floor(bayer4(p) * 16.0) * 4.0 + m2[i.y * 2 + i.x] + 0.5) / 64.0;',
    '}',
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);',
    '}',
    'float fbm(vec2 p) {',
    '  float v = 0.0, a = 0.5; const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
    '  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }',
    '  return v;',
    '}',
    'mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }',
    'mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }',
    'mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0, -s, c, 0, 0, 0, 1); }',
    '// 30-degree latitude/longitude lines, one pixel wide',
    'float gridLine(vec3 g) {',
    '  float lat = asin(clamp(g.y, -1.0, 1.0)), lon = atan(g.x, g.z);',
    '  float lon2 = lon < 0.0 ? lon + 2.0 * PI : lon, st = PI / 6.0;',
    '  float fl = fwidth(lat), fo = min(fwidth(lon), fwidth(lon2));',
    '  float dLat = abs(lat - st * floor(lat / st + 0.5)), dLon = abs(lon - st * floor(lon / st + 0.5));',
    '  return ((abs(lat) < 1.2 && dLat < 0.55 * fl) || (abs(lat) < 1.3 && dLon < 0.55 * fo)) ? 1.0 : 0.0;',
    '}',
    'void main() {',
    '  vec2 px = vec2(floor(gl_FragCoord.x), uRes.y - 1.0 - floor(gl_FragCoord.y));',
    '  float by = bayer4(px);',
    '  vec3 col = BLACK;',
    '  // The void: no art or stars behind text',
    '  vec2 vc = (uVoid.xy + uVoid.zw) * 0.5, vh = (uVoid.zw - uVoid.xy) * 0.5;',
    '  float vd = vh.x > 0.0 ? length(max(abs(px + 0.5 - vc) - vh, 0.0)) : 1e4;',
    '  float textVoid = 1.0 - smoothstep(2.0, 30.0, vd);',
    '  bool calm = vd < 4.0;',
    '  bool hasPlanet = uPlanet.z > 0.0;',
    '  vec2 pd = (px + 0.5 - uPlanet.xy) / max(uPlanet.z, 1.0);',
    '  float r2 = dot(pd, pd);',
    '  float planetVoid = hasPlanet ? 1.0 - smoothstep(1.3, 2.4, sqrt(r2)) : 0.0;',
    '  // Nebula: domain-warped fbm on fat (2x1) pixels, thresholded into rims and bodies',
    '  vec2 fat = vec2(floor(px.x / 2.0) * 2.0, px.y);',
    '  float bf = bayer4(fat / vec2(2.0, 1.0));',
    '  vec2 uv = fat / 180.0 * 2.6 + uSeed * 0.37;',
    '  vec2 q = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));',
    '  float n = fbm(uv + 2.4 * q + uSeed);',
    '  vec2 e = px / uRes;',
    '  float side = uSide > 0.5 ? e.x : uSide < -0.5 ? 1.0 - e.x : abs(2.0 * e.x - 1.0);',
    '  float edgeBias = smoothstep(0.3, 1.0, side) + 0.5 * smoothstep(0.7, 1.0, abs(2.0 * e.y - 1.0));',
    '  float dens = n - 0.6 * textVoid - 0.4 * planetVoid + 0.14 * edgeBias + uDensity;',
    '  float t = calm ? -1.0 : (dens - 0.5) / 0.3 + (bf - 0.5) * 0.16 + (hash(fat) - 0.5) * 0.05;',
    '  if (t >= 0.0) {',
    '    col = t < 0.05 ? YELLOW : t < 0.12 ? CYAN : t < 0.26 ? LBLUE : PURPLE;',
    '    if (t > 0.4) {',
    '      float inner = fbm(uv * 2.3 + q * 2.0 + vec2(11.0, 4.0)) + (bf - 0.5) * 0.22;',
    '      col = inner > 0.66 ? LBLUE : inner > 0.5 ? PURPLE : BLUE;',
    '    }',
    '    float ridge = 1.0 - abs(2.0 * fbm(uv * 1.7 + q * 1.5 + vec2(3.1, 7.7)) - 1.0);',
    '    if (t > 0.2 && ridge > 0.955) col = CYAN; else if (t > 0.2 && ridge > 0.93) col = LBLUE;',
    '  } else if (!calm && hash(px + uSeed * 17.0) > 0.9935) {',
    '    float k = hash(px * 1.7 + 3.1);',
    '    col = k < 0.45 ? WHITE : k < 0.75 ? LGREY : k < 0.93 ? LBLUE : k < 0.97 ? CYAN : YELLOW;',
    '    if (hash(px + 9.2) < 0.35 && sin(uTime * (0.8 + 2.5 * hash(px + 1.3)) + 6.2832 * hash(px + 4.4)) < -0.2) col = BLACK;',
    '  }',
    '  // Sparkles: white centre, lgrey at 1, lblue arms that pulse between 2 and 3',
    '  if (!calm) {',
    '    for (int i = 0; i < 4; i++) {',
    '      vec2 a = abs(px - uSpark[i]);',
    '      float arm = 2.0 + step(0.0, sin(uTime * 1.3 + float(i) * 1.7));',
    '      if (a.x + a.y < 0.5) col = WHITE;',
    '      else if (min(a.x, a.y) < 0.5) { float m = max(a.x, a.y); if (m < 1.5) col = LGREY; else if (m < arm + 0.5) col = LBLUE; }',
    '    }',
    '  }',
    '  // Wireframe planet: lit from the upper left, turning once a minute, with a ring',
    '  if (hasPlanet) {',
    '    float zs = sqrt(max(1.0 - r2, 0.0)), r = sqrt(r2);',
    '    vec3 front = vec3(pd.x, -pd.y, zs), back = vec3(pd.x, -pd.y, -zs);',
    '    mat3 orient = rotZ(-0.35) * rotX(0.42);',
    '    mat3 toBody = rotY(-uTime * 2.0 * PI / 60.0) * transpose(orient);',
    '    float gF = gridLine(toBody * front), gB = gridLine(toBody * back);',
    '    vec3 axis = orient * vec3(0.0, 1.0, 0.0);',
    '    float rz = -(axis.x * pd.x - axis.y * pd.y) / axis.z;',
    '    float rr = length(vec3(pd.x, -pd.y, rz)), fr = fwidth(rr);',
    '    bool line = abs(rr - 1.45) < 0.55 * fr || abs(rr - 1.68) < 0.55 * fr;',
    '    bool band = rr > 1.45 && rr < 1.68 && by < 0.2;',
    '    vec3 L = normalize(vec3(-0.75, 0.55, 0.40));',
    '    if (r >= 1.0) {',
    '      if (r < 1.22) {',
    '        float lit = dot(normalize(vec2(pd.x, -pd.y)), normalize(L.xy)) * 0.5 + 0.5;',
    '        float v = (1.0 - (r - 1.0) / 0.22) * (0.2 + 0.8 * lit) + (by - 0.5) * 0.35;',
    '        if (v > 0.75) col = CYAN; else if (v > 0.5) col = LBLUE; else if (v > 0.28) col = BLUE;',
    '      }',
    '      if (rz < 0.0) { if (line) col = LBLUE; else if (band) col = BLUE; }',
    '    } else {',
    '      float lambert = dot(front, L);',
    '      float rim = pow(1.0 - zs, 1.3) * max(lambert, 0.0) * 1.35 + (by - 0.5) * 0.18;',
    '      col = rim > 0.62 ? WHITE : rim > 0.45 ? YELLOW : rim > 0.3 ? LGREEN : rim > 0.18 ? GREEN : BLACK;',
    '      if (gB > 0.5 && col == BLACK && mod(px.x + px.y, 2.0) < 1.0) col = BLUE;',
    '      if (gF > 0.5) col = lambert > 0.45 ? WHITE : lambert > 0.1 ? CYAN : lambert > -0.35 ? LBLUE : BLUE;',
    '    }',
    '    if (rz >= 0.0) { if (line) col = CYAN; else if (band) col = LBLUE; }',
    '  }',
    '  if (bayer8(px) >= uReveal) col = BLACK;',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
    console.warn(gl.getShaderInfoLog(sh));
    return null;
  }

  function mulberry(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parseSeed(raw) {
    var parts = String(raw || '').split(',').map(Number);
    if (parts.length === 2) return parts;
    var n = parts[0] || 0; // a hash: spread it over a few hundred noise units
    return [(n % 997) / 31, (Math.floor(n / 997) % 991) / 29];
  }

  var scenes = [];

  function layout(s) {
    var a = 2 * dot(), box = s.box.getBoundingClientRect();
    var w = Math.ceil(box.width / a), h = Math.ceil(box.height / a);
    if (!w || !h) { s.w = 0; return; }
    if (!s.w) s.start = performance.now(); // replay the dissolve whenever the art appears
    s.w = w;
    s.h = h;
    s.cv.width = w;
    s.cv.height = h;
    s.cv.style.width = w * a + 'px';
    s.cv.style.height = h * a + 'px';
    s.gl.viewport(0, 0, w, h);
    var v = null;
    s.box.querySelectorAll('[data-void]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var q = [(r.left - box.left) / a, (r.top - box.top) / a, (r.right - box.left) / a, (r.bottom - box.top) / a];
      v = v ? [Math.min(v[0], q[0]), Math.min(v[1], q[1]), Math.max(v[2], q[2]), Math.max(v[3], q[3])] : q;
    });
    s.void = v || [0, 0, -1, -1];
    var pl = s.box.querySelector('[data-planet]'), pr = pl && pl.getBoundingClientRect();
    s.planet = pr && pr.width
      ? [(pr.left + pr.width / 2 - box.left) / a, (pr.top + pr.height / 2 - box.top) / a, pr.width / 3.5 / a]
      : [0, 0, 0];
    // 1 to 4 sparkles, away from the text and the planet
    var rnd = mulberry(Math.floor(s.seed[0] * 7919 + s.seed[1] * 104729)), count = Math.max(1, Math.min(4, Math.round(w * h / 20000)));
    s.sparks = [];
    for (var tries = 0; s.sparks.length < count * 2 && tries < 200; tries++) {
      var x = Math.floor(6 + rnd() * (w - 12)), y = Math.floor(6 + rnd() * (h - 12));
      if (x > s.void[0] - 10 && x < s.void[2] + 10 && y > s.void[1] - 10 && y < s.void[3] + 10) continue;
      if (s.planet[2] && Math.hypot(x - s.planet[0], y - s.planet[1]) < s.planet[2] * 2.4) continue;
      s.sparks.push(x, y);
    }
    while (s.sparks.length < 8) s.sparks.push(-99, -99);
    draw(s, performance.now());
  }

  function draw(s, now) {
    if (!s.w) return;
    var gl = s.gl, u = s.u;
    gl.uniform2f(u.uRes, s.w, s.h);
    gl.uniform1f(u.uTime, reduceMotion ? 0 : now / 1000);
    gl.uniform1f(u.uReveal, reduceMotion ? 1 : Math.min(1, (now - s.start) / 900));
    gl.uniform4fv(u.uVoid, s.void);
    gl.uniform3fv(u.uPlanet, s.planet);
    gl.uniform2fv(u.uSeed, s.seed);
    gl.uniform1f(u.uSide, s.side);
    gl.uniform1f(u.uDensity, s.density);
    gl.uniform2fv(u.uSpark, s.sparks);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  document.querySelectorAll('canvas.art').forEach(function (cv) {
    var gl = cv.getContext('webgl2', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return; // no WebGL 2: the page stays plain black
    var vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var u = {};
    ['uRes', 'uTime', 'uReveal', 'uVoid', 'uPlanet', 'uSeed', 'uSide', 'uDensity', 'uSpark'].forEach(function (name) {
      u[name] = gl.getUniformLocation(prog, name);
    });
    var s = {
      cv: cv, gl: gl, u: u, box: cv.parentElement, w: 0, start: 0, visible: true,
      seed: parseSeed(cv.getAttribute('data-seed')),
      side: cv.hasAttribute('data-side') ? +cv.getAttribute('data-side') : 1,
      density: +cv.getAttribute('data-density') || 0
    };
    scenes.push(s);
    new ResizeObserver(function () { layout(s); }).observe(s.box);
    new IntersectionObserver(function (entries) { s.visible = entries[0].isIntersecting; }).observe(cv);
  });

  if (scenes.length) {
    // The text column can move once the pixel font arrives
    if (document.fonts) document.fonts.ready.then(function () { scenes.forEach(layout); });
    // Ambient motion on a 50 ms timer (20 steps per second), only for art on screen
    if (!reduceMotion) {
      setInterval(function () {
        if (document.hidden) return;
        var now = performance.now();
        scenes.forEach(function (s) { if (s.visible) draw(s, now); });
      }, 50);
    }
  }
})();
