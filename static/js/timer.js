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
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000); var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60);
    return pad(h) + ':' + pad(m);
  }
  function fmtShort(ms) {
    var s = Math.floor(ms / 1000); var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60);
    return h + 'h ' + m + 'm';
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function dk(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function getProj(id) { return projects.find(function (p) { return p.id === id; }); }
  function getSub(proj, sid) { return proj && proj.subs ? proj.subs.find(function (s) { return s.id === sid; }) : null; }

  function todayTotal() {
    var key = dk(new Date()); var t = 0;
    sessions.forEach(function (s) { if (dk(new Date(s.start)) === key) t += s.duration; });
    if (active) {
      var activeDur = active.elapsed + (active.paused ? 0 : Date.now() - active.start);
      if (dk(new Date(active.initialStart)) === key) t += activeDur;
    }
    return t;
  }

  // --- Start / Stop ---
  function startTimer(projId, subId) {
    if (active) stopTimer();
    active = { projectId: projId, subprojectId: subId || null, initialStart: Date.now(), start: Date.now(), elapsed: 0, paused: false };
    save('tt_active', active);
    startTick();
    renderPanel();
    renderBanner();
  }

  function togglePause() {
    if (!active) return;
    if (active.paused) {
      active.start = Date.now();
      active.paused = false;
      startTick();
    } else {
      active.elapsed += Date.now() - active.start;
      active.start = null;
      active.paused = true;
      stopTick();
    }
    save('tt_active', active);
    renderBanner();
    renderPanel();
    tick(); // update immediately
  }

  function stopTimer() {
    if (!active) return;
    var now = Date.now();
    var duration = active.elapsed + (active.paused ? 0 : now - active.start);
    var startTime = active.initialStart || (now - duration);
    sessions.push({ id: uid(), projectId: active.projectId, subprojectId: active.subprojectId, start: startTime, end: now, duration: duration });
    save('tt_sessions', sessions);
    active = null;
    save('tt_active', active);
    stopTick();
    document.title = 'Timer';
    renderPanel();
    renderBanner();
    renderCalendar();
  }

  function startTick() { stopTick(); tick(); tickInterval = setInterval(tick, 1000); }
  function stopTick() { if (tickInterval) { clearInterval(tickInterval); tickInterval = null; } }
  function tick() {
    if (!active) { document.title = 'Timer'; return; }
    var el = active.elapsed + (active.paused ? 0 : Date.now() - active.start);
    var formatted = fmtDur(el);
    $activeClock.textContent = formatted;
    document.title = fmtTime(el) + ' - Timer';
    // Update inline timer on the active row
    var row = document.querySelector('[data-timer-id="' + active.projectId + (active.subprojectId ? ':' + active.subprojectId : '') + '"]');
    if (row) { var t = row.querySelector('.tt-row-clock'); if (t) t.textContent = formatted; }
    $totalToday.textContent = fmtShort(todayTotal()) + ' today';
  }

  // --- Active Banner ---
  function renderBanner() {
    if (!active) { $banner.style.display = 'none'; document.title = 'Timer'; return; }
    var proj = getProj(active.projectId);
    var sub = active.subprojectId ? getSub(proj, active.subprojectId) : null;
    var name = proj ? proj.name : '?';
    if (sub) name += ' / ' + sub.name;
    $activeDot.style.background = proj ? proj.color : '#888';
    $activeName.textContent = name;
    
    if (active.paused) {
      $activePlayPause.innerHTML = '&#9654;'; // Play icon
      $activePlayPause.title = 'Resume';
      $activePlayPause.style.color = 'var(--accent-green)';
      $banner.style.animation = 'none';
      $banner.style.borderColor = 'var(--border-color)';
    } else {
      $activePlayPause.innerHTML = '&#10074;&#10074;'; // Pause icon
      $activePlayPause.title = 'Pause';
      $activePlayPause.style.color = 'var(--accent-yellow)';
      $banner.style.animation = 'tt-pulse 2s ease-in-out infinite';
      $banner.style.borderColor = 'var(--accent-green)';
    }
    
    $banner.style.display = '';
  }

  if ($activePlayPause) $activePlayPause.addEventListener('click', togglePause);
  $activeStop.addEventListener('click', stopTimer);

  // --- Project Panel ---
  function renderPanel() {
    var html = '';
    projects.forEach(function (p) {
      var isActive = active && active.projectId === p.id && !active.subprojectId;
      var expanded = !!expandedProjects[p.id];
      var hasSubs = p.subs && p.subs.length > 0;

      html += '<div class="tt-project" draggable="true" data-drag-proj="' + p.id + '">';
      
      if (deletingId === p.id) {
        html += '<div class="tt-row" style="background: var(--accent-red); color: white; border-bottom: 2px solid var(--border-color);">';
        html += '<span style="flex:1; font-weight: bold; padding-left: 0.5rem;">Are you sure? This action is irreversible.</span>';
        html += '<button class="timer-btn-sm" style="background:white; color:var(--accent-red); margin-right: 0.5rem;" data-confirmdel="' + p.id + '">Yes, Delete</button>';
        html += '<button class="timer-btn-sm" style="background:transparent; color:white; border: 1px solid white;" data-canceldel="1">Cancel</button>';
        html += '</div>';
      } else if (editingId === p.id) {
        html += '<div class="tt-row">';
        html += '<input type="color" id="edit-color-' + p.id + '" class="timer-color" value="' + p.color + '" style="margin-right: 0.5rem; width: 24px; height: 24px; flex-shrink:0;">';
        html += '<input type="text" id="edit-name-' + p.id + '" class="timer-input" value="' + esc(p.name).replace(/"/g, '&quot;') + '" style="flex:1; margin-right: 0.5rem; padding: 0.25rem 0.5rem;">';
        html += '<button class="timer-btn-sm" data-saveedit="' + p.id + '" style="margin-right: 0.25rem;">Save</button>';
        html += '<button class="timer-btn-sm" data-canceledit="1">&times;</button>';
        html += '</div>';
      } else {
        html += '<div class="tt-row' + (isActive ? ' tt-row-active' : '') + '" data-timer-id="' + p.id + '">';
        html += '<span class="timer-project-dot" style="background:' + p.color + '"></span>';
        html += '<span class="tt-row-name">' + esc(p.name) + '</span>';
        var el = active && active.projectId === p.id && !active.subprojectId ? 
          active.elapsed + (active.paused ? 0 : Date.now() - active.start) : 0;
        html += '<span class="tt-row-clock">' + (isActive ? fmtDur(el) : '') + '</span>';

        if (isActive) {
          if (active.paused) {
            html += '<button class="tt-row-btn tt-btn-play" data-play="' + p.id + '" title="Resume">&#9654;</button>';
          } else {
            html += '<button class="tt-row-btn tt-btn-pause" data-pause="1" style="color:var(--accent-yellow)" title="Pause">&#10074;&#10074;</button>';
          }
          html += '<button class="tt-row-btn tt-btn-stop" data-stop="1" title="Stop">&#9632;</button>';
        } else {
          html += '<button class="tt-row-btn tt-btn-play" data-play="' + p.id + '" title="Start">&#9654;</button>';
        }

        if (hasSubs) {
          html += '<button class="tt-row-btn tt-btn-toggle" data-toggle="' + p.id + '" title="Toggle sub-projects">' + (expanded ? '&#9650;' : '&#9660;') + '</button>';
        }

        html += '<button class="tt-row-btn tt-btn-edit" data-edit="' + p.id + '" title="Edit">&#x270E;&#xFE0E;</button>';
        html += '<button class="tt-row-btn tt-btn-gear" data-addsub="' + p.id + '" title="Add sub-project">+</button>';
        html += '<button class="tt-row-btn tt-btn-danger" data-del="' + p.id + '" title="Delete">&times;</button>';
        html += '</div>';
      }

      // Sub-projects
      if (hasSubs || addingSubFor === p.id) {
        html += '<div class="tt-subs' + (expanded ? '' : ' tt-hidden') + '">';
        if (hasSubs) {
          p.subs.forEach(function (s) {
          var subActive = active && active.projectId === p.id && active.subprojectId === s.id;
          html += '<div class="tt-row tt-row-sub' + (subActive ? ' tt-row-active' : '') + '" data-timer-id="' + p.id + ':' + s.id + '" draggable="true" data-drag-sub="' + p.id + ':' + s.id + '">';
          
          if (deletingId === p.id + ':' + s.id) {
            html += '<div class="tt-row" style="background: var(--accent-red); color: white; width: 100%; border: none;">';
            html += '<span style="flex:1; font-weight: bold; padding-left: 1.5rem; font-size: 0.85rem;">Are you sure?</span>';
            html += '<button class="timer-btn-sm" style="background:white; color:var(--accent-red); margin-right: 0.5rem;" data-confirmdelsub="' + p.id + ':' + s.id + '">Delete</button>';
            html += '<button class="timer-btn-sm" style="background:transparent; color:white; border: 1px solid white;" data-canceldel="1">Cancel</button>';
            html += '</div>';
          } else if (editingId === p.id + ':' + s.id) {
            html += '<div class="tt-row" style="width:100%;">';
            html += '<span class="tt-sub-indent"></span>';
            html += '<input type="text" id="edit-subname-' + p.id + '-' + s.id + '" class="timer-input tt-input-sm" value="' + esc(s.name).replace(/"/g, '&quot;') + '" style="flex:1; margin-right: 0.5rem; padding: 0.25rem 0.5rem;">';
            html += '<button class="timer-btn-sm" data-saveeditsub="' + p.id + ':' + s.id + '" style="margin-right: 0.25rem;">Save</button>';
            html += '<button class="timer-btn-sm" data-canceledit="1">&times;</button>';
            html += '</div>';
          } else {
            html += '<span class="tt-sub-indent"></span>';
            html += '<span class="timer-project-dot tt-dot-sm" style="background:' + p.color + '; opacity:0.6"></span>';
            html += '<span class="tt-row-name">' + esc(s.name) + '</span>';
            var elSub = active && active.projectId === p.id && active.subprojectId === s.id ? 
              active.elapsed + (active.paused ? 0 : Date.now() - active.start) : 0;
            html += '<span class="tt-row-clock">' + (subActive ? fmtDur(elSub) : '') + '</span>';

            if (subActive) {
              if (active.paused) {
                html += '<button class="tt-row-btn tt-btn-play" data-playsub="' + p.id + ':' + s.id + '" title="Resume">&#9654;</button>';
              } else {
                html += '<button class="tt-row-btn tt-btn-pause" data-pause="1" style="color:var(--accent-yellow)" title="Pause">&#10074;&#10074;</button>';
              }
              html += '<button class="tt-row-btn tt-btn-stop" data-stop="1" title="Stop">&#9632;</button>';
            } else {
              html += '<button class="tt-row-btn tt-btn-play" data-playsub="' + p.id + ':' + s.id + '" title="Start">&#9654;</button>';
            }
            html += '<button class="tt-row-btn tt-btn-edit" data-editsub="' + p.id + ':' + s.id + '" title="Edit">&#x270E;&#xFE0E;</button>';
            html += '<button class="tt-row-btn tt-btn-danger" data-delsub="' + p.id + ':' + s.id + '" title="Delete">&times;</button>';
          }
          html += '</div>';
        });
        }
        
        if (addingSubFor === p.id) {
          html += '<div class="tt-row tt-row-sub">';
          html += '<span class="tt-sub-indent"></span>';
          html += '<input type="text" id="new-sub-name-' + p.id + '" class="timer-input tt-input-sm" placeholder="+ Add a sub-project..." style="flex:1; margin-right: 0.5rem; padding: 0.35rem 0.5rem; font-size: 0.75rem;">';
          html += '<button class="timer-btn-sm" data-savesub="' + p.id + '" style="padding: 0.35rem 0.75rem;">Add</button>';
          html += '<button class="timer-btn-sm" data-cancelsub="1" style="padding: 0.35rem 0.5rem; margin-left: 0.25rem;" title="Cancel">&times;</button>';
          html += '</div>';
        }
        
        html += '</div>';
      }
      html += '</div>';
    });

    html += '<div class="tt-project tt-add-project-row" style="background: var(--card-bg); padding: 0.5rem; display: flex; gap: 0.5rem; align-items: center; border-top: 2px dashed var(--border-color);">';
    html += '<input type="text" id="new-project-name" class="timer-input" placeholder="+ Add a new project..." style="flex:1; font-size: 0.85rem; padding: 0.4rem 0.5rem;">';
    html += '<input type="color" id="new-project-color" class="timer-color" value="#D92B2B">';
    html += '<button class="timer-btn-sm" id="btn-add-project">Add</button>';
    html += '</div>';

    if (projects.length === 0) {
      html = '<p style="color:var(--text-muted); margin-bottom: 1rem;">No projects yet. Add one below.</p>' + html;
    }
    $panel.innerHTML = html;
  }

  // Panel event delegation
  $panel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-play]');
    if (btn) { 
      var playId = btn.getAttribute('data-play');
      if (active && active.projectId === playId && active.paused && !active.subprojectId) {
        togglePause();
      } else {
        startTimer(playId, null); 
      }
      return; 
    }

    btn = e.target.closest('[data-playsub]');
    if (btn) { 
      var p = btn.getAttribute('data-playsub').split(':'); 
      if (active && active.projectId === p[0] && active.subprojectId === p[1] && active.paused) {
        togglePause();
      } else {
        startTimer(p[0], p[1]); 
      }
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

  function saveNewProject() {
    var $name = document.getElementById('new-project-name');
    var $color = document.getElementById('new-project-color');
    if (!$name || !$color) return;
    var name = $name.value.trim();
    if (!name) return;
    projects.push({ id: uid(), name: name, color: $color.value, subs: [] });
    save('tt_projects', projects);
    renderPanel();
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
    document.querySelectorAll('.timer-view-toggle .filter-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === v);
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
  }

  // --- Daily: Hour timeline (dynamic range) ---
  function renderDaily() {
    var day = dk(viewDate);
    $calLabel.textContent = viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    var daySessions = sessions.filter(function (s) { return dk(new Date(s.start)) === day; });
    var totalMs = 0;
    daySessions.forEach(function (s) { totalMs += s.duration; });

    // Compute dynamic hour range based on actual sessions
    var minH = 8, maxH = 20;
    daySessions.forEach(function (s) {
      var sh = new Date(s.start).getHours();
      var eh = new Date(s.end).getHours();
      if (sh < minH) minH = sh;
      if (eh + 1 > maxH) maxH = eh + 1;
    });
    // Include current hour if timer is active today
    if (active && dk(new Date(active.start)) === day) {
      var ah = new Date(active.start).getHours();
      var nh = new Date().getHours();
      if (ah < minH) minH = ah;
      if (nh + 1 > maxH) maxH = nh + 1;
    }
    if (maxH > 24) maxH = 24;

    var viewTotalEl = document.getElementById('view-total');
    if (viewTotalEl) viewTotalEl.textContent = fmtShort(totalMs);

    var html = '<div class="tt-timeline">';

    for (var h = minH; h < maxH; h++) {
      var hourStart = new Date(viewDate); hourStart.setHours(h, 0, 0, 0);
      var hourEnd = new Date(viewDate); hourEnd.setHours(h + 1, 0, 0, 0);

      var blocks = [];
      daySessions.forEach(function (s) {
        var ss = Math.max(s.start, hourStart.getTime());
        var se = Math.min(s.end, hourEnd.getTime());
        if (se > ss) {
          var left = ((ss - hourStart.getTime()) / 3600000) * 100;
          var width = ((se - ss) / 3600000) * 100;
          var proj = getProj(s.projectId);
          var sub = getSub(proj, s.subprojectId);
          var label = proj ? proj.name : '?';
          if (sub) label += ' / ' + sub.name;
          blocks.push({ left: left, width: Math.max(width, 1), color: proj ? proj.color : '#888', name: label });
        }
      });

      html += '<div class="tt-hour-row">';
      html += '<span class="tt-hour-label">' + pad(h) + ':00</span>';
      html += '<div class="tt-hour-track">';
      blocks.forEach(function (b) {
        html += '<div class="tt-hour-block" style="left:' + b.left + '%;width:' + b.width + '%;background:' + b.color + ';" title="' + esc(b.name) + '"></div>';
      });
      html += '</div></div>';
    }
    html += '</div>';

    // Session list
    if (daySessions.length > 0) {
      html += '<h3 style="margin-top:1.5rem;">Sessions</h3>';
      html += renderSessionList(daySessions);
    }

    $calView.innerHTML = html;
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
      var daySess = sessions.filter(function (s) { return dk(new Date(s.start)) === key; });
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
      html += '<div class="tt-week-col' + (isToday ? ' tt-week-today' : '') + '" data-goto-day="' + dd.key + '" style="cursor:pointer;">';
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
          html += '<div class="tt-week-bar-seg" style="height:' + pct + '%;background:' + (proj ? proj.color : '#888') + ';" title="' + (proj ? esc(proj.name) : '?') + ': ' + fmtShort(dd.byProj[pid]) + '"></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="tt-week-total">' + (dd.total > 0 ? fmtShort(dd.total) : '-') + '</div>';
      html += '</div>';
    });

    html += '</div>';
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
    sessions.forEach(function (s) {
      var d = new Date(s.start);
      if (d.getFullYear() === year && d.getMonth() === month) {
        var key = d.getDate();
        if (!dayTotals[key]) { dayTotals[key] = 0; dayProjects[key] = {}; }
        dayTotals[key] += s.duration;
        monthTotal += s.duration;
        dayProjects[key][s.projectId] = (dayProjects[key][s.projectId] || 0) + s.duration;
      }
    });

    var maxDayMs = 0;
    Object.keys(dayTotals).forEach(function (k) { if (dayTotals[k] > maxDayMs) maxDayMs = dayTotals[k]; });
    if (maxDayMs === 0) maxDayMs = 1;

    var today = new Date();
    var todayDate = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : -1;

    var viewTotalEl = document.getElementById('view-total');
    if (viewTotalEl) viewTotalEl.textContent = fmtShort(monthTotal);

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
      html += '<div class="tt-month-cell' + (isToday ? ' tt-month-today' : '') + '" data-goto-day="' + cellKey + '" style="cursor:pointer;">';
      html += '<span class="tt-month-day-num">' + day + '</span>';

      if (total > 0) {
        html += '<div class="tt-month-dots">';
        var pids = Object.keys(dayProjects[day] || {});
        pids.slice(0, 4).forEach(function (pid) {
          var proj = getProj(pid);
          html += '<span class="tt-month-dot" style="background:' + (proj ? proj.color : '#888') + '"></span>';
        });
        html += '</div>';
        html += '<span class="tt-month-time">' + fmtShort(total) + '</span>';
      }

      if (total > 0) {
        html += '<div class="tt-month-heat" style="opacity:' + (intensity * 0.3) + '"></div>';
      }

      html += '</div>';
    }

    html += '</div>';
    $calView.innerHTML = html;
  }

  // --- Session List ---
  function renderSessionList(list) {
    var sorted = list.slice().sort(function (a, b) { return b.start - a.start; });
    var html = '<ul class="timer-session-list">';
    sorted.forEach(function (s) {
      var proj = getProj(s.projectId);
      var sub = proj ? getSub(proj, s.subprojectId) : null;
      var color = proj ? proj.color : '#888';
      var name = proj ? esc(proj.name) : 'Deleted';
      if (sub) name += ' / ' + esc(sub.name);
      var start = new Date(s.start);
      var end = new Date(s.end);
      html += '<li class="timer-session-item">' +
        '<span class="timer-project-dot" style="background:' + color + '"></span>' +
        '<span class="timer-session-name">' + name + '</span>' +
        '<span class="timer-session-time">' + pad(start.getHours()) + ':' + pad(start.getMinutes()) + ' - ' + pad(end.getHours()) + ':' + pad(end.getMinutes()) + '</span>' +
        '<span class="timer-session-dur">' + fmtShort(s.duration) + '</span>' +
        '<button class="timer-btn-icon timer-btn-danger" data-del-session="' + s.id + '" title="Delete">&times;</button>' +
        '</li>';
    });
    html += '</ul>';
    return html;
  }

  // Calendar click delegation: delete sessions + navigate to day
  $calView.addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-del-session');
    if (id) {
      sessions = sessions.filter(function (s) { return s.id !== id; });
      save('tt_sessions', sessions);
      renderCalendar();
      return;
    }
    var dayEl = e.target.closest('[data-goto-day]');
    if (dayEl) {
      goToDay(dayEl.getAttribute('data-goto-day'));
    }
  });

  // --- Global Keyboard Shortcuts ---
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    var key = e.key.toLowerCase();
    if (key === 'd') {
      setView('daily');
    } else if (key === 'w') {
      setView('weekly');
    } else if (key === 'm') {
      setView('monthly');
    }
  });

  // --- Init ---
  if (active) startTick();
  renderPanel();
  renderBanner();
  renderCalendar();

})();
