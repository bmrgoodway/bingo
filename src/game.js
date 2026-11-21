// 빙고 규칙만 모은 파일 (화면 코드 없음).
// 보드는 한 줄짜리 배열(values)이고, 칸 번호는 0 … size*size-1 (왼쪽 위부터 오른쪽으로).

export function randomInt(n, rnd = Math.random) {
  return Math.floor(rnd() * n);
}

export function shuffle(list, rnd = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rnd);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LINE_CACHE = new Map();

/** 가로·세로·대각선 모든 줄 (칸 번호 배열의 배열) */
export function linesOf(size) {
  if (LINE_CACHE.has(size)) return LINE_CACHE.get(size);
  const out = [];
  for (let r = 0; r < size; r++) out.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push(Array.from({ length: size }, (_, r) => r * size + c));
  out.push(Array.from({ length: size }, (_, i) => i * size + i));
  out.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  LINE_CACHE.set(size, out);
  return out;
}

/** 완성된 줄들의 인덱스 목록 */
export function completedLines(marked, size) {
  const out = [];
  linesOf(size).forEach((line, i) => { if (line.every((cell) => marked[cell])) out.push(i); });
  return out;
}

export function makeBoard(items) {
  return shuffle(items);
}

export function emptyMarks(n) {
  return new Array(n).fill(false);
}

/** 한 칸이 몇 개 줄의 완성에 얼마나 가까운지 점수 */
function cellScore(index, marked, size) {
  let score = 0;
  for (const line of linesOf(size)) {
    if (!line.includes(index)) continue;
    let have = 0;
    for (const cell of line) if (marked[cell]) have++;
    if (have === size - 1) score += 100;       // 지금 부르면 한 줄 완성
    else if (have === size - 2) score += 24;   // 한 칸만 더
    else if (have === size - 3) score += 6;
    else score += have * 0.8;
  }
  return score;
}

/**
 * AI가 부를 칸을 고릅니다.
 * - 쉬움: 대부분 아무거나, 가끔(22%) 좋은 수
 * - 보통: 68% 좋은 수, 나머지 아무거나
 * - 어려움: 항상 가장 좋은 수. 상대도 같이 좋아지는 수는 감점(견제).
 * returns 칸 번호 또는 -1
 */
export function aiChoose({ board, marked, opponent, difficulty = 'normal', rnd = Math.random }) {
  const open = [];
  for (let i = 0; i < board.length; i++) if (!marked[i]) open.push(i);
  if (!open.length) return -1;

  const smartChance = difficulty === 'easy' ? 0.22 : difficulty === 'normal' ? 0.68 : 1;
  if (rnd() > smartChance) return open[randomInt(open.length, rnd)];

  const size = Math.round(Math.sqrt(board.length));
  const oppMarked = opponent?.marked ?? [];
  const oppIndex = new Map();
  (opponent?.board ?? []).forEach((value, i) => oppIndex.set(value, i));

  let best = open[0];
  let bestScore = -Infinity;
  for (const i of open) {
    let score = cellScore(i, board.map((v, k) => (k === i ? true : marked[k])), size);
    // 이 칸을 부르면 상대도 표시되므로, 상대가 얼마나 이득인지 보고 견제
    const j = oppIndex.get(board[i]);
    if (j != null && !oppMarked[j]) {
      const oppGain = cellScore(j, oppMarked.map((v, k) => (k === j ? true : v)), size);
      const weight = difficulty === 'hard' ? 0.85 : difficulty === 'normal' ? 0.35 : 0.1;
      score -= oppGain * weight;
    }
    score += rnd() * 3; // 같은 점수면 무작위로
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** 어떤 값이 보드에서 차지하는 칸 번호 */
export function indexOfValue(board, value) {
  return board.indexOf(value);
}

/** 이 값이 지금 불리면 이 보드에 변화가 생기는가 */
export function marksFor(board, marked, value) {
  return board.reduce((n, v, i) => (v === value && !marked[i] ? n + 1 : n), 0);
}
