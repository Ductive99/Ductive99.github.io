// ============================================
// Site script: key hints, filters, the year readout and the generated topographic map.
// ============================================
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  // Code blocks: the copy button, without the line numbers or the last newline
  // ============================================
  if (navigator.clipboard) {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var code = btn.closest('.code').querySelector('pre').cloneNode(true);
        code.querySelectorAll('.ln').forEach(function (n) { n.remove(); });
        navigator.clipboard.writeText(code.textContent.replace(/\n$/, '')).then(function () {
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
        });
      });
    });
  }

  // ============================================
  // Sidenotes: each footnote is copied into the margin, level with its reference.
  // The stylesheet shows the copies on wide screens and the list under the post everywhere else.
  // ============================================
  var footnotes = document.querySelector('.prose > .footnotes');
  if (footnotes) {
    var prose = footnotes.parentElement, sides = [];
    footnotes.querySelectorAll('li[id]').forEach(function (li) {
      var ref = prose.querySelector('a.footnote-ref[href="#' + CSS.escape(li.id) + '"]');
      if (!ref) return;
      var side = document.createElement('aside');
      side.className = 'sidenote';
      side.innerHTML = li.innerHTML;
      side.querySelectorAll('.footnote-backref').forEach(function (b) { b.remove(); });
      side.setAttribute('data-n', ref.textContent);
      prose.appendChild(side);
      sides.push([ref, side]);
    });
    prose.classList.add('has-sidenotes');
    // Level with the reference, or just under the note before it
    new ResizeObserver(function () {
      var top = prose.getBoundingClientRect().top, free = 0;
      sides.forEach(function (pair) {
        var y = Math.max(free, pair[0].getBoundingClientRect().top - top);
        pair[1].style.top = y + 'px';
        free = y + pair[1].offsetHeight + 16;
      });
    }).observe(prose);
  }

  // ============================================
  // New post notice (home): the newest post under a week old that this browser has not opened.
  // Opening a post is remembered in localStorage; without storage the notice just shows for the week.
  // ============================================
  function opened(path) {
    try { return localStorage.getItem('read:' + path); } catch (e) { return null; }
  }

  if (document.querySelector('[data-post]')) {
    try { localStorage.setItem('read:' + location.pathname, '1'); } catch (e) {}
  }

  function announce() {
    var shown = false;
    document.querySelectorAll('[data-new]').forEach(function (a) {
      var fresh = Date.now() - new Date(a.getAttribute('data-new')) < 7 * 864e5;
      a.hidden = shown || !fresh || !!opened(a.pathname);
      shown = shown || !a.hidden;
    });
  }

  announce();
  window.addEventListener('pageshow', announce); // coming back from the post with the Back button

  // How much of the year has gone by, in the footer
  var year = document.querySelector('[data-year]');
  if (year) {
    var now = new Date(), y = now.getFullYear();
    var share = (now - new Date(y, 0, 1)) / (new Date(y + 1, 0, 1) - new Date(y, 0, 1));
    year.textContent = y + ' is ' + Math.floor(share * 100) + '% over';
    year.hidden = false;
  }

  // ============================================
  // Background art: a topographic map of terrain generated at random on every load.
  // Heights come from seeded noise and contour lines are traced with marching squares.
  // Text ([data-void]) pushes the ground down, so it always sits in open water and
  // the land rises in the empty parts of the page.
  // Left alone, only the shore moves: a slow swell that fades out with height.
  // A click raises a summit under the pointer, and moving the pointer leaves a wake that settles back.
  // ============================================
  var GRID = 6;        // px between height samples
  var STEP = 0.07;     // height between contour lines; every 5th is drawn heavier
  var STEP_M = 50;     // metres one contour stands for, in the readouts
  var WATER_LINES = 2; // depth lines drawn below the coast
  var REVEAL_MS = 1400;
  var SWELL = 0.05;    // height the shore rises and falls by when nothing else moves
  var SHORE = 0.15;    // height above or below sea level at which the swell has mostly died out
  var REACH = 90;      // px a click or the pointer reaches over the ground
  var WAKE = 0.005;    // height the pointer pushes up per px it travels
  var SETTLE_MS = 500; // how long pushed ground takes to get most of the way to rest
  var maps = [];

  function newSeed() { return 10000 + Math.floor(Math.random() * 90000); }
  function metres(height) { return Math.round(height / STEP * STEP_M / 10) * 10; } // to 10 m, so moving ground reads calmly

  // Seeded gradient noise, roughly -1..1
  function noise(seed) {
    function corner(ix, iy, x, y) {
      var h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
      h = Math.imul(h ^ (h >>> 15), 2246822519);
      h = Math.imul(h ^ (h >>> 13), 3266489917);
      var angle = ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 * Math.PI;
      return Math.cos(angle) * (x - ix) + Math.sin(angle) * (y - iy);
    }
    return function (x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      var u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      var top = corner(ix, iy, x, y), bottom = corner(ix, iy + 1, x, y);
      top += u * (corner(ix + 1, iy, x, y) - top);
      bottom += u * (corner(ix + 1, iy + 1, x, y) - bottom);
      return (top + v * (bottom - top)) * 1.5;
    };
  }

  // Call fn(sample, weight) for every sample within REACH of a point; the weight is 1 at the point and 0 at REACH
  function around(m, x, y, fn) {
    for (var j = Math.max(0, Math.ceil((y - REACH) / GRID)); j < m.rows && j * GRID <= y + REACH; j++) {
      for (var i = Math.max(0, Math.ceil((x - REACH) / GRID)); i < m.cols && i * GRID <= x + REACH; i++) {
        var d = Math.hypot(i * GRID - x, j * GRID - y) / REACH;
        if (d < 1) fn(j * m.cols + i, (1 - d * d) * (1 - d * d));
      }
    }
  }

  // A click: the sample under it becomes the highest ground within REACH, and gets a spot height.
  // Ground nearer the text than the click rises less, and ground at the text not at all.
  function summit(m, x, y) {
    var i = Math.round(x / GRID), j = Math.round(y / GRID), at = j * m.cols + i, top = 0, free = m.clear[at];
    if (!free) return; // up against the text
    around(m, i * GRID, j * GRID, function (p) { top = Math.max(top, m.base[p] + m.goal[p]); });
    around(m, i * GRID, j * GRID, function (p, w) {
      m.goal[p] += (top + 3 * STEP - m.base[p] - m.goal[p]) * w * Math.min(1, m.clear[p] / free);
    });
    if (m.summits.every(function (s) { return s.at !== at; })) m.summits.push({ x: i * GRID, y: j * GRID, at: at });
  }

  // Self-check: on a slope, the clicked sample ends up above everything around it
  var slope = { cols: 40, rows: 40, base: Float32Array.from({ length: 1600 }, function (_, p) { return p % 40 / 40; }), goal: new Float32Array(1600), clear: new Float32Array(1600).fill(1), summits: [] };
  summit(slope, 60, 60);
  around(slope, 60, 60, function (p) {
    console.assert(p === 410 || slope.base[p] + slope.goal[p] < slope.base[410] + slope.goal[410], 'map: summit', p);
  });

  // The ground this frame: the still ground, plus what clicks and the pointer have pushed up (settling
  // towards the clicks alone), plus the swell, which only shows near sea level
  function rise(m, now, elapsed) {
    var heights = m.heights, lift = m.lift, settle = reduceMotion ? 1 : 1 - Math.exp(-elapsed / SETTLE_MS);
    for (var p = 0; p < heights.length; p++) {
      lift[p] += (m.goal[p] - lift[p]) * settle;
      var h = m.base[p] + lift[p], low = h / SHORE;
      heights[p] = reduceMotion ? h : h + SWELL * Math.exp(-low * low) * Math.sin(now / 1400 + m.phase[p]);
    }
  }

  // Sample the still ground on the grid: rolling hills, sinking to open water around the text
  function survey(m) {
    var n = noise(m.seed), cols = m.cols, rows = m.rows, heights = m.base = new Float32Array(cols * rows);
    m.heights = new Float32Array(cols * rows);
    m.goal = new Float32Array(cols * rows);  // what clicks have raised
    m.lift = new Float32Array(cols * rows);  // the same plus the pointer's wake, as drawn
    m.phase = new Float32Array(cols * rows); // where each sample is in the swell
    m.clear = new Float32Array(cols * rows); // how freely a click or the pointer may push each sample up: not at all by the text
    var hill = 420;                                        // px across the largest hills
    var shore = Math.max(90, Math.min(260, 0.3 * Math.min(m.width, m.height))); // px over which the ground falls away to the text
    var sea = -(WATER_LINES + 0.5) * STEP; // the ground at the text: just under the deepest depth line, so the lines run right up to it
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var x = i * GRID, y = j * GRID, px = x / hill, py = y / hill;
        var ground = 0.38 + 0.62 * n(px, py) + 0.28 * n(px * 2 + 40, py * 2 + 40) + 0.12 * n(px * 4 + 80, py * 4 + 80);
        var near = Infinity;
        for (var k = 0; k < m.voids.length; k++) {
          var r = m.voids[k];
          near = Math.min(near, Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3])));
        }
        near *= 1 + 0.8 * n(px * 1.5 + 120, py * 1.5 + 120); // so the coast wanders instead of tracing the text box
        var t = Math.max(0, Math.min(1, 1 - (near - 6) / shore));
        heights[j * cols + i] = ground + (sea - ground) * t * t * (3 - 2 * t);
        m.clear[j * cols + i] = 1 - t;
        m.phase[j * cols + i] = 6 * n(px * 3 + 160, py * 3 + 160); // so the shore does not rise and fall all at once
      }
    }
    // Spot heights: the tallest summits of the still ground, kept apart from each other and off the edges.
    // They stay put while the ground moves, and read out its height where they stand.
    var summits = [];
    for (j = 8; j < rows - 8; j++) {
      for (i = 8; i < cols - 8; i++) {
        var h = heights[j * cols + i], top = h > 4 * STEP;
        for (var dj = -1; top && dj <= 1; dj++) {
          for (var di = -1; di <= 1; di++) if (heights[(j + dj) * cols + i + di] > h) top = false;
        }
        if (top) summits.push({ x: i * GRID, y: j * GRID, at: j * cols + i, height: h });
      }
    }
    summits.sort(function (a, b) { return b.height - a.height; });
    m.summits = [];
    summits.forEach(function (s) {
      var apart = m.summits.every(function (o) { return Math.hypot(o.x - s.x, o.y - s.y) > 200; });
      if (apart && m.summits.length < 4) m.summits.push(s);
    });
  }

  // Self-check: ground at the text sits under the deepest depth line
  var bay = { seed: 1, cols: 40, rows: 40, width: 240, height: 240, voids: [[100, 100, 140, 120]] };
  survey(bay);
  console.assert(bay.base[18 * 40 + 20] < -WATER_LINES * STEP, 'map: text at sea');

  // Marching squares: for each of the 16 corner patterns, the cell edges a contour crosses, in pairs.
  // Edges are numbered 0 top, 1 right, 2 bottom, 3 left.
  var EDGES = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [3, 2], [0, 2], [0, 1, 3, 2], [1, 2], [3, 1], [0, 1], [3, 0], []];

  // Self-check: a pattern and its inverse cross the same edges
  for (var c = 0; c < 16; c++) {
    console.assert(EDGES[c].slice().sort().join() === EDGES[15 - c].slice().sort().join(), 'map: edge table', c);
  }

  // Trace every contour into one path per level; level k is the line at height k * STEP
  function trace(m) {
    var heights = m.heights, cols = m.cols, paths = m.paths = {};
    var i, j, a, b, c, d, v;
    function crossX(edge) { return edge === 0 ? i + (v - a) / (b - a) : edge === 2 ? i + (v - d) / (c - d) : edge === 1 ? i + 1 : i; }
    function crossY(edge) { return edge === 1 ? j + (v - b) / (c - b) : edge === 3 ? j + (v - a) / (d - a) : edge === 2 ? j + 1 : j; }
    for (j = 0; j < m.rows - 1; j++) {
      for (i = 0; i < cols - 1; i++) {
        a = heights[j * cols + i];
        b = heights[j * cols + i + 1];
        c = heights[(j + 1) * cols + i + 1];
        d = heights[(j + 1) * cols + i];
        var lowest = Math.max(-WATER_LINES, Math.ceil(Math.min(a, b, c, d) / STEP));
        var highest = Math.floor(Math.max(a, b, c, d) / STEP);
        for (var k = lowest; k <= highest; k++) {
          v = k * STEP;
          var edges = EDGES[(a > v) | (b > v) << 1 | (c > v) << 2 | (d > v) << 3];
          var path = paths[k] || (paths[k] = new Path2D());
          for (var e = 0; e < edges.length; e += 2) {
            path.moveTo(crossX(edges[e]) * GRID, crossY(edges[e]) * GRID);
            path.lineTo(crossX(edges[e + 1]) * GRID, crossY(edges[e + 1]) * GRID);
          }
        }
      }
    }
    m.levels = Object.keys(paths).map(Number).sort(function (p, q) { return p - q; });
  }

  // Draw the levels from the lowest up. `shown` counts visible levels; its fraction is the next one fading in.
  function paint(m, shown) {
    var ctx = m.ctx, css = getComputedStyle(root);
    var land = css.getPropertyValue('--land'), water = css.getPropertyValue('--water');
    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    ctx.clearRect(0, 0, m.width, m.height);
    m.levels.forEach(function (k, n) {
      var alpha = Math.min(1, shown - n);
      if (alpha <= 0) return;
      var heavy = k % 5 === 0; // the coast and every fifth contour
      ctx.strokeStyle = k > 0 ? land : water;
      ctx.lineWidth = heavy ? 1.25 : 0.75;
      ctx.globalAlpha = alpha * (k < 0 ? 0.35 : heavy ? 0.9 : 0.5);
      ctx.stroke(m.paths[k]);
    });
    // Spot heights arrive last, each knocked out of the lines beneath it like a map label
    ctx.globalAlpha = Math.max(0, Math.min(1, shown - m.levels.length));
    ctx.font = '500 condensed 11px Archivo, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = css.getPropertyValue('--paper');
    m.summits.forEach(function (s) {
      var text = String(metres(m.heights[s.at]));
      ctx.strokeText(text, s.x + 7, s.y);
      ctx.fillStyle = css.getPropertyValue('--text-2');
      ctx.fillText(text, s.x + 7, s.y);
      ctx.fillStyle = land;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  // Draw one frame: move the ground, redraw the lines.
  // Keeps going while the map is on screen; stands still for reduced motion.
  function run(m) {
    cancelAnimationFrame(m.raf);
    if (!m.width) return;
    var now = performance.now(), moving = !reduceMotion && m.seen;
    if (moving) m.raf = requestAnimationFrame(function () { run(m); });
    // About 30 frames a second while the map is arriving or was just touched; 12 is plenty for the swell alone
    if (moving && now - m.drawn < (now < Math.max(m.start + REVEAL_MS, m.stirred + 1500) ? 30 : 80)) return;
    rise(m, now, now - m.drawn);
    m.drawn = now;
    trace(m);
    var t = reduceMotion ? 1 : Math.min(1, (now - m.start) / REVEAL_MS);
    paint(m, (1 - Math.pow(1 - t, 3)) * (m.levels.length + 1));
    // The marginal note: the elevation under the pointer, or of the highest spot height
    if (!m.elev) return;
    var h = m.pointer >= 0 ? m.heights[m.pointer] : Math.max.apply(null, m.summits.map(function (o) { return m.heights[o.at]; }));
    var text = h > 0 ? (m.pointer >= 0 ? 'Elevation ' : 'Summit ') + metres(h) + ' m' : 'Open water';
    if (m.elev.textContent !== text) m.elev.textContent = text;
  }

  function layout(m, restart) {
    var box = m.box.getBoundingClientRect();
    var width = Math.ceil(box.width), height = Math.ceil(box.height);
    if (!width || !height) { m.width = 0; m.key = ''; return; } // hidden: the reveal replays when it comes back
    // Keep-clear boxes: each line of text inside a data-void element that overlaps this map, in the map's own
    // coordinates. Lines, not the whole block, so the land fills in beside short lines (most of a phone screen).
    // An element with no text yet (the empty elevation note) keeps clear its whole box.
    var voids = [], range = document.createRange();
    document.querySelectorAll('[data-void]').forEach(function (el) {
      var rects = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        range.selectNodeContents(walk.currentNode);
        Array.prototype.forEach.call(range.getClientRects(), function (r) { if (r.width) rects.push(r); });
      }
      (rects.length ? rects : [el.getBoundingClientRect()]).forEach(function (r) {
        if (!r.width || r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) return;
        voids.push([r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top]);
      });
    });
    // Surveying is the slow part: skip it when neither the box nor the text over it has changed
    var key = [width, height].concat(voids).join();
    if (key === m.key && !restart) return;
    m.key = key;
    m.voids = voids;
    if (!m.width || restart) m.start = performance.now();
    m.width = width;
    m.height = height;
    m.dpr = Math.min(window.devicePixelRatio || 1, 2);
    m.cv.width = width * m.dpr;
    m.cv.height = height * m.dpr;
    m.cv.style.width = width + 'px';
    m.cv.style.height = height + 'px';
    m.cols = Math.ceil(width / GRID) + 1;
    m.rows = Math.ceil(height / GRID) + 1;
    survey(m);
    m.drawn = 0; // the canvas was just cleared: draw now, whatever the frame pacing says
    run(m);
  }

  // Settles when the text font has loaded, or failed to
  var fontReady = document.fonts ? document.fonts.load('1em Archivo').catch(function () {}) : Promise.resolve();

  document.querySelectorAll('canvas.art').forEach(function (cv) {
    var m = { cv: cv, ctx: cv.getContext('2d'), box: cv.parentElement, width: 0, seed: newSeed(), seen: true, pointer: -1, stirred: -Infinity };
    maps.push(m);

    // The marginal note: the elevation under the pointer
    var sheet = m.box.querySelector('[data-sheet]');
    if (sheet) {
      m.elev = sheet.querySelector('[data-sheet-elev]');
      sheet.hidden = false;
    }
    m.box.addEventListener('pointermove', function (e) {
      var box = m.box.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
      var moved = Math.min(60, Math.hypot(x - m.px, y - m.py)); // NaN on the way in, so no wake from the jump
      if (moved && !reduceMotion) around(m, x, y, function (p, w) { m.lift[p] += WAKE * moved * w * m.clear[p]; });
      m.stirred = performance.now();
      m.px = x;
      m.py = y;
      m.pointer = Math.round(y / GRID) * m.cols + Math.round(x / GRID);
      if (reduceMotion) run(m);
    });
    m.box.addEventListener('pointerleave', function () { m.pointer = -1; m.px = NaN; if (reduceMotion) run(m); });
    // Not on the text or the controls: land there would run under the words
    m.box.addEventListener('click', function (e) {
      if (e.target.closest('a, button, input, select, textarea, label, [data-void]')) return;
      var box = m.box.getBoundingClientRect();
      summit(m, e.clientX - box.left, e.clientY - box.top);
      m.stirred = performance.now();
      if (reduceMotion) run(m);
    });

    // Surveying is slow, so it waits twice. For the font: the text, and so the coastline, moves when it arrives.
    // And for the observer's turn to end: that runs before the browser paints, and would hold up the first paint.
    new ResizeObserver(function () { fontReady.then(function () { setTimeout(function () { layout(m); }); }); }).observe(m.box);
    // Stop working while the map is scrolled out of view
    new IntersectionObserver(function (entries) { m.seen = entries[entries.length - 1].isIntersecting; run(m); }).observe(cv);
  });

  if (maps.length) {
    // The inks change with the colour scheme
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { maps.forEach(run); });
  }
})();
