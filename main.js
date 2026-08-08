// 4단계까지: 층 슬라이더 · 단면 · 검색 · 클릭 선택 · 정보 패널.
// 메모(sites/observations)는 다음 단계다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const BASE = import.meta.env.BASE_URL;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 태블릿에서 3배까지 가면 느려짐
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.15;
controls.maxDistance = 5;

scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1, 1.5, 2); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-1.5, 0, -1.5); scene.add(fill);

// 뼈와 근육을 같은 색으로 두면 "뼈까지 벗겨졌는지"를 눈으로 확인할 수 없다.
const MAT = {
  bone:   new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.85, side: THREE.DoubleSide }),
  muscle: new THREE.MeshStandardMaterial({ color: 0xc74d47, roughness: 0.75, side: THREE.DoubleSide }),
  pick:   new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.5, emissive: 0x553300, side: THREE.DoubleSide }),
};

const LAYER_LABEL = ['뼈만', '심부까지', '중간층까지', '표층까지(전체)'];
const parts = [];      // { mesh, info }
let attachments = {};
let selected = null;
let box, size, center;

Promise.all([
  fetch(BASE + 'structures.json').then(r => r.json()),
  fetch(BASE + 'attachments.json').then(r => r.json()),
  new GLTFLoader().loadAsync(BASE + 'pelvis.glb', (e) => {
    if (e.total) status.textContent = `불러오는 중… ${Math.round((e.loaded / e.total) * 100)}%`;
  }),
]).then(([structures, atts, gltf]) => {
  attachments = atts;
  const byMesh = new Map(structures.map(s => [s.meshName, s]));

  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    // .glb의 노드 이름이 structures.json의 meshName이다 (tools/obj2glb.mjs 참조)
    const info = byMesh.get(o.name) || byMesh.get(o.parent?.name);
    o.userData.info = info;
    o.material = info?.depth === 0 ? MAT.bone : MAT.muscle;
    parts.push({ mesh: o, info });
  });
  scene.add(gltf.scene);

  box = new THREE.Box3().setFromObject(gltf.scene);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z + Math.max(size.x, size.y) * 1.35);
  controls.update();

  status.remove();
  $('panel').hidden = false;
  $('search').hidden = false;
  applyLayer();
  applyCut();
}).catch((err) => { status.textContent = '불러오지 못했습니다.\n' + err; });

// --- 층 슬라이더 --------------------------------------------------------
// 값 3 = 전부 보임. 값을 낮추면 depth가 큰 것(표층)부터 사라진다.
function applyLayer() {
  const v = +$('layer').value;
  for (const p of parts) p.mesh.visible = (p.info?.depth ?? 3) <= v;
  $('layerOut').textContent = LAYER_LABEL[v];
}
$('layer').addEventListener('input', applyLayer);

// --- 단면 자르기 --------------------------------------------------------
const AXIS = {
  x: new THREE.Vector3(-1, 0, 0),   // 세로로 갈라서 좌우 단면
  y: new THREE.Vector3(0, -1, 0),   // 가로로 잘라서 위아래 단면
  z: new THREE.Vector3(0, 0, -1),   // 앞뒤 단면
};
const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let axis = 'off';
let flip = 1;   // 자른 뒤 어느 쪽을 남길지

function applyCut() {
  if (axis === 'off' || !box) { renderer.clippingPlanes = []; $('cutRow').hidden = true; return; }
  $('cutRow').hidden = false;
  plane.normal.copy(AXIS[axis]).multiplyScalar(flip);
  const t = +$('cut').value / 1000;
  const at = box.min[axis] + (box.max[axis] - box.min[axis]) * t;   // 슬라이더 0~1 → 축의 최소~최대
  plane.constant = -plane.normal[axis] * at;
  renderer.clippingPlanes = [plane];
  $('cutOut').textContent = `${Math.round(t * 100)}%`;
}
$('cut').addEventListener('input', applyCut);
$('flip').addEventListener('click', () => { flip *= -1; applyCut(); });
for (const b of document.querySelectorAll('.btns button')) {
  b.addEventListener('click', () => {
    axis = b.dataset.axis;
    for (const o of document.querySelectorAll('.btns button')) o.setAttribute('aria-pressed', String(o === b));
    applyCut();
  });
}

