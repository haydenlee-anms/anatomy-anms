// BodyParts3D .obj 여러 개 → .glb 하나로 합치는 1회용 변환 스크립트.
// 새 의존성 없음. node tools/obj2glb.mjs 로 실행.
//
// 구조 하나 = glTF 노드 하나로 유지한다. 합쳐버리면 2단계에서 이름표를 못 붙인다.
import fs from 'node:fs';
import path from 'node:path';

const OBJ_DIR = '/workspace/jixiangying/anatomy/isa_BP3D_4.0_obj_99';
const META = '/workspace/jixiangying/anatomy/data/anatomy_data_simple_refined.json';
const ID_LIST = process.argv[2];
const OUT = process.argv[3] || 'public/pelvis.glb';

const ids = fs.readFileSync(ID_LIST, 'utf8').trim().split(/\s+/);
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const nameOf = {};
for (const list of Object.values(meta)) for (const it of list) nameOf[it.id] = it.nameEn;

// --- .obj 파싱 ---------------------------------------------------------
// 이 데이터셋은 f 줄이 항상 "v//vn" 이고 v 인덱스 == vn 인덱스다. 그 가정을 검사한다.
function parseObj(text) {
  const pos = [], nrm = [], idx = [];
  let assumptionBroken = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      pos.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('vn ')) {
      const p = line.split(/\s+/);
      nrm.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const parts = line.trim().split(/\s+/).slice(1);
      const v = [];
      for (const tok of parts) {
        const bits = tok.split('/');
        const vi = parseInt(bits[0], 10);
        const ni = bits[2] ? parseInt(bits[2], 10) : vi;
        if (ni !== vi) assumptionBroken++;
        v.push(vi - 1); // obj는 1부터 시작
      }
      // 다각형이 오면 삼각형으로 쪼갠다 (이 데이터는 전부 삼각형이지만 방어)
      for (let i = 1; i + 1 < v.length; i++) idx.push(v[0], v[i], v[i + 1]);
    }
  }
  return { pos, nrm, idx, assumptionBroken };
}

const meshes = [];
let brokenTotal = 0, missing = [];
for (const id of ids) {
  const f = path.join(OBJ_DIR, `${id}.obj`);
  if (!fs.existsSync(f)) { missing.push(id); continue; }
  const m = parseObj(fs.readFileSync(f, 'utf8'));
  brokenTotal += m.assumptionBroken;
  if (m.nrm.length !== m.pos.length) {
    console.error(`  ! ${id}: 정점 ${m.pos.length / 3}개인데 법선 ${m.nrm.length / 3}개 — 건너뜀`);
    continue;
  }
  meshes.push({ id, name: nameOf[id] || id, ...m });
}
if (missing.length) console.error(`  ! .obj 없음 ${missing.length}개: ${missing.slice(0, 5).join(', ')}...`);
if (brokenTotal) console.error(`  ! v!=vn 인 면 ${brokenTotal}개 발견 (가정 깨짐)`);

// --- 좌표 정리 ---------------------------------------------------------
// 원본은 Z가 위쪽이고 단위가 mm다. glTF/three.js는 Y가 위쪽이고 m를 쓴다.
// (x, y, z) → (x, z, -y) 로 축을 바꾸고, 중심을 원점으로 옮기고, 1000으로 나눈다.
let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
for (const m of meshes) {
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 2], z = -m.pos[i + 1];
    if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
    if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
  }
}
const cx = (bb[0] + bb[3]) / 2, cy = (bb[1] + bb[4]) / 2, cz = (bb[2] + bb[5]) / 2;
const S = 0.001;
console.log(`  원본 크기: ${(bb[3] - bb[0]).toFixed(0)} x ${(bb[4] - bb[1]).toFixed(0)} x ${(bb[5] - bb[2]).toFixed(0)} mm`);

// --- glTF 조립 ---------------------------------------------------------
const bin = [];          // Buffer 조각들
let offset = 0;
const bufferViews = [], accessors = [], gltfMeshes = [], nodes = [];

function pushView(buf, target) {
  while (offset % 4 !== 0) { bin.push(Buffer.alloc(1)); offset++; }  // 4바이트 정렬
  const view = { buffer: 0, byteOffset: offset, byteLength: buf.length };
  if (target) view.target = target;
  bufferViews.push(view);
  bin.push(buf); offset += buf.length;
  return bufferViews.length - 1;
}

