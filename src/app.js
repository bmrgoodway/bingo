// 빙고 앱 화면과 진행 (로그인 없음 · 저장은 이 브라우저에만)
import { local } from './store.js';
import { THEMES, SIZE_CELLS, CONTENT_LABEL, numberItems } from './content.js';
import { shuffle, linesOf, completedLines, emptyMarks, aiChoose } from './game.js';
import { sfx, setSound, primeSound, soundOn } from './sound.js';

/* ──────────────────────────── 기본 값 ──────────────────────────── */

const DEFAULT_SETTINGS = {
  mode: 'ai',
  size: 5,
  content: 'number',
  theme: 'food',
  fill: 'random',
  target: 3,
  difficulty: 'normal',
  count: 2,
  names: ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4'],
  curtain: true,
  customItems: [],
  customName: '나의 빙고',
};

const DEFAULT_STATS = {
  ai: { easy: { w: 0, l: 0, d: 0 }, normal: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } },
  local: { games: 0 },
  host: { draws: 0 },
  best: 0,
};

const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };
const MODE_LABEL = { ai: '🤖 AI 대전', local: '👥 로컬 대전', host: '🎤 사회자 추첨' };

/* ──────────────────────────── 저장 ──────────────────────────── */

function loadSettings() {
  const saved = local.get('settings', null);
  const s = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!['ai', 'local', 'host'].includes(s.mode)) s.mode = 'ai';
  s.size = Number(s.size) === 4 ? 4 : 5;
  if (!['number', 'theme', 'custom'].includes(s.content)) s.content = 'number';
  if (!THEMES[s.theme]) s.theme = 'food';
  s.fill = s.fill === 'manual' ? 'manual' : 'random';
  s.target = [3, 5].includes(Number(s.target)) ? Number(s.target) : 3;
  if (!DIFF_LABEL[s.difficulty]) s.difficulty = 'normal';
  s.count = Math.min(4, Math.max(2, Number(s.count) || 2));
  if (!Array.isArray(s.names) || s.names.length !== 4) s.names = [...DEFAULT_SETTINGS.names];
  s.names = s.names.map((n) => String(n || '').slice(0, 10));
  s.curtain = s.curtain !== false;
  if (!Array.isArray(s.customItems)) s.customItems = [];
  s.customItems = s.customItems.map((v) => String(v)).filter(Boolean);
  s.customName = String(s.customName || '나의 빙고').slice(0, 20);
  return s;
}

function loadStats() {
  const saved = local.get('stats', null);
  const base = JSON.parse(JSON.stringify(DEFAULT_STATS));
  if (!saved || typeof saved !== 'object') return base;
  for (const d of ['easy', 'normal', 'hard']) {
    const r = saved.ai?.[d];
    if (r) base.ai[d] = { w: Number(r.w) || 0, l: Number(r.l) || 0, d: Number(r.d) || 0 };
  }
  base.local.games = Number(saved.local?.games) || 0;
  base.host.draws = Number(saved.host?.draws) || 0;
  base.best = Number(saved.best) || 0;
  return base;
}

function saveStats() {
  local.set('stats', stats);
}

function loadCustoms() {
  const list = local.get('customs', []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && Array.isArray(x.items) && [16, 25].includes(Number(x.size)))
    .map((x) => ({
      id: String(x.id || Math.random().toString(36).slice(2)),
      name: String(x.name || '커스텀').slice(0, 20),
      size: Number(x.size),
      items: x.items.map((v) => String(v)),
      savedAt: Number(x.savedAt) || Date.now(),
    }))
    .slice(0, 20);
}

/* ──────────────────────────── 상태 ──────────────────────────── */

const settings = loadSettings();
const stats = loadStats();
let customs = loadCustoms();

const view = {
  screen: 'home',
  settings,
  match: null,
  host: null,
  builder: null,
  editor: { items: [], name: '' },
  modal: null,
  toastTimer: 0,
};

const app = document.getElementById('app');

/* ──────────────────────────── 작은 도우미 ──────────────────────────── */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(view.toastTimer);
  view.toastTimer = setTimeout(() => el.classList.remove('is-on'), 2400);
}

function go(screen) {
  view.screen = screen;
  render();
  window.scrollTo(0, 0);
}

/* ──────────────────────────── 소리 · 화면색 ──────────────────────────── */

function applySoundState(on) {
  setSound(on);
  local.set('muted', !on);
  const btn = $('#btn-sound');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? '효과음 켜짐' : '효과음 꺼짐');
  btn.textContent = on ? '♪' : '✕';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  local.set('theme', theme);
  const btn = $('#btn-theme');
  if (btn) {
    const night = theme === 'night';
    btn.setAttribute('aria-pressed', String(night));
    btn.setAttribute('aria-label', night ? '낮 화면으로 바꾸기' : '밤 화면으로 바꾸기');
    btn.textContent = night ? '☀' : '☾';
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#101016' : '#fbf7ea');
}

/* ──────────────────────────── 내용 · 판 ──────────────────────────── */

function poolFor(s) {
  const n = SIZE_CELLS[s.size];
  if (s.content === 'number') return numberItems(s.size);
  if (s.content === 'theme') {
    const theme = THEMES[s.theme] ?? THEMES.food;
    return shuffle(theme.items).slice(0, n);
  }
  const items = (s.customItems || []).map((v) => String(v).trim()).filter(Boolean);
  return items.length === n ? items.slice(0, n) : null;
}

function contentSummary(s) {
  if (s.content === 'number') return `숫자 1~${SIZE_CELLS[s.size]}`;
  if (s.content === 'theme') return `${THEMES[s.theme]?.emoji ?? ''} ${THEMES[s.theme]?.name ?? '테마'} 테마`;
  return `✏️ ${s.customName || '직접 입력'}`;
}

/* ──────────────────────────── 그리기 ──────────────────────────── */

let clockTimer = null;

