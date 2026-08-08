// structures.json 생성.
//
// 값의 출처를 3가지로 구분해서 각 항목의 `출처` 필드에 남긴다:
//   원본  = BodyParts3D / TA2 에서 그대로 가져온 것 (검증됨)
//   측정  = 3D 형상에서 계산한 것 (좌우 판정, 묻힘 정도)
//   추정  = Claude의 해부학 지식 (사용자 검수 필요)
import fs from 'node:fs';

const ids = fs.readFileSync('tools/region_ids.txt', 'utf8').trim().split(/\s+/);
const meta = JSON.parse(fs.readFileSync('/workspace/jixiangying/anatomy/data/anatomy_data_simple_refined.json', 'utf8'));
const nameOf = {}; for (const l of Object.values(meta)) for (const it of l) nameOf[it.id] = it.nameEn;
for (const ex of JSON.parse(fs.readFileSync('tools/extra-structures.json', 'utf8'))) nameOf[ex.id] = ex.nameEn;

// 대부분은 BodyParts3D 3.0 전체판으로 통일했다 (tools/stl-jobs.json).
// 전체판에 STL이 없어 4.0 ISA판을 그대로 쓰는 것만 따로 표시한다.
const FROM_30 = new Set(JSON.parse(fs.readFileSync('tools/stl-jobs.json', 'utf8')).map(j => j.id));
const burial = Object.fromEntries(JSON.parse(fs.readFileSync('/tmp/burial.json', 'utf8')).map(r => [r.id, r]));
const sides = Object.fromEntries(JSON.parse(fs.readFileSync('/tmp/sides.json', 'utf8')).map(r => [r.id, r]));

