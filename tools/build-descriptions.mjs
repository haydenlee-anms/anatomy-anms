// Z-Anatomy 안에 들어있던 구조 설명글을 뷰어가 쓸 형태로 정리한다.
//
// 원본은 위키백과 문서를 다듬은 영문 글이고 통째로는 12.94MB 라 못 싣는다.
// 그래서:
//   1) 우리 모델에 실제로 있는 구조 것만 남긴다
//   2) 재활에 안 쓰는 절을 버린다 (역사·어원·다른 동물·사회문화·참고문헌 등)
//   3) "이는 곳 / 닿는 곳 / 신경지배" 문장을 본문에서 뽑아 따로 담는다
//
// 뽑는다 = 원문 문장을 그대로 옮긴다. 요약하거나 지어내지 않는다.
// 그래야 사용자가 원문과 대조해서 틀린 걸 잡아낼 수 있다.
//
// 주의할 함정 두 개 (실제로 걸렸다):
//   * 한 문서가 여러 구조를 덮는다. "Rectus femoris" 를 찾으면 대퇴사두근 문서가 나온다.
//     이러면 옆 근육 문장을 그 근육 것으로 착각한다. -> 문서 제목을 보고 걸러낸다
//   * Z-Anatomy 가 지골(phalanx) 28개에 고대 그리스 밀집대형(phalanx) 문서를 붙여놨다.
//     동음이의어 사고다. -> 버린다
import fs from 'node:fs';

const RAW = process.argv[2] || '/workspace/za_desc.json';
const OUT = process.argv[3] || 'public/descriptions.json';

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const structures = JSON.parse(fs.readFileSync('public/structures.json', 'utf8'));

// --- 이름 맞추기 -------------------------------------------------------
// Z-Anatomy 는 같은 구조를 "Psoas major" 로도 "Iliacus muscle" 로도 적는다.
// 변이 구조는 (Adductor minimus) 처럼 괄호로 감싼다.
const stripParens = (s) => s.replace(/^\((.*)\)$/, '$1').replace(/\s*\([^)]*\)\s*$/, '').trim();
const index = new Map();
for (const k of Object.keys(raw)) {
  for (const v of new Set([k, stripParens(k)])) {
    const l = v.toLowerCase();
    for (const cand of new Set([l, l.replace(/\s+muscle$/, ''), l + ' muscle'])) {
      if (!index.has(cand)) index.set(cand, k);
    }
  }
}
function lookup(en) {
  const l = en.toLowerCase(), s = stripParens(en).toLowerCase();
  return index.get(l) ?? index.get(s) ?? index.get(l.replace(/\s+muscle$/, ''))
      ?? index.get(l + ' muscle') ?? null;
}

// --- 절 나누기 ---------------------------------------------------------
// 원문은 위키백과식으로 == 제목 == 을 쓴다. = 개수가 들쭉날쭉해서 깊이는 무시한다.
// 실제 문서에 나온 제목을 전부 세어보고 만든 표다. 여기 없는 절은 버린다.
const KEEP = [
  [/^(structure|anatomy|description|overview|body|location|morphology|general characteristics)$/i, '구조'],
  [/^(origin and insertion|attachments?|muscle attachments|insertions?|origins?|parts)$/i, '부착'],
  [/^(function|functions|actions?|movements?)$/i, '기능'],
  [/^(nerve supply|innervation|nerve)$/i, '신경지배'],
  [/^(blood supply|arterial supply|vascular supply)$/i, '혈액공급'],
  [/^(relations?|articulations?|surfaces|borders)$/i, '위치관계'],
  [/^(variations?|variants?|congenital (anomalies|disorders))$/i, '변이'],
  [/^(clinical significance|clinical relevance|pathology|injur(y|ies)|fractures?|examination|treatment|palsy|diagnosis)$/i, '임상'],
];
// 재활에 안 쓰는 절. 하위 절에서도 이건 버린다.
const DROP = /^(history|name and history|etymology|(in )?other animals|(in )?animals|mammal evolution|society and culture|references?|external links|additional images|gallery|see also|notes?|training|exercises|development|ossification|imaging)$/i;
const ORDER = ['구조', '부착', '위치관계', '기능', '신경지배', '혈액공급', '변이', '임상'];
function label(title) {
  for (const [re, ko] of KEEP) if (re.test(title.trim())) return ko;
  return null;
}

