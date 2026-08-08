// BodyParts3D 3.0판 STL을 4.0판 ISA 세트와 같은 밀도의 .obj로 변환한다.
//
// 왜 필요한가: 우리가 쓰는 ISA 세트(4.0판)에는 요방형근과 다열근이 빠져 있다.
// 전체판(3.0판)에는 있지만 메쉬가 7~14배 조밀해서 그대로 넣으면 모델이 무거워진다.
//
// 주의: 3.0판과 4.0판은 좌표계는 같지만 메쉬가 재작업되어 같은 근육도
// 무게중심이 9~16mm 어긋난다. 이 파일로 들어온 구조는 그만큼 오차가 있다.
import fs from 'node:fs';
import path from 'node:path';

const STL_DIR = '/workspace/kmm/BodyParts3D/assets/BodyParts3D_data/stl';
const OUT_DIR = '/workspace/jixiangying/anatomy/isa_BP3D_4.0_obj_99';
const extras = JSON.parse(fs.readFileSync('tools/extra-structures.json', 'utf8'));

// 바이너리 STL: 80바이트 헤더 + 삼각형 수(uint32) + 삼각형당 50바이트
function readStl(p) {
  const b = fs.readFileSync(p);
  const n = b.readUInt32LE(80);
  const tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;   // 앞 12바이트는 면 법선. 정점만 읽는다
    for (let k = 0; k < 9; k++) tris[i * 9 + k] = b.readFloatLE(o + k * 4);
  }
  return tris;
}

// 격자 클러스터링: 같은 칸에 든 정점을 하나로 합친다. 용접과 감면이 동시에 된다.
function cluster(tris, cell) {
  const map = new Map();          // 칸 키 → {sum, count, index}
  const key = (x, y, z) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const vidx = new Int32Array(tris.length / 3);
  for (let i = 0; i < tris.length; i += 3) {
    const k = key(tris[i], tris[i + 1], tris[i + 2]);
    let e = map.get(k);
    if (!e) { e = { s: [0, 0, 0], n: 0, i: map.size }; map.set(k, e); }
    e.s[0] += tris[i]; e.s[1] += tris[i + 1]; e.s[2] += tris[i + 2]; e.n++;
    vidx[i / 3] = e.i;
  }
  const pos = new Float32Array(map.size * 3);
  for (const e of map.values()) for (let c = 0; c < 3; c++) pos[e.i * 3 + c] = e.s[c] / e.n;

  const faces = [];
  for (let t = 0; t < vidx.length; t += 3) {
    const a = vidx[t], b = vidx[t + 1], c = vidx[t + 2];
    if (a !== b && b !== c && a !== c) faces.push(a, b, c);   // 찌부러진 삼각형 버림
  }
  return { pos, faces };
}

// 면 법선을 정점에 누적해서 부드러운 법선을 만든다
function normals(pos, faces) {
  const nrm = new Float32Array(pos.length);
  for (let f = 0; f < faces.length; f += 3) {
    const [a, b, c] = [faces[f] * 3, faces[f + 1] * 3, faces[f + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { nrm[i] += nx; nrm[i + 1] += ny; nrm[i + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  return nrm;
}

for (const ex of extras) {
  const src = path.join(STL_DIR, `${ex.stl}.stl`);
  if (!fs.existsSync(src)) { console.error(`  ! ${ex.stl}.stl 없음`); continue; }
  const tris = readStl(src);
  const before = tris.length / 9;

  // 목표 삼각형 수에 맞을 때까지 격자 크기를 키워가며 탐색
  let lo = 0.2, hi = 40, best = null;
  for (let it = 0; it < 24; it++) {
    const cell = (lo + hi) / 2;
    const r = cluster(tris, cell);
    const n = r.faces.length / 3;
    best = { ...r, cell, n };
    if (n > ex.targetTris) lo = cell; else hi = cell;
    if (Math.abs(n - ex.targetTris) / ex.targetTris < 0.08) break;
  }
  const nrm = normals(best.pos, best.faces);

  const L = [
    '# ' + ex.nameEn,
    '# BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan',
    `# 출처: BodyParts3D 3.0판 ${ex.stl}.stl 을 감면(${before}→${best.n} 삼각형)한 것. 4.0판 ISA 세트에는 없는 구조.`,
  ];
  for (let i = 0; i < best.pos.length; i += 3) L.push(`v ${best.pos[i].toFixed(3)} ${best.pos[i + 1].toFixed(3)} ${best.pos[i + 2].toFixed(3)}`);
  for (let i = 0; i < nrm.length; i += 3) L.push(`vn ${nrm[i].toFixed(4)} ${nrm[i + 1].toFixed(4)} ${nrm[i + 2].toFixed(4)}`);
  for (let f = 0; f < best.faces.length; f += 3) {
    const a = best.faces[f] + 1, b = best.faces[f + 1] + 1, c = best.faces[f + 2] + 1;
    L.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, `${ex.id}.obj`), L.join('\n') + '\n');
  console.log(`  ${ex.id.padEnd(10)} ${ex.nameEn.padEnd(26)} 삼각형 ${String(before).padStart(6)} → ${String(best.n).padStart(5)}  (격자 ${best.cell.toFixed(2)}mm)`);
}
