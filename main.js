// 전신 뷰어. 부위별로 나눠서 보는 것만 받아온다.
//
// 왜 나눠 받나: 전신을 한 파일로 만들면 태블릿에서 못 연다. 용량도 문제지만
// 구조 하나당 그리기 명령이 한 번씩 나가서, 수천 개를 한 번에 켜면 프레임이 떨어진다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const BASE = import.meta.env.BASE_URL;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 태블릿 고밀도 화면에서 성능 확보
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0.9, 2.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.05;
controls.maxDistance = 8;
controls.target.set(0, 0.9, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1, 1.5, 2); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-1.5, 0, -1.5); scene.add(fill);

// 계통별로 색을 나눠야 층을 벗겼을 때 뭐가 남았는지 눈으로 안다
const MAT = {
  '뼈':        new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.85, side: THREE.DoubleSide }),
  '근육':      new THREE.MeshStandardMaterial({ color: 0xc74d47, roughness: 0.75, side: THREE.DoubleSide }),
  '관절·인대': new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.6, side: THREE.DoubleSide }),
  '신경':      new THREE.MeshStandardMaterial({ color: 0xe0d24a, roughness: 0.5, side: THREE.DoubleSide }),
  '부착부':    new THREE.MeshStandardMaterial({ color: 0x6fa8c7, roughness: 0.6, side: THREE.DoubleSide }),
  pick:        new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.5, emissive: 0x553300, side: THREE.DoubleSide }),
};
const matOf = (i) => MAT[i?.종류] || MAT['근육'];

const LAYER_LABEL = ['뼈만', '심부까지', '중간층까지', '표층까지(전체)'];
const REGION_LABEL = { trunk: '몸통', lower: '하지', upper: '상지', head: '머리·목' };

let byMesh = new Map();          // meshName → 메타
const parts = [];                // { mesh, info }
const loaded = new Set();        // 이미 받은 부위
const loading = new Set();
const onRegions = new Set(['trunk']);
const onSystems = new Set(['뼈', '근육', '관절·인대']);
let selected = null;

const loader = new GLTFLoader();
let attachments = {};   // 이는 곳 / 닿는 곳 (사람이 쓴 것. 미검증)
let sites = [];         // 내가 정의한 부위
let obs = [];           // 날짜 붙은 관찰 기록

Promise.all([
  fetch(BASE + 'structures.json').then(r => r.json()),
  fetch(BASE + 'attachments.json').then(r => r.json()).catch(() => ({})),
  fetch(BASE + 'sites.json').then(r => r.json()).catch(() => ({ sites: [] })),
  fetch(BASE + 'observations.jsonl').then(r => r.text()).then(t =>
    t.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } })
     .filter(o => o && o.date)).catch(() => []),
]).then(async ([list, atts, siteFile, observations]) => {
  byMesh = new Map(list.map(s => [s.meshName, s]));
  attachments = atts; sites = siteFile.sites || []; obs = observations;
  $('search').hidden = false;
  $('panel').hidden = false;
  syncButtons();
  await ensureRegion('trunk');
  status.remove();
  applyVisibility();
  frameVisible();
}).catch(e => { status.textContent = '불러오지 못했습니다.\n' + e; });

// 보이는 것 전체가 화면에 들어오도록 카메라를 맞춘다
function frameVisible() {
  const box = new THREE.Box3();
  for (const p of parts) if (p.mesh.visible) box.expandByObject(p.mesh);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  controls.target.copy(c);
  camera.position.set(c.x, c.y, c.z + Math.max(size.x, size.y) * 1.3);
  controls.update();
}

// --- 부위 로딩 ----------------------------------------------------------
async function ensureRegion(r) {
  if (loaded.has(r) || loading.has(r)) return;
  loading.add(r);
  const btn = document.querySelector(`#regions [data-r="${r}"]`);
  if (btn) btn.classList.add('loading');
  try {
    const gltf = await loader.loadAsync(`${BASE}model/${r}.glb`);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeVertexNormals();   // 법선을 파일에 안 넣었다. 용량의 33%였다.
      // three.js 가 노드 이름을 고쳐버리므로 extras 에 심어둔 원본 id 로 찾는다
      const id = o.userData.id || o.parent?.userData?.id || o.name;
      o.userData.id = id;
      const info = byMesh.get(id);
      o.userData.info = info;
      o.material = matOf(info);
      o.userData.region = r;
      parts.push({ mesh: o, info, region: r });
    });
    scene.add(gltf.scene);
    loaded.add(r);
  } catch (e) {
    console.error(r, e);
    if (btn) btn.textContent = REGION_LABEL[r] + ' ✕';
  } finally {
    loading.delete(r);
    if (btn) btn.classList.remove('loading');
  }
}

