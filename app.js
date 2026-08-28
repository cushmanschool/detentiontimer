'use strict';

const STORAGE_KEY = 'detention-timers-v1';
const CHIME_REPEAT_MS = 8000;

/** @type {{id:number,name:string,totalSeconds:number,remaining:number,endAt:number|null,status:'ready'|'running'|'paused'|'done'}[]} */
let students = [];
let selectedMinutes = 10;
let audioCtx = null;
let lastChimeAt = 0;
let wakeLock = null;

const grid = document.getElementById('timerGrid');
const emptyState = document.getElementById('emptyState');
const startAllBtn = document.getElementById('startAll');
const formError = document.getElementById('formError');
const nameInput = document.getElementById('studentName');
const customInput = document.getElementById('customMinutes');

/* ── Persistence ───────────────────────────────────────── */

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    students = JSON.parse(raw);
    // Running timers keep counting via their end timestamp even while
    // the page is closed; anything past due comes back as done.
    for (const s of students) {
      if (s.status === 'running' && remainingOf(s) <= 0) {
        s.status = 'done';
        s.remaining = 0;
        s.endAt = null;
      }
    }
  } catch {
    students = [];
  }
}

/* ── Time helpers ──────────────────────────────────────── */

function remainingOf(s) {
  if (s.status === 'running' && s.endAt) {
    return Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000));
  }
  return s.remaining;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ── Chime (WebAudio — no external files) ──────────────── */

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function chime() {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  [659.25, 880].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1);
  });
}

document.addEventListener('pointerdown', ensureAudio, { once: false });

/* ── Wake lock (keep a projected screen awake) ─────────── */

async function updateWakeLock() {
  const anyRunning = students.some((s) => s.status === 'running');
  if (anyRunning && !wakeLock && 'wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  } else if (!anyRunning && wakeLock) {
    try { await wakeLock.release(); } catch {}
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    wakeLock = null;
    updateWakeLock();
  }
});

/* ── Actions ───────────────────────────────────────────── */

function addStudent(name, minutes) {
  students.push({
    id: Date.now() + Math.random(),
    name,
    totalSeconds: minutes * 60,
    remaining: minutes * 60,
    endAt: null,
    status: 'ready',
  });
  save();
  render();
}

function startStudent(s) {
  s.endAt = Date.now() + remainingOf(s) * 1000;
  s.status = 'running';
  save();
  render();
  updateWakeLock();
}

function pauseStudent(s) {
  s.remaining = remainingOf(s);
  s.endAt = null;
  s.status = 'paused';
  save();
  render();
  updateWakeLock();
}

function addMinute(s) {
  s.totalSeconds += 60;
  if (s.status === 'running') {
    s.endAt += 60000;
  } else {
    s.remaining += 60;
    if (s.status === 'done') s.status = 'paused';
  }
  save();
  render();
}

function removeStudent(s) {
  students = students.filter((x) => x.id !== s.id);
  save();
  render();
  updateWakeLock();
}

/* ── Rendering ─────────────────────────────────────────── */

