// 전신 structures.json 생성.
//
// 구조가 121개에서 2천 개대로 늘어나 손으로 적는 방식이 불가능해졌다.
// 그래서 자동 생성하고, 값마다 출처를 남긴다:
//   원본(Z-Anatomy)  구조 이름·계통·부위. 그대로 가져옴
//   원본(TA2)        라틴명. Terminologia Anatomica 2 에서 이름으로 맞춤
//   측정(형상)       좌/우. 이름 접미사(.l/.r)에서 읽음
//   추정             한글명·depth. 아래 표에 있는 것만 채우고 나머지는 비운다
//
// 한글명을 지어내지 않는 이유: 2천 개를 지어내면 틀린 걸 사용자가 못 잡아낸다.
// 표에 있는 것만 채우고, 없으면 null 로 두고 뷰어가 영문·라틴명을 보여준다.
import fs from 'node:fs';
import path from 'node:path';

const IN = process.argv[2] || '/workspace/za_full';
const OUT = process.argv[3] || 'public/structures.json';

// --- TA2 (Terminologia Anatomica 2) ------------------------------------
const ta2 = new Map();
for (const l of fs.readFileSync('/workspace/z-anatomy/models-of-human-anatomy/TA2.csv', 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue;
  const c = l.replace(/^﻿/, '').replace(/^"|"$/g, '').split(';');
  if (c.length < 3 || c[0] === 'TA2ID') continue;
  const en = (c[1] || '').trim().toLowerCase(), la = (c[2] || '').trim();
  if (en && la && !ta2.has(en)) ta2.set(en, la);
}

// --- 지금까지 사람이 확인한 한글명 (골반·고관절·요추) --------------------
// 여기 없는 구조는 한글명을 비워둔다. 지어내지 않는다.
const KO = JSON.parse(fs.readFileSync('tools/ko-names.json', 'utf8'));

// Z-Anatomy 이름 규칙 (실제 데이터에서 확인):
//   .l / .r          좌 / 우
//   .ol / .or        그 근육이 "이는 곳"(origin) 표시. 뼈 위에 칠해져 있다
//   .el / .er        "닿는 곳"(insertion) 표시. 번호가 붙기도 한다 (.e18l 등)
//   .i / .j          형체 없는 라벨 위치점. 애초에 걸러진다
function parseName(raw) {
  const m = raw.match(/^(.*)\.([a-z]\d*[a-z]?)$/);
  if (!m) return { base: raw, side: null, kind: null };
  const tag = m[2];
  const side = tag.endsWith('l') ? '좌' : tag.endsWith('r') ? '우' : null;
  const kind = /^o/.test(tag) ? '이는곳' : /^e/.test(tag) ? '닿는곳' : null;
  return { base: m[1], side, kind };
}
// 한글명 표는 BodyParts3D 이름 기준이라 " muscle" 이 안 붙어 있다
const koKey = (base) => base.toLowerCase().replace(/\s+muscle$/, '').trim();

const SYS_DEPTH = { '뼈': 0, '부착부': 0, '관절·인대': 1, '신경': 1, '근육': 2 };

const out = [];
for (const f of fs.readdirSync(IN).filter(x => x.endsWith('.json'))) {
  const grp = f.replace('.json', '');
  const meta = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  for (const s of meta.structures) {
    const { base, side, kind } = parseName(s.name);
    const key = base.toLowerCase();
    const la = ta2.get(key) || ta2.get(key + ' muscle') || null;
    const ko = KO[koKey(base)] || null;
    const suffix = [kind, side].filter(Boolean).join(' ');

    out.push({
      meshName: s.name,
      한글명: ko ? (suffix ? `${ko} ${suffix}` : ko) : null,
      영문명: base,
      라틴명: la,
      종류: s.system,
      부착구분: kind,                       // 부착부일 때 이는곳/닿는곳
      depth: SYS_DEPTH[s.system] ?? 2,
      부위: grp,
      세부부위: s.region,
      좌우: side,
      출처: {
        영문명: '원본(Z-Anatomy)',
        라틴명: la ? '원본(TA2)' : '없음',
        종류: '원본(Z-Anatomy 계통 분류)',
        부위: '원본(Z-Anatomy 부위 분류)',
        좌우: side ? '원본(이름 접미사)' : '해당없음',
        한글명: ko ? '추정(사람이 확인함)' : '없음',
        depth: '추정(계통 기준 일괄 배정)',
      },
    });
  }
}

out.sort((a, b) => a.부위.localeCompare(b.부위) || a.영문명.localeCompare(b.영문명));
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');

const byGrp = {}, bySys = {};
let koN = 0, laN = 0;
for (const o of out) {
  byGrp[o.부위] = (byGrp[o.부위] || 0) + 1;
  bySys[o.종류] = (bySys[o.종류] || 0) + 1;
  if (o.한글명) koN++;
  if (o.라틴명) laN++;
}
console.log(`구조 ${out.length}개 → ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB)`);
console.log(`  부위별: ${JSON.stringify(byGrp)}`);
console.log(`  계통별: ${JSON.stringify(bySys)}`);
console.log(`  라틴명 있음: ${laN} (${(laN / out.length * 100).toFixed(0)}%)`);
console.log(`  한글명 있음: ${koN} (${(koN / out.length * 100).toFixed(0)}%)  ← 나머지는 영문·라틴명으로 표시`);