// --- 보이기 규칙 --------------------------------------------------------
// 부위가 켜져 있고, 계통이 켜져 있고, 층 슬라이더보다 얕아야 보인다
function applyVisibility() {
  const v = +$('layer').value;
  for (const p of parts) {
    p.mesh.visible = onRegions.has(p.region)
      && onSystems.has(p.info?.종류)
      && (p.info?.depth ?? 2) <= v;
  }
  $('layerOut').textContent = LAYER_LABEL[v];
}
$('layer').addEventListener('input', applyVisibility);

function syncButtons() {
  for (const b of document.querySelectorAll('#regions button'))
    b.setAttribute('aria-pressed', String(onRegions.has(b.dataset.r)));
  for (const b of document.querySelectorAll('#systems button'))
    b.setAttribute('aria-pressed', String(onSystems.has(b.dataset.s)));
}
for (const b of document.querySelectorAll('#regions button')) {
  b.addEventListener('click', async () => {
    const r = b.dataset.r;
    if (onRegions.has(r)) onRegions.delete(r); else { onRegions.add(r); await ensureRegion(r); }
    syncButtons(); applyVisibility();
  });
}
for (const b of document.querySelectorAll('#systems button')) {
  b.addEventListener('click', () => {
    const s = b.dataset.s;
    if (onSystems.has(s)) onSystems.delete(s); else onSystems.add(s);
    syncButtons(); applyVisibility();
  });
}

// --- 단면 자르기 --------------------------------------------------------
const AXIS = { x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, -1, 0), z: new THREE.Vector3(0, 0, -1) };
const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let axis = 'off', flip = 1;

function applyCut() {
  if (axis === 'off') { renderer.clippingPlanes = []; $('cutRow').hidden = true; return; }
  $('cutRow').hidden = false;
  const box = new THREE.Box3();
  for (const p of parts) if (p.mesh.visible) box.expandByObject(p.mesh);
  if (box.isEmpty()) return;
  plane.normal.copy(AXIS[axis]).multiplyScalar(flip);
  const t = +$('cut').value / 1000;
  const at = box.min[axis] + (box.max[axis] - box.min[axis]) * t;
  plane.constant = -plane.normal[axis] * at;
  renderer.clippingPlanes = [plane];
  $('cutOut').textContent = `${Math.round(t * 100)}%`;
}
$('cut').addEventListener('input', applyCut);
$('flip').addEventListener('click', () => { flip *= -1; applyCut(); });
for (const b of document.querySelectorAll('#axes button')) {
  b.addEventListener('click', () => {
    axis = b.dataset.axis;
    for (const o of document.querySelectorAll('#axes button')) o.setAttribute('aria-pressed', String(o === b));
    applyCut();
  });
}

// --- 선택과 정보 패널 ---------------------------------------------------
const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function label(info, meshName) {
  return info?.한글명 || info?.영문명 || meshName;
}

