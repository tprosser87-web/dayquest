(function () {
  'use strict';
  /* ---------- Storage ---------- */
  var KEY = 'dayquest:v1';
  var state = load();
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.days) return migrate(s); } catch (e) {}
    return migrate({});
  }
  function migrate(s) {
    s.days = s.days || {};
    s.settings = s.settings || { googleIcs: '', outlookIcs: '', proxyUrl: '', dailyGoal: 100 };
    s.badges = s.badges || {};
    s.calCache = s.calCache || {};
    s.tab = s.tab || 'priorities';
    if (s.tab === 'meals') s.tab = 'nutrition';
    s.workoutTemplates = s.workoutTemplates || [];
    s.habitTemplates = s.habitTemplates || [];
    s.supplementTemplates = s.supplementTemplates || [];
    Object.keys(s.days).forEach(function (k) {
      var d = s.days[k] || {};
      if (!d.meals) d.meals = { breakfast: '', lunch: '', dinner: '', snacks: '' };
      d.habits = d.habits || {};
      d.supplements = d.supplements || {};
      s.days[k] = d;
    });
    return s;
  }
  var saveTimer;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { localStorage.setItem(KEY, JSON.stringify(state)); }, 150); }
  function saveNow() { clearTimeout(saveTimer); localStorage.setItem(KEY, JSON.stringify(state)); }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveNow(); });

  /* ---------- Dates ---------- */
  function key(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = fromKey(k); d.setDate(d.getDate() + n); return key(d); }
  function todayKey() { return key(new Date()); }
  function weekStartKey(k) { var d = fromKey(k); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return key(d); } // Monday
  var selected = todayKey();

  function day(k) {
    k = k || selected;
    if (!state.days[k]) state.days[k] = { priorities: [], work: [], home: [], workouts: [], meals: { breakfast: '', lunch: '', dinner: '', snacks: '' }, gratitude: ['', '', ''], notes: '', timebox: {}, habits: {}, supplements: {}, challengeClaimed: false };
    var d = state.days[k];
    if (!d.meals) d.meals = { breakfast: '', lunch: '', dinner: '', snacks: '' };
    d.habits = d.habits || {};
    d.supplements = d.supplements || {};
    return d;
  }
  function peek(k) { return state.days[k] || null; }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Scoring ---------- */
  var PTS = { priority: 30, allPriorities: 20, work: 10, home: 10, workout: 15, meal: 5, gratitude: 5, notes: 5, slot: 2, slotMax: 20, challenge: 25, habit: 10, allHabits: 15, supplement: 5 };
  function scoreOf(d) {
    if (!d) return { score: 0, done: 0, total: 0 };
    var s = 0, done = 0, total = 0;
    d.priorities.forEach(function (i) { total++; if (i.done) { s += PTS.priority; done++; } });
    if (d.priorities.length >= 3 && d.priorities.every(function (i) { return i.done; })) s += PTS.allPriorities;
    d.work.forEach(function (i) { total++; if (i.done) { s += PTS.work; done++; } });
    d.home.forEach(function (i) { total++; if (i.done) { s += PTS.home; done++; } });
    d.workouts.forEach(function (i) { total++; if (i.done) { s += PTS.workout; done++; } });
    (state.habitTemplates || []).forEach(function (h) { total++; if (d.habits && d.habits[h.id]) { s += PTS.habit; done++; } });
    if ((state.habitTemplates || []).length >= 3 && (state.habitTemplates || []).every(function (h) { return d.habits && d.habits[h.id]; })) s += PTS.allHabits;
    (state.supplementTemplates || []).forEach(function (h) { total++; if (d.supplements && d.supplements[h.id]) { s += PTS.supplement; done++; } });
    var meals = ['breakfast', 'lunch', 'dinner', 'snacks'];
    var mealObj = d.meals || {};
    meals.forEach(function (m) { total++; if ((mealObj[m] || '').trim()) { s += PTS.meal; done++; } });
    d.gratitude.forEach(function (g) { total++; if ((g || '').trim()) { s += PTS.gratitude; done++; } });
    if ((d.notes || '').trim()) s += PTS.notes;
    var slots = Object.keys(d.timebox).filter(function (k) { return (d.timebox[k] || '').trim(); }).length;
    s += Math.min(slots * PTS.slot, PTS.slotMax);
    if (d.challengeClaimed) s += PTS.challenge;
    return { score: s, done: done, total: total, slots: slots };
  }
  function totalXP() {
    var xp = 0;
    Object.keys(state.days).forEach(function (k) { xp += scoreOf(state.days[k]).score; });
    xp += Object.keys(state.badges).length * 50;
    return xp;
  }
  function levelFor(xp) { // level n needs 100*n*(n-1)/2 xp ... gentle curve
    var lvl = 1; while (xp >= xpForLevel(lvl + 1)) lvl++;
    return lvl;
  }
  function xpForLevel(n) { return 75 * n * (n - 1); }
  function goal() { return +state.settings.dailyGoal || 100; }
  function hitGoal(k) { return scoreOf(peek(k)).score >= goal(); }
  function dayStreak() {
    var k = todayKey(), n = 0;
    if (!hitGoal(k)) k = addDays(k, -1);
    while (hitGoal(k) && n < 3650) { n++; k = addDays(k, -1); }
    return n;
  }
  function bestStreak() {
    var keys = Object.keys(state.days).sort(), best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      if (hitGoal(k)) { run = (prev && addDays(prev, 1) === k) ? run + 1 : 1; prev = k; best = Math.max(best, run); }
      else { run = 0; prev = null; }
    });
    return best;
  }
  function workoutDay(k) { var d = peek(k); return !!(d && d.workouts.some(function (w) { return w.done; })); }
  function workoutDaysInWeek(ws) { var n = 0; for (var i = 0; i < 7; i++) if (workoutDay(addDays(ws, i))) n++; return n; }
  var WEEK_TARGET = 3;
  function workoutWeekStreak() {
    var ws = weekStartKey(todayKey()), n = 0;
    if (workoutDaysInWeek(ws) < WEEK_TARGET) ws = addDays(ws, -7);
    while (workoutDaysInWeek(ws) >= WEEK_TARGET && n < 520) { n++; ws = addDays(ws, -7); }
    return n;
  }

  /* ---------- Daily challenges ---------- */
  var CHALLENGES = [
    { id: 'prio3', text: 'Complete all 3 top priorities', test: function (d) { return d.priorities.length >= 3 && d.priorities.every(function (i) { return i.done; }); } },
    { id: 'work5', text: 'Check off 5 work tasks', test: function (d) { return d.work.filter(function (i) { return i.done; }).length >= 5; } },
    { id: 'home3', text: 'Knock out 3 home tasks', test: function (d) { return d.home.filter(function (i) { return i.done; }).length >= 3; } },
    { id: 'move', text: 'Log and finish a workout', test: function (d) { return d.workouts.some(function (w) { return w.done; }); } },
    { id: 'grat', text: 'Write all 3 gratitudes', test: function (d) { return d.gratitude.every(function (g) { return (g || '').trim(); }); } },
    { id: 'meals', text: 'Plan all 4 meals', test: function (d) { return ['breakfast', 'lunch', 'dinner', 'snacks'].every(function (m) { return (d.meals[m] || '').trim(); }); } },
    { id: 'box8', text: 'Time box at least 8 slots', test: function (d) { return scoreOf(d).slots >= 8; } },
    { id: 'big', text: 'Score 150 points today', test: function (d) { var c = d.challengeClaimed; d.challengeClaimed = false; var s = scoreOf(d).score; d.challengeClaimed = c; return s >= 150; } },
    { id: 'clear', text: 'Clear your whole work list (3+ items)', test: function (d) { return d.work.length >= 3 && d.work.every(function (i) { return i.done; }); } },
    { id: 'combo', text: 'Finish a priority, a workout and a gratitude', test: function (d) { return d.priorities.some(function (i) { return i.done; }) && d.workouts.some(function (w) { return w.done; }) && d.gratitude.some(function (g) { return (g || '').trim(); }); } },
    { id: 'habits', text: 'Complete all of your atomic habits (2+)', test: function (d) { var t = state.habitTemplates || []; return t.length >= 2 && t.every(function (h) { return d.habits && d.habits[h.id]; }); } },
    { id: 'supps', text: 'Take all of your supplements (2+)', test: function (d) { var t = state.supplementTemplates || []; return t.length >= 2 && t.every(function (h) { return d.supplements && d.supplements[h.id]; }); } },
    { id: 'stack', text: 'Finish a habit, a priority and plan a meal', test: function (d) { var meals = d.meals || {}; var planned = ['breakfast', 'lunch', 'dinner', 'snacks'].some(function (m) { return (meals[m] || '').trim(); }); var habit = (state.habitTemplates || []).some(function (h) { return d.habits && d.habits[h.id]; }); return habit && d.priorities.some(function (i) { return i.done; }) && planned; } }
  ];
  var ORIG_CHALLENGE_COUNT = 10;
  function challengeFor(k) {
    var d = peek(k);
    if (d && d.challengeId) {
      for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === d.challengeId) return CHALLENGES[i];
    }
    var h = 0; for (var j = 0; j < k.length; j++) h = (h * 31 + k.charCodeAt(j)) >>> 0;
    var pool = (d && !d.challengeId) ? ORIG_CHALLENGE_COUNT : CHALLENGES.length;
    var ch = CHALLENGES[h % pool];
    if (d && !d.challengeId) { d.challengeId = ch.id; save(); }
    return ch;
  }

  /* ---------- Badges ---------- */
  var BADGES = [
    { id: 'first', emo: '🌱', name: 'First Step', desc: 'Complete any item', test: function () { return anyDay(function (d) { return scoreOf(d).done > 0; }); } },
    { id: 'prio', emo: '🎯', name: 'Priority Pro', desc: 'All 3 priorities in a day', test: function () { return anyDay(function (d) { return d.priorities.length >= 3 && d.priorities.every(function (i) { return i.done; }); }); } },
    { id: 'century', emo: '💯', name: 'Century', desc: '100+ points in a day', test: function () { return anyDay(function (d) { return scoreOf(d).score >= 100; }); } },
    { id: 'grateful', emo: '💛', name: 'Grateful Heart', desc: '3 gratitudes in a day', test: function () { return anyDay(function (d) { return d.gratitude.every(function (g) { return (g || '').trim(); }); }); } },
    { id: 'chef', emo: '🥗', name: 'Meal Master', desc: 'Plan all 4 meals', test: function () { return anyDay(function (d) { var m = d.meals || {}; return ['breakfast', 'lunch', 'dinner', 'snacks'].every(function (k) { return (m[k] || '').trim(); }); }); } },
    { id: 'timelord', emo: '⏳', name: 'Time Lord', desc: 'Box 10+ slots in a day', test: function () { return anyDay(function (d) { return scoreOf(d).slots >= 10; }); } },
    { id: 'sweat', emo: '💪', name: 'Sweat Starter', desc: 'Finish your first workout', test: function () { return anyDay(function (d) { return d.workouts.some(function (w) { return w.done; }); }); } },
    { id: 'iron', emo: '🏋️', name: 'Iron Week', desc: `${WEEK_TARGET} workout days in a week`, test: function () { return workoutWeekStreak() >= 1 || anyWeekWorkouts(); } },
    { id: 'fire3', emo: '🔥', name: 'On Fire', desc: '3 day goal streak', test: function () { return bestStreak() >= 3; } },
    { id: 'fire7', emo: '🚀', name: 'Week Warrior', desc: '7 day goal streak', test: function () { return bestStreak() >= 7; } },
    { id: 'fire30', emo: '👑', name: 'Unstoppable', desc: '30 day goal streak', test: function () { return bestStreak() >= 30; } },
    { id: 'champ', emo: '🏆', name: 'Challenger', desc: 'Win 5 daily challenges', test: function () { return Object.keys(state.days).filter(function (k) { return state.days[k].challengeClaimed; }).length >= 5; } },
    { id: 'lvl5', emo: '⭐', name: 'Rising Star', desc: 'Reach level 5', test: function () { return levelFor(totalXP()) >= 5; } },
    { id: 'lvl10', emo: '🌟', name: 'Superstar', desc: 'Reach level 10', test: function () { return levelFor(totalXP()) >= 10; } },
    { id: 'sweep', emo: '🧹', name: 'Clean Sweep', desc: 'Clear work and home lists (3+ each)', test: function () { return anyDay(function (d) { return d.work.length >= 3 && d.home.length >= 3 && d.work.concat(d.home).every(function (i) { return i.done; }); }); } },
    { id: 'atom', emo: '⚛️', name: 'First Atom', desc: 'Complete your first atomic habit', test: function () { return anyDay(function (d) { return Object.keys(d.habits || {}).some(function (id) { return d.habits[id]; }); }); } },
    { id: 'chain7', emo: '🔗', name: 'Chain Maker', desc: 'Hold a 7 day habit streak', test: function () { return (state.habitTemplates || []).some(function (h) { return habitBestStreak(h.id) >= 7; }); } },
    { id: 'chain30', emo: '💎', name: 'Identity Shift', desc: 'Hold a 30 day habit streak', test: function () { return (state.habitTemplates || []).some(function (h) { return habitBestStreak(h.id) >= 30; }); } },
    { id: 'stackr', emo: '📚', name: 'Habit Stacker', desc: 'Complete all habits in a day (3+)', test: function () { var t = state.habitTemplates || []; return t.length >= 3 && anyDay(function (d) { return t.every(function (h) { return d.habits && d.habits[h.id]; }); }); } },
    { id: 'vita', emo: '💊', name: 'Daily Dose', desc: 'Take all supplements in a day (2+)', test: function () { var t = state.supplementTemplates || []; return t.length >= 2 && anyDay(function (d) { return t.every(function (h) { return d.supplements && d.supplements[h.id]; }); }); } }
  ];
  function anyDay(fn) { return Object.keys(state.days).some(function (k) { return fn(state.days[k]); }); }
  function anyWeekWorkouts() { var seen = {}; return Object.keys(state.days).some(function (k) { var ws = weekStartKey(k); if (seen[ws]) return false; seen[ws] = 1; return workoutDaysInWeek(ws) >= WEEK_TARGET; }); }

  /* ---------- Celebration ---------- */
  var toastEl = document.getElementById('toast'), toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2600); }
  function floatPts(el, txt) {
    if (!el) return; var r = el.getBoundingClientRect(); var f = document.createElement('div');
    f.className = 'float-pts'; f.textContent = txt; f.style.left = (r.left + r.width / 2 - 14) + 'px'; f.style.top = (r.top - 6) + 'px';
    document.body.appendChild(f); setTimeout(function () { f.remove(); }, 950);
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) {} }
  var cv = document.getElementById('confetti'), ctx = cv.getContext('2d'), parts = [], raf = null;
  function confetti(n) {
    var dpr = window.devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var colors = ['#ffd54f', '#f472b6', '#8b5cf6', '#22d3ee', '#34d399', '#fb923c'];
    for (var i = 0; i < (n || 140); i++) parts.push({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 4, g: .32 + Math.random() * .1, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[i % colors.length], life: 0 });
    if (!raf) tick();
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.y < innerHeight + 30 && p.life < 260; });
    parts.forEach(function (p) { p.life++; p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (parts.length) raf = requestAnimationFrame(tick); else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  var lastLevel = levelFor(totalXP());
  function afterChange(el, pts) {
    save();
    if (el && pts) { floatPts(el, '+' + pts); buzz(); }
    var d = day();
    // challenge
    var ch = challengeFor(selected);
    if (!d.challengeClaimed && ch.test(d)) { d.challengeClaimed = true; save(); setTimeout(function () { toast('Daily challenge complete! +' + PTS.challenge + ' bonus'); confetti(180); }, 250); }
    else if (d.challengeClaimed && !ch.test(d)) { d.challengeClaimed = false; save(); }
    // badges
    BADGES.forEach(function (b) {
      if (!state.badges[b.id] && b.test()) { state.badges[b.id] = todayKey(); save(); setTimeout(function () { toast(b.emo + ' Badge unlocked: ' + b.name + ' (+50 XP)'); confetti(120); }, 900); }
    });
    var lvl = levelFor(totalXP());
    if (lvl > lastLevel) setTimeout(function () { toast('Level up! You reached level ' + lvl); confetti(220); }, 1500);
    lastLevel = lvl;
    renderHeader();
    updateTabCounts();
  }

  /* ---------- Header ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var prevPct = -1;
  function renderHeader() {
    var xp = totalXP(), lvl = levelFor(xp), lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
    $('levelLabel').textContent = 'Level ' + lvl; $('xpLabel').textContent = xp.toLocaleString() + ' XP';
    $('xpFill').style.width = Math.round((xp - lo) / (hi - lo) * 100) + '%';
    $('streakNum').textContent = dayStreak();
    var d = peek(selected), sc = scoreOf(d);
    var pct = sc.total ? Math.round(sc.done / sc.total * 100) : 0;
    var goalPct = Math.min(sc.score / goal(), 1);
    $('dayScore').textContent = sc.score;
    var fg = $('ringFg'); fg.style.strokeDashoffset = (326.7 * (1 - goalPct)).toFixed(1);
    fg.style.stroke = goalPct >= 1 ? '#34d399' : goalPct > .5 ? '#ffd54f' : '#fb923c';
    document.querySelector('.score-goal').innerHTML = '<span>' + sc.score + '/' + goal() + '</span> daily goal &nbsp;•&nbsp; <span>' + pct + '%</span> of items done';
    if (prevPct >= 0 && prevPct < 1 && goalPct >= 1 && selected === todayKey()) { toast('Daily goal smashed! Streak secured 🔥'); confetti(200); }
    prevPct = goalPct;
    var ch = challengeFor(selected), box = $('challengeBox');
    $('challengeText').textContent = ch.text;
    box.classList.toggle('done', !!(d && d.challengeClaimed));
    $('challengeBonus').textContent = d && d.challengeClaimed ? 'done +' + PTS.challenge : '+' + PTS.challenge;
    renderWeekStrip();
    var t = todayKey(), lbl;
    if (selected === t) lbl = 'Today'; else if (selected === addDays(t, -1)) lbl = 'Yesterday'; else if (selected === addDays(t, 1)) lbl = 'Tomorrow';
    else lbl = fromKey(selected).toLocaleDateString(undefined, { weekday: 'long' });
    $('dayTitle').textContent = lbl + ', ' + fromKey(selected).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    $('todayBtn').style.display = selected === t ? 'none' : '';
    $('dateInput').value = selected;
  }
  function renderWeekStrip() {
    var ws = weekStartKey(selected), t = todayKey(), html = '';
    for (var i = 0; i < 7; i++) {
      var k = addDays(ws, i), dd = fromKey(k);
      html += '<button class="wday' + (k === selected ? ' sel' : '') + (k === t ? ' today' : '') + '" data-day="' + k + '">' + dd.toLocaleDateString(undefined, { weekday: 'narrow' }) + '<b>' + dd.getDate() + '</b><span class="pip' + (hitGoal(k) ? ' on' : '') + '"></span></button>';
    }
    $('weekStrip').innerHTML = html;
  }
  $('weekStrip').addEventListener('click', function (e) { var b = e.target.closest('[data-day]'); if (b) selectDay(b.dataset.day); });
  $('prevDay').onclick = function () { selectDay(addDays(selected, -1)); };
  $('nextDay').onclick = function () { selectDay(addDays(selected, 1)); };
  $('todayBtn').onclick = function () { selectDay(todayKey()); };
  $('dateInput').onchange = function (e) { if (e.target.value) selectDay(e.target.value); };
  function selectDay(k) { selected = k; prevPct = -1; renderHeader(); renderView(); }

  /* ---------- Tabs ---------- */
  var TABS = [
    { id: 'priorities', label: '🎯 Top 3' }, { id: 'habits', label: '⚛️ Habits' }, { id: 'work', label: '💼 Work' }, { id: 'home', label: '🏡 Home' },
    { id: 'workout', label: '💪 Workout' }, { id: 'nutrition', label: '🥗 Nutrition' }, { id: 'gratitude', label: '💛 Gratitude' },
    { id: 'notes', label: '📝 Notes' }, { id: 'timebox', label: '⏰ Time Box' }, { id: 'stats', label: '🏆 Stats' }
  ];
  function tabCount(id) {
    var d = peek(selected); if (!d) return '';
    var lists = { priorities: d.priorities, work: d.work, home: d.home, workout: d.workouts };
    if (lists[id] && lists[id].length) return lists[id].filter(function (i) { return i.done; }).length + '/' + lists[id].length;
    if (id === 'gratitude') { var g = d.gratitude.filter(function (x) { return (x || '').trim(); }).length; return g ? g + '/3' : ''; }
    if (id === 'habits') {
      var ht = state.habitTemplates || []; if (!ht.length) return '';
      return ht.filter(function (h) { return d.habits && d.habits[h.id]; }).length + '/' + ht.length;
    }
    if (id === 'nutrition') {
      var st = state.supplementTemplates || []; if (!st.length) return '';
      return st.filter(function (h) { return d.supplements && d.supplements[h.id]; }).length + '/' + st.length;
    }
    return '';
  }
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      var c = tabCount(t.id);
      return '<button class="tab' + (state.tab === t.id ? ' active' : '') + '" role="tab" data-tab="' + t.id + '">' + t.label + (c ? ' <span class="cnt">' + c + '</span>' : '') + '</button>';
    }).join('');
  }
  function updateTabCounts() { renderTabs(); }
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    state.tab = b.dataset.tab; save(); renderTabs(); renderView();
    b = document.querySelector('.tab.active'); if (b && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });

  /* ---------- Views ---------- */
  var view = $('view');
  function renderView() {
    renderTabs();
    var fn = { priorities: vPriorities, habits: vHabits, work: function () { vList('work'); }, home: function () { vList('home'); }, workout: vWorkout, nutrition: vNutrition, meals: vNutrition, gratitude: vGratitude, notes: vNotes, timebox: vTimebox, stats: vStats }[state.tab] || vPriorities;
    view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    fn();
  }

  function itemRow(i, kind, idx) {
    return '<li class="item' + (i.done ? ' done' : '') + '" data-id="' + i.id + '">' +
      (kind === 'priorities' ? '<span class="prio-num">' + (idx + 1) + '</span>' : '') +
      '<button class="check' + (i.done ? ' on' : '') + '" data-act="toggle" aria-label="Toggle done">✓</button>' +
      '<input class="item-text" value="' + esc(i.text) + '" data-act="edit" enterkeyhint="done">' +
      '<button class="del" data-act="del" aria-label="Delete">×</button></li>';
  }
  function bindList(kind, ptsEach) {
    var d = day();
    view.querySelector('.list').addEventListener('click', function (e) {
      var li = e.target.closest('.item'); if (!li) return;
      var arr = d[kind], it = arr.find(function (x) { return x.id === li.dataset.id; }); if (!it) return;
      var act = e.target.dataset.act;
      if (act === 'toggle') {
        it.done = !it.done; li.classList.toggle('done', it.done); e.target.classList.toggle('on', it.done);
        e.target.classList.remove('pop'); void e.target.offsetWidth; if (it.done) e.target.classList.add('pop');
        var bonus = (kind === 'priorities' && it.done && arr.length >= 3 && arr.every(function (x) { return x.done; })) ? PTS.allPriorities : 0;
        afterChange(e.target, it.done ? ptsEach + bonus : 0);
        if (bonus) { toast('All 3 priorities done! +' + bonus + ' bonus'); confetti(160); }
        else if (it.done && arr.every(function (x) { return x.done; }) && arr.length >= 2) { toast('List cleared! Nice work'); confetti(90); }
      } else if (act === 'del') {
        d[kind] = arr.filter(function (x) { return x !== it; }); afterChange(); renderView();
      }
    });
    view.querySelector('.list').addEventListener('input', function (e) {
      var li = e.target.closest('.item'); if (!li) return;
      var it = d[kind].find(function (x) { return x.id === li.dataset.id; }); if (it) { it.text = e.target.value; save(); }
    });
    view.querySelector('.list').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });
    var form = view.querySelector('.add-row');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault(); var inp = form.querySelector('input'); var v = inp.value.trim(); if (!v) return;
      if (kind === 'priorities' && d.priorities.length >= 3) { toast('Keep it to 3. Focus wins!'); return; }
      d[kind].push({ id: uid(), text: v, done: false }); inp.value = ''; afterChange(); renderView();
      var again = view.querySelector('.add-row input'); if (again && !(kind === 'priorities' && d.priorities.length >= 3)) again.focus();
    });
  }
  function vPriorities() {
    var d = day();
    view.innerHTML = '<div class="panel"><h2>Top 3 Priorities</h2><p class="sub">The 3 things that make today a win. <span class="pts">+' + PTS.priority + ' each</span>, plus <span class="pts">+' + PTS.allPriorities + '</span> for all 3.</p>' +
      '<ul class="list">' + d.priorities.map(function (i, n) { return itemRow(i, 'priorities', n); }).join('') + '</ul>' +
      (d.priorities.length ? '' : '<div class="empty">What are your 3 big wins today?</div>') +
      (d.priorities.length < 3 ? '<form class="add-row"><input placeholder="Priority #' + (d.priorities.length + 1) + '" enterkeyhint="done" maxlength="140"><button class="btn">Add</button></form>' : '') +
      '</div>' + carryOverHtml('priorities');
    bindList('priorities', PTS.priority); bindCarry('priorities');
  }
  function vList(kind) {
    var d = day(), title = kind === 'work' ? 'Work To-Do' : 'Home To-Do';
    view.innerHTML = '<div class="panel"><h2>' + title + '</h2><p class="sub">Every check is <span class="pts">+' + PTS[kind] + '</span>. Clear the list for a celebration.</p>' +
      '<ul class="list">' + d[kind].map(function (i) { return itemRow(i, kind); }).join('') + '</ul>' +
      (d[kind].length ? '' : '<div class="empty">Nothing here yet. Add your first task.</div>') +
      '<form class="add-row"><input placeholder="Add a ' + (kind === 'work' ? 'work' : 'home') + ' task" enterkeyhint="done" maxlength="160"><button class="btn">Add</button></form></div>' + carryOverHtml(kind);
    bindList(kind, PTS[kind]); bindCarry(kind);
  }
  function carryOverHtml(kind) {
    var y = peek(addDays(selected, -1)); if (!y) return '';
    var left = y[kind].filter(function (i) { return !i.done; }); if (!left.length) return '';
    return '<div class="panel"><p class="sub" style="margin:0 0 8px">' + left.length + ' unfinished from yesterday</p><button class="btn ghost small" id="carryBtn">Bring them forward</button></div>';
  }
  function bindCarry(kind) {
    var b = $('carryBtn'); if (!b) return;
    b.onclick = function () {
      var y = peek(addDays(selected, -1)), d = day(), have = d[kind].map(function (i) { return i.text; });
      y[kind].filter(function (i) { return !i.done && have.indexOf(i.text) < 0; }).forEach(function (i) {
        if (kind === 'priorities' && d.priorities.length >= 3) return;
        d[kind].push({ id: uid(), text: i.text, done: false });
      });
      afterChange(); renderView(); toast('Carried forward');
    };
  }

  /* Workout */
  function woMeta(w) {
    var p = [];
    if (w.kind === 'cardio') { if (w.duration) p.push(w.duration + ' min'); if (w.distance) p.push(w.distance + ' mi'); }
    else { if (w.sets || w.reps) p.push((w.sets || '?') + ' x ' + (w.reps || '?')); if (w.weight) p.push(w.weight + ' lb'); if (w.duration) p.push(w.duration + ' min'); }
    if (w.note) p.push(w.note);
    return p.join(' • ') || (w.kind === 'cardio' ? 'Cardio' : 'Strength');
  }
  var woKind = 'strength';
  function vWorkout() {
    var d = day(), ws = weekStartKey(selected), wdays = workoutDaysInWeek(ws), streak = workoutWeekStreak();
    var dots = ''; for (var i = 0; i < 7; i++) { var k = addDays(ws, i); dots += '<div><i class="' + (workoutDay(k) ? 'on' : '') + '"></i>' + fromKey(k).toLocaleDateString(undefined, { weekday: 'narrow' }) + '</div>'; }
    var recent = recentExercises();
    view.innerHTML =
      '<div class="panel"><h2>Workout</h2><p class="sub">Plan it, then crush it. <span class="pts">+' + PTS.workout + '</span> per exercise done.</p>' +
      '<div class="stat-row"><div class="stat"><b>' + wdays + '/' + WEEK_TARGET + '</b><span>days this week</span></div><div class="stat"><b>' + streak + '</b><span>week streak</span></div><div class="stat"><b>' + totalWorkouts() + '</b><span>total done</span></div></div>' +
      '<div class="weekdots">' + dots + '</div></div>' +
      '<div class="panel"><h3 style="margin-top:0">Today\'s plan</h3><div id="woList">' +
      (d.workouts.length ? d.workouts.map(function (w) {
        return '<div class="wo-card' + (w.done ? ' done' : '') + '" data-id="' + w.id + '"><button class="check' + (w.done ? ' on' : '') + '" data-act="toggle">✓</button><div class="wo-main"><div class="wo-name">' + esc(w.name) + '</div><div class="wo-meta">' + esc(woMeta(w)) + '</div></div><button class="del" data-act="del">×</button></div>';
      }).join('') : '<div class="empty">No exercises planned yet.</div>') + '</div>' +
      (d.workouts.length && d.workouts.every(function (w) { return w.done; }) ? '<p class="sub" style="text-align:center;color:var(--good)">Workout complete. Beast mode!</p>' : '') +
      '</div>' +
      '<div class="panel"><h3 style="margin-top:0">Add exercise</h3>' +
      '<div class="seg"><button data-k="strength" class="' + (woKind === 'strength' ? 'on' : '') + '">Strength</button><button data-k="cardio" class="' + (woKind === 'cardio' ? 'on' : '') + '">Cardio / Time</button></div>' +
      '<form id="woForm"><input class="field" name="name" placeholder="' + (woKind === 'cardio' ? 'Run, bike, row...' : 'Bench press, squats...') + '" list="woRecent" required maxlength="60" style="margin-bottom:8px">' +
      '<datalist id="woRecent">' + recent.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>' +
      (woKind === 'cardio'
        ? '<div class="grid2"><input class="field" name="duration" inputmode="decimal" placeholder="Minutes"><input class="field" name="distance" inputmode="decimal" placeholder="Miles (optional)"></div>'
        : '<div class="grid3"><input class="field" name="sets" inputmode="numeric" placeholder="Sets"><input class="field" name="reps" inputmode="numeric" placeholder="Reps"><input class="field" name="weight" inputmode="decimal" placeholder="Lbs"></div>') +
      '<input class="field" name="note" placeholder="Note (optional)" maxlength="80" style="margin-top:8px"><div class="row-btns"><button class="btn" type="submit">Add to plan</button>' +
      (lastWorkoutDay() ? '<button class="btn ghost" type="button" id="copyLast">Copy last workout</button>' : '') + '</div></form></div>';
    view.querySelector('.seg').onclick = function (e) { var b = e.target.closest('[data-k]'); if (b) { woKind = b.dataset.k; vWorkout(); } };
    $('woForm').onsubmit = function (e) {
      e.preventDefault(); var f = new FormData(e.target), w = { id: uid(), kind: woKind, done: false };
      ['name', 'sets', 'reps', 'weight', 'duration', 'distance', 'note'].forEach(function (k) { var v = (f.get(k) || '').toString().trim(); if (v) w[k] = v; });
      if (!w.name) return; d.workouts.push(w); afterChange(); vWorkout();
    };
    var cl = $('copyLast'); if (cl) cl.onclick = function () {
      var src = peek(lastWorkoutDay()); src.workouts.forEach(function (w) { var c = Object.assign({}, w, { id: uid(), done: false }); d.workouts.push(c); });
      afterChange(); vWorkout(); toast('Copied your last workout');
    };
    $('woList').onclick = function (e) {
      var card = e.target.closest('.wo-card'); if (!card) return; var w = d.workouts.find(function (x) { return x.id === card.dataset.id; });
      if (e.target.dataset.act === 'toggle') {
        var wasDay = workoutDay(selected); w.done = !w.done; afterChange(e.target, w.done ? PTS.workout : 0);
        if (w.done && d.workouts.every(function (x) { return x.done; })) { toast('Workout complete! 💪'); confetti(150); }
        else if (w.done && !wasDay) toast('Workout day logged: ' + workoutDaysInWeek(weekStartKey(selected)) + '/' + WEEK_TARGET + ' this week');
        vWorkout();
      } else if (e.target.dataset.act === 'del') { d.workouts = d.workouts.filter(function (x) { return x !== w; }); afterChange(); vWorkout(); }
    };
  }
  function recentExercises() { var s = {}; Object.keys(state.days).forEach(function (k) { state.days[k].workouts.forEach(function (w) { s[w.name] = 1; }); }); return Object.keys(s).slice(0, 40); }
  function totalWorkouts() { var n = 0; Object.keys(state.days).forEach(function (k) { if (workoutDay(k)) n++; }); return n; }
  function lastWorkoutDay() { var ks = Object.keys(state.days).filter(function (k) { return k < selected && state.days[k].workouts.length; }).sort(); return ks[ks.length - 1]; }

  /* Meals */
  function habitDoneOn(id, k) { var d = peek(k); return !!(d && d.habits && d.habits[id]); }
  function habitStreak(id, endKey) {
    var k = endKey || selected, n = 0;
    if (!habitDoneOn(id, k)) {
      if (k === todayKey()) k = addDays(k, -1);
      else return 0;
    }
    while (habitDoneOn(id, k) && n < 3650) { n++; k = addDays(k, -1); }
    return n;
  }
  function habitBestStreak(id) {
    var keys = Object.keys(state.days).sort(), best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      if (habitDoneOn(id, k)) { run = (prev && addDays(prev, 1) === k) ? run + 1 : 1; prev = k; best = Math.max(best, run); }
      else { run = 0; prev = null; }
    });
    return best;
  }
  function templateList(kind) {
    var key = kind === 'habit' ? 'habitTemplates' : 'supplementTemplates';
    if (!state[key]) state[key] = [];
    return state[key];
  }
  function dayFlags(d, kind) {
    var field = kind === 'habit' ? 'habits' : 'supplements';
    if (!d[field]) d[field] = {};
    return d[field];
  }
  function habitWeekPips(id) {
    var ws = weekStartKey(selected), html = '<div class="habit-week" aria-hidden="true">';
    for (var i = 0; i < 7; i++) {
      var k = addDays(ws, i);
      html += '<i class="' + (habitDoneOn(id, k) ? 'on' : '') + (k === selected ? ' cur' : '') + '" title="' + k + '"></i>';
    }
    return html + '</div>';
  }

  function bindTemplateList(kind, rerender, ptsEach, allBonus) {
    var d = day(), list = templateList(kind), flags = dayFlags(d, kind);
    var ul = view.querySelector('.tmpl-list[data-kind="' + kind + '"]');
    if (!ul) return;
    ul.addEventListener('click', function (e) {
      var li = e.target.closest('.item'); if (!li) return;
      var it = list.find(function (x) { return x.id === li.dataset.id; }); if (!it) return;
      var act = e.target.dataset.act;
      if (act === 'toggle') {
        flags[it.id] = !flags[it.id];
        li.classList.toggle('done', !!flags[it.id]);
        e.target.classList.toggle('on', !!flags[it.id]);
        e.target.classList.remove('pop'); void e.target.offsetWidth; if (flags[it.id]) e.target.classList.add('pop');
        var allOn = list.length >= 3 && list.every(function (x) { return flags[x.id]; });
        var bonus = (kind === 'habit' && flags[it.id] && allOn) ? (allBonus || 0) : 0;
        afterChange(e.target, flags[it.id] ? ptsEach + bonus : 0);
        if (bonus) { toast('Every habit done! +' + bonus + ' bonus'); confetti(160); }
        else if (flags[it.id] && list.length >= 2 && list.every(function (x) { return flags[x.id]; })) { toast(kind === 'habit' ? 'All habits done. Keep the chain going!' : 'All supplements checked off'); confetti(90); }
        rerender();
      } else if (act === 'del') {
        if (!confirm('Remove "' + it.text + '" from every day? Past checks stay in your history.')) return;
        var key = kind === 'habit' ? 'habitTemplates' : 'supplementTemplates';
        state[key] = list.filter(function (x) { return x !== it; });
        afterChange(); rerender();
      }
    });
    ul.addEventListener('input', function (e) {
      var li = e.target.closest('.item'); if (!li || e.target.dataset.act !== 'edit') return;
      var it = list.find(function (x) { return x.id === li.dataset.id; });
      if (it) { it.text = e.target.value; save(); }
    });
    ul.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
    var form = view.querySelector('.tmpl-add[data-kind="' + kind + '"]');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault(); var inp = form.querySelector('input'); var v = inp.value.trim(); if (!v) return;
      list.push({ id: uid(), text: v }); inp.value = ''; afterChange(); rerender();
      var again = view.querySelector('.tmpl-add[data-kind="' + kind + '"] input'); if (again) again.focus();
    });
  }

  function vHabits() {
    var d = day(), list = templateList('habit'), flags = dayFlags(d, 'habit');
    var doneN = list.filter(function (h) { return flags[h.id]; }).length;
    var curBest = 0, ever = 0;
    list.forEach(function (h) { curBest = Math.max(curBest, habitStreak(h.id)); ever = Math.max(ever, habitBestStreak(h.id)); });
    view.innerHTML = '<div class="panel"><h2>Atomic Habits</h2><p class="sub">Small daily actions that compound. This list stays on every day until you edit it. Checks start fresh each morning. <span class="pts">+' + PTS.habit + ' each</span>' + (list.length >= 3 ? ', plus <span class="pts">+' + PTS.allHabits + '</span> for completing all of them' : '') + '.</p>' +
      (list.length ? '<div class="stat-row"><div class="stat"><b>' + doneN + '/' + list.length + '</b><span>done today</span></div><div class="stat"><b>🔥 ' + curBest + '</b><span>top streak</span></div><div class="stat"><b>' + ever + '</b><span>best ever</span></div></div>' : '') +
      '<ul class="list tmpl-list" data-kind="habit">' + list.map(function (h) {
        var on = !!flags[h.id], st = habitStreak(h.id);
        return '<li class="item item-habit' + (on ? ' done' : '') + '" data-id="' + h.id + '"><button class="check' + (on ? ' on' : '') + '" data-act="toggle" aria-label="Toggle done">✓</button>' +
          '<div class="habit-main"><textarea class="item-text wrap" rows="2" data-act="edit" enterkeyhint="done" maxlength="140">' + esc(h.text) + '</textarea>' + habitWeekPips(h.id) + '</div>' +
          '<span class="streak-mini' + (st ? '' : ' zero') + '" title="Current streak">🔥 ' + st + '</span>' +
          '<button class="del" data-act="del" aria-label="Remove habit">×</button></li>';
      }).join('') + '</ul>' +
      (list.length ? '' : '<div class="empty">Add a small habit to start the chain. For example, read 10 pages of a book.</div>') +
      '<form class="add-row tmpl-add" data-kind="habit"><input placeholder="Add a habit" enterkeyhint="done" maxlength="140"><button class="btn">Add</button></form></div>';
    bindTemplateList('habit', vHabits, PTS.habit, PTS.allHabits);
  }

  function vNutrition() {
    var d = day(), meals = [['breakfast', '🍳 Breakfast'], ['lunch', '🥪 Lunch'], ['dinner', '🍝 Dinner'], ['snacks', '🍎 Snacks']];
    var list = templateList('supplement'), flags = dayFlags(d, 'supplement');
    var doneN = list.filter(function (h) { return flags[h.id]; }).length;
    view.innerHTML = '<div class="panel"><h2>Nutrition</h2><p class="sub">Plan your meals and check off today\'s supplements.</p></div>' +
      '<div class="panel"><h3 style="margin-top:0">Meal planning</h3><p class="sub">Plan ahead, eat better. <span class="pts">+' + PTS.meal + '</span> per meal planned.</p>' +
      meals.map(function (m) { return '<div class="meal"><label>' + m[1] + '</label><textarea class="field" data-meal="' + m[0] + '" rows="2" placeholder="What\'s the plan?">' + esc((d.meals || {})[m[0]]) + '</textarea></div>'; }).join('') +
      '<div class="row-btns"><button class="btn ghost small" id="copyMeals">Copy meals from yesterday</button></div></div>' +
      '<div class="panel"><h3 style="margin-top:0">Supplements</h3><p class="sub">This checklist stays on every day until you edit it. Checks start fresh each morning. <span class="pts">+' + PTS.supplement + '</span> each.</p>' +
      (list.length ? '<p class="sub" style="margin-top:-4px">' + doneN + ' of ' + list.length + ' taken today</p>' : '') +
      '<ul class="list tmpl-list" data-kind="supplement">' + list.map(function (h) {
        var on = !!flags[h.id];
        return '<li class="item' + (on ? ' done' : '') + '" data-id="' + h.id + '"><button class="check' + (on ? ' on' : '') + '" data-act="toggle" aria-label="Toggle done">✓</button>' +
          '<input class="item-text" value="' + esc(h.text) + '" data-act="edit" enterkeyhint="done" maxlength="140">' +
          '<button class="del" data-act="del" aria-label="Remove supplement">×</button></li>';
      }).join('') + '</ul>' +
      (list.length ? '' : '<div class="empty">Add the supplements you take on a normal day.</div>') +
      '<form class="add-row tmpl-add" data-kind="supplement"><input placeholder="Add a supplement" enterkeyhint="done" maxlength="140"><button class="btn">Add</button></form></div>';
    bindTextPoints('[data-meal]', function (el) { return (d.meals || {})[el.dataset.meal]; }, function (el, v) { if (!d.meals) d.meals = { breakfast: '', lunch: '', dinner: '', snacks: '' }; d.meals[el.dataset.meal] = v; }, PTS.meal);
    $('copyMeals').onclick = function () { var y = peek(addDays(selected, -1)); if (!y || !y.meals) { toast('Nothing planned yesterday'); return; } d.meals = Object.assign({}, y.meals); afterChange(); vNutrition(); toast('Meals copied'); };
    bindTemplateList('supplement', vNutrition, PTS.supplement, 0);
  }

  function bindTextPoints(sel, get, set, pts) {
    view.querySelectorAll(sel).forEach(function (el) {
      el.addEventListener('input', function () {
        var was = !!(get(el) || '').trim(); set(el, el.value); var now = !!el.value.trim();
        if (was !== now) afterChange(now ? el : null, now ? pts : 0); else save();
      });
    });
  }

  /* Gratitude */
  var PROMPTS = ['Someone who made today better...', 'A small thing you enjoyed...', 'Something you\'re looking forward to...'];
  function vGratitude() {
    var d = day();
    view.innerHTML = '<div class="panel"><h2>Gratitude</h2><p class="sub">Three good things. <span class="pts">+' + PTS.gratitude + '</span> each.</p>' +
      d.gratitude.map(function (g, i) { return '<div class="grat-row"><span class="grat-num">' + ['🌤️', '🌻', '✨'][i] + '</span><textarea class="field" data-g="' + i + '" rows="2" placeholder="' + PROMPTS[i] + '">' + esc(g) + '</textarea></div>'; }).join('') + '</div>' +
      gratHistory();
    bindTextPoints('[data-g]', function (el) { return d.gratitude[+el.dataset.g]; }, function (el, v) { d.gratitude[+el.dataset.g] = v; }, PTS.gratitude);
  }
  function gratHistory() {
    var ks = Object.keys(state.days).filter(function (k) { return k < selected && state.days[k].gratitude.some(function (g) { return (g || '').trim(); }); }).sort().reverse().slice(0, 5);
    if (!ks.length) return '';
    return '<div class="panel"><h3 style="margin-top:0">Recent gratitude</h3>' + ks.map(function (k) {
      return '<p class="sub" style="margin-bottom:8px"><b style="color:var(--text)">' + fromKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</b>: ' + state.days[k].gratitude.filter(function (g) { return (g || '').trim(); }).map(esc).join(' • ') + '</p>';
    }).join('') + '</div>';
  }

  /* Notes */
  function vNotes() {
    var d = day();
    view.innerHTML = '<div class="panel"><h2>Notes</h2><p class="sub">Ideas, thoughts, anything. Saved automatically. <span class="pts">+' + PTS.notes + '</span> for journaling.</p><textarea class="field notes" id="notes" placeholder="Start typing...">' + esc(d.notes) + '</textarea><div class="small-muted" id="noteCount"></div></div>';
    var el = $('notes'), cnt = $('noteCount');
    var upd = function () { var w = el.value.trim() ? el.value.trim().split(/\s+/).length : 0; cnt.textContent = w + ' words'; };
    upd();
    el.addEventListener('input', function () { var was = !!(d.notes || '').trim(); d.notes = el.value; var now = !!el.value.trim(); upd(); if (was !== now) afterChange(now ? el : null, now ? PTS.notes : 0); else save(); });
  }

  /* Time Box */
  function slotKeys() { var a = []; for (var m = 5 * 60; m < 18 * 60; m += 30) a.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); return a; }
  function fmtTime(hm) { var p = hm.split(':'), h = +p[0], m = p[1]; return ((h + 11) % 12 + 1) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function fmtMs(ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function vTimebox() {
    var d = day(), base = fromKey(selected), cal = eventsForDay(selected);
    var now = new Date(), isToday = selected === todayKey(), nowMin = now.getHours() * 60 + now.getMinutes();
    var allday = cal.events.filter(function (e) { return e.allDay; });
    var timed = cal.events.filter(function (e) { return !e.allDay; });
    var dayStart = base.getTime();
    var early = timed.filter(function (e) { return e.end <= dayStart + 5 * 3600000 || e.start >= dayStart + 18 * 3600000; });
    var configured = hasProxy() && (state.settings.googleIcs || state.settings.outlookIcs);
    var html = '<div class="panel"><h2>Time Box</h2><p class="sub">5:00 AM to 6:00 PM in 30 minute blocks. Tap a slot to plan it. <span class="pts">+' + PTS.slot + '</span> per block (up to ' + PTS.slotMax + ').</p>' +
      '<div class="legend"><span><i style="background:var(--accent)"></i>Your blocks</span><span><i style="background:var(--google)"></i>Google</span><span><i style="background:var(--outlook)"></i>Outlook</span>' +
      (configured ? '<button class="text-btn" id="syncBtn">↻ Sync</button>' : '<button class="text-btn" id="connectBtn">' + (hasProxy() ? 'Connect calendars' : 'Set up calendar sync') + '</button>') + '</div>' +
      '<div class="status-line ' + (cal.error ? 'err' : '') + '" id="calStatus">' + esc(cal.status) + '</div></div>';
    html += '<div class="panel" style="padding-top:8px">';
    if (allday.length) html += '<div class="tb-allday">' + allday.map(evHtml).join('') + '</div>';
    slotKeys().forEach(function (k) {
      var p = k.split(':'), sm = +p[0] * 60 + +p[1], s = dayStart + sm * 60000, e = s + 30 * 60000;
      var evs = timed.filter(function (ev) { return ev.start < e && ev.end > s || (ev.start === ev.end && ev.start >= s && ev.start < e); });
      var v = d.timebox[k] || '';
      html += '<div class="slot' + (p[1] === '00' ? ' hour' : '') + (isToday && nowMin >= sm && nowMin < sm + 30 ? ' now' : '') + '" id="slot-' + k.replace(':', '') + '"><div class="slot-time">' + fmtTime(k) + '</div><div class="slot-body">' +
        evs.map(function (ev) { return evHtml(ev, s); }).join('') +
        '<input class="slot-input' + (v.trim() ? ' filled' : '') + '" data-slot="' + k + '" value="' + esc(v) + '" placeholder="' + (evs.length ? '' : '+') + '" enterkeyhint="done" maxlength="100"></div></div>';
    });
    if (early.length) html += '<h3>Outside 5 AM to 6 PM</h3><div class="tb-allday">' + early.map(evHtml).join('') + '</div>';
    html += '</div>';
    view.innerHTML = html;
    view.querySelectorAll('[data-slot]').forEach(function (el) {
      el.addEventListener('input', function () {
        var was = !!(d.timebox[el.dataset.slot] || '').trim(); d.timebox[el.dataset.slot] = el.value; var nowF = !!el.value.trim();
        el.classList.toggle('filled', nowF);
        if (!nowF) delete d.timebox[el.dataset.slot];
        var under = scoreOf(d).slots <= PTS.slotMax / PTS.slot;
        if (was !== nowF) afterChange(nowF && under ? el : null, nowF && under ? PTS.slot : 0); else save();
      });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.blur(); });
    });
    var sb = $('syncBtn'); if (sb) sb.onclick = function () { syncCalendars(true); };
    var cb = $('connectBtn'); if (cb) cb.onclick = openSettings;
    if (isToday && !renderView._scrolled) { renderView._scrolled = true; var n = view.querySelector('.slot.now'); if (n) setTimeout(function () { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 200); }
  }
  function evHtml(ev, slotStart) {
    var cont = slotStart && ev.start < slotStart;
    var time = ev.allDay ? 'All day' : (cont ? 'cont.' : fmtMs(ev.start) + ' to ' + fmtMs(ev.end));
    return '<div class="ev ' + ev.src + '" title="' + esc(ev.title + (ev.location ? ' @ ' + ev.location : '')) + '">' + esc(ev.title) + '<small>' + time + (ev.location ? ' • ' + esc(ev.location) : '') + '</small></div>';
  }

  /* ---------- Calendar sync ---------- */
  var parsedCache = {}; // url -> events (in-memory)
  var syncing = false, lastSyncMsg = '';
  function configuredProxy() {
    var p = (state.settings.proxyUrl || '').trim();
    if (!p && window.DAYQUEST_CONFIG && DAYQUEST_CONFIG.PROXY_BASE) p = String(DAYQUEST_CONFIG.PROXY_BASE).trim();
    return p.replace(/\/$/, '');
  }
  function hasProxy() { return !!configuredProxy(); }
  function proxyFor(url) {
    var p = configuredProxy();
    if (!p) return '';
    return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(url);
  }
  function normalizeIcsUrl(u) { u = (u || '').trim(); if (/^webcal:\/\//i.test(u)) u = 'https://' + u.slice(9); return u; }
  function fetchIcs(url) {
    url = normalizeIcsUrl(url);
    return fetch(proxyFor(url), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + (t ? ': ' + t.slice(0, 120) : '')); });
      return r.text();
    }).then(function (t) { if (t.indexOf('BEGIN:VCALENDAR') < 0) throw new Error('That link did not return a calendar'); return t; });
  }
  function sources() {
    var s = [];
    if (state.settings.googleIcs) s.push({ src: 'google', url: state.settings.googleIcs, name: 'Google' });
    if (state.settings.outlookIcs) s.push({ src: 'outlook', url: state.settings.outlookIcs, name: 'Outlook' });
    return s;
  }
  function syncCalendars(manual) {
    if (!hasProxy()) { if (manual) toast('Calendar sync coming soon'); return Promise.resolve(); }
    var srcs = sources(); if (!srcs.length || syncing) return Promise.resolve();
    syncing = true; setCalStatus('Syncing calendars...');
    return Promise.all(srcs.map(function (s) {
      return fetchIcs(s.url).then(function (txt) {
        state.calCache[s.src] = { url: s.url, text: txt, at: Date.now() }; delete parsedCache[s.src]; return null;
      }).catch(function (e) { return s.name + ': ' + e.message; });
    })).then(function (errs) {
      syncing = false; errs = errs.filter(Boolean);
      try { saveNow(); } catch (e) { // quota: drop cached text, keep in memory
        srcs.forEach(function (s) { var c = state.calCache[s.src]; if (c) { parsedCache[s.src] = ICS.parse(c.text); } }); }
      lastSyncMsg = errs.join(' | ');
      if (manual) toast(errs.length ? 'Sync issue: ' + errs[0] : 'Calendars synced');
      if (state.tab === 'timebox') vTimebox();
    });
  }
  function setCalStatus(t) { var el = $('calStatus'); if (el) { el.textContent = t; el.className = 'status-line'; } }
  function eventsForDay(k) {
    var srcs = sources();
    if (!hasProxy()) return { events: [], status: 'Calendar sync coming soon. After the Cloudflare Worker is deployed, paste its URL in Settings.' };
    if (!srcs.length) return { events: [], status: 'Connect Google and Outlook in Settings to see your meetings here.' };
    var start = fromKey(k).getTime(), end = fromKey(addDays(k, 1)).getTime(), out = [], times = [];
    srcs.forEach(function (s) {
      var c = state.calCache[s.src]; if (!c || c.url !== s.url) return;
      var evs = parsedCache[s.src] || (parsedCache[s.src] = ICS.parse(c.text));
      ICS.occurrences(evs, start, end).forEach(function (o) { o.src = s.src; out.push(o); });
      times.push(s.name + ' ' + new Date(c.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    });
    out.sort(function (a, b) { return (b.allDay - a.allDay) || a.start - b.start; });
    var status = syncing ? 'Syncing calendars...' : lastSyncMsg ? 'Sync issue: ' + lastSyncMsg : times.length ? out.length + ' event' + (out.length === 1 ? '' : 's') + ' • synced ' + times.join(', ') : 'Not synced yet. Tap Sync.';
    return { events: out, status: status, error: !!lastSyncMsg };
  }

  /* ---------- Stats ---------- */
  function vStats() {
    var xp = totalXP(), lvl = levelFor(xp), lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
    var ws = weekStartKey(selected), bars = '', weekTotal = 0, max = goal();
    var vals = []; for (var i = 0; i < 7; i++) { var k = addDays(ws, i), v = scoreOf(peek(k)).score; vals.push([k, v]); weekTotal += v; max = Math.max(max, v); }
    bars = vals.map(function (kv) { return '<div class="bar' + (kv[0] === selected ? ' cur' : '') + '"><em>' + (kv[1] || '') + '</em><i style="height:' + Math.round(kv[1] / max * 100) + '%"></i><span>' + fromKey(kv[0]).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2) + '</span></div>'; }).join('');
    var wbars = '', wvals = [], wmax = 1;
    for (var w = 7; w >= 0; w--) { var s = addDays(ws, -7 * w), tot = 0; for (var j = 0; j < 7; j++) tot += scoreOf(peek(addDays(s, j))).score; wvals.push([s, tot]); wmax = Math.max(wmax, tot); }
    wbars = wvals.map(function (kv, idx) { return '<div class="bar' + (idx === wvals.length - 1 ? ' cur' : '') + '"><em>' + (kv[1] || '') + '</em><i style="height:' + Math.round(kv[1] / wmax * 100) + '%"></i><span>' + fromKey(kv[0]).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) + '</span></div>'; }).join('');
    var earned = Object.keys(state.badges).length;
    view.innerHTML =
      '<div class="panel" style="text-align:center"><div class="small-muted">YOUR LEVEL</div><div class="lvl-big">' + lvl + '</div><div class="small-muted">' + (hi - xp) + ' XP to level ' + (lvl + 1) + '</div><div class="xpbar"><div class="xpfill" style="width:' + Math.round((xp - lo) / (hi - lo) * 100) + '%"></div></div>' +
      '<div class="stat-row"><div class="stat"><b>🔥 ' + dayStreak() + '</b><span>day streak</span></div><div class="stat"><b>' + bestStreak() + '</b><span>best streak</span></div><div class="stat"><b>' + earned + '/' + BADGES.length + '</b><span>badges</span></div></div>' +
      '<div class="small-muted">Hit ' + goal() + ' points in a day to keep your streak alive.</div></div>' +
      '<div class="panel"><h2>This week</h2><p class="sub">' + weekTotal + ' points so far</p><div class="chart">' + bars + '</div></div>' +
      '<div class="panel"><h2>Weekly score history</h2><p class="sub">Last 8 weeks</p><div class="chart">' + wbars + '</div></div>' +
      '<div class="panel"><h2>Badges</h2><p class="sub">Each badge is worth +50 XP.</p><div class="badges">' + BADGES.map(function (b) {
        var e = state.badges[b.id];
        return '<div class="badge' + (e ? ' earned' : '') + '"><span class="emo">' + b.emo + '</span><b>' + b.name + '</b>' + esc(e ? 'Earned ' + fromKey(e).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : b.desc) + '</div>';
      }).join('') + '</div></div>' +
      '<div class="panel"><h2>How scoring works</h2><p class="sub" style="line-height:1.6">Priority +' + PTS.priority + ' (all 3: +' + PTS.allPriorities + ' bonus) • Atomic habit +' + PTS.habit + ' (all 3+: +' + PTS.allHabits + ' bonus) • Work or home task +10 • Exercise +' + PTS.workout + ' • Meal planned +' + PTS.meal + ' • Supplement +' + PTS.supplement + ' • Gratitude +' + PTS.gratitude + ' • Notes +' + PTS.notes + ' • Time block +' + PTS.slot + ' (max ' + PTS.slotMax + ') • Daily challenge +' + PTS.challenge + '. Every point is XP toward your next level.</p></div>';
  }

  /* ---------- Settings ---------- */
  var sheet = $('sheet');
  function openSheet(html) { $('sheetBody').innerHTML = html; sheet.classList.remove('hidden'); }
  function closeSheet() { sheet.classList.add('hidden'); }
  sheet.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeSheet(); });
  $('settingsBtn').onclick = openSettings;
  function openSettings() {
    var s = state.settings;
    openSheet('<h2>Settings</h2><p class="sub">Your data stays on this iPhone. Calendar links are stored only on this device.</p>' +
      '<label class="form-label">🟢 Google Calendar secret iCal address</label><input class="field" id="gIcs" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" value="' + esc(s.googleIcs) + '">' +
      '<div class="help"><b>How to find it</b> (needs a computer browser):<ol><li>Open calendar.google.com and click the gear, then <b>Settings</b>.</li><li>On the left, under "Settings for my calendars", pick your calendar.</li><li>Scroll to <b>Integrate calendar</b> and copy <b>Secret address in iCal format</b>.</li><li>Paste it here (AirDrop or Notes to your phone works well).</li></ol></div>' +
      '<label class="form-label">🔵 Outlook calendar ICS link</label><input class="field" id="oIcs" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics" value="' + esc(s.outlookIcs) + '">' +
      '<div class="help"><b>How to find it</b>:<ol><li>Open Outlook on the web (outlook.office.com or outlook.live.com) and click the gear.</li><li>Go to <b>Calendar</b>, then <b>Shared calendars</b>.</li><li>Under <b>Publish a calendar</b>, choose your calendar and "Can view all details", then click <b>Publish</b>.</li><li>Copy the <b>ICS</b> link (not the HTML one) and paste it here.</li></ol>If your work account hides "Publish a calendar", your IT admin has turned it off.</div>' +
      '<label class="form-label">Daily goal (points for a streak day)</label><input class="field" id="goalIn" type="number" inputmode="numeric" min="20" max="1000" value="' + esc(s.dailyGoal || 100) + '">' +
      '<label class="form-label">Cloudflare Worker URL (calendar proxy)</label><input class="field" id="proxyIn" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://dayquest-ics.your-account.workers.dev" value="' + esc(s.proxyUrl) + '">' +
      '<div class="help">Calendars do not let the app fetch them directly, so sync goes through a small Cloudflare Worker. Leave this blank until the worker is deployed, then paste the worker URL here (for example https://dayquest-ics.your-account.workers.dev). Calendar sync shows "coming soon" until this is set. You can also set PROXY_BASE in config.js and republish the app.</div>' +
      '<div class="status-line" id="setStatus"></div>' +
      '<div class="row-btns"><button class="btn" id="saveSet">Save and sync</button><button class="btn ghost" id="testSet">Test links</button><button class="btn ghost" data-close>Close</button></div>' +
      '<h3 style="margin-top:22px">Backup</h3><div class="row-btns"><button class="btn ghost small" id="exportBtn">Export data</button><label class="btn ghost small" style="position:relative">Import data<input type="file" id="importIn" accept="application/json" style="position:absolute;inset:0;opacity:0"></label><button class="btn danger small" id="resetBtn">Reset all</button></div>' +
      '<p class="small-muted" style="margin-top:16px">Tip: in Safari tap Share, then <b>Add to Home Screen</b> to install DayQuest like an app.</p>');
    var collect = function () { return { googleIcs: normalizeIcsUrl($('gIcs').value), outlookIcs: normalizeIcsUrl($('oIcs').value), proxyUrl: $('proxyIn').value.trim(), dailyGoal: Math.max(20, Math.min(1000, +$('goalIn').value || 100)) }; };
    $('saveSet').onclick = function () {
      var n = collect(); if (n.googleIcs !== state.settings.googleIcs) delete state.calCache.google; if (n.outlookIcs !== state.settings.outlookIcs) delete state.calCache.outlook;
      Object.assign(state.settings, n); parsedCache = {}; lastSyncMsg = ''; saveNow(); closeSheet(); renderHeader(); renderView(); syncCalendars(true);
    };
    $('testSet').onclick = function () {
      var n = collect(), st = $('setStatus'), old = state.settings.proxyUrl; state.settings.proxyUrl = n.proxyUrl;
      var tests = [['Google', n.googleIcs], ['Outlook', n.outlookIcs]].filter(function (t) { return t[1]; });
      if (!configuredProxy()) { state.settings.proxyUrl = old; st.textContent = 'Calendar sync coming soon. Add a Cloudflare Worker URL first.'; st.className = 'status-line'; return; }
      if (!tests.length) { state.settings.proxyUrl = old; st.textContent = 'Paste at least one link first.'; st.className = 'status-line err'; return; }
      st.textContent = 'Testing...'; st.className = 'status-line';
      Promise.all(tests.map(function (t) { return fetchIcs(t[1]).then(function (txt) { return t[0] + ': OK, ' + ICS.parse(txt).length + ' events found'; }, function (e) { return t[0] + ': ' + e.message; }); }))
        .then(function (r) { state.settings.proxyUrl = old; st.textContent = r.join(' | '); st.className = 'status-line ' + (r.join('').indexOf('OK') >= 0 && r.every(function (x) { return x.indexOf('OK') >= 0; }) ? 'ok' : 'err'); });
    };
    $('exportBtn').onclick = function () {
      var data = JSON.parse(JSON.stringify(state)); delete data.calCache;
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'dayquest-backup-' + todayKey() + '.json'; a.click();
    };
    $('importIn').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var d = JSON.parse(r.result); if (!d.days) throw 0; state = migrate(d); saveNow(); closeSheet(); renderHeader(); renderView(); toast('Backup restored'); } catch (x) { toast('That file is not a DayQuest backup'); } };
      r.readAsText(f);
    };
    $('resetBtn').onclick = function () { if (confirm('Erase all DayQuest data on this device?')) { localStorage.removeItem(KEY); state = migrate({}); closeSheet(); renderHeader(); renderView(); } };
  }

  /* ---------- Boot ---------- */
  // Seed a friendly first day
  if (!Object.keys(state.days).length) {
    var d0 = day(todayKey());
    d0.priorities = [{ id: uid(), text: 'Tap the circle to complete a priority', done: false }];
    save();
  }
  var bootToday = todayKey();
  renderHeader(); renderView();
  if (hasProxy() && sources().length) {
    var stale = sources().some(function (s) { var c = state.calCache[s.src]; return !c || Date.now() - c.at > 15 * 60000; });
    if (stale) syncCalendars(false);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var t = todayKey();
      if (t !== bootToday) { if (selected === bootToday) selected = t; bootToday = t; renderView(); }
      renderHeader(); if (hasProxy() && sources().length) syncCalendars(false);
    }
  });
  setInterval(function () { if (state.tab === 'timebox' && !document.hidden && document.activeElement.tagName !== 'INPUT') vTimebox(); }, 5 * 60000);
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {}); });
})();