function render() {
  const focusKey = document.activeElement?.dataset?.focusKey || null;
  if (view.screen === 'home') app.innerHTML = homeView();
  else if (view.screen === 'editor') app.innerHTML = editorView();
  else if (view.screen === 'build') app.innerHTML = builderView();
  else if (view.screen === 'play') app.innerHTML = playView();
  else if (view.screen === 'host') app.innerHTML = hostView();

  paintLines();
  paintBars();
  if (view.modal) app.insertAdjacentHTML('beforeend', modalView());
  if (view.modal?.confetti) addConfetti();
  syncClock();

  if (focusKey) {
    const el = app.querySelector(`[data-focus-key="${focusKey}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
}

function syncClock() {
  const el = app.querySelector('[data-clock]');
  if (!el) return;
  const start = view.screen === 'play' ? view.match?.startedAt : null;
  el.textContent = fmtClock(start ? Date.now() - start : 0);
  if (start && !clockTimer) {
    clockTimer = setInterval(() => {
      const node = document.querySelector('[data-clock]');
      if (!node || !view.match) return;
      node.textContent = fmtClock(Date.now() - view.match.startedAt);
    }, 1000);
  }
  if (!start && clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function paintLines() {
  for (const boardEl of $$('[data-lines]')) {
    const layer = boardEl.querySelector('.line-layer');
    if (!layer) continue;
    layer.innerHTML = '';
    const size = Number(boardEl.dataset.size);
    const ids = String(boardEl.dataset.lines || '').split(',').filter(Boolean).map(Number);
    ids.forEach((li, n) => {
      const line = linesOf(size)[li];
      if (!line) return;
      const a = line[0];
      const b = line[line.length - 1];
      const ax = (((a % size) + 0.5) / size) * 100;
      const ay = ((Math.floor(a / size) + 0.5) / size) * 100;
      const bx = (((b % size) + 0.5) / size) * 100;
      const by = ((Math.floor(b / size) + 0.5) / size) * 100;
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy);
      const pad = (0.5 / size) * 100 * 0.94;
      const ux = dx / dist;
      const uy = dy / dist;
      const bar = document.createElement('i');
      bar.className = 'line-bar';
      bar.style.setProperty('--lx', `${ax - ux * pad}%`);
      bar.style.setProperty('--ly', `${ay - uy * pad}%`);
      bar.style.setProperty('--lw', `${dist + pad * 2}%`);
      bar.style.setProperty('--la', `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`);
      bar.style.setProperty('--ld', `${n * 0.09}s`);
      layer.appendChild(bar);
    });
  }
}

function paintBars() {
  for (const el of $$('[data-bar]')) el.style.setProperty('--p', `${Math.min(100, Number(el.dataset.bar) || 0)}%`);
}

function addConfetti() {
  const card = app.querySelector('.modal-card');
  if (!card) return;
  view.modal.confetti = false;
  const colors = ['#0abbee', '#ffdc1a', '#02c245', '#ff614a', '#7e65c1'];
  for (let i = 0; i < 34; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti';
    bit.style.setProperty('--x', `${Math.random() * 100}%`);
    bit.style.setProperty('--delay', `${(Math.random() * 0.6).toFixed(2)}s`);
    bit.style.setProperty('--dur', `${(1.2 + Math.random()).toFixed(2)}s`);
    bit.style.setProperty('--rot', `${Math.round(Math.random() * 540)}deg`);
    bit.style.setProperty('--c', colors[i % colors.length]);
    card.appendChild(bit);
  }
}

/* ──────────────────────────── 홈 ──────────────────────────── */

function segBtn(key, value, label, current) {
  const on = String(current) === String(value);
  return `<button type="button" class="seg-btn${on ? ' is-on' : ''}" data-action="set" data-key="${key}" data-value="${esc(value)}" aria-pressed="${on}">${label}</button>`;
}

function modeCard(mode, emoji, title, desc) {
  const on = settings.mode === mode;
  return `<button type="button" class="mode-card${on ? ' is-on' : ''}" data-action="mode" data-mode="${mode}" aria-pressed="${on}">
    <span class="mode-emoji" aria-hidden="true">${emoji}</span>
    <b>${title}</b>
    <small>${desc}</small>
  </button>`;
}

function statsChips() {
  const ai = stats.ai;
  const w = ai.easy.w + ai.normal.w + ai.hard.w;
  const l = ai.easy.l + ai.normal.l + ai.hard.l;
  const d = ai.easy.d + ai.normal.d + ai.hard.d;
  const chips = [];
  if (w + l + d > 0) chips.push(`<span class="stat"><b>AI</b> ${w}승 ${l}패${d ? ` ${d}무` : ''}</span>`);
  if (stats.local.games) chips.push(`<span class="stat"><b>로컬</b> ${stats.local.games}판</span>`);
  if (stats.host.draws) chips.push(`<span class="stat"><b>추첨</b> ${stats.host.draws}회</span>`);
  if (stats.best) chips.push(`<span class="stat"><b>최고</b> ${stats.best}줄</span>`);
  return chips.length ? chips.join('') : '<span class="stat stat-empty">아직 기록이 없어요 · 첫 판을 시작해 보세요</span>';
}

function homeView() {
  const s = settings;
  const n = SIZE_CELLS[s.size];
  const customReady = (s.customItems || []).length === n;
  const canStart = s.content !== 'custom' || customReady;

  const presetChips = Object.entries(THEMES)
    .map(([id, t]) => `<button type="button" class="chip${s.theme === id ? ' is-on' : ''}" data-action="set" data-key="theme" data-value="${id}" aria-pressed="${s.theme === id}">${t.emoji} ${t.name}</button>`)
    .join('');

  const contentBlock = `
    <div class="field">
      <span class="label">칸 수</span>
      <div class="seg" role="group" aria-label="칸 수">
        ${segBtn('size', 4, '4×4 <small>16칸</small>', s.size)}
        ${segBtn('size', 5, '5×5 <small>25칸</small>', s.size)}
      </div>
    </div>
    <div class="field">
      <span class="label">내용</span>
      <div class="seg" role="group" aria-label="빙고 내용">
        ${segBtn('content', 'number', '숫자', s.content)}
        ${segBtn('content', 'theme', '테마', s.content)}
        ${segBtn('content', 'custom', '직접 입력', s.content)}
      </div>
    </div>
    ${s.content === 'theme' ? `<div class="field"><span class="label">테마 고르기</span><div class="chips">${presetChips}</div></div>` : ''}
    ${s.content === 'custom' ? `
      <div class="field">
        <span class="label">커스텀 보드</span>
        <div class="custom-row">
          <span class="custom-name${customReady ? '' : ' is-warn'}">${customReady ? esc(s.customName) : '아직 단어를 입력하지 않았어요'}</span>
          <button type="button" class="btn btn-sm" data-action="editor-open">보드 편집</button>
        </div>
        <p class="hint">${customReady ? `${n}개 단어가 준비됐어요. 저장해 두면 다음에 또 쓸 수 있어요.` : `${n}개 단어를 입력하면 시작할 수 있어요.`}</p>
      </div>` : ''}
    ${s.mode === 'host'
      ? '<p class="hint">사회자 추첨은 보드 없이 큰 볼을 뽑습니다. 아래에서 내 빙고판을 함께 볼 수 있어요.</p>'
      : `<div class="field">
          <span class="label">보드 배치</span>
          <div class="seg" role="group" aria-label="보드 배치">
            ${segBtn('fill', 'random', '랜덤 자동', s.fill)}
            ${segBtn('fill', 'manual', '직접 채우기', s.fill)}
          </div>
          <p class="hint">${s.fill === 'manual' ? '시작하면 칸에 넣을 순서를 직접 고릅니다.' : '단어를 섞어서 자동으로 채웁니다.'}</p>
        </div>`}
  `;

  let modeBlock = '';
  if (s.mode === 'ai') {
    modeBlock = `
      <div class="field">
        <span class="label">AI 난이도</span>
        <div class="seg" role="group" aria-label="AI 난이도">
          ${segBtn('difficulty', 'easy', '쉬움', s.difficulty)}
          ${segBtn('difficulty', 'normal', '보통', s.difficulty)}
          ${segBtn('difficulty', 'hard', '어려움', s.difficulty)}
        </div>
        <p class="hint">${s.difficulty === 'hard' ? 'AI가 완성 가능한 줄의 교차점을 먼저 노립니다.' : s.difficulty === 'easy' ? 'AI가 가끔 엉뚱한 칸을 부릅니다.' : 'AI가 절반쯤 좋은 수를 고릅니다.'}</p>
      </div>
      <div class="field">
        <span class="label">목표 빙고 줄</span>
        <div class="seg" role="group" aria-label="목표 줄 수">
          ${segBtn('target', 3, '3줄', s.target)}
          ${segBtn('target', 5, '5줄', s.target)}
        </div>
      </div>`;
  } else if (s.mode === 'local') {
    const nameInputs = Array.from({ length: s.count }, (_, i) => `
      <label class="name-row">
        <span class="name-badge" data-accent="${i % 4}">${i + 1}</span>
        <input class="input" data-name-input="${i}" maxlength="10" value="${esc(s.names[i] || `플레이어 ${i + 1}`)}" aria-label="플레이어 ${i + 1} 이름" placeholder="플레이어 ${i + 1}">
      </label>`).join('');
    modeBlock = `
      <div class="field">
        <span class="label">인원</span>
        <div class="seg" role="group" aria-label="인원">
          ${segBtn('count', 2, '2명', s.count)}
          ${segBtn('count', 3, '3명', s.count)}
          ${segBtn('count', 4, '4명', s.count)}
        </div>
      </div>
      <div class="field">
        <span class="label">이름</span>
        <div class="names">${nameInputs}</div>
      </div>
      <div class="field">
        <span class="label">프라이버시 가림막</span>
        <div class="seg" role="group" aria-label="가림막">
          ${segBtn('curtain', '1', '켜기', s.curtain ? '1' : '0')}
          ${segBtn('curtain', '0', '끄기', s.curtain ? '1' : '0')}
        </div>
        <p class="hint">턴이 넘어갈 때 보드를 가려 다음 사람이 준비할 시간을 줍니다.</p>
      </div>
      <div class="field">
        <span class="label">목표 빙고 줄</span>
        <div class="seg" role="group" aria-label="목표 줄 수">
          ${segBtn('target', 3, '3줄', s.target)}
          ${segBtn('target', 5, '5줄', s.target)}
        </div>
      </div>`;
  } else {
    modeBlock = `
      <div class="rule-box">
        <b>이렇게 진행해요</b>
        <ol>
          <li>큰 볼을 뽑아 번호·단어를 부릅니다.</li>
          <li>부른 것은 오른쪽 기록판에 차례로 쌓입니다.</li>
          <li>필요하면 <b>내 빙고판</b>을 켜서 함께 표시하세요.</li>
        </ol>
      </div>
      <p class="hint">추첨은 기록만 남고 순위·승패는 세지 않아요. 학급 레크리에이션·수업 놀이에 쓰기 좋습니다.</p>`;
  }

  const modeLine = s.mode === 'ai'
    ? `AI ${DIFF_LABEL[s.difficulty]} · 목표 ${s.target}줄`
    : s.mode === 'local'
      ? `${s.count}명 · 목표 ${s.target}줄 · 가림막 ${s.curtain ? '켜짐' : '꺼짐'}`
      : '큰 볼 추첨 · 기록판';

  return `
  <section class="hero">
    <div class="hero-copy">
      <span class="eyebrow">로그인 없이 바로 · 수업 · 모임 · 레크리에이션</span>
      <h1>빙고<span class="bang">!</span></h1>
      <p class="hero-desc">AI와 겨루고, 한 기기로 친구와 돌아가며, 사회자로 추첨까지. 숫자·테마·내 단어로 판을 만들어요.</p>
      <div class="stats" aria-label="지난 기록">${statsChips()}</div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="mini-board" data-size="4">
        ${Array.from({ length: 16 }, (_, i) => `<span class="mini-cell${[0, 1, 2, 3].includes(i) ? ' is-line' : [5, 10, 15].includes(i) ? ' is-mark' : ''}">${i + 1}</span>`).join('')}
        <span class="mini-stamp">BINGO!</span>
      </div>
    </div>
  </section>

  <h2 class="sec-title"><span class="num">1</span> 어떻게 즐길까요?</h2>
  <div class="modes" role="group" aria-label="놀이 방식">
    ${modeCard('ai', '🤖', 'AI 대전', '혼자서 AI와 빙고 대결')}
    ${modeCard('local', '👥', '로컬 대전', '한 기기로 2~4명 턴제')}
    ${modeCard('host', '🎤', '사회자 추첨', '큰 볼 뽑기 · 기록판')}
  </div>

  <h2 class="sec-title"><span class="num">2</span> 판을 골라요</h2>
  <div class="setup-grid">
    <div class="card">
      <h3 class="card-title">빙고판</h3>
      ${contentBlock}
    </div>
    <div class="card">
      <h3 class="card-title">${s.mode === 'ai' ? '대결 방식' : s.mode === 'local' ? '함께하는 사람' : '추첨 방식'}</h3>
      ${modeBlock}
    </div>
  </div>

  <div class="start-bar">
    <p class="start-hint"><b>${s.size}×${s.size}</b> · ${contentSummary(s)} · ${modeLine}</p>
    <button type="button" class="btn btn-primary btn-lg" data-action="start" ${canStart ? '' : 'disabled'}>시작하기 →</button>
  </div>
  <p class="foot-note">기록과 커스텀 보드는 이 브라우저에만 저장됩니다. 로그인은 필요 없어요.</p>
  `;
}

/* ──────────────────────────── 커스텀 보드 편집 ──────────────────────────── */

function openEditor() {
  const n = SIZE_CELLS[settings.size];
  let items = (settings.customItems || []).length >= n ? settings.customItems.slice(0, n) : null;
  if (!items) {
    const saved = customs.find((c) => c.size === settings.size);
    items = saved ? saved.items.slice(0, n) : [];
  }
  view.editor = {
    items: Array.from({ length: n }, (_, i) => items[i] ?? ''),
    name: settings.customName || `커스텀 ${settings.size}×${settings.size}`,
  };
  view.screen = 'editor';
  render();
  window.scrollTo(0, 0);
}

function editorView() {
  const s = settings;
  const n = SIZE_CELLS[s.size];
  const ed = view.editor;
  const filled = ed.items.filter((v) => v.trim()).length;
  const savedList = customs.length
    ? `<ul class="saved-list">${customs.map((c) => `
        <li>
          <span class="saved-name">${esc(c.name)}<small>${c.size}×${c.size}</small></span>
          <span class="saved-actions">
            <button type="button" class="btn btn-xs" data-action="editor-load" data-id="${c.id}">불러오기</button>
            <button type="button" class="btn btn-xs btn-danger" data-action="editor-del" data-id="${c.id}">삭제</button>
          </span>
        </li>`).join('')}</ul>`
    : '<p class="hint">저장한 보드가 아직 없어요. 이름을 적고 저장해 두면 다음에 바로 불러올 수 있어요.</p>';

  return `
  <div class="page-head">
    <button type="button" class="btn btn-ghost" data-action="editor-back">← 돌아가기</button>
    <h1 class="page-title">커스텀 빙고판 <span class="tag">${s.size}×${s.size} · ${n}개</span></h1>
  </div>

  <div class="editor-grid">
    <div class="card">
      <div class="editor-top">
        <p>칸을 눌러 단어를 적으세요. <b>${filled}/${n}</b>칸 채움</p>
        <div class="row-btns">
          <button type="button" class="btn btn-xs" data-action="editor-sample">예시 단어</button>
          <button type="button" class="btn btn-xs btn-danger" data-action="editor-clear">비우기</button>
        </div>
      </div>
      <div class="editor-board" data-size="${s.size}">
        ${ed.items.map((v, i) => `<input class="input cell-input" data-editor-input="${i}" maxlength="10" value="${esc(v)}" aria-label="${i + 1}번째 칸" placeholder="${i + 1}">`).join('')}
      </div>
      <p class="hint">같은 단어는 두 번 넣을 수 없어요. 띄어쓰기는 그대로 보입니다.</p>
    </div>

    <div class="card">
      <div class="field">
        <span class="label">보드 이름</span>
        <input class="input" data-editor-name maxlength="20" value="${esc(ed.name)}" aria-label="보드 이름" placeholder="예: 5학년 국어 단어">
      </div>
      <div class="row-btns wide">
        <button type="button" class="btn" data-action="editor-save">저장하기</button>
        <button type="button" class="btn btn-primary" data-action="editor-use">이 보드로 시작 →</button>
      </div>
      <h3 class="card-title">저장한 보드</h3>
      ${savedList}
    </div>
  </div>
  `;
}

function readEditor() {
  const inputs = $$('[data-editor-input]');
  if (inputs.length) view.editor.items = inputs.map((el) => el.value.trim());
  const nameEl = $('[data-editor-name]');
  if (nameEl) view.editor.name = nameEl.value.trim().slice(0, 20);
  return view.editor;
}

function validateEditor() {
  const { items } = readEditor();
  const n = SIZE_CELLS[settings.size];
  if (items.length !== n) return '칸 수가 맞지 않아요. 화면을 새로고침해 주세요.';
  if (items.some((v) => !v)) return `빈 칸이 있어요. ${n}칸을 모두 채워 주세요.`;
  if (new Set(items).size !== items.length) return '같은 단어가 두 번 들어 있어요. 겹치는 단어를 바꿔 주세요.';
  return null;
}

/* ──────────────────────────── 보드 직접 채우기 ──────────────────────────── */

function startBuilder() {
  const s = settings;
  const pool = poolFor(s);
  if (!pool) {
    toast('커스텀 단어를 먼저 채워 주세요.');
    view.screen = 'home';
    render();
    return;
  }
  const count = s.mode === 'ai' ? 1 : s.count;
  const n = SIZE_CELLS[s.size];
  view.builder = {
    size: s.size,
    mode: s.mode,
    pool,
    boards: Array.from({ length: count }, (_, i) => ({
      name: s.mode === 'ai' ? '나' : s.names[i] || `플레이어 ${i + 1}`,
      cells: Array(n).fill(null),
    })),
    idx: 0,
    cover: false,
  };
  view.screen = 'build';
  render();
  window.scrollTo(0, 0);
}

function builderView() {
  const b = view.builder;
  const n = b.size * b.size;
  const cur = b.boards[b.idx];
  const filled = cur.cells.filter(Boolean).length;
  const remaining = b.pool.filter((v) => !cur.cells.includes(v));
  const isLast = b.idx === b.boards.length - 1;

  const chips = remaining.map((v) => `<button type="button" class="chip chip-word" data-action="build-place" data-value="${esc(v)}">${esc(v)}</button>`).join('');

  return `
  <div class="page-head">
    <button type="button" class="btn btn-ghost" data-action="home">← 그만두기</button>
    <h1 class="page-title">보드 만들기 <span class="tag">${b.idx + 1} / ${b.boards.length} · ${esc(cur.name)}</span></h1>
  </div>
  <div class="build-wrap">
    <div class="build-board-area">
      <div class="card">
        <div class="editor-top">
          <p><b>${filled}/${n}</b>칸 채움 · 아래 단어를 누른 순서대로 채워집니다</p>
          <div class="row-btns">
            <button type="button" class="btn btn-xs" data-action="build-undo">되돌리기</button>
            <button type="button" class="btn btn-xs" data-action="build-random">남은 칸 랜덤</button>
            <button type="button" class="btn btn-xs btn-danger" data-action="build-clear">비우기</button>
          </div>
        </div>
        <div class="build-board" data-size="${b.size}">
          ${cur.cells.map((v, i) => `<button type="button" class="build-cell${v ? ' is-filled' : ''}" ${v ? `data-action="build-remove" data-cell="${i}"` : 'disabled'} data-focus-key="b${i}">${v ? esc(v) : `<span>${i + 1}</span>`}</button>`).join('')}
        </div>
      </div>
      <div class="start-bar">
        <p class="start-hint">${remaining.length ? `남은 단어 <b>${remaining.length}</b>개` : '모두 채웠어요!'}</p>
        <div class="row-btns">
          <button type="button" class="btn" data-action="build-again">처음부터</button>
          <button type="button" class="btn btn-primary btn-lg" data-action="build-next" ${filled === n ? '' : 'disabled'}>${isLast ? '시작하기 →' : '다음 사람 →'}</button>
        </div>
      </div>
    </div>
    <aside class="card chip-box">
      <h3 class="card-title">넣을 단어 <span class="tag">${remaining.length}</span></h3>
      <div class="chips">${chips || '<p class="hint">남은 단어가 없어요.</p>'}</div>
    </aside>
  </div>
  ${b.cover ? `
  <div class="cover" role="dialog" aria-modal="true" aria-label="다음 사람에게 넘기기">
    <div class="cover-card">
      <span class="cover-emoji" aria-hidden="true">🙈</span>
      <p class="cover-title">다음 사람에게 넘겨주세요</p>
      <p><b>${esc(b.boards[b.idx].name)}</b>의 보드를 만듭니다.<br>다른 사람은 잠깐 화면을 보지 마세요.</p>
      <button type="button" class="btn btn-primary btn-lg" data-action="build-reveal">준비됐어요</button>
    </div>
  </div>` : ''}
  `;
}

/* ──────────────────────────── 대전 ──────────────────────────── */

function startMatch(boardsOverride = null) {
  const s = settings;
  const n = SIZE_CELLS[s.size];
  const pool = poolFor(s);
  if (!pool) {
    toast('커스텀 단어를 먼저 채워 주세요.');
    return;
  }
  const players = [];
  const humans = s.mode === 'ai' ? 1 : s.count;
  for (let i = 0; i < humans; i++) {
    const board = boardsOverride?.[i] ? boardsOverride[i].slice() : shuffle(pool);
    players.push({
      name: s.mode === 'ai' ? '나' : (s.names[i] || `플레이어 ${i + 1}`).slice(0, 10) || `플레이어 ${i + 1}`,
      isAI: false,
      board,
      marked: emptyMarks(n),
      linesIdx: [],
      lines: 0,
      accent: i % 4,
    });
  }
  if (s.mode === 'ai') {
    players.push({
      name: `AI · ${DIFF_LABEL[s.difficulty]}`,
      isAI: true,
      board: shuffle(pool),
      marked: emptyMarks(n),
      linesIdx: [],
      lines: 0,
      accent: 1,
    });
  }

  view.match = {
    mode: s.mode,
    size: s.size,
    target: s.target,
    difficulty: s.difficulty,
    curtain: s.mode === 'local' && s.curtain,
    pool,
    players,
    called: [],
    turn: 0,
    lastValue: null,
    thinking: false,
    curtainUp: s.mode === 'local' && s.curtain,
    finished: false,
    winner: null,
    startedAt: Date.now(),
  };
  view.modal = null;
  view.screen = 'play';
  render();
  window.scrollTo(0, 0);
  if (view.match.curtainUp) sfx.curtain();
}

function callValue(value, byIndex) {
  const m = view.match;
  if (!m || m.finished || m.called.includes(value)) return;
  m.called.push(value);
  m.lastValue = value;

  let lineGain = 0;
  for (const p of m.players) {
    p.board.forEach((v, i) => { if (v === value) p.marked[i] = true; });
    const before = p.linesIdx.length;
    p.linesIdx = completedLines(p.marked, m.size);
    p.lines = p.linesIdx.length;
    lineGain += p.lines - before;
  }

  sfx.check();
  if (lineGain > 0) sfx.line();

  const winners = m.players.filter((p) => p.lines >= m.target);
  if (winners.length) {
    const maxLines = Math.max(...winners.map((p) => p.lines));
    const top = winners.filter((p) => p.lines === maxLines);
    const caller = m.players[byIndex];
    finishMatch(top.includes(caller) ? caller : top[0]);
    return;
  }
  advanceTurn();
}

function advanceTurn() {
  const m = view.match;
  if (!m || m.finished) return;
  m.turn = (m.turn + 1) % m.players.length;
  const next = m.players[m.turn];
  m.curtainUp = m.curtain && !next.isAI;
  m.thinking = !!next.isAI;
  render();
  if (next.isAI) {
    setTimeout(() => {
      if (view.match === m && !m.finished) aiTurn();
    }, 720);
  } else if (m.curtainUp) {
    sfx.curtain();
  }
}

function aiTurn() {
  const m = view.match;
  if (!m || m.finished) return;
  const p = m.players[m.turn];
  if (!p?.isAI) return;
  const cell = aiChoose({
    board: p.board,
    marked: p.marked,
    opponent: m.players.find((x) => !x.isAI),
    difficulty: m.difficulty,
  });
  m.thinking = false;
  if (cell < 0) {
    finishMatch(null);
    return;
  }
  callValue(p.board[cell], m.turn);
}

function finishMatch(winner) {
  const m = view.match;
  m.finished = true;
  m.winner = winner;
  m.endedAt = Date.now();
  m.thinking = false;
  m.curtainUp = false;
  const lines = winner?.lines ?? 0;
  stats.best = Math.max(stats.best, lines);

  if (m.mode === 'ai') {
    const rec = stats.ai[m.difficulty];
    if (!winner) rec.d += 1;
    else if (winner.isAI) rec.l += 1;
    else rec.w += 1;
    if (winner && !winner.isAI) sfx.win();
    else sfx.lose();
  } else {
    stats.local.games += 1;
    sfx.win();
  }
  saveStats();

  view.modal = {
    winner: winner?.name ?? null,
    isPlayerWin: !!winner && !winner.isAI,
    lines,
    calls: m.called.length,
    elapsed: (m.endedAt || Date.now()) - m.startedAt,
    confetti: !!winner && !winner.isAI,
  };
  m.result = view.modal;
  render();
}

function boardMarkup({ board, marked, linesIdx, size, name, accent, active, canTap, playerIndex, lastValue, words, target, showTarget = true, showStamp, hidden = false, hiddenNote = '종료 후 공개' }) {
  const lineCells = new Set();
  for (const li of linesIdx) for (const c of linesOf(size)[li]) lineCells.add(c);
  // 가려진 보드는 칸 값을 화면·DOM 어디에도 남기지 않습니다(값 대신 ? 만 그림).
  const cells = hidden
    ? Array.from({ length: board.length }, () => '<span class="cell is-locked" aria-hidden="true">?</span>').join('')
    : board.map((value, i) => {
      const cls = ['cell'];
      if (words) cls.push('is-word');
      if (marked[i]) cls.push('is-marked');
      if (lineCells.has(i)) cls.push('is-line');
      if (value === lastValue) cls.push('is-last');
      const disabled = !canTap || marked[i];
      return `<button type="button" class="${cls.join(' ')}" data-action="call" data-player="${playerIndex}" data-cell="${i}" data-value="${esc(value)}" data-focus-key="p${playerIndex}c${i}" ${disabled ? 'disabled' : ''} aria-label="${esc(value)}${marked[i] ? ' · 이미 부름' : ''}">${esc(value)}</button>`;
    }).join('');

  return `
  <section class="board-card${active ? ' is-turn' : ''}${hidden ? ' is-secret' : ''}" data-accent="${accent}">
    <header class="board-head">
      <span class="board-name"><i class="dot" aria-hidden="true"></i>${esc(name)}</span>
      <span class="board-meta">
        ${showStamp && !hidden && linesIdx.length ? `<span class="bingo-stamp">BINGO ×${linesIdx.length}</span>` : ''}
        ${showTarget ? `<span class="board-lines"><b>${linesIdx.length}</b>/${target}줄</span>` : ''}
      </span>
    </header>
    <div class="board${hidden ? ' is-hidden' : ''}" data-lines="${hidden ? '' : linesIdx.join(',')}" data-size="${size}">
      ${cells}
      ${hidden
        ? `<div class="board-mask"><span class="mask-lock" aria-hidden="true">🔒</span><b>게임 중 비공개</b><small>${esc(hiddenNote)}</small></div>`
        : '<div class="line-layer" aria-hidden="true"></div>'}
    </div>
  </section>`;
}

function playView() {
  const m = view.match;
  if (!m) return homeView();
  const words = m.pool.some((v) => !/^\d+$/.test(v));
  const players = m.players;
  const turnPlayer = players[m.turn];
  const calledCount = m.called.length;
  const total = m.pool.length;
  const recent = m.called.slice(-8).reverse();

  const banner = m.finished
    ? '🏁 경기 종료 — 모든 보드가 공개됐어요'
    : m.curtainUp
      ? '🙈 가림막이 쳐져 있어요 — 준비되면 보드를 열어 주세요'
      : m.thinking
        ? '🤖 AI가 고르는 중…'
        : `${turnPlayer.isAI ? '🤖' : '🙋'} <b>${turnPlayer.name === '나' ? '내' : esc(turnPlayer.name)}</b> 차례 — ${turnPlayer.isAI ? 'AI가 보드를 고릅니다' : '내 보드에서 부를 칸을 탭하세요'}`;

  const boards = players.map((p, i) => boardMarkup({
    board: p.board,
    marked: p.marked,
    linesIdx: p.linesIdx,
    size: m.size,
    name: p.name,
    accent: p.accent,
    active: !m.finished && i === m.turn,
    canTap: !m.finished && !m.thinking && !m.curtainUp && i === m.turn && !p.isAI,
    playerIndex: i,
    lastValue: m.lastValue,
    words,
    target: m.target,
    showStamp: true,
    // 게임 중에는 AI 보드(AI 대전)와 다른 사람 보드(로컬 대전)의 숫자를 가립니다.
    hidden: !m.finished && (p.isAI || (m.mode === 'local' && i !== m.turn)),
    hiddenNote: p.isAI ? '종료 후 공개' : `${p.name} 차례에 공개`,
  })).join('');

  const privacyHint = m.finished
    ? '경기가 끝나 모든 보드가 공개됐어요. 어디서 빙고가 났는지 복기해 보세요.'
    : m.mode === 'ai'
      ? 'AI 보드는 게임 중에 가려집니다. AI의 빙고 줄 수와 진행 바는 계속 볼 수 있어요.'
      : '지금 차례인 사람의 보드만 보입니다. 다른 보드는 그 사람 차례에 열려요.';
  const rows = players.map((p, i) => `
    <div class="lines-row" data-accent="${p.accent}">
      <span class="lines-name"><i class="dot" aria-hidden="true"></i>${esc(p.name)}</span>
      <span class="lines-count"><b>${p.lines}</b>/${m.target}</span>
      <span class="bar"><i data-bar="${(p.lines / m.target) * 100}"></i></span>
    </div>`).join('');

  return `
  <div class="play-head">
    <button type="button" class="btn btn-ghost" data-action="home">← 그만두기</button>
    <h1 class="play-title">${MODE_LABEL[m.mode]} <span class="tag">${m.size}×${m.size} · 목표 ${m.target}줄</span></h1>
    <span class="play-clock" title="경과 시간"><span class="tag">시간</span> <b data-clock>00:00</b></span>
  </div>

  <p class="turn" data-accent="${m.turn}" aria-live="polite"><span>${banner}</span><span class="turn-right">호출 <b>${calledCount}</b>/${total}</span></p>

  <div class="play-body">
    <div class="arena-wrap">
      <div class="arena">${boards}</div>
      ${m.curtainUp ? `
      <div class="curtain" role="dialog" aria-modal="true" aria-label="가림막">
        <div class="cover-card">
          <span class="cover-emoji" aria-hidden="true">🙈</span>
          <p class="cover-title">가림막</p>
          <p><b>${esc(turnPlayer.name)}</b> 차례입니다.<br>보드를 확인하고 준비되면 열어 주세요.</p>
          <button type="button" class="btn btn-primary btn-lg" data-action="curtain-open">다음 플레이어 준비 완료</button>
        </div>
      </div>` : ''}
    </div>

    <aside class="panel">
      <div class="panel-block">
        <h3 class="card-title">최근 호출 <span class="tag">${calledCount}/${total}</span></h3>
        <div class="recents">
          ${recent.length ? recent.map((v, i) => `<span class="recent-chip${i === 0 ? ' is-new' : ''}">${esc(v)}</span>`).join('') : '<p class="hint">아직 부른 칸이 없어요. 보드에서 칸을 눌러 시작하세요.</p>'}
        </div>
      </div>
      <div class="panel-block">
        <h3 class="card-title">빙고 줄</h3>
        ${rows}
      </div>
      <div class="panel-block">
        <p class="hint">${privacyHint}</p>
        ${m.finished && !view.modal ? '<button type="button" class="btn btn-block" data-action="show-result">결과 다시 보기</button>' : ''}
        <button type="button" class="btn btn-block" data-action="restart">같은 설정으로 다시</button>
      </div>
    </aside>
  </div>
  `;
}

/* ──────────────────────────── 사회자 추첨 ──────────────────────────── */

function startHost() {
  const s = settings;
  const pool = poolFor(s);
  if (!pool) {
    toast('커스텀 단어를 먼저 채워 주세요.');
    return;
  }
  const n = SIZE_CELLS[s.size];
  view.host = {
    size: s.size,
    pool,
    called: [],
    remaining: shuffle(pool),
    last: null,
    flicker: null,
    drawing: false,
    showBoard: false,
    personal: { board: shuffle(pool), marked: emptyMarks(n), linesIdx: [] },
    startedAt: Date.now(),
  };
  view.screen = 'host';
  render();
  window.scrollTo(0, 0);
}

function hostDraw() {
  const h = view.host;
  if (!h || h.drawing || !h.remaining.length || view.screen !== 'host') return;
  h.drawing = true;
  h.flicker = h.remaining[Math.floor(Math.random() * h.remaining.length)];
  sfx.draw();
  render();

  const chosen = h.remaining[Math.floor(Math.random() * h.remaining.length)];
  let tick = 0;
  const timer = setInterval(() => {
    if (view.host !== h || view.screen !== 'host') {
      clearInterval(timer);
      return;
    }
    tick += 1;
    if (tick < 8) {
      h.flicker = h.remaining[Math.floor(Math.random() * h.remaining.length)];
      render();
      return;
    }
    clearInterval(timer);
    h.drawing = false;
    h.flicker = null;
    h.last = chosen;
    h.called.push(chosen);
    h.remaining = h.remaining.filter((v) => v !== chosen);
    const size = Math.round(Math.sqrt(h.personal.board.length));
    h.personal.board.forEach((v, i) => { if (v === chosen) h.personal.marked[i] = true; });
    h.personal.linesIdx = completedLines(h.personal.marked, size);
    stats.host.draws += 1;
    saveStats();
    sfx.ball();
    render();
  }, 65);
}

function hostView() {
  const h = view.host;
  if (!h) return homeView();
  const n = h.pool.length;
  const words = h.pool.some((v) => !/^\d+$/.test(v));
  const size = Math.round(Math.sqrt(n));
  const ballText = h.flicker ?? h.last ?? '?';
  const recent = h.called.slice(-6).reverse();
  const personal = h.personal;

  const history = h.pool.map((v) => {
    const order = h.called.indexOf(v);
    return `<span class="hist-cell${order >= 0 ? ' is-called' : ''}${words ? ' is-word' : ''}">${esc(v)}${order >= 0 ? `<b>${order + 1}</b>` : ''}</span>`;
  }).join('');

  return `
  <div class="play-head">
    <button type="button" class="btn btn-ghost" data-action="home">← 그만두기</button>
    <h1 class="play-title">🎤 사회자 추첨 <span class="tag">${size}×${size} · ${words ? '단어' : '숫자'} ${n}개</span></h1>
    <button type="button" class="btn btn-sm" data-action="host-reset">처음부터</button>
  </div>

  <div class="host-body">
    <section class="draw-stage${h.drawing ? ' is-drawing' : ''}">
      <p class="draw-label">${h.last && !h.drawing ? '방금 부른 것' : h.drawing ? '뽑는 중…' : '준비됐어요'}</p>
      <div class="ball${h.drawing ? ' is-spinning' : ''}${h.last && !h.drawing ? ' is-out' : ''}">
        <span class="ball-text${words ? ' is-word' : ''}">${esc(ballText)}</span>
      </div>
      <button type="button" class="btn btn-primary btn-xl" data-action="draw" ${h.drawing || !h.remaining.length ? 'disabled' : ''}>
        ${h.remaining.length ? '뽑기' : '모두 뽑았어요'}
      </button>
      <p class="host-count">남은 <b>${h.remaining.length}</b> / ${n} · 호출 <b>${h.called.length}</b></p>
      <p class="hint">스페이스 키로도 뽑을 수 있어요.</p>
      <p class="sr-only" aria-live="polite">${h.last ? `방금 부른 것 ${h.last}` : ''}</p>
    </section>

    <aside class="host-side">
      <div class="card">
        <h3 class="card-title">호출 기록판</h3>
        <div class="history-grid${words ? ' is-word' : ''}" data-size="${size}">${history}</div>
      </div>
      <div class="card">
        <h3 class="card-title">최근 호출</h3>
        <div class="recents">
          ${recent.length ? recent.map((v, i) => `<span class="recent-chip${i === 0 ? ' is-new' : ''}">${esc(v)}</span>`).join('') : '<p class="hint">아직 뽑지 않았어요.</p>'}
        </div>
      </div>
      <div class="card">
        <label class="switch">
          <input type="checkbox" data-action="show-board" ${h.showBoard ? 'checked' : ''}>
          <span>내 빙고판 같이 보기</span>
        </label>
        ${h.showBoard ? `
          <div class="mini-personal">
            ${boardMarkup({
              board: personal.board,
              marked: personal.marked,
              linesIdx: personal.linesIdx,
              size,
              name: '내 빙고판',
              accent: 2,
              active: false,
              canTap: false,
              playerIndex: 99,
              lastValue: h.last,
              words,
              target: 0,
              showTarget: false,
              showStamp: false,
            })}
            <p class="hint">${personal.linesIdx.length ? `${personal.linesIdx.length}줄 완성!` : '뽑은 것이 내 판에도 자동으로 표시됩니다.'}</p>
          </div>` : ''}
      </div>
    </aside>
  </div>
  `;
}

/* ──────────────────────────── 결과 창 ──────────────────────────── */

function modalView() {
  const md = view.modal;
  if (!md) return '';
  const m = view.match;
  const aiMode = m?.mode === 'ai';
  const title = aiMode
    ? (md.isPlayerWin ? '빙고! 이겼어요' : md.winner ? '아쉬워요!' : '무승부')
    : md.winner ? '빙고!' : '무승부';
  const sub = aiMode
    ? (md.isPlayerWin ? 'AI를 이겼습니다 🎉' : `AI가 ${md.lines}줄을 먼저 완성했어요`)
    : md.winner ? `${esc(md.winner)} 승리 🎉` : '아무도 목표에 닿지 못했어요';

  return `
  <div class="modal" role="dialog" aria-modal="true" aria-label="결과">
    <div class="modal-card${md.confetti ? ' is-win' : ''}">
      <span class="modal-eyebrow">결과</span>
      <h2 class="modal-title">${title}</h2>
      <p class="modal-sub">${sub}</p>
      <div class="modal-stats">
        <span><b>${md.lines}</b><small>빙고 줄</small></span>
        <span><b>${md.calls}</b><small>호출</small></span>
        <span><b>${fmtClock(md.elapsed)}</b><small>시간</small></span>
      </div>
      <div class="row-btns wide">
        <button type="button" class="btn btn-primary" data-action="modal-restart">같은 설정으로 다시</button>
        <button type="button" class="btn" data-action="modal-home">다른 판 고르기</button>
      </div>
      <button type="button" class="btn btn-block" data-action="modal-board">보드 확인 — 어디서 빙고가 났는지 보기</button>
    </div>
  </div>`;
}

/* ──────────────────────────── 움직임 ──────────────────────────── */

function setSetting(key, raw) {
  if (key === 'curtain') settings.curtain = raw === '1';
  else if (key === 'size' || key === 'target' || key === 'count') settings[key] = Number(raw);
  else settings[key] = raw;
  local.set('settings', settings);
  sfx.tap();
  render();
}

function startAction() {
  primeSound();
  const s = settings;
  if (s.content === 'custom' && (s.customItems || []).length !== SIZE_CELLS[s.size]) {
    toast('커스텀 단어를 먼저 채워 주세요.');
    return;
  }
  if (s.mode === 'host') startHost();
  else if (s.fill === 'manual') startBuilder();
  else startMatch();
}

function restartAction() {
  const s = settings;
  view.modal = null;
  if (s.mode === 'host') startHost();
  else if (s.fill === 'manual') startBuilder();
  else startMatch();
}

function placeValue(value) {
  const b = view.builder;
  if (!b) return;
  const cells = b.boards[b.idx].cells;
  const slot = cells.indexOf(null);
  if (slot < 0) {
    sfx.error();
    toast('칸이 다 찼어요. 칸을 눌러 빼거나 랜덤 채우기를 쓰세요.');
    return;
  }
  if (cells.includes(value)) return;
  cells[slot] = value;
  sfx.tap();
  render();
}

function undoPlace() {
  const b = view.builder;
  if (!b) return;
  const cells = b.boards[b.idx].cells;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i]) { cells[i] = null; break; }
  }
  render();
}

function randomFill() {
  const b = view.builder;
  if (!b) return;
  const cells = b.boards[b.idx].cells;
  const used = cells.filter(Boolean);
  const left = shuffle(b.pool.filter((v) => !used.includes(v)));
  let k = 0;
  for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = left[k++] ?? null;
  sfx.check();
  render();
}

function clearBoard() {
  const b = view.builder;
  if (!b) return;
  b.boards[b.idx].cells = b.boards[b.idx].cells.map(() => null);
  sfx.tap();
  render();
}

function builderNext() {
  const b = view.builder;
  if (!b) return;
  const cells = b.boards[b.idx].cells;
  if (cells.some((v) => !v)) {
    sfx.error();
    toast('모든 칸을 채워 주세요.');
    return;
  }
  if (b.idx < b.boards.length - 1) {
    b.idx += 1;
    b.cover = b.mode === 'local' && settings.curtain;
    sfx.curtain();
    render();
    window.scrollTo(0, 0);
    return;
  }
  const built = b.boards.map((x) => x.cells.slice());
  view.builder = null;
  startMatch(built);
}

function saveCustom() {
  const err = validateEditor();
  if (err) { sfx.error(); toast(err); return; }
  const ed = readEditor();
  const name = ed.name || `커스텀 ${settings.size}×${settings.size}`;
  const existing = customs.find((c) => c.name === name && c.size === settings.size);
  const record = {
    id: existing?.id ?? Math.random().toString(36).slice(2, 10),
    name,
    size: settings.size,
    items: ed.items.slice(),
    savedAt: Date.now(),
  };
  customs = [record, ...customs.filter((c) => c.id !== record.id)].slice(0, 20);
  local.set('customs', customs);
  settings.customName = name;
  settings.customItems = ed.items.slice();
  local.set('settings', settings);
  sfx.check();
  toast(`‘${name}’ 보드를 저장했어요.`);
  render();
}

function useCustom() {
  const err = validateEditor();
  if (err) { sfx.error(); toast(err); return; }
  const ed = readEditor();
  settings.content = 'custom';
  settings.customItems = ed.items.slice();
  settings.customName = ed.name || '나의 빙고';
  local.set('settings', settings);
  view.modal = null;
  startAction();
}

/* ──────────────────────────── 이벤트 ──────────────────────────── */

function onAppClick(event) {
  const btn = event.target.closest?.('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  primeSound();

  switch (action) {
    case 'mode':
      settings.mode = btn.dataset.mode;
      local.set('settings', settings);
      sfx.tap();
      render();
      break;
    case 'set':
      setSetting(btn.dataset.key, btn.dataset.value);
      break;
    case 'start':
      startAction();
      break;
    case 'home':
      view.match = null;
      view.builder = null;
      view.host = null;
      view.modal = null;
      go('home');
      break;
    case 'restart':
      restartAction();
      break;
    case 'curtain-open':
      if (view.match) {
        view.match.curtainUp = false;
        sfx.curtain();
        render();
      }
      break;
    case 'call': {
      const m = view.match;
      if (!m || m.finished || m.thinking || m.curtainUp) return;
      const pi = Number(btn.dataset.player);
      if (pi !== m.turn) return;
      const p = m.players[pi];
      if (!p || p.isAI) return;
      const cell = Number(btn.dataset.cell);
      const value = p.board[cell];
      if (m.called.includes(value)) { sfx.error(); return; }
      callValue(value, pi);
      break;
    }
    case 'editor-open':
      openEditor();
      break;
    case 'editor-back':
      view.screen = 'home';
      render();
      break;
    case 'editor-sample': {
      const n = SIZE_CELLS[settings.size];
      view.editor.items = shuffle(THEMES.school.items).slice(0, n);
      sfx.tap();
      render();
      toast('학교·일상 예시 단어를 채웠어요.');
      break;
    }
    case 'editor-clear':
      view.editor.items = view.editor.items.map(() => '');
      sfx.tap();
      render();
      break;
    case 'editor-save':
      saveCustom();
      break;
    case 'editor-use':
      useCustom();
      break;
    case 'editor-load': {
      const found = customs.find((c) => c.id === btn.dataset.id);
      if (!found) return;
      if (settings.size !== found.size) {
        settings.size = found.size;
        local.set('settings', settings);
      }
      view.editor = { items: found.items.slice(0, SIZE_CELLS[found.size]), name: found.name };
      sfx.tap();
      render();
      break;
    }
    case 'editor-del': {
      const found = customs.find((c) => c.id === btn.dataset.id);
      if (!found) return;
      if (!window.confirm(`‘${found.name}’ 보드를 지울까요?`)) return;
      customs = customs.filter((c) => c.id !== found.id);
      local.set('customs', customs);
      render();
      break;
    }
    case 'build-place':
      placeValue(btn.dataset.value);
      break;
    case 'build-remove':
      if (view.builder) {
        view.builder.boards[view.builder.idx].cells[Number(btn.dataset.cell)] = null;
        sfx.tap();
        render();
      }
      break;
    case 'build-undo':
      undoPlace();
      break;
    case 'build-random':
      randomFill();
      break;
    case 'build-clear':
      clearBoard();
      break;
    case 'build-again': {
      const b = view.builder;
      if (!b) return;
      b.idx = 0;
      b.cover = false;
      b.boards = b.boards.map((x) => ({ ...x, cells: x.cells.map(() => null) }));
      render();
      break;
    }
    case 'build-next':
      builderNext();
      break;
    case 'build-reveal':
      if (view.builder) {
        view.builder.cover = false;
        sfx.curtain();
        render();
        window.scrollTo(0, 0);
      }
      break;
    case 'draw':
      hostDraw();
      break;
    case 'host-reset':
      if (view.host?.called.length && !window.confirm('지금까지 뽑은 기록을 지우고 처음부터 시작할까요?')) return;
      startHost();
      break;
    case 'modal-restart':
      restartAction();
      break;
    case 'modal-board':
      view.modal = null;
      sfx.tap();
      render();
      break;
    case 'show-result':
      if (view.match?.result) {
        view.modal = { ...view.match.result, confetti: false };
        sfx.tap();
        render();
      }
      break;
    case 'modal-home':
      view.modal = null;
      view.match = null;
      go('home');
      break;
    default:
      break;
  }
}

function onAppInput(event) {
  const t = event.target;
  if (t.matches('[data-name-input]')) {
    const i = Number(t.dataset.nameInput);
    settings.names[i] = t.value.slice(0, 10);
    local.set('settings', settings);
  } else if (t.matches('[data-editor-input]')) {
    view.editor.items[Number(t.dataset.editorInput)] = t.value;
  } else if (t.matches('[data-editor-name]')) {
    view.editor.name = t.value;
  }
}

function onAppChange(event) {
  const t = event.target;
  if (t.matches('[data-action="show-board"]')) {
    if (!view.host) return;
    view.host.showBoard = t.checked;
    sfx.tap();
    render();
  }
}

function onKeyDown(event) {
  if (event.key !== ' ' || view.screen !== 'host') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  event.preventDefault();
  hostDraw();
}

/* ──────────────────────────── 시작 ──────────────────────────── */

export function init() {
  applyTheme(local.get('theme', 'day') === 'night' ? 'night' : 'day');
  applySoundState(local.get('muted', false) !== true);

  const soundBtn = $('#btn-sound');
  const themeBtn = $('#btn-theme');
  soundBtn?.addEventListener('click', () => {
    const on = !soundOn();
    applySoundState(on);
    if (on) sfx.check();
  });
  themeBtn?.addEventListener('click', () => {
    const night = document.documentElement.dataset.theme === 'night';
    applyTheme(night ? 'day' : 'night');
    sfx.tap();
  });

  app.addEventListener('click', onAppClick);
  app.addEventListener('input', onAppInput);
  app.addEventListener('change', onAppChange);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', primeSound, { once: true });

  render();
}