// --- TA2 (Terminologia Anatomica 2) 라틴명 ------------------------------
const ta2 = new Map();
for (const l of fs.readFileSync('/workspace/z-anatomy/models-of-human-anatomy/TA2.csv', 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue;
  const c = l.replace(/^﻿/, '').replace(/^"|"$/g, '').split(';');
  if (c.length < 3 || c[0] === 'TA2ID') continue;
  const en = (c[1] || '').trim().toLowerCase(), la = (c[2] || '').trim();
  if (en && la && !ta2.has(en)) ta2.set(en, la);
}
// 어순이 달라 자동으로 안 붙는 것들. TA2 안에 실제로 있는 행을 손으로 지목한 것이라 출처는 '원본'.
const TA2_ALIAS = {
  'gemellus superior': 'superior gemellus muscle',
  'gemellus inferior': 'inferior gemellus muscle',
  'adductor minimus': '(adductor minimus)',
  'lumbar rotator': '(rotatores lumborum)',
  'lateral lumbar intertransversarius': 'lateral intertransversarii lumborum muscles',
  'medial lumbar intertransversarius': 'medial intertransversarii lumborum muscles',
  // 3.0판 메쉬는 다열근 전체(천골~경추)라 부위별 항목이 아니라 총칭을 쓴다
  'multifidus': 'multifidus muscles',
  // Z-Anatomy는 부위를 더 잘게 나눠 놓았다. TA2에는 상위 항목만 있어서 그쪽으로 연결한다.
  'descending part of iliofemoral ligament': 'iliofemoral ligament',
  'transverse part of iliofemoral ligament': 'iliofemoral ligament',
  'anterior layer of thoracolumbar fascia': 'thoracolumbar fascia',
  'middle layer of thoracolumbar fascia': 'thoracolumbar fascia',
  'posterior layer of thoracolumbar fascia': 'thoracolumbar fascia',
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'], ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

function core(en) {
  return en.toLowerCase().replace(/\b(right|left)\b/g, '')
    .replace(/^(long|short|oblique|transverse)\s+head\s+of\s+/, '')
    .replace(/\s+/g, ' ').trim();
}
// TA2에 아예 항목이 없는 것. TA2는 치골직장근을 항문거근에 포함시켜 따로 싣지 않는다.
// 아래 값은 Claude가 채운 것이므로 출처를 '추정'으로 표시한다.
const LATIN_GUESS = { 'puborectalis': 'Musculus puborectalis' };

function latin(c) {
  const tries = [TA2_ALIAS[c], c, c + ' muscle'];
  const m = c.match(/^(first|second|third|fourth|fifth) lumbar vertebra$/);
  if (m) tries.push('lumbar vertebra ' + ROMAN[ORD[m[1]]], 'lumbar vertebrae');
  if (/^intervertebral disk of/.test(c)) tries.push('intervertebral disc', 'intervertebral disk');
  for (const t of tries) if (t && ta2.has(t)) return { la: ta2.get(t), src: '원본(TA2)' };
  if (LATIN_GUESS[c]) return { la: LATIN_GUESS[c], src: '추정(TA2에 없음)' };
  return { la: null, src: '없음' };
}

// --- 한글명 / 깊이 / 부위 ----------------------------------------------
// depth: 0 뼈 · 1 심부근육 · 2 중간층 · 3 표층
// 검수: "확실" = 표준 용어이고 층 구분도 명확 / "검수" = 사용자가 봐줘야 함
const T = {
  // 뼈·관절 (depth 0)
  'first lumbar vertebra':  ['제1요추', 0, '요추', '확실'],
  'second lumbar vertebra': ['제2요추', 0, '요추', '확실'],
  'third lumbar vertebra':  ['제3요추', 0, '요추', '확실'],
  'fourth lumbar vertebra': ['제4요추', 0, '요추', '확실'],
  'fifth lumbar vertebra':  ['제5요추', 0, '요추', '확실'],
  'intervertebral disk of first lumbar vertebra':  ['제1요추 추간판', 0, '요추', '확실'],
  'intervertebral disk of second lumbar vertebra': ['제2요추 추간판', 0, '요추', '확실'],
  'intervertebral disk of third lumbar vertebra':  ['제3요추 추간판', 0, '요추', '확실'],
  'intervertebral disk of fourth lumbar vertebra': ['제4요추 추간판', 0, '요추', '확실'],
  'intervertebral disk of fifth lumbar vertebra':  ['제5요추 추간판', 0, '요추', '확실'],
  'sacrum':   ['천골', 0, '골반', '확실'],
  'hip bone': ['관골(볼기뼈)', 0, '골반', '확실'],
  'femur':    ['대퇴골', 0, '고관절', '확실'],

  // 골반저근 (depth 1) — 전부 골반 안쪽 깊은 층
  'coccygeus':      ['미골근', 1, '골반', '확실'],
  'iliococcygeus':  ['장골미골근', 1, '골반', '확실'],
  'pubococcygeus':  ['치골미골근', 1, '골반', '확실'],
  'puborectalis':   ['치골직장근', 1, '골반', '확실'],
  'tendinous arch of levator ani': ['항문거근 건궁', 1, '골반', '검수'],

  // 고관절 심부 회전근 (depth 1)
  'piriformis':         ['이상근', 1, '고관절', '확실'],
  'obturator internus': ['내폐쇄근', 1, '고관절', '확실'],
  'obturator externus': ['외폐쇄근', 1, '고관절', '확실'],
  'gemellus superior':  ['상쌍자근', 1, '고관절', '검수'],
  'gemellus inferior':  ['하쌍자근', 1, '고관절', '검수'],
  'quadratus femoris':  ['대퇴방형근', 1, '고관절', '확실'],
  'gluteus minimus':    ['소둔근', 1, '고관절', '확실'],
  'psoas major':        ['대요근', 1, '고관절', '확실'],
  'iliacus':            ['장골근', 1, '고관절', '확실'],

  // 요추 심부 (depth 1)
  'quadratus lumborum': ['요방형근', 1, '요추', '확실'],
  'multifidus':         ['다열근', 1, '요추', '확실'],
  'lumbar rotator':                    ['요회선근', 1, '요추', '검수'],
  'lateral lumbar intertransversarius': ['외측 요횡돌기간근', 1, '요추', '검수'],
  'medial lumbar intertransversarius':  ['내측 요횡돌기간근', 1, '요추', '검수'],

  // 중간층 (depth 2)
  'gluteus medius':      ['중둔근', 2, '고관절', '확실'],
  'adductor magnus':     ['대내전근', 2, '고관절', '확실'],
  'adductor minimus':    ['소내전근', 2, '고관절', '검수'],
  'adductor brevis':     ['단내전근', 2, '고관절', '확실'],
  'pectineus':           ['치골근', 2, '고관절', '확실'],
  'semimembranosus':     ['반막양근', 2, '고관절', '확실'],
  'iliocostalis lumborum': ['요장늑근', 2, '요추', '확실'],
  'iliocostalis thoracis': ['흉장늑근', 2, '요추', '검수'],
  'longissimus thoracis':  ['흉최장근', 2, '요추', '검수'],

  // 인대·근막 — BodyParts3D에는 이 둘뿐이라, 나머지는 Z-Anatomy에서 가져왔다
  'inguinal ligament':   ['서혜인대', 2, '골반', '확실'],
  'iliotibial tract':    ['장경인대(장경대)', 3, '고관절', '확실'],

  // 아래는 Z-Anatomy 출처 (체형교정에 필요하다는 사용자 요청)
  'sacrotuberous ligament':            ['천결절인대', 1, '골반', '확실'],
  'sacrospinous ligament':             ['천극인대', 1, '골반', '확실'],
  'iliolumbar ligament':               ['장요인대', 1, '요추', '확실'],
  'anterior sacro-iliac ligament':     ['전천장인대', 1, '골반', '확실'],
  'posterior sacro-iliac ligament':    ['후천장인대', 1, '골반', '확실'],
  'interosseous sacro-iliac ligament': ['골간천장인대', 1, '골반', '확실'],
  'descending part of iliofemoral ligament':  ['장골대퇴인대 하행부', 1, '고관절', '검수'],
  'transverse part of iliofemoral ligament':  ['장골대퇴인대 횡부', 1, '고관절', '검수'],
  'pubofemoral ligament':              ['치골대퇴인대', 1, '고관절', '확실'],
  'ischiofemoral ligament':            ['좌골대퇴인대', 1, '고관절', '확실'],
  'obturator membrane':                ['폐쇄막', 1, '골반', '확실'],
  'anterior layer of thoracolumbar fascia':  ['흉요근막 전층', 1, '요추', '확실'],
  'middle layer of thoracolumbar fascia':    ['흉요근막 중간층', 2, '요추', '확실'],
  'posterior layer of thoracolumbar fascia': ['흉요근막 후층', 3, '요추', '확실'],

  // 표층 (depth 3)
  'gluteus maximus':     ['대둔근', 3, '고관절', '확실'],
  'tensor fasciae latae': ['대퇴근막장근', 3, '고관절', '확실'],
  'sartorius':           ['봉공근', 3, '고관절', '확실'],
  'rectus femoris':      ['대퇴직근', 3, '고관절', '확실'],
  'biceps femoris':      ['대퇴이두근', 3, '고관절', '확실'],
  'semitendinosus':      ['반건양근', 3, '고관절', '확실'],
  'adductor longus':     ['장내전근', 3, '고관절', '확실'],
  'gracilis':            ['박근', 3, '고관절', '확실'],
};
// 대퇴이두근은 장두/단두가 층이 다르다
const HEAD_KO = { long: '장두', short: '단두' };

// 형상 측정과 Claude의 depth 추정이 어긋난 3종. 사용자가 판단해야 함.
const CONFLICT = {
  'psoas major':
    'depth=1(심부)로 뒀으나 형상 측정은 0.8로 얕게 나옴. 대요근을 앞에서 덮는 복벽·복강 장기가 ' +
    '이 85개 목록에 없어서 생긴 착시로 판단함. depth=1이 맞다고 보나 확인 바람.',
  'quadratus femoris':
    'depth=1(심부 외회전근)로 뒀으나 형상 측정은 0.9로 얕게 나옴. 대둔근 하연에 걸쳐 있어 ' +
    '덮이는 정도가 부위마다 다름. 경계 사례. depth=2로 볼 여지 있음.',
  'gracilis':
    'depth=3(표층)으로 뒀으나 형상 측정은 1.34로 깊게 나옴. 측정 방식이 "몸통 중심에서 바깥쪽"으로 ' +
    '광선을 쏘는데, 허벅지 안쪽 근육은 그 방향이 반대쪽 다리를 향해서 잘못 측정됨. ' +
    'depth=3이 맞다고 보나 확인 바람.',
};

const out = [], unmatched = [];
for (const id of ids) {
  const en = nameOf[id] || id;
  const c = core(en);
  const t = T[c];
  if (!t) { unmatched.push({ id, en, c }); continue; }
  let [ko, depth, region, check] = t;

  // 대퇴이두근 장두/단두 분리
  const h = en.toLowerCase().match(/^(long|short) head of/);
  if (h) { ko += ' ' + HEAD_KO[h[1]]; if (h[1] === 'short') depth = 2; }

  const b = burial[id], s = sides[id];
  const la = latin(c);
  // 뼈 / 근육 / 인대·근막 — 뷰어에서 색을 나눠 칠하는 데 쓴다
  const 종류 = depth === 0 ? '뼈'
    : /ligament|iliotibial tract|tendinous arch|fascia|membrane/.test(c) ? '인대·근막' : '근육';

  const item = {
    meshName: id,
    한글명: ko + (s && s.side !== '정중' ? ` (${s.side})` : ''),
    라틴명: la.la,
    종류,
    depth,
    region,
    좌우: s ? s.side : null,
    nameEn: en,
    출처: {
      // 2026-08-08 사용자가 한글명과 depth를 검수 없이 승인함 ("맞다고 쳐")
      한글명: check === '확실' ? '추정(표준용어)' : '추정(사용자 승인)',
      라틴명: la.src,
      depth: '추정+측정',
      좌우: '측정(형상)',
      nameEn: '원본(BodyParts3D)',
    },
    묻힘정도: b ? b.mean : null,
  };
  // 형상 측정과 내 추정이 어긋난 것. 왜 어긋났는지 이유를 남긴다.
  if (CONFLICT[c]) item.검수요망 = CONFLICT[c];
  // 어느 자료에서 온 메쉬인지 표시
  if (id.startsWith('ZA_')) {
    item.출처.nameEn = '원본(Z-Anatomy, CC BY-SA 4.0)';
    item.판본주의 = 'BodyParts3D에 없는 인대·근막이라 Z-Anatomy에서 가져옴. ' +
      '두 자료의 좌표를 맞추려고 공통 구조 9개로 축별 배율·이동을 계산해 적용했고, ' +
      '그 9개의 평균 오차는 3.9mm였음. 이 구조도 그 정도 어긋날 수 있음.';
  } else if (FROM_30.has(id)) {
    item.출처.nameEn = '원본(BodyParts3D 3.0 전체판)';
  } else {
    item.출처.nameEn = '원본(BodyParts3D 4.0 ISA판)';
    item.판본주의 = '3.0 전체판에 이 구조의 STL이 없어 4.0 ISA판 메쉬를 그대로 씀. ' +
      '나머지는 3.0 전체판으로 통일되어 있어, 이 구조만 위치가 10mm 안팎 어긋날 수 있음.';
  }
  out.push(item);
}

out.sort((a, b) => a.depth - b.depth || a.region.localeCompare(b.region) || a.한글명.localeCompare(b.한글명));

if (unmatched.length) {
  console.error(`\n!! 한글명 표에 없는 구조 ${unmatched.length}개:`);
  unmatched.forEach(u => console.error(`   ${u.id.padEnd(9)} ${u.en}  [${u.c}]`));
}
const noLatin = out.filter(o => !o.라틴명);
console.log(`구조 ${out.length}개 생성`);
console.log(`라틴명 없음: ${noLatin.length}개 ${noLatin.map(o => o.meshName).join(', ')}`);
const byDepth = {};
for (const o of out) byDepth[o.depth] = (byDepth[o.depth] || 0) + 1;
console.log(`깊이별: ${JSON.stringify(byDepth)}`);
const check = out.filter(o => o.출처.한글명 === '추정(검수요망)');
console.log(`한글명 검수 필요: ${check.length}개`);

fs.writeFileSync('public/structures.json', JSON.stringify(out, null, 2) + '\n');
console.log('→ public/structures.json');