function makeButton(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${className}`;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function render() {
  grid.innerHTML = '';
  emptyState.hidden = students.length > 0;
  startAllBtn.hidden = !students.some((s) => s.status === 'ready' || s.status === 'paused');

  for (const s of students) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = s.id;

    const top = document.createElement('div');
    top.className = 'card-top';
    const nameEl = document.createElement('span');
    nameEl.className = 'card-name';
    nameEl.textContent = s.name;
    const assigned = document.createElement('span');
    assigned.className = 'card-assigned';
    assigned.textContent = `${Math.round(s.totalSeconds / 60)} min`;
    top.append(nameEl, assigned);
    card.appendChild(top);

    if (s.status === 'done') {
      card.classList.add('done');
      const free = document.createElement('p');
      free.className = 'free-to-go';
      free.textContent = 'Free to go';
      free.setAttribute('role', 'status');
      card.appendChild(free);

      const controls = document.createElement('div');
      controls.className = 'card-controls';
      controls.append(
        makeButton('Dismiss', 'btn-done', () => removeStudent(s)),
        makeButton('+1 min', 'btn-ghost', () => addMinute(s)),
      );
      card.appendChild(controls);
    } else {
      const time = document.createElement('p');
      time.className = 'card-time';
      time.textContent = formatTime(remainingOf(s));
      card.appendChild(time);

      const progress = document.createElement('div');
      progress.className = 'progress';
      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = `${(remainingOf(s) / s.totalSeconds) * 100}%`;
      progress.appendChild(fill);
      card.appendChild(progress);

      const controls = document.createElement('div');
      controls.className = 'card-controls';
      if (s.status === 'running') {
        controls.appendChild(makeButton('Pause', 'btn-primary', () => pauseStudent(s)));
      } else {
        const label = s.status === 'paused' ? 'Resume' : 'Start';
        controls.appendChild(makeButton(label, 'btn-primary', () => { ensureAudio(); startStudent(s); }));
      }
      controls.append(
        makeButton('+1 min', 'btn-ghost', () => addMinute(s)),
        makeButton('Remove', 'btn-ghost', () => removeStudent(s)),
      );
      card.appendChild(controls);
    }

    grid.appendChild(card);
  }
}

/* Per-tick update of digits and progress without rebuilding the DOM. */
function tick() {
  let structuralChange = false;

  for (const s of students) {
    if (s.status !== 'running') continue;
    const left = remainingOf(s);
    if (left <= 0) {
      s.status = 'done';
      s.remaining = 0;
      s.endAt = null;
      structuralChange = true;
      continue;
    }
    const card = grid.querySelector(`[data-id="${s.id}"]`);
    if (!card) continue;
    card.querySelector('.card-time').textContent = formatTime(left);
    card.querySelector('.progress-fill').style.width = `${(left / s.totalSeconds) * 100}%`;
    card.classList.toggle('urgent', left <= 60);
  }

  if (structuralChange) {
    save();
    render();
    updateWakeLock();
  }

  // Repeat the chime gently while anyone is waiting to be dismissed.
  if (students.some((s) => s.status === 'done') && Date.now() - lastChimeAt > CHIME_REPEAT_MS) {
    lastChimeAt = Date.now();
    chime();
  }
}

/* ── Wall clock ────────────────────────────────────────── */

function updateClock() {
  const now = new Date();
  document.getElementById('wallClock').textContent = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ── Form ──────────────────────────────────────────────── */

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('selected');
      c.setAttribute('aria-pressed', 'false');
    });
    chip.classList.add('selected');
    chip.setAttribute('aria-pressed', 'true');
    selectedMinutes = parseInt(chip.dataset.minutes, 10);
    customInput.value = '';
  });
});

customInput.addEventListener('input', () => {
  if (customInput.value) {
    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('selected');
      c.setAttribute('aria-pressed', 'false');
    });
  }
});

document.getElementById('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  ensureAudio();

  const name = nameInput.value.trim();
  const minutes = customInput.value
    ? parseInt(customInput.value, 10)
    : selectedMinutes;

  if (!name) {
    formError.textContent = 'Enter the student’s name.';
    formError.hidden = false;
    nameInput.focus();
    return;
  }
  if (!minutes || minutes < 1 || minutes > 180) {
    formError.textContent = 'Pick a number of minutes between 1 and 180.';
    formError.hidden = false;
    customInput.focus();
    return;
  }

  formError.hidden = true;
  addStudent(name, minutes);
  nameInput.value = '';
  nameInput.focus();
});

startAllBtn.addEventListener('click', () => {
  ensureAudio();
  const now = Date.now();
  for (const s of students) {
    if (s.status === 'ready' || s.status === 'paused') {
      s.endAt = now + remainingOf(s) * 1000;
      s.status = 'running';
    }
  }
  save();
  render();
  updateWakeLock();
});

/* ── Boot ──────────────────────────────────────────────── */

load();
render();
updateWakeLock();
updateClock();
setInterval(tick, 300);
setInterval(updateClock, 1000);
