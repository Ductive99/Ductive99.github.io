// ============================================
// Time Tracker v2 - Calendar views + inline controls
// ============================================
(function () {
  'use strict';

  // --- Storage ---
  function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch (e) { return fb; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // --- State ---
  var projects = load('tt_projects', []);
  var sessions = load('tt_sessions', []);
  var active = load('tt_active', null);
  var currentView = 'daily';
  var viewDate = new Date();
  var tickInterval = null;
  var expandedProjects = load('tt_expanded', {});
  var addingSubFor = null;
  var deletingId = null;
  var editingId = null;
  var draggedItem = null;
  var lastSession = null; // for post-stop trimming UI
  var selectedId = null;
  var deletingSessionId = null;
  var privacyMode = false;
  var baseTitle = document.title;
  // New projects cycle through these; they are also the colour picker's swatches
  var PALETTE = ['#ff1744', '#ff6d00', '#ffea00', '#00e676', '#00e5ff', '#2979ff', '#d500f9', '#ff4081'];
  var PALETTE_NAMES = ['Electric red', 'Bright orange', 'Sunshine yellow', 'Neon green', 'Electric cyan', 'Vivid blue', 'Neon purple', 'Hot pink'];
  var ICON = {
    play: '<i class="ic ic-play"></i>', pause: '<i class="ic ic-pause"></i>', stop: '<i class="ic ic-stop"></i>',
    edit: '<i class="ic ic-edit"></i>', plus: '<i class="ic ic-plus"></i>', close: '<i class="ic ic-close"></i>',
    up: '<i class="ic ic-up"></i>', down: '<i class="ic ic-down"></i>'
  };

  // --- DOM ---
  var $panel = document.getElementById('project-panel');
  var $banner = document.getElementById('active-banner');
  var $activeDot = document.getElementById('active-dot');
  var $activeName = document.getElementById('active-name');
  var $activeClock = document.getElementById('active-clock');
  var $activePlayPause = document.getElementById('active-playpause');
  var $activeStop = document.getElementById('active-stop');
  var $calView = document.getElementById('calendar-view');
  var $calLabel = document.getElementById('cal-label');
  var $totalToday = document.getElementById('total-today');

  if (!$panel) return;

  // --- Helpers ---
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDur(ms) {
    var s = Math.floor(ms / 1000); var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); s %= 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function fmtShort(ms) {
    var s = Math.floor(ms / 1000); var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60);
    return h + 'h ' + m + 'm';
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function setBig(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }
  var _gibCache = {};
  function gibberish(str) {
    if (!str) return '';
    if (_gibCache[str]) return _gibCache[str];
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*+=<>?/~|_';
    var out = '';
    for (var i = 0; i < str.length; i++) {
      out += str[i] === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)];
    }
    _gibCache[str] = out;
    return out;
  }
  function displayName(str) { return privacyMode ? gibberish(str) : str; }
  function dk(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function getProj(id) { return projects.find(function (p) { return p.id === id; }); }
  function getSub(proj, sid) { return proj && proj.subs ? proj.subs.find(function (s) { return s.id === sid; }) : null; }

  // Split a session across midnight boundaries so each day gets its portion
  function splitSessionByDay(s) {
    var parts = [];
    var cur = new Date(s.start);
    var end = new Date(s.end);
    while (cur < end) {
      var nextMidnight = new Date(cur);
      nextMidnight.setHours(24, 0, 0, 0);
      var segEnd = nextMidnight < end ? nextMidnight.getTime() : s.end;
      parts.push({ id: s.id, projectId: s.projectId, subprojectId: s.subprojectId, start: cur.getTime(), end: segEnd, duration: segEnd - cur.getTime(), pauseLog: s.pauseLog || [] });
      cur = nextMidnight;
    }
    return parts;
  }

  // Get all session segments that fall on a specific day key
  function getSessionsForDay(dayKey) {
    var result = [];
    sessions.forEach(function (s) {
      var parts = splitSessionByDay(s);
      parts.forEach(function (p) {
        if (dk(new Date(p.start)) === dayKey) result.push(p);
      });
    });
    return result;
  }

  function todayTotal() {
    var key = dk(new Date()); var t = 0;
    var daySessions = getSessionsForDay(key);
    daySessions.forEach(function (s) { t += s.duration; });
    if (active) {
      var activeDur = active.elapsed + (active.paused ? 0 : Date.now() - active.start);
      if (dk(new Date(active.initialStart)) === key) t += activeDur;
    }
    return t;
  }

  // --- Start / Stop ---
  function startTimer(projId, subId, countdownMs) {
    if (active) stopTimer();
    active = { projectId: projId, subprojectId: subId || null, initialStart: Date.now(), start: Date.now(), elapsed: 0, paused: false, pauseLog: [], countdownMs: countdownMs || null };
    save('tt_active', active);
    if (editorInPanel()) editingSession = null;
    lastSession = null;
    selectedId = null;
    startTick();
    renderPanel();
    renderBanner();
    renderLastSession();
    updateHint();
  }

  function togglePause() {
    if (!active) return;
    if (active.paused) {
      // Resuming: close the pause interval
      if (active.pauseLog && active.pauseLog.length > 0) {
        var last = active.pauseLog[active.pauseLog.length - 1];
        if (!last.end) last.end = Date.now();
      }
      active.start = Date.now();
      active.paused = false;
      startTick();
    } else {
      // Pausing: open a new pause interval
      active.elapsed += Date.now() - active.start;
      if (!active.pauseLog) active.pauseLog = [];
      active.pauseLog.push({ start: Date.now(), end: null });
      active.start = null;
      active.paused = true;
      stopTick();
    }
    save('tt_active', active);
    renderBanner();
    renderPanel();
    tick(); // update immediately
  }

  // endAt: when the session really ended (a countdown that finished while the tab was closed)
  function stopTimer(endAt) {
    if (!active) return;
    var now = typeof endAt === 'number' ? endAt : Date.now();
    var duration = active.elapsed + (active.paused ? 0 : now - active.start);
    var startTime = active.initialStart || (now - duration);
    // Close any open pause interval
    var pLog = (active.pauseLog || []).slice();
    pLog.forEach(function(p) { if (!p.end) p.end = now; });
    var newSession = { id: uid(), projectId: active.projectId, subprojectId: active.subprojectId, start: startTime, end: now, duration: duration, pauseLog: pLog };
    sessions.push(newSession);
    save('tt_sessions', sessions);
    lastSession = newSession;
    editingSession = null;
    active = null;
    save('tt_active', active);
    stopTick();
    document.title = baseTitle;
    if (focusMode) exitFocus();
    renderPanel();
    renderBanner();
    renderCalendar();
    renderLastSession();
    updateHint();
  }

  function startTick() { stopTick(); tick(); tickInterval = setInterval(tick, 1000); }
  function stopTick() { if (tickInterval) { clearInterval(tickInterval); tickInterval = null; } }
  function tick() {
    if (!active) { document.title = baseTitle; return; }
    var tickNow = Date.now();
    var el = active.elapsed + (active.paused ? 0 : tickNow - active.start);
    var formatted;

    if (active.countdownMs) {
      var remaining = active.countdownMs - el;
      if (remaining <= 0) {
        var overshoot = -remaining;
        remaining = 0;
        if (!active.paused) {
          // Gentle bird chirp alarm — 3 bursts
          try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var now = ctx.currentTime;

            function chirp(time) {
              var osc = ctx.createOscillator();
              var gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(3500, time);
              osc.frequency.exponentialRampToValueAtTime(1800, time + 0.15);
              gain.gain.setValueAtTime(0, time);
              gain.gain.linearRampToValueAtTime(0.35, time + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
              gain.gain.linearRampToValueAtTime(0, time + 0.15);
              osc.start(time);
              osc.stop(time + 0.15);
            }

            // Burst 1
            chirp(now);
            chirp(now + 0.25);
            chirp(now + 0.50);
            // Burst 2 (after pause)
            chirp(now + 1.0);
            chirp(now + 1.25);
            chirp(now + 1.50);
            // Burst 3
            chirp(now + 2.2);
            chirp(now + 2.45);
            chirp(now + 2.70);
            chirp(now + 2.95);
          } catch(e) {}
          // End the session when the countdown reached zero, not now
          stopTimer(tickNow - overshoot);
          return;
        }
      }
      formatted = fmtDur(remaining);
      document.title = fmtDur(remaining) + ' - Timer';
    } else {
      formatted = fmtDur(el);
      document.title = fmtDur(el) + ' - Timer';
    }

    setBig($activeClock, formatted);
    if (focusMode) setBig($focusClock, formatted);
    // Update inline timer on the active row
    var row = document.querySelector('[data-timer-id="' + active.projectId + (active.subprojectId ? ':' + active.subprojectId : '') + '"]');
    if (row) { var t = row.querySelector('.tt-row-clock'); if (t) t.textContent = formatted; }
    $totalToday.textContent = fmtShort(todayTotal()) + ' today';
    // Live update the daily view if viewing today
    if (currentView === 'daily' && dk(viewDate) === dk(new Date())) {
      renderDaily();
    }
  }

  // --- Active Banner ---
  function renderBanner() {
    if (!active) { $banner.style.display = 'none'; document.title = baseTitle; return; }
    var proj = getProj(active.projectId);
    var sub = active.subprojectId ? getSub(proj, active.subprojectId) : null;
    var projName = proj ? proj.name : '?';
    var subName = sub ? sub.name : null;
    var name = displayName(projName) + (subName ? ' / ' + displayName(subName) : '');
    $activeDot.style.background = proj ? proj.color : '#787878';
    $activeName.textContent = name;

    // Running: a cyan line sweeps the bottom edge. Paused: a yellow status.
    $activePlayPause.innerHTML = active.paused ? ICON.play : ICON.pause;
    $activePlayPause.title = active.paused ? 'Resume' : 'Pause';
    $banner.classList.toggle('is-paused', !!active.paused);
    $banner.classList.toggle('is-running', !active.paused);
    document.getElementById('active-status').hidden = !active.paused;

    $banner.style.display = '';
  }

  if ($activePlayPause) $activePlayPause.addEventListener('click', togglePause);
  $activeStop.addEventListener('click', stopTimer);

  // --- Privacy Toggle ---
  var $privacyBtn = document.getElementById('btn-privacy');
  if ($privacyBtn) {
    $privacyBtn.addEventListener('click', function () {
      privacyMode = !privacyMode;
      _gibCache = {}; // fresh gibberish each toggle
      $privacyBtn.setAttribute('aria-pressed', privacyMode);
      renderPanel();
      renderBanner();
      renderCalendar();
    });
  }

  // --- Hint ---
  function updateHint() {
    var $hint = document.getElementById('tt-hint');
    if (!$hint) return;
    $hint.hidden = !(!active && projects.filter(function(p){return !p.archived;}).length > 0);
  }

  // --- Focus Mode ---
  var focusMode = false;
  var $focusOverlay = document.getElementById('focus-overlay');
  var $focusClock   = document.getElementById('focus-clock');
  var $focusName    = document.getElementById('focus-name');
  var $focusDot     = document.getElementById('focus-dot');
  var $focusPlay    = document.getElementById('focus-playpause');
  var $focusStop    = document.getElementById('focus-stop');
  var $focusExit    = document.getElementById('focus-exit');
  var $btnFocus     = document.getElementById('btn-focus');

  function updateFocusOverlay() {
    if (!active || !$focusOverlay) return;
    var proj = getProj(active.projectId);
    var sub  = active.subprojectId ? getSub(proj, active.subprojectId) : null;
    var projName = proj ? proj.name : '?';
    var subName  = sub ? sub.name : null;
    $focusName.textContent = displayName(projName) + (subName ? ' / ' + displayName(subName) : '');
    $focusDot.style.background = proj ? proj.color : '#787878';
    document.getElementById('focus-status').hidden = !active.paused;
    if ($focusPlay) $focusPlay.innerHTML = active.paused ? ICON.play + 'Resume' : ICON.pause + 'Pause';
  }

  function enterFocus() {
    if (!active) return;
    focusMode = true;
    updateFocusOverlay();
    $focusOverlay.hidden = false;
    document.body.classList.add('tt-focus-active');
    tick();
  }

  function exitFocus() {
    focusMode = false;
    if ($focusOverlay) $focusOverlay.hidden = true;
    document.body.classList.remove('tt-focus-active');
  }

  if ($btnFocus)  $btnFocus.addEventListener('click', enterFocus);
  if ($focusExit) $focusExit.addEventListener('click', exitFocus);
  if ($focusPlay) $focusPlay.addEventListener('click', function() { togglePause(); updateFocusOverlay(); });
  if ($focusStop) $focusStop.addEventListener('click', function() { exitFocus(); stopTimer(); });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && focusMode) exitFocus();
  });

  // --- Project Panel ---
  function renderPanel() {
    var html = '';
    projects.forEach(function (p) {
      if (p.archived) return;
      var isActive = active && active.projectId === p.id && !active.subprojectId;
      var expanded = !!expandedProjects[p.id];
      var hasSubs = p.subs && p.subs.length > 0;

      html += '<div class="tt-project" draggable="true" data-drag-proj="' + p.id + '">';
      
      if (deletingId === p.id) {
        html += '<div class="tt-row tt-confirm">';
        html += '<span>Delete this project?</span>';
        html += '<button class="timer-btn-sm" data-archiveproj="' + p.id + '" title="Remove from the list but keep its time in insights">Archive</button>';
        html += '<button class="timer-btn-sm btn-danger" data-confirmdel="' + p.id + '" title="Permanently delete the project; past insights lose its name">Delete all</button>';
        html += '<button class="timer-btn-sm" data-canceldel="1">Cancel</button>';
        html += '</div>';
      } else if (editingId === p.id) {
        html += '<div class="tt-row tt-row-edit">';
        html += colorBtn('edit-color-' + p.id, p.color);
        html += '<input type="text" id="edit-name-' + p.id + '" class="timer-input" value="' + esc(p.name).replace(/"/g, '&quot;') + '" aria-label="Project name">';
        html += '<button class="timer-btn-sm" data-saveedit="' + p.id + '">Save</button>';
        html += '<button class="tt-row-btn" data-canceledit="1" title="Cancel">' + ICON.close + '</button>';
        html += '</div>';
      } else {
        var isSelected = selectedId === p.id;
        html += '<div class="tt-row tt-row-selectable' + (isActive ? ' tt-row-active' : '') + (isSelected ? ' tt-row-selected' : '') + '" data-timer-id="' + p.id + '" data-select="' + p.id + '">';
        html += '<span class="timer-project-dot" style="background:' + p.color + '"></span>';
        html += '<span class="tt-row-name">' + esc(displayName(p.name)) + '</span>';
        var el = active && active.projectId === p.id && !active.subprojectId ? 
          active.elapsed + (active.paused ? 0 : Date.now() - active.start) : 0;
        
        // If it's a countdown, show remaining inline if active
        if (isActive && active.countdownMs) {
          var rem = active.countdownMs - el;
          html += '<span class="tt-row-clock">' + fmtDur(rem > 0 ? rem : 0) + '</span>';
        } else {
          html += '<span class="tt-row-clock">' + (isActive ? fmtDur(el) : '') + '</span>';
        }

        if (isActive) {
          if (active.paused) {
            html += '<button class="tt-row-btn tt-btn-play" data-play="' + p.id + '" title="Resume">' + ICON.play + '</button>';
          } else {
            html += '<button class="tt-row-btn tt-btn-pause" data-pause="1" title="Pause">' + ICON.pause + '</button>';
          }
          html += '<button class="tt-row-btn tt-btn-stop" data-stop="1" title="Stop">' + ICON.stop + '</button>';
        }

        if (hasSubs) {
          html += '<button class="tt-row-btn tt-btn-toggle" data-toggle="' + p.id + '" title="' + (expanded ? 'Hide' : 'Show') + ' sub-projects">' + (expanded ? ICON.up : ICON.down) + '</button>';
        }

        html += '<button class="tt-row-btn tt-btn-edit" data-edit="' + p.id + '" title="Edit">' + ICON.edit + '</button>';
        html += '<button class="tt-row-btn tt-btn-gear" data-addsub="' + p.id + '" title="Add sub-project">' + ICON.plus + '</button>';
        html += '<button class="tt-row-btn tt-btn-danger" data-del="' + p.id + '" title="Delete">' + ICON.close + '</button>';
        html += '</div>';

        // Start controls if selected
        if (isSelected && !isActive) html += startPanelHtml(p.id, 'data-play="' + p.id + '"');
      }

      // Sub-projects
      if (hasSubs || addingSubFor === p.id) {
        html += '<div class="tt-subs' + (expanded ? '' : ' tt-hidden') + '">';
        if (hasSubs) {
          p.subs.forEach(function (s) {
          var subActive = active && active.projectId === p.id && active.subprojectId === s.id;
          
          if (deletingId === p.id + ':' + s.id) {
            html += '<div class="tt-row tt-row-sub tt-confirm">';
            html += '<span>Delete this sub-project?</span>';
            html += '<button class="timer-btn-sm btn-danger" data-confirmdelsub="' + p.id + ':' + s.id + '">Delete</button>';
            html += '<button class="timer-btn-sm" data-canceldel="1">Cancel</button>';
            html += '</div>';
          } else if (editingId === p.id + ':' + s.id) {
            html += '<div class="tt-row tt-row-sub tt-row-edit">';
            html += '<span class="tt-sub-indent"></span>';
            html += '<input type="text" id="edit-subname-' + p.id + '-' + s.id + '" class="timer-input" value="' + esc(s.name).replace(/"/g, '&quot;') + '" aria-label="Sub-project name">';
            html += '<button class="timer-btn-sm" data-saveeditsub="' + p.id + ':' + s.id + '">Save</button>';
            html += '<button class="tt-row-btn" data-canceledit="1" title="Cancel">' + ICON.close + '</button>';
            html += '</div>';
          } else {
            var subIdFull = p.id + ':' + s.id;
            var isSubSelected = selectedId === subIdFull;
            html += '<div class="tt-row tt-row-sub tt-row-selectable' + (subActive ? ' tt-row-active' : '') + (isSubSelected ? ' tt-row-selected' : '') + '" data-timer-id="' + subIdFull + '" draggable="true" data-drag-sub="' + subIdFull + '" data-select="' + subIdFull + '">';
            
            html += '<span class="tt-sub-indent"></span>';
            html += '<span class="timer-project-dot tt-dot-sm" style="background:' + p.color + '"></span>';
            html += '<span class="tt-row-name">' + esc(displayName(s.name)) + '</span>';
            var elSub = active && active.projectId === p.id && active.subprojectId === s.id ? 
              active.elapsed + (active.paused ? 0 : Date.now() - active.start) : 0;
              
            if (subActive && active.countdownMs) {
              var remS = active.countdownMs - elSub;
              html += '<span class="tt-row-clock">' + fmtDur(remS > 0 ? remS : 0) + '</span>';
            } else {
              html += '<span class="tt-row-clock">' + (subActive ? fmtDur(elSub) : '') + '</span>';
            }

            if (subActive) {
              if (active.paused) {
                html += '<button class="tt-row-btn tt-btn-play" data-playsub="' + subIdFull + '" title="Resume">' + ICON.play + '</button>';
              } else {
                html += '<button class="tt-row-btn tt-btn-pause" data-pause="1" title="Pause">' + ICON.pause + '</button>';
              }
              html += '<button class="tt-row-btn tt-btn-stop" data-stop="1" title="Stop">' + ICON.stop + '</button>';
            }
            html += '<button class="tt-row-btn tt-btn-edit" data-editsub="' + subIdFull + '" title="Edit">' + ICON.edit + '</button>';
            html += '<button class="tt-row-btn tt-btn-danger" data-delsub="' + subIdFull + '" title="Delete">' + ICON.close + '</button>';
            html += '</div>';

            if (isSubSelected && !subActive) html += startPanelHtml(subIdFull, 'data-playsub="' + subIdFull + '"');
          }
        });
        }
        
        if (addingSubFor === p.id) {
          html += '<div class="tt-row tt-row-sub tt-row-edit">';
          html += '<span class="tt-sub-indent"></span>';
          html += '<input type="text" id="new-sub-name-' + p.id + '" class="timer-input" placeholder="New sub-project name" aria-label="New sub-project name">';
          html += '<button class="timer-btn-sm" data-savesub="' + p.id + '">Add</button>';
          html += '<button class="tt-row-btn" data-cancelsub="1" title="Cancel">' + ICON.close + '</button>';
          html += '</div>';
        }
        
        html += '</div>';
      }
      html += '</div>';
    });

    html += '<div class="tt-project tt-add-project-row">';
    html += '<input type="text" id="new-project-name" class="timer-input" placeholder="New project" aria-label="New project name">';
    html += colorBtn('new-project-color', PALETTE[projects.length % PALETTE.length]);
    html += '<button class="timer-btn-sm" id="btn-add-project">Add</button>';
    html += '</div>';

    if (projects.length === 0) {
      html = '<p class="tt-empty">No projects yet. Add one below.</p>' + html;
    }
    $panel.innerHTML = html;
  }

  // Swatch button; its value is the colour, read on save like an input's
  function colorBtn(id, color) {
    return '<button type="button" class="timer-color" id="' + id + '" value="' + color + '" style="--c:' + color + '" aria-label="Colour" aria-haspopup="true"></button>';
  }

  // Stopwatch or countdown, shown under the selected row. id is "project" or "project:sub".
  function startPanelHtml(id, playAttr) {
    return '<div class="tt-start-panel">' +
      '<button class="timer-btn-sm" ' + playAttr + '>' + ICON.play + 'Start stopwatch</button>' +
      '<span class="tt-start-or">or</span>' +
      '<input type="number" id="countdown-' + id + '" class="timer-input tt-input-num" value="25" min="1" max="999" aria-label="Countdown minutes">' +
      '<span class="dim">min</span>' +
      '<button class="timer-btn-sm" data-start-timer="' + id + '">Start timer</button>' +
      '</div>';
  }

  // Panel event delegation
  $panel.addEventListener('click', function (e) {
    if (e.target.tagName === 'INPUT') return;

    var colBtn = e.target.closest('.timer-color');
    if (colBtn) { openPicker(colBtn); return; }

    // Selection logic
    var sel = e.target.closest('[data-select]');
    if (sel && !e.target.closest('.tt-row-btn') && !e.target.closest('input') && !e.target.closest('button')) {
      var selId = sel.getAttribute('data-select');
      selectedId = (selectedId === selId) ? null : selId;
      renderPanel();
      return;
    }

    var btn = e.target.closest('[data-play]');
    if (btn) { 
      var playId = btn.getAttribute('data-play');
      if (active && active.projectId === playId && active.paused && !active.subprojectId) {
        togglePause();
      } else {
        startTimer(playId, null, null); 
      }
      return; 
    }

    btn = e.target.closest('[data-playsub]');
    if (btn) { 
      var p = btn.getAttribute('data-playsub').split(':'); 
      if (active && active.projectId === p[0] && active.subprojectId === p[1] && active.paused) {
        togglePause();
      } else {
        startTimer(p[0], p[1], null); 
      }
      return; 
    }

    btn = e.target.closest('[data-start-timer]');
    if (btn) {
      var id = btn.getAttribute('data-start-timer');
      var parts = id.split(':');
      var input = document.getElementById('countdown-' + id);
      var mins = input ? parseInt(input.value) : 25;
      if (isNaN(mins) || mins < 1) mins = 25;
      startTimer(parts[0], parts[1] || null, mins * 60000);
      return;
    }

    btn = e.target.closest('[data-pause]');
    if (btn) { togglePause(); return; }

    btn = e.target.closest('[data-stop]');
    if (btn) { stopTimer(); return; }

    btn = e.target.closest('[data-toggle]');
    if (btn) {
      var id = btn.getAttribute('data-toggle');
      expandedProjects[id] = !expandedProjects[id];
      save('tt_expanded', expandedProjects);
      renderPanel();
      return;
    }

    btn = e.target.closest('[data-addsub]');
    if (btn) {
      addingSubFor = btn.getAttribute('data-addsub');
      expandedProjects[addingSubFor] = true;
      renderPanel();
      var input = document.getElementById('new-sub-name-' + addingSubFor);
      if (input) input.focus();
      return;
    }

    btn = e.target.closest('[data-cancelsub]');
    if (btn) { addingSubFor = null; renderPanel(); return; }

    btn = e.target.closest('[data-savesub]');
    if (btn) { 
       var pid = btn.getAttribute('data-savesub');
       var input = document.getElementById('new-sub-name-' + pid);
       if (input) saveSubProject(pid, input.value);
       return; 
    }

    btn = e.target.closest('[data-del]');
    if (btn) {
      deletingId = btn.getAttribute('data-del');
      renderPanel();
      return;
    }

    btn = e.target.closest('[data-delsub]');
    if (btn) {
      deletingId = btn.getAttribute('data-delsub');
      renderPanel();
      return;
    }

    btn = e.target.closest('[data-archiveproj]');
    if (btn) {
      var did = btn.getAttribute('data-archiveproj');
      var p = getProj(did);
      if (p) {
        p.archived = true;
        save('tt_projects', projects);
      }
      deletingId = null;
      renderPanel();
      updateHint();
      return;
    }

    btn = e.target.closest('[data-confirmdel]');
    if (btn) {
      var did = btn.getAttribute('data-confirmdel');
      if (active && active.projectId === did) stopTimer();
      projects = projects.filter(function (p) { return p.id !== did; });
      save('tt_projects', projects);
      deletingId = null;
      renderPanel();
      renderBanner();
      renderCalendar();
      updateHint();
      return;
    }

    btn = e.target.closest('[data-confirmdelsub]');
    if (btn) {
      var parts = btn.getAttribute('data-confirmdelsub').split(':');
      if (active && active.projectId === parts[0] && active.subprojectId === parts[1]) stopTimer();
      var pr = getProj(parts[0]);
      if (pr && pr.subs) { pr.subs = pr.subs.filter(function (s) { return s.id !== parts[1]; }); save('tt_projects', projects); }
      deletingId = null;
      renderPanel();
      renderCalendar();
      return;
    }

    btn = e.target.closest('[data-canceldel]');
    if (btn) { deletingId = null; renderPanel(); return; }

    btn = e.target.closest('[data-edit]');
    if (btn) {
      editingId = btn.getAttribute('data-edit');
      renderPanel();
      return;
    }

    btn = e.target.closest('[data-editsub]');
    if (btn) {
      editingId = btn.getAttribute('data-editsub');
      renderPanel();
      return;
    }

    btn = e.target.closest('[data-canceledit]');
    if (btn) { editingId = null; renderPanel(); return; }

    btn = e.target.closest('[data-saveedit]');
    if (btn) {
      var id = btn.getAttribute('data-saveedit');
      var p = getProj(id);
      if (p) {
        var inp = document.getElementById('edit-name-' + id);
        var col = document.getElementById('edit-color-' + id);
        if (inp && inp.value.trim()) p.name = inp.value.trim();
        if (col) p.color = col.value;
        save('tt_projects', projects);
      }
      editingId = null;
      renderPanel();
      renderBanner();
      renderCalendar();
      return;
    }

    btn = e.target.closest('[data-saveeditsub]');
    if (btn) {
      var parts = btn.getAttribute('data-saveeditsub').split(':');
      var pr = getProj(parts[0]);
      var s = getSub(pr, parts[1]);
      if (s) {
        var inp = document.getElementById('edit-subname-' + parts[0] + '-' + parts[1]);
        if (inp && inp.value.trim()) s.name = inp.value.trim();
        save('tt_projects', projects);
      }
      editingId = null;
      renderPanel();
      renderBanner();
      renderCalendar();
      return;
    }

    btn = e.target.closest('#btn-add-project');
    if (btn) {
      saveNewProject();
      return;
    }
  });

  // --- Colour picker: one shared popover, anchored to whichever swatch button opened it ---
  var $picker = document.getElementById('color-picker');
  var pickerFor = null;
  var pickerWasOpen = false; // outside-tap closes the picker on pointerup, before the button's click
  $picker.innerHTML = PALETTE.map(function (c, i) {
    return '<button type="button" class="cp-swatch" style="--c:' + c + ';--tick:' + tickColor(c) + '" data-color="' + c + '" aria-label="' + PALETTE_NAMES[i] + '" aria-pressed="false"></button>';
  }).join('') + '<label class="cp-swatch cp-custom" title="Custom colour"><input type="color" aria-label="Custom colour"></label>';
  var $custom = $picker.querySelector('.cp-custom');
  var $customInput = $custom.querySelector('input');

  $panel.addEventListener('pointerdown', function (e) {
    pickerWasOpen = !!e.target.closest('.timer-color') && $picker.matches(':popover-open');
  });

  function openPicker(btn) {
    var wasOpen = pickerWasOpen || $picker.matches(':popover-open');
    pickerWasOpen = false;
    if ($picker.matches(':popover-open')) $picker.hidePopover();
    if (wasOpen && pickerFor === btn) return; // a second tap on the same button closes it
    pickerFor = btn;
    markPicked(btn.value);
    $picker.showPopover({ source: btn }); // source: Esc / outside tap hand focus back to the button
    // Open below the button, above if it would run off the bottom; keep inside the viewport sideways
    var r = btn.getBoundingClientRect(), w = $picker.offsetWidth, h = $picker.offsetHeight;
    var top = (r.bottom + 8 + h > window.innerHeight && r.top > h + 8) ? r.top - 8 - h : r.bottom + 8;
    var left = Math.max(8, Math.min(r.left, document.documentElement.clientWidth - w - 8));
    $picker.style.top = top + window.scrollY + 'px';
    $picker.style.left = left + window.scrollX + 'px';
    ($picker.querySelector('[aria-pressed="true"]') || $picker.querySelector('.cp-swatch')).focus();
  }

  // Dark tick on light swatches (yellow, cyan...), white on the rest
  function tickColor(hex) {
    var n = parseInt(hex.slice(1), 16);
    return 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255) > 128 ? '#1a2321' : '#fff';
  }

  function markPicked(color) {
    color = color.toLowerCase();
    var known = false;
    $picker.querySelectorAll('[data-color]').forEach(function (s) {
      var on = s.getAttribute('data-color') === color;
      s.setAttribute('aria-pressed', on);
      if (on) known = true;
    });
    $custom.classList.toggle('is-on', !known);
    $custom.style.setProperty('--c', known ? '' : color);
    $custom.style.setProperty('--tick', tickColor(color));
    $customInput.value = color;
  }

  function setPicked(color) {
    pickerFor.value = color;
    pickerFor.style.setProperty('--c', color);
    markPicked(color);
  }

  $picker.addEventListener('click', function (e) {
    var s = e.target.closest('[data-color]');
    if (!s) return;
    setPicked(s.getAttribute('data-color'));
    $picker.hidePopover();
    pickerFor.focus();
  });
  $customInput.addEventListener('input', function () { setPicked($customInput.value); });
  $customInput.addEventListener('change', function () { $picker.hidePopover(); pickerFor.focus(); });

  $panel.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (e.target.id && e.target.id.startsWith('new-sub-name-')) {
        var pid = e.target.id.replace('new-sub-name-', '');
        saveSubProject(pid, e.target.value);
      } else if (e.target.id === 'new-project-name') {
        saveNewProject();
      }
    }
  });

  // Auto-select countdown input text on focus so it can be replaced immediately
  $panel.addEventListener('focusin', function (e) {
    if (e.target.tagName === 'INPUT' && e.target.type === 'number' && e.target.id && e.target.id.startsWith('countdown-')) {
      e.target.select();
    }
  });

  function saveNewProject() {
    var $name = document.getElementById('new-project-name');
    var $color = document.getElementById('new-project-color');
    if (!$name || !$color) return;
    var name = $name.value.trim();
    if (!name) return;
    projects.push({ id: uid(), name: name, color: $color.value, subs: [] });
    save('tt_projects', projects);
    renderPanel();
    updateHint();
  }

  function saveSubProject(pid, name) {
    if (!name || !name.trim()) return;
    var proj = getProj(pid);
    if (!proj) return;
    if (!proj.subs) proj.subs = [];
    proj.subs.push({ id: uid(), name: name.trim() });
    save('tt_projects', projects);
    addingSubFor = null;
    renderPanel();
  }

  // --- Drag and Drop ---
  $panel.addEventListener('dragstart', function(e) {
    var pRow = e.target.closest('[data-drag-proj]');
    var sRow = e.target.closest('[data-drag-sub]');
    if (sRow) {
      draggedItem = { type: 'sub', id: sRow.getAttribute('data-drag-sub') };
      e.dataTransfer.setData('text/plain', 'sub');
    } else if (pRow) {
      draggedItem = { type: 'proj', id: pRow.getAttribute('data-drag-proj') };
      e.dataTransfer.setData('text/plain', 'proj');
    }
    if (draggedItem) {
      e.target.style.opacity = '0.5';
    }
  });

  $panel.addEventListener('dragend', function(e) {
    e.target.style.opacity = '1';
    draggedItem = null;
    document.querySelectorAll('.tt-drag-over').forEach(function(el) {
      el.classList.remove('tt-drag-over');
    });
  });

  $panel.addEventListener('dragover', function(e) {
    e.preventDefault();
    var dropTarget = null;
    if (draggedItem && draggedItem.type === 'sub') {
      dropTarget = e.target.closest('[data-drag-sub]');
    } else if (draggedItem && draggedItem.type === 'proj') {
      dropTarget = e.target.closest('[data-drag-proj]');
    }
    if (dropTarget) {
      dropTarget.classList.add('tt-drag-over');
    }
  });

  $panel.addEventListener('dragleave', function(e) {
    var pRow = e.target.closest('[data-drag-proj]');
    var sRow = e.target.closest('[data-drag-sub]');
    if (pRow) pRow.classList.remove('tt-drag-over');
    if (sRow) sRow.classList.remove('tt-drag-over');
  });

  $panel.addEventListener('drop', function(e) {
    e.preventDefault();
    if (!draggedItem) return;

    if (draggedItem.type === 'proj') {
      var targetRow = e.target.closest('[data-drag-proj]');
      if (targetRow) {
        var targetId = targetRow.getAttribute('data-drag-proj');
        if (targetId !== draggedItem.id) {
          var sourceIndex = projects.findIndex(function(p) { return p.id === draggedItem.id; });
          var targetIndex = projects.findIndex(function(p) { return p.id === targetId; });
          if (sourceIndex >= 0 && targetIndex >= 0) {
            var item = projects.splice(sourceIndex, 1)[0];
            projects.splice(targetIndex, 0, item);
            save('tt_projects', projects);
            renderPanel();
          }
        }
      }
    } else if (draggedItem.type === 'sub') {
      var targetRow = e.target.closest('[data-drag-sub]');
      if (targetRow) {
        var targetId = targetRow.getAttribute('data-drag-sub');
        var sourceParts = draggedItem.id.split(':');
        var targetParts = targetId.split(':');
        
        if (sourceParts[0] === targetParts[0] && draggedItem.id !== targetId) {
          var proj = getProj(sourceParts[0]);
          if (proj && proj.subs) {
            var sourceIndex = proj.subs.findIndex(function(s) { return s.id === sourceParts[1]; });
            var targetIndex = proj.subs.findIndex(function(s) { return s.id === targetParts[1]; });
            if (sourceIndex >= 0 && targetIndex >= 0) {
              var item = proj.subs.splice(sourceIndex, 1)[0];
              proj.subs.splice(targetIndex, 0, item);
              save('tt_projects', projects);
              renderPanel();
            }
          }
        }
      }
    }
    
    document.querySelectorAll('.tt-drag-over').forEach(function(el) {
      el.classList.remove('tt-drag-over');
    });
  });

  // --- Calendar ---
  document.getElementById('view-daily').addEventListener('click', function () { setView('daily'); });
  document.getElementById('view-weekly').addEventListener('click', function () { setView('weekly'); });
  document.getElementById('view-monthly').addEventListener('click', function () { setView('monthly'); });
  document.getElementById('cal-prev').addEventListener('click', function () { navCal(-1); });
  document.getElementById('cal-next').addEventListener('click', function () { navCal(1); });
  document.getElementById('cal-today').addEventListener('click', function () { viewDate = new Date(); renderCalendar(); });

  function setView(v, keepDate) {
    currentView = v;
    document.querySelectorAll('.timer-view-toggle [data-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === v);
    });
    if (!keepDate) viewDate = new Date();
    renderCalendar();
  }

  function goToDay(dateStr) {
    var parts = dateStr.split('-');
    viewDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    setView('daily', true);
  }

  function navCal(dir) {
    if (currentView === 'daily') viewDate.setDate(viewDate.getDate() + dir);
    else if (currentView === 'weekly') viewDate.setDate(viewDate.getDate() + dir * 7);
    else viewDate.setMonth(viewDate.getMonth() + dir);
    renderCalendar();
  }

  function renderCalendar() {
    if (currentView === 'daily') renderDaily();
    else if (currentView === 'weekly') renderWeekly();
    else renderMonthly();
    $totalToday.textContent = fmtShort(todayTotal()) + ' today';
    
    var $btnShare = document.getElementById('btn-share-insights');
    if ($btnShare) {
      $btnShare.style.display = (currentView === 'weekly' || currentView === 'monthly') ? '' : 'none';
    }
  }

  // --- Daily: Hour timeline (dynamic range) ---
  function renderDaily() {
    var day = dk(viewDate);
    $calLabel.textContent = viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    var daySessions = getSessionsForDay(day);
    var totalMs = 0;
    daySessions.forEach(function (s) { totalMs += s.duration; });

    // Build a virtual session for the live active timer
    var liveSession = null;
    if (active && active.initialStart) {
      var now = Date.now();
      var liveStart = active.initialStart;
      var liveEnd = now;
      // Split virtual live session to this day
      var liveFull = { id: '__live__', projectId: active.projectId, subprojectId: active.subprojectId, start: liveStart, end: liveEnd, duration: liveEnd - liveStart, pauseLog: active.pauseLog || [] };
      var liveParts = splitSessionByDay(liveFull);
      liveParts.forEach(function(p) {
        if (dk(new Date(p.start)) === day) {
          liveSession = p;
          totalMs += p.duration;
        }
      });
    }

    // Compute dynamic hour range based on actual sessions
    var minH = 8, maxH = 20;
    var allSessions = liveSession ? daySessions.concat([liveSession]) : daySessions;
    allSessions.forEach(function (s) {
      var sh = new Date(s.start).getHours();
      var eh = new Date(s.end).getHours();
      if (sh < minH) minH = sh;
      if (eh + 1 > maxH) maxH = eh + 1;
    });
    if (maxH > 24) maxH = 24;

    var viewTotalEl = document.getElementById('view-total');
    if (viewTotalEl) viewTotalEl.textContent = fmtShort(totalMs);

    var html = '<div class="tt-timeline">';

    for (var h = minH; h < maxH; h++) {
      var hourStart = new Date(viewDate); hourStart.setHours(h, 0, 0, 0);
      var hourEnd = new Date(viewDate); hourEnd.setHours(h + 1, 0, 0, 0);

      var blocks = [];
      var pauseBlocks = [];

      allSessions.forEach(function (s) {
        var ss = Math.max(s.start, hourStart.getTime());
        var se = Math.min(s.end, hourEnd.getTime());
        if (se > ss) {
          var left = ((ss - hourStart.getTime()) / 3600000) * 100;
          var width = ((se - ss) / 3600000) * 100;
          var proj = getProj(s.projectId);
          var sub = getSub(proj, s.subprojectId);
          var label = displayName(proj ? proj.name : '?');
          if (sub) label += ' / ' + displayName(sub.name);
          var isLive = s.id === '__live__';
          blocks.push({ left: left, width: Math.max(width, 1), color: proj ? proj.color : '#787878', name: label, live: isLive });

          // Render pause intervals as shaded overlay blocks
          if (s.pauseLog && s.pauseLog.length > 0) {
            s.pauseLog.forEach(function(p) {
              var pEnd = p.end || Date.now();
              var ps = Math.max(p.start, hourStart.getTime());
              var pe = Math.min(pEnd, hourEnd.getTime());
              if (pe > ps) {
                var pLeft = ((ps - hourStart.getTime()) / 3600000) * 100;
                var pWidth = ((pe - ps) / 3600000) * 100;
                pauseBlocks.push({ left: pLeft, width: Math.max(pWidth, 0.5), color: proj ? proj.color : '#787878' });
              }
            });
          }
        }
      });

      html += '<div class="tt-hour-row">';
      html += '<span class="tt-hour-label">' + pad(h) + ':00</span>';
      html += '<div class="tt-hour-track">';
      blocks.forEach(function (b) {
        html += '<div class="tt-hour-block' + (b.live ? ' tt-hour-block-live' : '') + '" style="left:' + b.left + '%;width:' + b.width + '%;background-color:' + b.color + ';" title="' + esc(b.name) + '"></div>';
      });
      pauseBlocks.forEach(function (b) {
        html += '<div class="tt-hour-block tt-hour-block-pause" style="left:' + b.left + '%;width:' + b.width + '%;background-color:' + b.color + ';" title="Paused"></div>';
      });
      html += '</div></div>';
    }
    html += '</div>';

    // Session list
    if (daySessions.length > 0) {
      html += '<h3 class="tt-sessions-title">Sessions</h3>';
      html += renderSessionList(daySessions);
    }

    $calView.innerHTML = html;
  }

  function buildStatsBanner(dayData, totalMs) {
    var activeDays = 0;
    var bestDayVal = 0;
    var bestDayDate = null;
    var projTotals = {};
    
    dayData.forEach(function(d) {
      if (d.total > 0) {
        activeDays++;
        if (d.total > bestDayVal) {
          bestDayVal = d.total;
          bestDayDate = d.date;
        }
      }
      if (d.byProj) {
        Object.keys(d.byProj).forEach(function(pid) {
          if (!projTotals[pid]) projTotals[pid] = 0;
          projTotals[pid] += d.byProj[pid];
        });
      }
    });

    var topProjId = null;
    var topProjVal = 0;
    Object.keys(projTotals).forEach(function(pid) {
      if (projTotals[pid] > topProjVal) {
        topProjVal = projTotals[pid];
        topProjId = pid;
      }
    });

    var avgDaily = activeDays > 0 ? totalMs / activeDays : 0;
    var topProjName = '-';
    if (topProjId) {
      var p = getProj(topProjId);
      topProjName = displayName(p ? p.name : 'Unknown');
    }
    if (topProjName.length > 15) {
      topProjName = topProjName.substring(0, 15) + '...';
    }

    var bestDayStr = '-';
    if (bestDayDate) {
      bestDayStr = bestDayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    var html = '<div class="tt-stats-banner">';
    
    html += '<div class="tt-stat-item">';
    html += '<div class="tt-stat-val">' + fmtShort(avgDaily) + '</div>';
    html += '<div class="tt-stat-label">Daily average</div>';
    html += '</div>';

    html += '<div class="tt-stat-item tt-stat-top">';
    html += '<div class="tt-stat-val" title="' + esc(topProjName) + '">' + esc(topProjName) + '</div>';
    html += '<div class="tt-stat-label">Top project</div>';
    html += '</div>';

    html += '<div class="tt-stat-item">';
    html += '<div class="tt-stat-val">' + bestDayStr + '</div>';
    html += '<div class="tt-stat-label">Best day (' + fmtShort(bestDayVal) + ')</div>';
    html += '</div>';

    html += '<div class="tt-stat-item">';
    html += '<div class="tt-stat-val">' + activeDays + ' / ' + dayData.length + '</div>';
    html += '<div class="tt-stat-label">Active days</div>';
    html += '</div>';

    if (totalMs > 0) {
      html += '<div class="tt-stats-bar">';
      Object.keys(projTotals).sort(function(a, b) { return projTotals[b] - projTotals[a]; }).forEach(function(pid) {
        var pct = (projTotals[pid] / totalMs) * 100;
        var p = getProj(pid);
        var color = p ? p.color : '#787878';
        var name = p ? esc(displayName(p.name)) : 'Unknown';
        html += '<div style="width: ' + pct + '%; background: ' + color + ';" title="' + name + ': ' + fmtShort(projTotals[pid]) + '"></div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // --- Weekly: 7 day columns ---
  function renderWeekly() {
    var monday = new Date(viewDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday); d.setDate(d.getDate() + i);
      days.push(d);
    }

    var endLabel = days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    var startLabel = days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    $calLabel.textContent = startLabel + ' - ' + endLabel;

    var weekTotal = 0;
    var dayData = days.map(function (d) {
      var key = dk(d);
      var daySess = getSessionsForDay(key);
      var byProj = {};
      var total = 0;
      daySess.forEach(function (s) {
        if (!byProj[s.projectId]) byProj[s.projectId] = 0;
        byProj[s.projectId] += s.duration;
        total += s.duration;
      });
      weekTotal += total;
      return { date: d, key: key, total: total, byProj: byProj };
    });

    var maxDay = Math.max.apply(null, dayData.map(function (d) { return d.total; }));
    if (maxDay === 0) maxDay = 1;

    var viewTotalEl = document.getElementById('view-total');
    if (viewTotalEl) viewTotalEl.textContent = fmtShort(weekTotal);

    var html = '<div class="tt-week-grid">';

    var dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var today = dk(new Date());

    dayData.forEach(function (dd, idx) {
      var isToday = dd.key === today;
      html += '<div class="tt-week-col' + (isToday ? ' tt-week-today' : '') + '" data-goto-day="' + dd.key + '">';
      html += '<div class="tt-week-day">' + dayNames[idx] + '</div>';
      html += '<div class="tt-week-date">' + dd.date.getDate() + '</div>';

      // Stacked bar - proportional to a 10 hour work day
      html += '<div class="tt-week-bar-container">';
      var TEN_HOURS = 36000000;
      var barH = dd.total > 0 ? Math.min(100, Math.max(2, (dd.total / TEN_HOURS) * 100)) : 0;
      var projIds = Object.keys(dd.byProj);
      if (projIds.length > 0) {
        html += '<div class="tt-week-bar" style="height:' + barH + '%">';
        projIds.forEach(function (pid) {
          var proj = getProj(pid);
          var pct = (dd.byProj[pid] / dd.total) * 100;
          html += '<div class="tt-week-bar-seg" style="height:' + pct + '%;background:' + (proj ? proj.color : '#787878') + ';" title="' + (proj ? esc(displayName(proj.name)) : '?') + ': ' + fmtShort(dd.byProj[pid]) + '"></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="tt-week-total">' + (dd.total > 0 ? fmtShort(dd.total) : '-') + '</div>';
      html += '</div>';
    });

    html += '</div>';
    html += buildStatsBanner(dayData, weekTotal);
    $calView.innerHTML = html;
  }

  // --- Monthly: Calendar grid ---
  function renderMonthly() {
    var year = viewDate.getFullYear();
    var month = viewDate.getMonth();
    $calLabel.textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    var first = new Date(year, month, 1);
    var startDay = (first.getDay() + 6) % 7; // Monday = 0
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    // Gather monthly data
    var dayTotals = {};
    var dayProjects = {};
    var monthTotal = 0;
    // Use split sessions to handle cross-day correctly
    sessions.forEach(function (s) {
      var parts = splitSessionByDay(s);
      parts.forEach(function(p) {
        var d = new Date(p.start);
        if (d.getFullYear() === year && d.getMonth() === month) {
          var key = d.getDate();
          if (!dayTotals[key]) { dayTotals[key] = 0; dayProjects[key] = {}; }
          dayTotals[key] += p.duration;
          monthTotal += p.duration;
          dayProjects[key][p.projectId] = (dayProjects[key][p.projectId] || 0) + p.duration;
        }
      });
    });

    var maxDayMs = 0;
    Object.keys(dayTotals).forEach(function (k) { if (dayTotals[k] > maxDayMs) maxDayMs = dayTotals[k]; });
    if (maxDayMs === 0) maxDayMs = 1;

    var today = new Date();
    var todayDate = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : -1;

    var viewTotalEl = document.getElementById('view-total');
    if (viewTotalEl) viewTotalEl.textContent = fmtShort(monthTotal);

    var dayData = [];
    for (var d = 1; d <= daysInMonth; d++) {
      var curDate = new Date(year, month, d);
      dayData.push({
        date: curDate,
        total: dayTotals[d] || 0,
        byProj: dayProjects[d] || {}
      });
    }

    var html = '<div class="tt-month-grid">';

    // Header
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) {
      html += '<div class="tt-month-header">' + d + '</div>';
    });

    // Empty cells before first day
    for (var e = 0; e < startDay; e++) {
      html += '<div class="tt-month-cell tt-month-empty"></div>';
    }

    // Day cells
    for (var day = 1; day <= daysInMonth; day++) {
      var isToday = day === todayDate;
      var total = dayTotals[day] || 0;
      var intensity = total > 0 ? Math.max(0.15, total / maxDayMs) : 0;

      var cellKey = year + '-' + pad(month + 1) + '-' + pad(day);
      html += '<div class="tt-month-cell' + (isToday ? ' tt-month-today' : '') + '" data-goto-day="' + cellKey + '">';
      html += '<span class="tt-month-day-num">' + day + '</span>';

      if (total > 0) {
        html += '<div class="tt-month-dots">';
        var pids = Object.keys(dayProjects[day] || {});
        pids.slice(0, 4).forEach(function (pid) {
          var proj = getProj(pid);
          html += '<span class="tt-month-dot" style="background:' + (proj ? proj.color : '#787878') + '"></span>';
        });
        html += '</div>';
        html += '<span class="tt-month-time">' + fmtShort(total) + '</span>';
      }

      if (total > 0) {
        // Ten-segment meter, relative to the busiest day of the month
        var lit = Math.max(1, Math.round(intensity * 10));
        html += '<span class="tt-month-meter" aria-hidden="true">';
        for (var seg = 0; seg < 10; seg++) html += '<i' + (seg < lit ? ' class="on"' : '') + '></i>';
        html += '</span>';
      }

      html += '</div>';
    }

    html += '</div>';
    html += buildStatsBanner(dayData, monthTotal);
    $calView.innerHTML = html;
  }

  // --- Session List ---
  function renderSessionList(list) {
    var sorted = list.slice().sort(function (a, b) { return b.start - a.start; });
    var html = '<ul class="timer-session-list">';
    sorted.forEach(function (s) {
      var proj = getProj(s.projectId);
      var sub = proj ? getSub(proj, s.subprojectId) : null;
      var color = proj ? proj.color : '#787878';
      var name = proj ? esc(displayName(proj.name)) : 'Deleted';
      if (sub) name += ' / ' + esc(displayName(sub.name));

      // The editor takes over this row, unless it is open in the last-session panel
      if (editingSession && editingSession.id === s.id && !editorInPanel()) {
        html += '<li class="tt-lastsess frame" data-trim-editor>' + editorHtml(editingSession, 'Edit') + '</li>';
        return;
      }

      if (deletingSessionId === s.id) {
        html += '<li class="timer-session-item tt-confirm">';
        html += '<span>Delete this session?</span>';
        html += '<button class="timer-btn-sm btn-danger" data-confirm-del-session="' + s.id + '">Delete</button>';
        html += '<button class="timer-btn-sm" data-cancel-del-session="1">Cancel</button>';
        html += '</li>';
      } else {
        html += '<li class="timer-session-item" data-edit-session="' + s.id + '" title="Edit session">' +
          '<span class="timer-project-dot" style="background:' + color + '"></span>' +
          '<span class="timer-session-name">' + name + '</span>' +
          '<span class="timer-session-time">' + hm(s.start) + ' - ' + hm(s.end) + '</span>' +
          '<span class="timer-session-dur">' + fmtShort(s.duration) + '</span>' +
          '<button class="timer-btn-icon timer-btn-danger" data-del-session="' + s.id + '" title="Delete">' + ICON.close + '</button>' +
          '</li>';
      }
    });
    html += '</ul>';
    return html;
  }

  // Calendar click delegation: session editor, delete sessions, navigate to day
  $calView.addEventListener('click', function (e) {
    if (onTrimAction(e)) return;
    var delBtn = e.target.closest('[data-del-session]');
    if (delBtn) {
      deletingSessionId = delBtn.getAttribute('data-del-session');
      renderCalendar();
      return;
    }
    var cancelDelBtn = e.target.closest('[data-cancel-del-session]');
    if (cancelDelBtn) {
      deletingSessionId = null;
      renderCalendar();
      return;
    }
    var confirmDelBtn = e.target.closest('[data-confirm-del-session]');
    if (confirmDelBtn) {
      var id = confirmDelBtn.getAttribute('data-confirm-del-session');
      sessions = sessions.filter(function (s) { return s.id !== id; });
      save('tt_sessions', sessions);
      deletingSessionId = null;
      renderCalendar();
      return;
    }
    var dayEl = e.target.closest('[data-goto-day]');
    if (dayEl) {
      goToDay(dayEl.getAttribute('data-goto-day'));
      return;
    }
    // Click on a session row to edit it
    var sessItem = e.target.closest('[data-edit-session]');
    if (sessItem) {
      var sessId = sessItem.getAttribute('data-edit-session');
      var sess = sessions.find(function(s) { return s.id === sessId; });
      if (sess) openSessionEditor(sess);
    }
  });

  // --- Session Editor: trim the end of a session ---
  // The session that just stopped opens in the panel under the projects; any other one inline in the list.
  var editingSession = null; // the session being trimmed
  var trimEndMs = null;      // its trimmed end
  var trimDragging = false;

  function hm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // Time worked from the session start to endMs, minus pauses
  function sessionDuration(s, endMs) {
    var pausedMs = 0;
    (s.pauseLog || []).forEach(function(p) {
      var ps = Math.max(p.start, s.start);
      var pe = Math.min(p.end || endMs, endMs);
      if (pe > ps) pausedMs += pe - ps;
    });
    return Math.max(0, endMs - s.start - pausedMs);
  }

  function editorInPanel() { return !!(editingSession && lastSession && editingSession.id === lastSession.id); }

  function trimPct(s) { return Math.max(1, Math.min(100, ((trimEndMs - s.start) / Math.max(1, s.end - s.start)) * 100)); }

  function editorHtml(s, label) {
    var proj = getProj(s.projectId);
    var sub = proj ? getSub(proj, s.subprojectId) : null;
    var color = proj ? proj.color : '#787878';
    var name = proj ? esc(displayName(proj.name)) : 'Unknown';
    if (sub) name += ' / ' + esc(displayName(sub.name));
    var span = Math.max(1, s.end - s.start), pct = trimPct(s);
    var h = '<div class="tt-lastsess-inner">';
    h += '<span class="timer-project-dot" style="background:' + color + '"></span>';
    h += '<span class="tt-lastsess-name">' + label + ': ' + name + '</span>';
    h += '<button class="tt-row-btn" data-trim="close" title="Close">' + ICON.close + '</button>';
    h += '</div>';
    // Solid: kept. Washed out: paused, or cut off after the handle.
    h += '<div class="tt-trim-timeline"><div class="tt-trim-track" title="Drag to trim the end">';
    h += '<div class="tt-trim-track-inner" style="left:0;width:100%;background:' + color + ';"></div>';
    (s.pauseLog || []).forEach(function(p) {
      var ps = Math.max(p.start, s.start), pe = Math.min(p.end || s.end, s.end);
      if (pe > ps) h += '<div class="tt-trim-pause-block" style="left:' + ((ps - s.start) / span) * 100 + '%;width:' + ((pe - ps) / span) * 100 + '%;"></div>';
    });
    h += '<div class="tt-trim-cutoff" style="width:' + (100 - pct) + '%;"></div>';
    h += '<div class="tt-trim-handle" style="left:' + pct + '%;"></div>';
    h += '</div>';
    h += '<div class="tt-trim-labels"><span>' + hm(s.start) + '</span><span class="tt-trim-end-label">' + hm(trimEndMs) + '</span><span>' + hm(s.end) + '</span></div>';
    h += '</div>';
    h += '<div class="tt-lastsess-footer">';
    h += '<span class="tt-lastsess-dur">' + fmtShort(sessionDuration(s, trimEndMs)) + '</span>';
    h += '<span class="tt-cal-nav"><button class="timer-btn-sm" data-trim="reset" title="Back to the original end">Reset</button>';
    h += '<button class="timer-btn-sm" data-trim="save">Save</button></span>';
    h += '</div>';
    return h;
  }

  // Updates the open editor in place (it may have been re-rendered since the drag began)
  function updateTrimUI() {
    var root = document.querySelector('[data-trim-editor]');
    if (!root || !editingSession) return;
    var pct = trimPct(editingSession);
    root.querySelector('.tt-trim-handle').style.left = pct + '%';
    root.querySelector('.tt-trim-cutoff').style.width = (100 - pct) + '%';
    root.querySelector('.tt-trim-end-label').textContent = hm(trimEndMs);
    root.querySelector('.tt-lastsess-dur').textContent = fmtShort(sessionDuration(editingSession, trimEndMs));
  }

  function trimFromPointer(e) {
    var root = document.querySelector('[data-trim-editor]');
    var track = root && root.querySelector('.tt-trim-track');
    if (!track || !editingSession) return;
    var s = editingSession, rect = track.getBoundingClientRect();
    var x = e.touches ? e.touches[0].clientX : e.clientX;
    var pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    trimEndMs = Math.max(s.start + 1000, Math.min(s.end, s.start + Math.round(pct * (s.end - s.start))));
    updateTrimUI();
  }

  // Registered once: press anywhere on the track to move the end there, then drag
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.tt-trim-track')) return;
    e.preventDefault();
    trimDragging = true;
    trimFromPointer(e);
  });
  document.addEventListener('touchstart', function (e) {
    if (!e.target.closest('.tt-trim-track')) return;
    trimDragging = true;
    trimFromPointer(e);
  }, { passive: true });
  document.addEventListener('mousemove', function (e) { if (trimDragging) trimFromPointer(e); });
  document.addEventListener('touchmove', function (e) { if (trimDragging) trimFromPointer(e); }, { passive: true });
  document.addEventListener('mouseup', function () { trimDragging = false; });
  document.addEventListener('touchend', function () { trimDragging = false; });

  function closeEditor() {
    editingSession = null;
    lastSession = null;
    renderLastSession();
    renderCalendar();
  }

  // Close, reset and save buttons of either editor. Returns true when it handled the click.
  function onTrimAction(e) {
    var btn = e.target.closest('[data-trim]');
    if (!btn || !editingSession) return false;
    var action = btn.getAttribute('data-trim');
    if (action === 'reset') {
      trimEndMs = editingSession.end;
      updateTrimUI();
      return true;
    }
    if (action === 'save') {
      var sess = sessions.find(function(s) { return s.id === editingSession.id; });
      if (sess && trimEndMs < sess.end && trimEndMs > sess.start) {
        sess.end = trimEndMs;
        sess.duration = sessionDuration(sess, trimEndMs);
        if (sess.pauseLog) {
          sess.pauseLog = sess.pauseLog.filter(function(p) { return p.start < trimEndMs; });
          sess.pauseLog.forEach(function(p) { if (p.end > trimEndMs) p.end = trimEndMs; });
        }
        save('tt_sessions', sessions);
      }
    }
    closeEditor();
    return true;
  }

  function openSessionEditor(sess) {
    if (lastSession && lastSession.id !== sess.id) lastSession = null; // one editor at a time
    editingSession = sess;
    trimEndMs = sess.end;
    renderLastSession();
    renderCalendar();
    var $editor = document.querySelector('[data-trim-editor]');
    if ($editor) $editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderLastSession() {
    var $ls = document.getElementById('last-session-trim');
    if (!$ls) return;
    // A session that just stopped opens here, ready to trim
    if (lastSession && !editingSession) {
      editingSession = lastSession;
      trimEndMs = lastSession.end;
    }
    var show = editorInPanel();
    $ls.toggleAttribute('data-trim-editor', show);
    $ls.style.display = show ? '' : 'none';
    if (show) $ls.innerHTML = editorHtml(editingSession, 'Last session');
  }

  var $lsContainer = document.getElementById('last-session-trim');
  if ($lsContainer) $lsContainer.addEventListener('click', onTrimAction);

  var $btnShareInsights = document.getElementById('btn-share-insights');
  if ($btnShareInsights) {
    $btnShareInsights.addEventListener('click', generateInsightsImage);
  }

  function loadHtml2Canvas(cb) {
    if (window.html2canvas) { cb(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = cb;
    document.head.appendChild(script);
  }

  function generateInsightsImage() {
    var periodLabel = $calLabel.textContent;
    var totalTime = document.getElementById('view-total') ? document.getElementById('view-total').textContent : '0h 0m';
    var $legend = document.getElementById('insights-legend');
    var withLegend = !$legend || $legend.checked;

    // Rendered off-screen with the page's own styles, then captured
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:800px;padding:40px;background:var(--paper);color:var(--ink);';

    var html = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:32px;padding-bottom:16px;margin-bottom:32px;border-bottom:1px solid var(--rule-strong);">';
    html += '<div style="font-weight:600;">Timer <span style="font-weight:400;color:var(--text-3);">elhoussain.me</span></div>';
    html += '<div style="text-align:right;">' + esc(periodLabel) + ' <span style="color:var(--text-2);">' + totalTime + '</span></div>';
    html += '</div>';
    wrap.innerHTML = html;

    var calView = document.getElementById('calendar-view');
    if (calView) {
      var clone = calView.cloneNode(true);
      if (!withLegend) {
        var top = clone.querySelector('.tt-stat-top .tt-stat-val');
        if (top) top.textContent = '***';
        var statBars = clone.querySelector('.tt-stats-bar');
        if (statBars) statBars.style.display = 'none';
      }
      wrap.appendChild(clone);
    }

    if (withLegend) {
      var targetSessions = [];
      if (currentView === 'weekly') {
        var monday = new Date(viewDate);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        for (var i = 0; i < 7; i++) {
          var d = new Date(monday); d.setDate(d.getDate() + i);
          targetSessions = targetSessions.concat(getSessionsForDay(dk(d)));
        }
      } else {
        var year = viewDate.getFullYear();
        var month = viewDate.getMonth();
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        for (var day = 1; day <= daysInMonth; day++) {
          var cellKey = year + '-' + pad(month + 1) + '-' + pad(day);
          targetSessions = targetSessions.concat(getSessionsForDay(cellKey));
        }
      }

      var byProj = {};
      targetSessions.forEach(function(s) {
        if (!byProj[s.projectId]) byProj[s.projectId] = 0;
        byProj[s.projectId] += s.duration;
      });

      var projArr = Object.keys(byProj).map(function(pid) {
        return { id: pid, dur: byProj[pid] };
      });
      projArr.sort(function(a, b) { return b.dur - a.dur; });

      if (projArr.length > 0) {
        var legHtml = '<div style="display:flex;flex-wrap:wrap;gap:16px 32px;margin-top:32px;padding-top:16px;border-top:1px solid var(--rule-strong);">';
        projArr.forEach(function(pItem) {
          var p = getProj(pItem.id);
          var name = p ? p.name : 'Unknown';
          var color = p ? p.color : '#787878';
          legHtml += '<div style="display:flex;align-items:center;gap:10px;">';
          legHtml += '<span style="width:12px;height:12px;border-radius:50%;background:' + color + ';"></span>';
          legHtml += '<span>' + esc(name) + '</span>';
          legHtml += '<span style="color:var(--text-2);">' + fmtShort(pItem.dur) + '</span>';
          legHtml += '</div>';
        });
        legHtml += '</div>';
        
        var legDiv = document.createElement('div');
        legDiv.innerHTML = legHtml;
        wrap.appendChild(legDiv);
      }
    }

    document.body.appendChild(wrap);

    var originalBtnText = $btnShareInsights.textContent;
    $btnShareInsights.textContent = 'Generating...';
    
    var $modal = document.getElementById('insights-modal');
    var $imgContainer = document.getElementById('insights-img-container');
    if ($imgContainer && $modal.open) {
       $imgContainer.innerHTML = '<p class="empty">Generating image...</p>';
    }

    loadHtml2Canvas(function() {
      setTimeout(function() {
        html2canvas(wrap, {
          backgroundColor: getComputedStyle(document.documentElement).backgroundColor,
          scale: 2,
          logging: false
        }).then(function(canvas) {
          document.body.removeChild(wrap);
          $btnShareInsights.textContent = originalBtnText;
          var imgUrl = canvas.toDataURL("image/png");
          var $btnDl = document.getElementById('insights-download-btn');
          
          if ($modal && $imgContainer && $btnDl) {
            $imgContainer.innerHTML = '<img src="' + imgUrl + '" alt="Timer insights for ' + esc(periodLabel) + '">';
            $btnDl.href = imgUrl;
            var dlName = 'es-timer-' + currentView + '-' + new Date().toISOString().split('T')[0] + '.png';
            $btnDl.setAttribute('download', dlName);
            if (!$modal.open) $modal.showModal();
          }
        });
      }, 50);
    });
  }

  var $legendToggle = document.getElementById('insights-legend');
  if ($legendToggle) {
    $legendToggle.addEventListener('change', function() {
      if (document.getElementById('insights-modal').open) generateInsightsImage();
    });
  }

  var $modalClose = document.getElementById('insights-close');
  if ($modalClose) {
    $modalClose.addEventListener('click', function() {
      document.getElementById('insights-modal').close();
    });
  }

  // --- Data Export & Import ---
  /*
  var $btnExport = document.getElementById('btn-export-data');
  if ($btnExport) {
    $btnExport.addEventListener('click', function() {
      var data = {
        version: 1,
        projects: projects,
        sessions: sessions
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'es-timer-backup-' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  var $btnImport = document.getElementById('btn-import-data');
  if ($btnImport) {
    $btnImport.addEventListener('change', function(e) {
      if (!e.target.files || e.target.files.length === 0) return;
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (data.projects && Array.isArray(data.projects)) {
            projects = data.projects;
            save('tt_projects', projects);
          }
          if (data.sessions && Array.isArray(data.sessions)) {
            sessions = data.sessions;
            save('tt_sessions', sessions);
          }
          alert('Data imported successfully!');
          renderPanel();
          renderCalendar();
          renderLastSession();
        } catch(err) {
          alert('Failed to import data: ' + err.message);
        }
        e.target.value = ''; // Reset input
      };
      reader.readAsText(file);
    });
  }
  */

  // Keyboard shortcuts (D, W, M) come from the data-key hints on the view buttons (main.js)

  // --- Init ---
  if (active) startTick();
  renderPanel();
  renderBanner();
  renderCalendar();
  renderLastSession();
  updateHint();

})();
