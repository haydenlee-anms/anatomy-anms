// 깊이를 추측이 아니라 형상에서 재는 스크립트.
//
// 방법: 각 구조 표면에서 몸 바깥 방향(수평)으로 광선을 쏘고,
//       몸 밖으로 나가기까지 다른 구조를 몇 개나 통과하는지 센다.
//       많이 통과할수록 깊이 묻혀 있는 것.
//
// 한계: 이 모델에는 피부가 없고 대상 86개만 들어있다. 덮고 있는 근육이
//       대상 밖이면 실제보다 얕게 나온다. 결과는 참고용이고 사람이 검수해야 한다.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const OBJ_DIR = '/workspace/jixiangying/anatomy/isa_BP3D_4.0_obj_99';
const META = '/workspace/jixiangying/anatomy/data/anatomy_data_simple_refined.json';
const SAMPLES = 60;   // 구조당 광선 개수

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const nameOf = {}, sysOf = {};
for (const list of Object.values(meta)) for (const it of list) { nameOf[it.id] = it.nameEn; sysOf[it.id] = it.systemEn; }
const ids = fs.readFileSync(process.argv[2], 'utf8').trim().split(/\s+/);

// .obj → three.js Mesh
function loadMesh(id) {
  const text = fs.readFileSync(path.join(OBJ_DIR, `${id}.obj`), 'utf8');
  const pos = [], idx = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); pos.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('f ')) {
      const v = line.trim().split(/\s+/).slice(1).map(t => parseInt(t.split('/')[0], 10) - 1);
      for (let i = 1; i + 1 < v.length; i++) idx.push(v[0], v[i], v[i + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingBox(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.name = id;
  m.updateMatrixWorld();
  return m;
}

const meshes = ids.map(loadMesh);
console.log(`구조 ${meshes.length}개 로드 완료`);

// 몸의 중심축 (원본 좌표계: X=좌우, Y=앞뒤, Z=위. 수평면은 XY)
const all = new THREE.Box3();
for (const m of meshes) all.expandByObject(m);
const c = all.getCenter(new THREE.Vector3());
const span = all.getSize(new THREE.Vector3()).length();

const ray = new THREE.Raycaster();
ray.firstHitOnly = false;
const results = [];

for (const m of meshes) {
  const p = m.geometry.attributes.position;
  const others = meshes.filter(o => o !== m);
  const step = Math.max(1, Math.floor(p.count / SAMPLES));
  const counts = [];
  for (let i = 0; i < p.count; i += step) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    // 중심축에서 이 점을 향하는 수평 방향 = 바깥쪽
    const dir = new THREE.Vector3(v.x - c.x, v.y - c.y, 0);
    if (dir.lengthSq() < 1e-6) continue;
    dir.normalize();
    // 자기 자신을 다시 맞지 않게 표면에서 살짝 띄워서 출발
    ray.set(v.clone().addScaledVector(dir, 0.5), dir);
    ray.far = span;
    const hits = ray.intersectObjects(others, false);
    counts.push(new Set(hits.map(h => h.object.name)).size);
  }
  counts.sort((a, b) => a - b);
  const med = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const mean = counts.length ? counts.reduce((s, x) => s + x, 0) / counts.length : 0;
  results.push({ id: m.name, name: nameOf[m.name], sys: sysOf[m.name], median: med, mean: +mean.toFixed(2), n: counts.length });
}

results.sort((a, b) => b.mean - a.mean || b.median - a.median);
console.log('\n=== 묻힘 정도 (mean이 클수록 깊음) ===');
console.log('중앙값 평균  계통    ID         이름');
for (const r of results) {
  console.log(`${String(r.median).padStart(4)} ${String(r.mean).padStart(7)}  ${(r.sys || '').replace(' System', '').padEnd(8)} ${r.id.padEnd(9)} ${r.name}`);
}
fs.writeFileSync(process.argv[3] || '/tmp/burial.json', JSON.stringify(results, null, 1));
