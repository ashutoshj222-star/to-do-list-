/* Tasks — a simple offline to-do list with reminders.
 *
 * Everything lives in localStorage on this device. Reminders use:
 *   - native Android/iOS notifications when running as the Capacitor app
 *     (fires even when the app is closed), or
 *   - the web Notification API when running as a PWA in the browser
 *     (fires while the app is open or recently in the background).
 */
(() => {
  'use strict';

  const APP_VERSION = '1.0.0';
  const STORAGE_KEY = 'tasks.v1';
  const SNOOZE_MINUTES = 10;
  const STALE_REMINDER_MS = 6 * 60 * 60 * 1000; // don't pop reminders older than 6h on open
  const MAX_NATIVE_SCHEDULED = 60;
  const DEFAULT_SETTINGS = { defaultTime: '09:00', bannerDismissed: false };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const Cap = window.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const LN = isNative ? Cap.Plugins.LocalNotifications : null;
  const NativeShare = isNative ? Cap.Plugins.Share : null;

  /* ---------------------------------------------------------------- dates */

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const todayKey = () => dayKey();
  const tomorrowKey = () => addDays(todayKey(), 1);

  function dueAt(t) {
    if (!t.date || !t.time) return null;
    const [h, m] = t.time.split(':').map(Number);
    const d = parseKey(t.date);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  // When this task's reminder should fire (or null if it has none).
  function reminderAt(t) {
    if (t.done || !t.remind) return null;
    const due = dueAt(t);
    if (due == null) return null;
    return t.snoozedUntil && t.snoozedUntil > due ? t.snoozedUntil : due;
  }

  function formatTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function formatDay(key) {
    const today = todayKey();
    if (key === today) return 'Today';
    if (key === addDays(today, 1)) return 'Tomorrow';
    if (key === addDays(today, -1)) return 'Yesterday';
    const d = parseKey(key);
    const diff = Math.round((d - parseKey(today)) / 86400000);
    if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function formatWhen(t) {
    if (!t.date) return 'No date';
    return t.time ? `${formatDay(t.date)}, ${formatTime(t.time)}` : formatDay(t.date);
  }

  function nextDate(key, repeat) {
    if (repeat === 'daily') return addDays(key, 1);
    if (repeat === 'weekly') return addDays(key, 7);
    if (repeat === 'weekdays') {
      let k = addDays(key, 1);
      while ([0, 6].includes(parseKey(k).getDay())) k = addDays(k, 1);
      return k;
    }
    return key;
  }

  /* ---------------------------------------------------------------- state */

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.tasks)) {
          return { version: 1, tasks: data.tasks.map(normalize), settings: { ...DEFAULT_SETTINGS, ...data.settings } };
        }
      }
    } catch (e) { console.warn('Could not read saved tasks', e); }
    return { version: 1, tasks: [], settings: { ...DEFAULT_SETTINGS } };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — device storage is full or blocked.');
    }
  }

  function commit() { save(); render(); syncReminders(); }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function normalize(t) {
    const now = Date.now();
    return {
      id: String(t.id || uid()),
      title: String(t.title || '').slice(0, 200),
      notes: String(t.notes || '').slice(0, 2000),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null,
      time: /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : null,
      remind: !!t.remind,
      repeat: ['none', 'daily', 'weekdays', 'weekly'].includes(t.repeat) ? t.repeat : 'none',
      flagged: !!t.flagged,
      done: !!t.done,
      doneAt: t.doneAt || null,
      snoozedUntil: t.snoozedUntil || null,
      notifiedFor: t.notifiedFor || null,
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
    };
  }

  const getTask = (id) => state.tasks.find((t) => t.id === id);

  function addTask(fields) {
    const t = normalize({ ...fields, id: uid(), createdAt: Date.now(), updatedAt: Date.now() });
    if (t.remind && !t.time) t.remind = false;
    state.tasks.push(t);
    commit();
    return t;
  }

  function updateTask(id, fields) {
    const t = getTask(id);
    if (!t) return null;
    const scheduleChanged = ['date', 'time', 'remind'].some((k) => k in fields && fields[k] !== t[k]);
    Object.assign(t, fields, { updatedAt: Date.now() });
    if (scheduleChanged) { t.snoozedUntil = null; t.notifiedFor = null; }
    if (t.remind && !t.time) t.remind = false;
    commit();
    return t;
  }

  function restoreTask(snapshot) {
    const i = state.tasks.findIndex((t) => t.id === snapshot.id);
    if (i >= 0) state.tasks[i] = snapshot; else state.tasks.push(snapshot);
    commit();
  }

  function completeTask(id) {
    const t = getTask(id);
    if (!t || t.done) return;
    const before = { ...t };
    if (t.repeat !== 'none' && t.date) {
      let next = nextDate(t.date, t.repeat);
      while (next < todayKey()) next = nextDate(next, t.repeat);
      Object.assign(t, { date: next, snoozedUntil: null, notifiedFor: null, updatedAt: Date.now() });
      commit();
      toast(`Done. Next: ${formatWhen(t)}`, () => restoreTask(before));
    } else {
      Object.assign(t, { done: true, doneAt: Date.now(), snoozedUntil: null, updatedAt: Date.now() });
      commit();
      toast('Completed', () => restoreTask(before));
    }
  }

  function reopenTask(id) {
    const t = getTask(id);
    if (!t) return;
    Object.assign(t, { done: false, doneAt: null, notifiedFor: null, updatedAt: Date.now() });
    commit();
  }

  function deleteTask(id) {
    const t = getTask(id);
    if (!t) return;
    const snapshot = { ...t };
    state.tasks = state.tasks.filter((x) => x.id !== id);
    commit();
    toast('Task deleted', () => restoreTask(snapshot));
  }

  function snoozeTask(id, minutes = SNOOZE_MINUTES) {
    const t = getTask(id);
    if (!t || t.done) return;
    t.snoozedUntil = Date.now() + minutes * 60000;
    t.notifiedFor = null;
    t.updatedAt = Date.now();
    commit();
    toast(`Snoozed for ${minutes} minutes`);
  }

  /* ---------------------------------------------------------------- views */

  const VIEWS = {
    today: 'Today',
    tomorrow: 'Tomorrow',
    upcoming: 'Upcoming',
    done: 'Completed',
  };
  let view = 'today';
  try { view = sessionStorage.getItem('view') || 'today'; } catch (e) { /* ignore */ }
  if (!VIEWS[view]) view = 'today';

  function byDue(a, b) {
    if ((a.date || '9999') !== (b.date || '9999')) return (a.date || '9999') < (b.date || '9999') ? -1 : 1;
    if ((a.time || '99') !== (b.time || '99')) return (a.time || '99') < (b.time || '99') ? -1 : 1;
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return a.createdAt - b.createdAt;
  }

  function sectionsFor(v) {
    const today = todayKey();
    const tomorrow = tomorrowKey();
    const open = state.tasks.filter((t) => !t.done).sort(byDue);
    if (v === 'today') {
      return [
        { title: 'Overdue', tone: 'overdue', tasks: open.filter((t) => t.date && t.date < today) },
        { title: 'Today', tasks: open.filter((t) => t.date === today) },
      ];
    }
    if (v === 'tomorrow') return [{ title: formatLong(tomorrow), tasks: open.filter((t) => t.date === tomorrow) }];
    if (v === 'upcoming') {
      const later = open.filter((t) => t.date && t.date > tomorrow);
      const groups = new Map();
      for (const t of later) {
        if (!groups.has(t.date)) groups.set(t.date, []);
        groups.get(t.date).push(t);
      }
      const out = [...groups].map(([k, tasks]) => ({ title: formatDay(k), tasks }));
      out.push({ title: 'Someday', tasks: open.filter((t) => !t.date) });
      return out;
    }
    const done = state.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return [{ title: 'Completed', tasks: done, clearable: true }];
  }

  function formatLong(key) {
    return parseKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  const EMPTY = {
    today: ['All clear for today', 'Add something you want to get done, or plan tomorrow while it’s fresh.'],
    tomorrow: ['Plan tomorrow', 'Write down what you need to do tomorrow. Set a time and you’ll get a reminder.'],
    upcoming: ['Nothing coming up', 'Tasks for later dates and tasks without a date show up here.'],
    done: ['Nothing completed yet', 'Tick off a task and it will land here.'],
  };

  const ICONS = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1l4 4-4 4V6H7a2 2 0 0 0-2 2v3H3V8a4 4 0 0 1 4-4h10V1ZM7 23l-4-4 4-4v3h10a2 2 0 0 0 2-2v-3h2v3a4 4 0 0 1-4 4H7v3Z"/></svg>',
    flag: '<svg class="flag-icon" viewBox="0 0 24 24" aria-label="Flagged"><path d="M5 2h2v1h11.5l-2.5 5 2.5 5H7v9H5V2Z"/></svg>',
    snooze: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.4 3.3 3.3-1.4 1.4L11 13.2V6h2v6.4Z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2l1.9 5.1L18 9l-5.1 1.9L11 16l-1.9-5.1L4 9l5.1-1.9L11 2Zm7 11 1 2.6 2.6 1-2.6 1L18 22l-1-2.4-2.6-1 2.6-1L18 13Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-1-6h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z"/></svg>',
  };

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function taskHTML(t) {
    const meta = [];
    const now = Date.now();
    const due = dueAt(t);
    const late = !t.done && ((due != null && due < now) || (t.date && t.date < todayKey()));
    const showDay = !(view === 'today' && t.date === todayKey()) && !(view === 'tomorrow');
    let when = '';
    if (t.date && showDay) when = formatDay(t.date);
    if (t.time) when = when ? `${when}, ${formatTime(t.time)}` : formatTime(t.time);
    if (t.done && t.doneAt) when = `Done ${formatDay(dayKey(new Date(t.doneAt)))}`;
    if (when) meta.push(`<span class="meta-item${late ? ' late' : ''}">${esc(when)}</span>`);
    if (!t.done && t.remind && t.time) {
      const snoozed = t.snoozedUntil && t.snoozedUntil > now;
      meta.push(snoozed
        ? `<span class="meta-item">${ICONS.snooze}${esc(new Date(t.snoozedUntil).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}</span>`
        : `<span class="meta-item" aria-label="Reminder on">${ICONS.bell}</span>`);
    }
    if (t.repeat !== 'none') meta.push(`<span class="meta-item" aria-label="Repeats">${ICONS.repeat}</span>`);
    const cls = ['task', t.done && 'is-done', t.flagged && 'flagged'].filter(Boolean).join(' ');
    return `<div class="${cls}" data-id="${esc(t.id)}" role="button" tabindex="0">
      <button type="button" class="check" aria-label="${t.done ? 'Mark as not done' : 'Complete'}: ${esc(t.title)}">${ICONS.check}</button>
      <div class="task-body">
        <div class="task-title">${esc(t.title)}</div>
        ${t.notes ? `<div class="task-notes">${esc(t.notes)}</div>` : ''}
        ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
      </div>
      ${t.flagged && !t.done ? ICONS.flag : ''}
    </div>`;
  }

  function render() {
    $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#view-title').textContent = VIEWS[view];
    for (const b of $$('.segmented button')) b.setAttribute('aria-selected', String(b.dataset.view === view));

    const sections = sectionsFor(view).filter((s) => s.tasks.length);
    let html = '';
    if (!sections.length) {
      const [h, p] = EMPTY[view];
      html = `<div class="empty"><div class="empty-icon">${view === 'done' ? ICONS.check.replace('#fff', 'currentColor') : ICONS.sun}</div><h2>${h}</h2><p>${p}</p></div>`;
    } else {
      const single = sections.length === 1 && view !== 'upcoming';
      for (const s of sections) {
        html += `<section class="section">`;
        if (!single || s.clearable || view === 'tomorrow') {
          html += `<div class="section-head"><h2 class="section-title${s.tone ? ' ' + s.tone : ''}">${esc(s.title)}</h2>`;
          html += s.clearable
            ? `<button type="button" class="link" data-action="clear-done">Clear</button>`
            : `<span class="section-count">${s.tasks.length}</span>`;
          html += `</div>`;
        }
        html += `<div class="card">${s.tasks.map(taskHTML).join('')}</div></section>`;
      }
      if (view === 'today' || view === 'tomorrow') {
        html += `<div class="list-footer"><button type="button" class="pill-btn" data-action="ai-plan">${ICONS.sparkle}Plan ${view} with AI</button></div>`;
      }
    }
    $('#list').innerHTML = html;
    updateBanner();
  }

  function setView(v) {
    view = v;
    try { sessionStorage.setItem('view', v); } catch (e) { /* ignore */ }
    render();
    window.scrollTo({ top: 0 });
  }

  /* ---------------------------------------------------------------- toast */

  let toastTimer = null;
  let toastUndo = null;
  function toast(text, undo) {
    const el = $('#toast');
    $('#toast-text').textContent = text;
    toastUndo = undo || null;
    $('#toast-action').hidden = !undo;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; toastUndo = null; }, undo ? 5000 : 2800);
  }

  /* ---------------------------------------------------------------- sheets */

  let openSheetEl = null;
  let lastFocus = null;

  function openSheet(el) {
    if (openSheetEl) closeSheet(true);
    lastFocus = document.activeElement;
    openSheetEl = el;
    $('#backdrop').hidden = false;
    el.hidden = false;
    document.body.classList.add('locked');
  }

  function closeSheet(immediate) {
    const el = openSheetEl;
    if (!el) return;
    openSheetEl = null;
    const bd = $('#backdrop');
    const finish = () => {
      el.hidden = true; bd.hidden = true;
      el.classList.remove('closing'); bd.classList.remove('closing');
      document.body.classList.remove('locked');
    };
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    el.classList.add('closing'); bd.classList.add('closing');
    setTimeout(finish, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- editor */

  const form = $('#editor');
  const f = {
    title: $('#f-title'), notes: $('#f-notes'), date: $('#f-date'), time: $('#f-time'),
    remind: $('#f-remind'), repeat: $('#f-repeat'), flag: $('#f-flag'),
  };
  let editingId = null;

  function openEditor(id) {
    const t = id ? getTask(id) : null;
    editingId = t ? t.id : null;
    $('#editor-title').textContent = t ? 'Edit Task' : 'New Task';
    $('#save-btn').textContent = t ? 'Save' : 'Add';
    $('#editor-extra').hidden = !t;
    const defaultDate = view === 'tomorrow' ? tomorrowKey() : view === 'upcoming' ? '' : todayKey();
    f.title.value = t ? t.title : '';
    f.notes.value = t ? t.notes : '';
    f.date.value = t ? (t.date || '') : defaultDate;
    f.time.value = t ? (t.time || '') : '';
    f.remind.checked = t ? t.remind : false;
    f.repeat.value = t ? t.repeat : 'none';
    f.flag.checked = t ? t.flagged : false;
    remindTouched = !!t;
    syncEditor();
    openSheet(form);
    if (!t) setTimeout(() => f.title.focus(), 60);
  }

  let remindTouched = false;

  function syncEditor() {
    $('#save-btn').disabled = !f.title.value.trim();
    const dateVal = f.date.value;
    const quick = !dateVal ? 'none' : dateVal === todayKey() ? 'today' : dateVal === tomorrowKey() ? 'tomorrow' : dateVal === addDays(todayKey(), 7) ? 'week' : '';
    for (const c of $$('.chip', form)) c.setAttribute('aria-pressed', String(c.dataset.quick === quick));
    const hint = $('#remind-hint');
    if (f.remind.checked && f.date.value && f.time.value) {
      const at = new Date(`${f.date.value}T${f.time.value}`);
      hint.hidden = false;
      hint.textContent = at.getTime() < Date.now()
        ? 'This time has already passed — pick a later time to get a reminder.'
        : `You’ll be reminded ${formatWhen({ date: f.date.value, time: f.time.value })}.`;
    } else {
      hint.hidden = true;
    }
  }

  form.addEventListener('input', (e) => {
    if (e.target === f.time && f.time.value && !remindTouched) f.remind.checked = true;
    if (e.target === f.time && f.time.value && !f.date.value) f.date.value = todayKey();
    if (e.target === f.time && !f.time.value) f.remind.checked = false;
    syncEditor();
  });

  f.remind.addEventListener('change', () => {
    remindTouched = true;
    if (f.remind.checked) {
      if (!f.date.value) f.date.value = todayKey();
      if (!f.time.value) f.time.value = state.settings.defaultTime;
      requestNotificationPermission();
    }
    syncEditor();
  });

  f.date.addEventListener('change', () => {
    if (!f.date.value) { f.time.value = ''; f.remind.checked = false; f.repeat.value = 'none'; }
    syncEditor();
  });

  f.repeat.addEventListener('change', () => {
    if (f.repeat.value !== 'none' && !f.date.value) f.date.value = todayKey();
    syncEditor();
  });

  for (const chip of $$('.chip', form)) {
    chip.addEventListener('click', () => {
      const q = chip.dataset.quick;
      f.date.value = q === 'today' ? todayKey() : q === 'tomorrow' ? tomorrowKey() : q === 'week' ? addDays(todayKey(), 7) : '';
      f.date.dispatchEvent(new Event('change'));
    });
  }

  f.title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (f.title.value.trim()) form.requestSubmit(); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = f.title.value.trim();
    if (!title) return;
    const fields = {
      title,
      notes: f.notes.value.trim(),
      date: f.date.value || null,
      time: f.date.value && f.time.value ? f.time.value : null,
      remind: f.remind.checked && !!f.date.value && !!f.time.value,
      repeat: f.date.value ? f.repeat.value : 'none',
      flagged: f.flag.checked,
    };
    if (fields.remind) requestNotificationPermission();
    if (editingId) {
      updateTask(editingId, fields);
    } else {
      const t = addTask(fields);
      const target = !t.date ? 'upcoming' : t.date === todayKey() || t.date < todayKey() ? 'today' : t.date === tomorrowKey() ? 'tomorrow' : 'upcoming';
      if (target !== view) { setView(target); toast(`Added to ${VIEWS[target]}`); }
    }
    closeSheet();
  });

  $('#delete-btn').addEventListener('click', () => {
    const id = editingId;
    closeSheet();
    deleteTask(id);
  });

  $('#ask-ai').addEventListener('click', () => {
    const t = getTask(editingId);
    if (t) shareWithAI(taskPrompt(t));
  });

  /* ---------------------------------------------------------------- AI */

  function taskPrompt(t) {
    return [
      `I need to get this done: "${t.title}"`,
      t.notes ? `Details: ${t.notes}` : '',
      t.date ? `Deadline: ${formatWhen(t)}` : '',
      '',
      'Please help me finish it. Break it into small, practical steps in order, estimate how long each step takes, tell me what I should prepare in advance, and point out anything that could go wrong.',
    ].filter((l, i, a) => l || a[i - 1]).join('\n');
  }

  function planPrompt(dayLabel, tasks) {
    const lines = tasks.map((t, i) => {
      const bits = [t.time ? formatTime(t.time) : 'any time', t.flagged ? 'important' : ''].filter(Boolean).join(', ');
      return `${i + 1}. ${t.title} (${bits})${t.notes ? ` — ${t.notes}` : ''}`;
    });
    return [
      `Here is my to-do list for ${dayLabel}:`,
      ...lines,
      '',
      'Please help me plan the day: suggest a realistic order and schedule, break the bigger tasks into concrete steps, and give me practical tips to actually finish each one.',
    ].join('\n');
  }

  function planDay(which) {
    const key = which === 'tomorrow' ? tomorrowKey() : todayKey();
    const tasks = state.tasks.filter((t) => !t.done && (t.date === key || (which === 'today' && t.date && t.date < key))).sort(byDue);
    if (!tasks.length) { toast(`No tasks for ${which} yet`); return; }
    shareWithAI(planPrompt(`${which} (${formatLong(key)})`, tasks));
  }

  async function shareWithAI(text) {
    try {
      if (NativeShare) { await NativeShare.share({ title: 'Ask AI', text, dialogTitle: 'Open in ChatGPT, Claude…' }); return; }
      if (navigator.share) { await navigator.share({ title: 'Ask AI', text }); return; }
    } catch (e) {
      if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return;
    }
    if (await copyText(text)) toast('Copied — paste it into ChatGPT, Claude or any AI app');
    else toast('Could not copy on this device');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------------------------------------------------------------- notifications */

  async function notificationStatus() {
    if (isNative) {
      try { return (await LN.checkPermissions()).display; } catch (e) { return 'unsupported'; }
    }
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // granted | denied | default
  }

  async function requestNotificationPermission() {
    let result;
    if (isNative) {
      try { result = (await LN.requestPermissions()).display; } catch (e) { result = 'unsupported'; }
    } else if ('Notification' in window) {
      if (Notification.permission !== 'default') result = Notification.permission;
      else result = await Notification.requestPermission();
    } else {
      result = 'unsupported';
    }
    if (result === 'denied') toast('Notifications are blocked — allow them in your phone settings');
    updateBanner();
    refreshSettings();
    syncReminders();
    return result;
  }

  async function updateBanner() {
    const hasReminders = state.tasks.some((t) => reminderAt(t) != null);
    const status = await notificationStatus();
    $('#notif-banner').hidden = !(hasReminders && status !== 'granted' && status !== 'denied' && status !== 'unsupported');
  }

  async function swRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 1500))]);
    } catch (e) { return null; }
  }

  async function showWebNotification(title, body, taskId) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const options = {
      body,
      tag: taskId ? `task-${taskId}` : 'tasks',
      renotify: true,
      requireInteraction: !!taskId,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { taskId },
      vibrate: [120, 60, 120],
    };
    const reg = await swRegistration();
    if (reg && reg.showNotification) {
      if (taskId) options.actions = [{ action: 'done', title: 'Mark done' }, { action: 'snooze', title: `Snooze ${SNOOZE_MINUTES} min` }];
      await reg.showNotification(title, options);
      return true;
    }
    try { new Notification(title, options); return true; } catch (e) { return false; }
  }

  function reminderBody(t) {
    const when = t.time ? formatTime(t.time) : '';
    return t.notes ? `${when ? when + ' · ' : ''}${t.notes}` : (when ? `Due ${when}` : 'Reminder');
  }

  // Web: check for reminders that are due now. Runs every few seconds while the app is open.
  async function checkDueReminders() {
    if (isNative) return;
    const now = Date.now();
    const due = state.tasks.filter((t) => { const at = reminderAt(t); return at != null && at <= now && t.notifiedFor !== at; });
    if (!due.length) return;
    const fresh = due.filter((t) => now - reminderAt(t) < STALE_REMINDER_MS);
    for (const t of due) t.notifiedFor = reminderAt(t);
    save();
    render();
    if (!fresh.length) return;
    let shown = false;
    if (fresh.length > 3) {
      shown = await showWebNotification(`${fresh.length} tasks need your attention`, fresh.map((t) => t.title).join(' · '));
    } else {
      for (const t of fresh) shown = (await showWebNotification(t.title, reminderBody(t), t.id)) || shown;
    }
    if (!shown || document.visibilityState === 'visible') toast(`⏰ ${fresh.length === 1 ? fresh[0].title : `${fresh.length} tasks are due`}`);
  }

  // Native: keep the OS notification schedule in sync with our tasks.
  const nativeId = (id) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2147483646) + 1;
  };

  let syncTimer = null;
  let syncChain = Promise.resolve();
  function syncReminders() {
    if (!isNative) { setTimeout(checkDueReminders, 0); return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncChain = syncChain.then(syncNative).catch((e) => console.warn('Reminder sync failed', e)); }, 250);
  }

  async function syncNative() {
    const status = await notificationStatus();
    if (status !== 'granted') return;
    const pending = await LN.getPending();
    if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const now = Date.now();
    const upcoming = state.tasks
      .map((t) => ({ t, at: reminderAt(t) }))
      .filter((x) => x.at != null && x.at > now)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_NATIVE_SCHEDULED);
    if (!upcoming.length) return;
    await LN.schedule({
      notifications: upcoming.map(({ t, at }) => ({
        id: nativeId(t.id),
        title: t.title,
        body: reminderBody(t),
        schedule: { at: new Date(at), allowWhileIdle: true },
        channelId: 'reminders',
        actionTypeId: 'TASK_REMINDER',
        extra: { taskId: t.id },
      })),
    });
  }

  async function setupNative() {
    try {
      await LN.createChannel({ id: 'reminders', name: 'Reminders', description: 'Task reminders', importance: 5, visibility: 1, vibration: true });
    } catch (e) { /* iOS has no channels */ }
    try {
      await LN.registerActionTypes({
        types: [{ id: 'TASK_REMINDER', actions: [{ id: 'done', title: 'Mark done' }, { id: 'snooze', title: `Snooze ${SNOOZE_MINUTES} min` }] }],
      });
    } catch (e) { console.warn(e); }
    LN.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
      handleNotificationAction(actionId, notification && notification.extra && notification.extra.taskId);
    });
    const app = Cap.Plugins.App;
    if (app) {
      app.addListener('resume', () => { render(); syncReminders(); });
      app.addListener('backButton', () => { if (openSheetEl) closeSheet(); else app.minimizeApp(); });
    }
  }

  function handleNotificationAction(action, taskId) {
    if (!taskId || !getTask(taskId)) return;
    if (action === 'done') completeTask(taskId);
    else if (action === 'snooze') snoozeTask(taskId);
    else {
      const t = getTask(taskId);
      if (!t.done) setView(t.date && t.date <= todayKey() ? 'today' : t.date === tomorrowKey() ? 'tomorrow' : 'upcoming');
      openEditor(taskId);
    }
  }

  /* ---------------------------------------------------------------- settings */

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; $('#install-group').hidden = false; });
  window.addEventListener('appinstalled', () => { installPrompt = null; $('#install-group').hidden = true; });

  async function refreshSettings() {
    const status = await notificationStatus();
    const label = { granted: 'On', denied: 'Blocked', default: 'Off', prompt: 'Off', 'prompt-with-rationale': 'Off', unsupported: 'Not supported' }[status] || status;
    $('#notif-status').textContent = label;
    $('#notif-enable').hidden = ['granted', 'denied', 'unsupported'].includes(status);
    $('#notif-test').hidden = status !== 'granted';
    $('#s-default-time').value = state.settings.defaultTime;
    let hint;
    if (status === 'denied') hint = 'Notifications are blocked. Allow them for this app in your phone or browser settings.';
    else if (isNative) hint = 'Reminders arrive even when the app is closed.';
    else if (status === 'unsupported') hint = 'This browser can’t show notifications. Install the Android app for reminders.';
    else hint = 'In the browser, reminders arrive while the app is open or recently used. For reminders when it’s fully closed, install the Android app (see README).';
    $('#notif-hint').textContent = hint;
    $('#version-label').textContent = `Tasks ${APP_VERSION}${isNative ? ' · app' : ''}`;
  }

  $('#settings-btn').addEventListener('click', () => { refreshSettings(); openSheet($('#settings')); });
  $('#notif-enable').addEventListener('click', requestNotificationPermission);
  $('#banner-enable').addEventListener('click', requestNotificationPermission);
  $('#notif-test').addEventListener('click', async () => {
    if (isNative) {
      await LN.schedule({ notifications: [{ id: 2147483647, title: 'Tasks', body: 'Notifications are working 👍', schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true }, channelId: 'reminders' }] });
      toast('Test notification on its way');
    } else {
      const ok = await showWebNotification('Tasks', 'Notifications are working 👍');
      toast(ok ? 'Test notification sent' : 'Could not show a notification');
    }
  });
  $('#s-default-time').addEventListener('change', (e) => {
    if (e.target.value) { state.settings.defaultTime = e.target.value; save(); }
  });
  $('#ai-plan-tomorrow').addEventListener('click', () => planDay('tomorrow'));
  $('#ai-plan-today').addEventListener('click', () => planDay('today'));
  $('#install-btn').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#install-group').hidden = true;
  });

  function exportData() {
    return { app: 'tasks', version: 1, exportedAt: new Date().toISOString(), tasks: state.tasks, settings: state.settings };
  }

  function importData(data) {
    if (!data || !Array.isArray(data.tasks)) throw new Error('This file is not a Tasks backup.');
    const incoming = data.tasks.map(normalize);
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    for (const t of incoming) {
      const existing = byId.get(t.id);
      if (!existing || (t.updatedAt || 0) >= (existing.updatedAt || 0)) byId.set(t.id, t);
    }
    state.tasks = [...byId.values()];
    if (data.settings) state.settings = { ...state.settings, ...data.settings };
    commit();
    return incoming.length;
  }

  $('#export-btn').addEventListener('click', async () => {
    const json = JSON.stringify(exportData(), null, 2);
    const name = `tasks-backup-${todayKey()}.json`;
    if (isNative && NativeShare) {
      try { await NativeShare.share({ title: name, text: json, dialogTitle: 'Save backup' }); } catch (e) { /* cancelled */ }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup saved');
  });

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = importData(JSON.parse(await file.text()));
      toast(`Imported ${n} task${n === 1 ? '' : 's'}`);
    } catch (err) {
      toast(err.message || 'Could not import that file');
    }
  });

  function clearCompleted() {
    const removed = state.tasks.filter((t) => t.done);
    if (!removed.length) { toast('No completed tasks'); return; }
    state.tasks = state.tasks.filter((t) => !t.done);
    commit();
    toast(`Cleared ${removed.length} task${removed.length === 1 ? '' : 's'}`, () => { state.tasks.push(...removed); commit(); });
  }
  $('#clear-done').addEventListener('click', clearCompleted);

  /* ---------------------------------------------------------------- events */

  for (const b of $$('.segmented button')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#add-btn').addEventListener('click', () => openEditor(null));
  $('#backdrop').addEventListener('click', () => closeSheet());
  for (const b of $$('[data-close]')) b.addEventListener('click', () => closeSheet());
  $('#toast-action').addEventListener('click', () => {
    const undo = toastUndo;
    $('#toast').hidden = true; toastUndo = null;
    if (undo) undo();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openSheetEl) closeSheet();
  });

  $('#list').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'clear-done') clearCompleted();
      if (action.dataset.action === 'ai-plan') planDay(view);
      return;
    }
    const row = e.target.closest('.task');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('.check')) {
      const t = getTask(id);
      if (!t) return;
      if (t.done) { reopenTask(id); return; }
      row.classList.add('completing');
      setTimeout(() => completeTask(id), 320);
      return;
    }
    openEditor(id);
  });

  $('#list').addEventListener('keydown', (e) => {
    const row = e.target.classList && e.target.classList.contains('task') ? e.target : null;
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEditor(row.dataset.id); }
  });

  // Day rollover / returning to the app.
  let lastDay = todayKey();
  function tick() {
    if (todayKey() !== lastDay) { lastDay = todayKey(); render(); syncReminders(); }
    checkDueReminders();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); tick(); } });
  setInterval(tick, 15000);

  // Messages from the service worker (notification buttons).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notification-action') handleNotificationAction(e.data.action, e.data.taskId);
    });
  }

  /* ---------------------------------------------------------------- boot */

  render();

  if (isNative) {
    setupNative().then(syncReminders);
  } else if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Opened from a notification while the app was closed.
  const params = new URLSearchParams(location.search);
  if (VIEWS[params.get('view')]) {
    setView(params.get('view'));
    history.replaceState(null, '', location.pathname);
  }
  if (params.get('task')) {
    handleNotificationAction(params.get('action') || 'open', params.get('task'));
    history.replaceState(null, '', location.pathname);
  }

  syncReminders();

  // A small API for automation and future AI / MCP integrations.
  window.TasksAPI = {
    list: (filter = {}) => state.tasks.filter((t) =>
      (filter.done === undefined || t.done === filter.done) && (!filter.date || t.date === filter.date)).map((t) => ({ ...t })),
    add: (fields) => ({ ...addTask(fields) }),
    update: (id, fields) => { const t = updateTask(id, fields); return t ? { ...t } : null; },
    complete: (id) => completeTask(id),
    remove: (id) => deleteTask(id),
    export: exportData,
    import: importData,
    taskPrompt: (id) => { const t = getTask(id); return t ? taskPrompt(t) : null; },
  };
})();