// --- 선택과 정보 패널 ---------------------------------------------------
// 이는곳/닿는곳을 찾을 때 쓰는 키. 좌/우와 "long head of" 같은 수식을 뗀다.
function attachKey(nameEn) {
  return (nameEn || '').toLowerCase()
    .replace(/\b(right|left)\b/g, '')
    .replace(/^(long|short|oblique|transverse)\s+head\s+of\s+/, '')
    .replace(/\s+/g, ' ').trim();
}

function select(part) {
  if (selected) selected.mesh.material = selected.info?.depth === 0 ? MAT.bone : MAT.muscle;
  selected = part;
  if (!part) { $('info').hidden = true; return; }
  part.mesh.material = MAT.pick;

  const s = part.info;
  $('iName').textContent = s?.한글명 || part.mesh.name;
  $('iLatin').textContent = s?.라틴명 || '';

  const rows = [];
  const add = (k, v) => { if (v) rows.push(`<dt>${k}</dt><dd>${v}</dd>`); };
  add('영문명', s?.nameEn);
  add('부위 / 층', s ? `${s.region} · ${LAYER_LABEL[s.depth]}`.replace('까지', '') : '');

  const a = attachments[attachKey(s?.nameEn)];
  add('이는 곳', a?.이는곳);
  add('닿는 곳', a?.닿는곳);
  add('비고', a?.비고);
  add('mesh', `<code>${part.mesh.name}</code>`);

  let html = rows.join('');
  if (a) {
    html += `<div class="warn">⚠ <b>미검증</b> — 이는 곳/닿는 곳은 3D 데이터에 없는 정보라
             Claude가 작성했고 문헌 대조를 거치지 않았습니다.</div>`;
  } else if (s && s.depth > 0) {
    html += `<div class="warn">이 구조의 이는 곳/닿는 곳은 아직 안 채워져 있습니다.</div>`;
  }
  if (s?.판본주의) html += `<div class="warn">📐 ${s.판본주의}</div>`;
  $('iBody').innerHTML = html;
  $('info').hidden = false;
}
$('infoClose').addEventListener('click', () => select(null));

// --- 클릭으로 선택 ------------------------------------------------------
// 깊은 근육은 앞의 근육에 가려 안 잡히는 게 정상이다. 층 슬라이더로 벗기고 누른다.
const ray = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  // 회전시키려고 끈 것과 구분: 조금이라도 움직였으면 선택하지 않는다
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  ray.setFromCamera(
    new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1),
    camera);
  const vis = parts.filter(p => p.mesh.visible).map(p => p.mesh);
  const hit = ray.intersectObjects(vis, false)[0];
  select(hit ? parts.find(p => p.mesh === hit.object) : null);
});

// --- 검색 --------------------------------------------------------------
$('q').addEventListener('input', () => {
  const q = $('q').value.trim().toLowerCase();
  const hits = $('hits');
  if (!q) { hits.hidden = true; hits.innerHTML = ''; return; }
  const found = parts.filter(p => {
    const s = p.info; if (!s) return false;
    return (s.한글명 + ' ' + s.nameEn + ' ' + (s.라틴명 || '')).toLowerCase().includes(q);
  }).slice(0, 12);

  hits.innerHTML = found.length
    ? found.map((p, i) => `<div data-i="${i}">${p.info.한글명}<div class="sub">${p.info.nameEn}</div></div>`).join('')
    : '<div class="sub" style="padding:9px 10px">없음</div>';
  hits.hidden = false;
  hits.querySelectorAll('[data-i]').forEach((el) => {
    el.addEventListener('click', () => {
      const p = found[+el.dataset.i];
      // 가려져 있으면 안 보이니, 그 근육이 드러나는 깊이까지 층을 벗긴다
      $('layer').value = String(p.info.depth);
      applyLayer();
      select(p);
      hits.hidden = true;
      $('q').blur();
    });
  });
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
