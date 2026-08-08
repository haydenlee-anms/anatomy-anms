// Blender가 뽑아준 부위별 덩어리(.bin + .json)를 브라우저용 .glb 로 조립한다.
//
// 두 가지 최적화를 적용한다 (둘 다 추가 라이브러리 없음, 화질 손실 없음):
//   ① 법선을 저장하지 않는다 — 용량의 33%. three.js가 로드할 때 계산한다
//   ② 좌표를 int16 으로 양자화한다 (KHR_mesh_quantization) — 좌표 용량 절반
//      구조마다 자기 bounding box 안에서 65536단계로 나누므로,
//      길이 300mm짜리 근육이면 0.005mm 해상도. 육안으로 구분 불가능한 오차.
//
// 실행: node tools/pack-glb.mjs <입력폴더> <출력폴더>
import fs from 'node:fs';
import path from 'node:path';

const IN = process.argv[2] || '/workspace/za_full';
const OUT = process.argv[3] || 'public/model';
fs.mkdirSync(OUT, { recursive: true });

for (const jsonFile of fs.readdirSync(IN).filter(f => f.endsWith('.json'))) {
  const grp = jsonFile.replace('.json', '');
  const meta = JSON.parse(fs.readFileSync(path.join(IN, jsonFile), 'utf8'));
  const bin = fs.readFileSync(path.join(IN, grp + '.bin'));
  const posAll = new Float32Array(bin.buffer, bin.byteOffset, meta.posBytes / 4);
  const idxAll = new Uint32Array(bin.buffer, bin.byteOffset + meta.posBytes,
                                 (bin.byteLength - meta.posBytes) / 4);

  const chunks = [];
  let offset = 0;
  const bufferViews = [], accessors = [], meshes = [], nodes = [];

  function pushView(buf, target) {
    while (offset % 4 !== 0) { chunks.push(Buffer.alloc(1)); offset++; }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
    chunks.push(buf); offset += buf.length;
    return bufferViews.length - 1;
  }

  // Blender는 Z가 위, glTF/three.js는 Y가 위다. (x, y, z) → (x, z, -y) 로 눕힌 걸 세운다.
  const axis = (i, c) => c === 0 ? posAll[i * 3] : c === 1 ? posAll[i * 3 + 2] : -posAll[i * 3 + 1];

  for (const s of meta.structures) {
    const n = s.vn;
    // 이 구조만의 bounding box 를 구해 그 안에서 int16 으로 나눈다
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      const v = axis(s.v0 + i, c);
      if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v;
    }
    const center = [0, 1, 2].map(c => (mn[c] + mx[c]) / 2);
    const half = [0, 1, 2].map(c => Math.max((mx[c] - mn[c]) / 2, 1e-4));

    const posBuf = Buffer.alloc(n * 8);         // SHORT x3 + 2바이트 정렬 패딩
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const t = (axis(s.v0 + i, c) - center[c]) / half[c];   // -1..1
        posBuf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(t * 32767))), i * 8 + c * 2);
      }
    }

    const small = n <= 65535;
    const idxBuf = Buffer.alloc(s.ic * (small ? 2 : 4));
    for (let i = 0; i < s.ic; i++) {
      const v = idxAll[s.i0 + i];
      if (small) idxBuf.writeUInt16LE(v, i * 2); else idxBuf.writeUInt32LE(v, i * 4);
    }

    const pv = pushView(posBuf, 34962);
    bufferViews[pv].byteStride = 8;
    const iv = pushView(idxBuf, 34963);

    accessors.push({ bufferView: pv, componentType: 5122, normalized: true, count: n, type: 'VEC3',
                     min: [-1, -1, -1], max: [1, 1, 1] });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: iv, componentType: small ? 5123 : 5125, count: s.ic, type: 'SCALAR' });
    const idxAcc = accessors.length - 1;

    meshes.push({ name: s.name, primitives: [{ attributes: { POSITION: posAcc }, indices: idxAcc, material: 0 }] });
    // 양자화로 -1..1 로 눌러놨으므로 노드에서 원래 크기로 되돌린다 (단위 mm → m)
    nodes.push({
      name: s.name,
      mesh: meshes.length - 1,
      translation: center.map(v => v / 1000),
      scale: half.map(v => v / 1000),
      // three.js 는 노드 이름의 공백과 점을 _ 로 바꿔버려서 원본 이름으로 조회가 안 된다.
      // extras 는 그대로 userData 에 실려오므로 여기에 원본 이름을 남긴다.
      extras: { id: s.name, system: s.system, region: s.region },
    });
  }

  const json = {
    asset: {
      version: '2.0', generator: 'anatomy-anms pack-glb',
      copyright: 'Z-Anatomy (https://z-anatomy.com), CC BY-SA 4.0 — derived from BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan',
    },
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes, accessors, bufferViews,
    materials: [{ name: 'tissue', pbrMetallicRoughness: { baseColorFactor: [0.78, 0.3, 0.28, 1], metallicFactor: 0, roughnessFactor: 0.75 }, doubleSided: true }],
    buffers: [{ byteLength: offset }],
  };

  const binBuf = Buffer.concat(chunks);
  let js = JSON.stringify(json); while (js.length % 4) js += ' ';
  const jsonBuf = Buffer.from(js, 'utf8');
  const pad = (4 - (binBuf.length % 4)) % 4;
  const binOut = Buffer.concat([binBuf, Buffer.alloc(pad)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binOut.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const outPath = path.join(OUT, grp + '.glb');
  fs.writeFileSync(outPath, Buffer.concat([header, jh, jsonBuf, bh, binOut]));

  const tris = meta.structures.reduce((s, x) => s + x.ic / 3, 0);
  console.log(`  ${grp.padEnd(8)} 구조 ${String(meta.structures.length).padStart(5)}  삼각형 ${tris.toLocaleString().padStart(10)}  →  ${(fs.statSync(outPath).size / 1048576).toFixed(2)} MB`);
}