// 문서 첫머리의 전부-대문자 줄이 그 문서의 실제 제목이다.
function titleOf(body) {
  for (const ln of body.split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    if (t === t.toUpperCase() && /[A-Z]/.test(t)) return t;
    return null;
  }
  return null;
}

// 하위 절(=== X ===)은 제 이름이 표에 없으면 상위 절의 이름을 물려받는다.
// 안 그러면 광배근처럼 == Structure == 아래 내용이 전부 === Variations === 안에
// 들어있는 문서에서 본문을 통째로 잃는다. 단, DROP 에 걸리면 물려받지 않고 버린다.
function split(body) {
  const secs = [];
  let cur = { ko: null, lines: [] };
  const stack = [];                       // 깊이별 물려줄 이름
  for (const ln of body.split(/\r?\n/)) {
    const m = ln.match(/^(=+)\s*(.+?)\s*=+$/);
    if (!m) { cur.lines.push(ln); continue; }
    secs.push(cur);
    const depth = Math.max(1, m[1].length - 1), title = m[2];
    const own = label(title);
    const parent = stack[depth - 2] ?? null;
    const ko = DROP.test(title.trim()) ? null : (own ?? (depth > 1 ? parent : null));
    stack[depth - 1] = ko;
    stack.length = depth;
    cur = { ko, lines: [] };
  }
  secs.push(cur);
  return secs;
}

const clean = (ls) => ls.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').trim();

// 앞머리에서 제목 줄과 위키백과 링크를 떼어낸다.
function lead(text) {
  const ls = text.split('\n');
  while (ls.length && (!ls[0].trim() || (ls[0] === ls[0].toUpperCase() && /[A-Z]/.test(ls[0])))) ls.shift();
  return ls.join('\n').replace(/^https?:\/\/\S+$/gm, '').trim();
}

// --- 부착부·신경지배 문장 뽑기 -----------------------------------------
//
// 낱말을 두 등급으로 나눈다. 위 등급에서 하나라도 나오면 아래는 안 쓴다.
// 이유: "attached to the second sacral vertebra" 는 사실 이는 곳 얘기인데
// attach 만 보고 고르면 닿는 곳으로 들어간다. insert 가 있으면 그게 맞다.
const ORIGIN = {
  any:   /\b(originat\w*|arise[sn]?|arising)\b/i,
  place: /\b(originates?|originating|arises?|arising)\s+(?:\w+\s+){0,2}?(from|on|at|in|by)\b/i,
};
const INSERT = {
  any:   /\b(inserts?|inserted|inserting|insertion|attach(?:ed|es|ment|ments)?)\b/i,
  place: /\b(inserts?|inserted|inserting)\s+(?:\w+\s+){0,2}?(on|onto|into|in|at|to)\b/i,
};
const NERVE = {
  any:   /\b(innervat\w*|nerve supply|supplied by)\b/i,
  place: /\b(is innervated by|innervated by|nerve supply (?:is|of))\b/i,
};
// 부착 위치를 말하는 게 아니라 딴소리하는 문장
const NOISE = /\b(remembered|mnemonic|acronym|compared (?:to|with)|in contrast|unlike the)\b/i;
// Z-Anatomy 가 '근육' 으로 묶어놨지만 살덩이가 아닌 것. 이는곳/닿는곳을 뽑지 않는다.
const NOT_BELLY = /\b(bursa|bursae|sheath|fascia|retinaculum|septum|septa|aponeurosis|raphe|trochlea|tract|ring|arch|tarsus)\b/i;