function select(part) {
  if (selected) selected.mesh.material = matOf(selected.info);
  selected = part;
  if (!part) { $('info').hidden = true; return; }
  part.mesh.material = MAT.pick;

  const s = part.info;
  $('iName').textContent = label(s, part.mesh.userData.id);
  $('iLatin').textContent = s?.라틴명 || '';

  const rows = [];
  const add = (k, v) => { if (v) rows.push(`<dt>${k}</dt><dd>${v}</dd>`); };
  add('영문명', esc(s?.영문명));
  add('계통 / 부위', s ? `${esc(s.종류)} · ${esc(REGION_LABEL[s.부위] || s.부위)}` : '');
  add('세부 부위', esc(s?.세부부위));
  add('좌우', esc(s?.좌우));
  add('mesh', `<code>${esc(part.mesh.userData.id)}</code>`);

  // 이는 곳 / 닿는 곳 — 골반·고관절·요추 것만 채워져 있다
  // Z-Anatomy는 'X muscle' 로 부르는데 이는곳/닿는곳 표는 그냥 'X' 로 되어 있다
  const a = attachments[(s?.영문명 || '').toLowerCase().replace(/\s+muscle$/, '')];
  let html = rows.join('');
  if (a) {
    html = `<dt>이는 곳</dt><dd>${esc(a.이는곳)}</dd><dt>닿는 곳</dt><dd>${esc(a.닿는곳)}</dd>`
         + (a.비고 ? `<dt>비고</dt><dd>${esc(a.비고)}</dd>` : '') + html
         + `<div class="warn">⚠ <b>미검증</b> — 이는 곳/닿는 곳은 3D 데이터에 없는 정보라
            Claude가 작성했고 문헌 대조를 거치지 않았습니다.</div>`;
  }
  if (s && !s.한글명) {
    html += `<div class="warn">한글명이 아직 없습니다. 전신으로 넓히면서 구조가 2천 개대가 되어,
             사람이 확인한 것만 한글명을 넣고 나머지는 비워뒀습니다. 지어내지 않습니다.</div>`;
  }
  html += `<div class="warn">⚠ <b>층(depth)은 계통 기준 일괄 배정</b>입니다.
           근육 하나하나의 깊이를 확인한 값이 아닙니다.</div>`;
  html += notesHtml(part.mesh.userData.id);
  $('iBody').innerHTML = html;
  $('info').hidden = false;
}

// 이 구조를 가리키는 site 를 찾아 관찰 기록을 날짜 역순으로 보여준다. 쓰기 기능은 없다.
function notesHtml(meshName) {
  const mine = sites.filter(st => (st.refs || []).includes(meshName));
  if (!mine.length) return '';
  let h = '';
  for (const st of mine) {
    const list = obs.filter(o => o.siteId === st.id).sort((x, y) => (x.date < y.date ? 1 : -1));
    h += `<dt>내 메모 — ${esc(st.이름)}</dt><dd>`;
    if (st.설명) h += `<div style="color:#999;margin-bottom:5px">${esc(st.설명)}</div>`;
    h += list.length
      ? list.map(o => `<div style="margin:4px 0"><span style="color:#8aa">${esc(o.date)}</span>
                       <span style="color:#c85">[${esc(o.type)}]</span> ${esc(o.text)}</div>`).join('')
      : '<span style="color:#777">기록 없음</span>';
    h += '</dd>';
  }
  return h;
}
$('infoClose').addEventListener('click', () => select(null));

// --- 클릭으로 선택 ------------------------------------------------------
const ray = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;  // 끌었으면 회전이다
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(parts.filter(p => p.mesh.visible).map(p => p.mesh), false)[0];
  select(hit ? parts.find(p => p.mesh === hit.object) : null);
});

// --- 검색 --------------------------------------------------------------
// 아직 안 받아온 부위의 구조도 찾아준다. 고르면 그 부위를 받아온다.
$('q').addEventListener('input', () => {
  const q = $('q').value.trim().toLowerCase();
  const hits = $('hits');
  if (!q) { hits.hidden = true; hits.innerHTML = ''; return; }
  const found = [];
  for (const s of byMesh.values()) {
    if (`${s.한글명 || ''} ${s.영문명} ${s.라틴명 || ''}`.toLowerCase().includes(q)) found.push(s);
    if (found.length >= 14) break;
  }
  hits.innerHTML = found.length
    ? found.map((s, i) => `<div data-i="${i}">${esc(label(s, s.meshName))}
        <div class="sub">${esc(s.영문명)} · ${esc(REGION_LABEL[s.부위] || s.부위)}</div></div>`).join('')
    : '<div class="sub" style="padding:9px 10px">없음</div>';
  hits.hidden = false;
  hits.querySelectorAll('[data-i]').forEach((el) => {
    el.addEventListener('click', async () => {
      const s = found[+el.dataset.i];
      onRegions.add(s.부위); onSystems.add(s.종류);
      syncButtons();
      await ensureRegion(s.부위);
      $('layer').value = String(Math.max(+$('layer').value, s.depth));
      applyVisibility();
      const p = parts.find(x => x.mesh.userData.id === s.meshName);
      if (p) {
        select(p);
        const c = new THREE.Box3().setFromObject(p.mesh).getCenter(new THREE.Vector3());
        controls.target.copy(c);
        controls.update();
      }
      hits.hidden = true; $('q').blur();
    });
  });
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 검증용. 브라우저 콘솔에서 내부 상태를 볼 수 있게 열어둔다
window.__dbg = { parts, scene, camera, controls, byMesh: () => byMesh };

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