for (const m of meshes) {
  const n = m.pos.length / 3;

  const posBuf = Buffer.alloc(n * 12);
  const nrmBuf = Buffer.alloc(n * 12);
  let pMin = [Infinity, Infinity, Infinity], pMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const x = (m.pos[i * 3] - cx) * S;
    const y = (m.pos[i * 3 + 2] - cy) * S;
    const z = (-m.pos[i * 3 + 1] - cz) * S;
    posBuf.writeFloatLE(x, i * 12); posBuf.writeFloatLE(y, i * 12 + 4); posBuf.writeFloatLE(z, i * 12 + 8);
    if (x < pMin[0]) pMin[0] = x; if (y < pMin[1]) pMin[1] = y; if (z < pMin[2]) pMin[2] = z;
    if (x > pMax[0]) pMax[0] = x; if (y > pMax[1]) pMax[1] = y; if (z > pMax[2]) pMax[2] = z;
    // 법선은 축만 바꾼다 (이동/축소 영향 없음)
    nrmBuf.writeFloatLE(m.nrm[i * 3], i * 12);
    nrmBuf.writeFloatLE(m.nrm[i * 3 + 2], i * 12 + 4);
    nrmBuf.writeFloatLE(-m.nrm[i * 3 + 1], i * 12 + 8);
  }

  // 정점이 65535개 이하면 인덱스를 절반 크기로 저장 (용량 절약)
  const small = n <= 65535;
  const idxBuf = Buffer.alloc(m.idx.length * (small ? 2 : 4));
  for (let i = 0; i < m.idx.length; i++) {
    if (small) idxBuf.writeUInt16LE(m.idx[i], i * 2); else idxBuf.writeUInt32LE(m.idx[i], i * 4);
  }

  const posView = pushView(posBuf, 34962);
  const nrmView = pushView(nrmBuf, 34962);
  const idxView = pushView(idxBuf, 34963);

  accessors.push({ bufferView: posView, componentType: 5126, count: n, type: 'VEC3', min: pMin, max: pMax });
  const posAcc = accessors.length - 1;
  accessors.push({ bufferView: nrmView, componentType: 5126, count: n, type: 'VEC3' });
  const nrmAcc = accessors.length - 1;
  accessors.push({ bufferView: idxView, componentType: small ? 5123 : 5125, count: m.idx.length, type: 'SCALAR' });
  const idxAcc = accessors.length - 1;

  gltfMeshes.push({
    name: m.id,
    primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, material: 0 }],
  });
  nodes.push({ name: m.id, mesh: gltfMeshes.length - 1, extras: { nameEn: m.name } });
}

const json = {
  asset: {
    version: '2.0',
    generator: 'anatomy-anms obj2glb',
    copyright: 'BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan',
  },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes, meshes: gltfMeshes, accessors, bufferViews,
  materials: [{
    name: 'muscle',
    pbrMetallicRoughness: { baseColorFactor: [0.78, 0.30, 0.28, 1], metallicFactor: 0.0, roughnessFactor: 0.75 },
    doubleSided: true,
  }],
  buffers: [{ byteLength: offset }],
};

// --- GLB 컨테이너로 포장 ------------------------------------------------
const binBuf = Buffer.concat(bin);
let jsonStr = JSON.stringify(json);
while (jsonStr.length % 4 !== 0) jsonStr += ' ';
const jsonBuf = Buffer.from(jsonStr, 'utf8');
const binPad = (4 - (binBuf.length % 4)) % 4;
const binOut = Buffer.concat([binBuf, Buffer.alloc(binPad)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);                        // 'glTF'
header.writeUInt32LE(2, 4);                                 // version
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binOut.length, 8);
const jsonHdr = Buffer.alloc(8);
jsonHdr.writeUInt32LE(jsonBuf.length, 0); jsonHdr.writeUInt32LE(0x4e4f534a, 4); // JSON
const binHdr = Buffer.alloc(8);
binHdr.writeUInt32LE(binOut.length, 0); binHdr.writeUInt32LE(0x004e4942, 4);    // BIN

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binOut]));

const tri = meshes.reduce((s, m) => s + m.idx.length / 3, 0);
const vtx = meshes.reduce((s, m) => s + m.pos.length / 3, 0);
console.log(`  구조 ${meshes.length}개 / 정점 ${vtx.toLocaleString()} / 삼각형 ${tri.toLocaleString()}`);
console.log(`  → ${OUT}  ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