function sentences(text) {
  // "…inserts on the:" 뒤에 붙는 항목 나열을 한 문장으로 합친다.
  // 안 그러면 "The semimembranosus muscle inserts on the:" 만 남아 쓸모가 없다.
  const joined = [];
  for (const ln of text.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
    const item = /^[•\-*·]/.test(ln);
    if (item && joined.length && /[:：]$/.test(joined[joined.length - 1])) {
      joined[joined.length - 1] += ' ' + ln.replace(/^[•\-*·]\s*/, '');
    } else if (item && joined.length && /[,;]$/.test(joined[joined.length - 1])) {
      joined[joined.length - 1] += ' ' + ln.replace(/^[•\-*·]\s*/, '');
    } else joined.push(ln);
  }
  return joined
    .flatMap((p) => p.split(/(?<=[.;])\s+(?=[A-Z(])/))
    // 마침표 뒤에 띄어쓰기를 빼먹은 곳이 꽤 있다 ("...described.The supraspinatus...")
    .flatMap((p) => p.split(/(?<=[a-z)])\.(?=[A-Z][a-z])/).map((x, i, a) => i < a.length - 1 ? x + '.' : x))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 25 && s.length < 500 && !/^https?:/.test(s));
}

// 후보 문장에 점수를 매겨 좋은 순으로 3개까지 고른다.
//   +2  그 구조 이름이 문장에 나온다  (옆 근육 설명을 집어오는 걸 막는다)
//   +1  "inserts on / arises from" 처럼 붙는 자리를 실제로 말한다
// 문서가 여러 구조를 묶어 다루면 이름이 나온 문장만 쓴다. 아니면 오답이 섞인다.
function pick(text, kind, { exclude, name, strict } = {}) {
  const seen = new Set(), cand = [];
  for (const s of sentences(text)) {
    if (!kind.any.test(s)) continue;
    if (NOISE.test(s)) continue;
    if (exclude && exclude(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    const named = name ? name.test(s) : false;
    if (strict && !named) continue;
    cand.push({ s, score: (named ? 2 : 0) + (kind.place.test(s) ? 1 : 0) });
  }
  return cand
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .map((c) => c.s);
}

// 문서가 다른 구조 것일 때, 그 구조 이름이 들어간 문장만 쓴다.
// "Rectus femoris muscle" -> /rectus femoris/  (muscle·of·the 같은 흔한 말은 뺀다)
const STOP = /\b(muscle|muscles|of|the|part|head|portion|belly|left|right|superficial|deep)\b/gi;
function nameRe(en) {
  const core = stripParens(en).replace(STOP, ' ').replace(/\s+/g, ' ').trim();
  if (core.length < 4) return null;
  return new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// "Inferior head of lateral pterygoid muscle" 같은 조각 이름은 늘 부모 문서에 얹혀 있다.
// 부모 문서에는 형제 조각 설명도 같이 있어서, 이름만 보고 고르면 옆 갈래 걸 집어온다.
// 그래서 방향을 나타내는 낱말이 문장에 있어야만 쓴다. 위키백과가 쓰는 동의어까지 본다.
const SYN = {
  inferior: ['inferior', 'lower'], superior: ['superior', 'upper'],
  lower: ['lower', 'inferior'], upper: ['upper', 'superior'],
};
function partRe(en) {
  const m = stripParens(en).match(/^(.*?)\s+(?:heads?|parts?|portions?|bell(?:y|ies)|layers?|fib(?:er|re)s)\s+of\b/i);
  if (!m) return null;
  const mod = m[1].toLowerCase().trim().split(/\s+/).pop();
  if (!/^[a-z-]{3,}$/.test(mod)) return null;
  const alts = SYN[mod] || [mod];
  return new RegExp(`\\b(${alts.join('|')})\\b`, 'i');
}

// --- 만들기 ------------------------------------------------------------
const wanted = new Map();   // 영문명 -> 종류 (좌우 중복 제거)
for (const s of structures) if (!s.부착구분) wanted.set(s.영문명, s.종류);

const out = {};
const stat = { 문서없음: 0, 동음이의어버림: 0, 공용문서: 0, 이는곳: 0, 닿는곳: 0, 신경지배: 0 };

for (const [en, kind] of wanted) {
  const key = lookup(en);
  if (!key) { stat.문서없음++; continue; }
  const body = raw[key];

  // 동음이의어 사고: 지골에 붙은 고대 그리스 밀집대형 문서
  if (/\b(military formation|hoplite|phalangite)\b/i.test(body)) { stat.동음이의어버림++; continue; }

  const docTitle = titleOf(body);
  // 문서 제목이 이 구조 이름과 다르면 = 여러 구조를 묶어 다루는 문서다
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const shared = docTitle ? !norm(docTitle).includes(norm(stripParens(en)).slice(0, 14)) : false;

  const rec = { 원문키: key, 절: {} };
  if (shared) { rec.원문제목 = docTitle; stat.공용문서++; }

  let intro = '', attachText = '';
  let first = true;
  for (const sec of split(body)) {
    const txt = clean(sec.lines);
    if (first) { first = false; intro = lead(txt); continue; }   // 절 제목 앞의 앞머리
    if (!txt || !sec.ko) continue;
    if (sec.ko === '구조' || sec.ko === '부착') attachText += txt + '\n';
    rec.절[sec.ko] = rec.절[sec.ko] ? rec.절[sec.ko] + '\n' + txt : txt;
  }
  if (intro) rec.설명 = intro;
  // 화면에 보여줄 순서로 다시 담는다
  rec.절 = Object.fromEntries(ORDER.filter((k) => rec.절[k]).map((k) => [k, rec.절[k]]));

  // 근육 살덩이일 때만 부착부를 뽑는다.
  // 뼈 설명의 "attached to" 는 방향이 반대라 헷갈리고,
  // 근막·건초·점액낭은 Z-Anatomy 가 근육으로 묶어놨지만 이는곳/닿는곳이 없다.
  if (kind === '근육' && !NOT_BELLY.test(en)) {
    const src = (intro + '\n' + attachText).trim();
    const sub = partRe(en);
    const opt = { name: sub || nameRe(en), strict: shared || !!sub };
    // 이는 곳만 말하는 문장은 닿는 곳 목록에서 뺀다 (둘 다 말하면 양쪽에 둔다)
    const onlyOrigin = (s) => ORIGIN.place.test(s) && !INSERT.any.test(s);
    const o = pick(src, ORIGIN, opt);
    // 이는 곳으로 이미 쓴 문장은, 닿는 곳을 진짜로 말하지 않는 한 뺀다.
    // 안 그러면 "arises … attached …" 한 문장이 양쪽에 똑같이 걸린다.
    const i = pick(src, INSERT, { ...opt, exclude: onlyOrigin })
      // "…as high as the insertion of the gluteus maximus" 처럼 남의 닿는 곳을
      // 스쳐 말한 문장이 있어서, insert 라는 낱말만으로는 부족하다. 자리를 말해야 한다.
      .filter((s) => !o.includes(s) || INSERT.place.test(s));
    const n = pick((rec.절.신경지배 || '') + '\n' + src, NERVE, opt);
    if (o.length) { rec.이는곳 = o; stat.이는곳++; }
    if (i.length) { rec.닿는곳 = i; stat.닿는곳++; }
    if (n.length) { rec.신경지배 = n; stat.신경지배++; }
  }

  if (rec.설명 || Object.keys(rec.절).length) out[en] = rec;
}

fs.writeFileSync(OUT, JSON.stringify(out) + '\n');

const muscles = [...wanted].filter(([, k]) => k === '근육').length;
console.log(`구조 ${wanted.size}종 중 설명 붙은 것 ${Object.keys(out).length}종`);
console.log(`  근육 ${muscles}종 중  이는곳 ${stat.이는곳} / 닿는곳 ${stat.닿는곳} / 신경지배 ${stat.신경지배}`);
console.log(`  문서 없음 ${stat.문서없음} · 동음이의어 버림 ${stat.동음이의어버림} · 여러 구조 공용 문서 ${stat.공용문서}`);
console.log(`  ${OUT}  ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
