// BodyParts3D 3.0 전체판 STL을 뷰어가 쓸 밀도의 .obj로 변환한다.
//
// 왜 전체판을 쓰나: 처음엔 4.0판의 ISA(축소판) 세트를 썼는데 요방형근·다열근이
// 빠져 있었다. 전체판에는 있다. 두 판본을 섞으면 같은 근육도 위치가 9~16mm
// 어긋나므로, 전체판에 있는 것은 전부 전체판으로 통일한다.
//
// 왜 삼각형을 줄이나: 3.0판 원본을 다 합치면 300만 삼각형(약 48MB)이라 태블릿에서 못 쓴다.
// 줄이는 방식은 tools/decimate.mjs (QEM 모서리 접기). 격자로 뭉개는 방식은
// 얇은 뼈에 구멍을 내서 폐기했다.
//
// 작업 목록은 tools/stl-jobs.json (id / stl / nameEn / targetTris).
import fs from 'node:fs';
import path from 'node:path';
import { decimate } from './decimate.mjs';

const STL_DIR = '/workspace/kmm/BodyParts3D/assets/BodyParts3D_data/stl';
const OUT_DIR = '/workspace/jixiangying/anatomy/isa_BP3D_4.0_obj_99';
const jobs = JSON.parse(fs.readFileSync(process.argv[2] || 'tools/stl-jobs.json', 'utf8'));
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;

// 바이너리 STL: 80바이트 헤더 + 삼각형 수(uint32) + 삼각형당 50바이트.
// STL은 정점을 공유하지 않으므로 같은 좌표끼리 합쳐(용접) 인덱스 메쉬로 만든다.
function readStlIndexed(p) {
  const b = fs.readFileSync(p);
  const n = b.readUInt32LE(80);
  const map = new Map(), pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const x = b.readFloatLE(o + v*12), y = b.readFloatLE(o + v*12 + 4), z = b.readFloatLE(o + v*12 + 8);
      const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let j = map.get(k);
      if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(x, y, z); }
      idx.push(j);
    }
  }
  return { pos: Float64Array.from(pos), idx: Int32Array.from(idx), srcTris: n };
}

// 면 법선을 정점에 누적해서 부드러운 법선을 만든다
function normals(pos, idx) {
  const nrm = new Float64Array(pos.length);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f]*3, b = idx[f+1]*3, c = idx[f+2]*3;
    const ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2];
    const vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    for (const i of [a, b, c]) { nrm[i] += nx; nrm[i+1] += ny; nrm[i+2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i+1], nrm[i+2]) || 1;
    nrm[i] /= l; nrm[i+1] /= l; nrm[i+2] /= l;
  }
  return nrm;
}

for (const job of jobs) {
  if (only && !only.has(job.id)) continue;
  const src = path.join(STL_DIR, `${job.stl}.stl`);
  if (!fs.existsSync(src)) { console.error(`  ! ${job.stl}.stl 없음`); continue; }

  const m = readStlIndexed(src);
  const r = m.idx.length / 3 <= job.targetTris ? m : decimate(m.pos, m.idx, job.targetTris);
  const nrm = normals(r.pos, r.idx);

  const L = [
    '# ' + job.nameEn,
    '# BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan',
    `# 출처: BodyParts3D 3.0 전체판 ${job.stl}.stl 을 QEM 모서리 접기로 ${m.srcTris}→${r.idx.length/3} 삼각형으로 줄인 것.`,
  ];
  for (let i = 0; i < r.pos.length; i += 3) L.push(`v ${r.pos[i].toFixed(3)} ${r.pos[i+1].toFixed(3)} ${r.pos[i+2].toFixed(3)}`);
  for (let i = 0; i < nrm.length; i += 3) L.push(`vn ${nrm[i].toFixed(4)} ${nrm[i+1].toFixed(4)} ${nrm[i+2].toFixed(4)}`);
  for (let f = 0; f < r.idx.length; f += 3) {
    const a = r.idx[f]+1, b = r.idx[f+1]+1, c = r.idx[f+2]+1;
    L.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, `${job.id}.obj`), L.join('\n') + '\n');
  console.log(`  ${job.id.padEnd(10)} ${(job.nameEn||'').padEnd(28)} ${String(m.srcTris).padStart(6)} → ${String(r.idx.length/3).padStart(5)}`);
}
