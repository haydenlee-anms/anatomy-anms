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
  origin:      new THREE.MeshStandardMaterial({ color: 0x4a9de0, roughness: 0.6, side: THREE.DoubleSide }),  // 이는 곳
  insertion:   new THREE.MeshStandardMaterial({ color: 0x4ad08a, roughness: 0.6, side: THREE.DoubleSide }),  // 닿는 곳
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
const pickable = [];             // 지금 광선에 잡히는 메쉬. 매 프레임 새로 만들지 않으려고 들고 있는다

const loader = new GLTFLoader();
let attachments = {};   // 이는 곳 / 닿는 곳 (사람이 쓴 것. 미검증). 아래 원문이 없을 때만 쓴다
let descs = {};         // Z-Anatomy 수록 영문 설명. 출처가 있는 자료
let sites = [];         // 내가 정의한 부위
let obs = [];           // 날짜 붙은 관찰 기록

// 설명은 1.5MB 라 첫 화면을 늦추면 안 된다. 따로 받아오고, 오면 열린 패널만 다시 그린다.
fetch(BASE + 'descriptions.json').then(r => r.json())
  .then(d => { descs = d; if (selected) renderInfo(selected); })
  .catch(() => {});

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

// --- 하나씩 뜯어보기 ----------------------------------------------------
// 벗겨내기: 누른 구조를 숨긴다. 계속 누르면 겉에서부터 한 겹씩 벗겨진다
// 이것만 보기: 그 구조만 남기고 나머지를 숨긴다
const peeled = [];        // 벗겨낸 순서대로. 되돌리기에 쓴다
let soloIds = null;       // null 이면 평소대로, Set 이면 그것만 보임

// 반투명: 숨기는 것과 다르다. 겉 구조를 흐리게 남겨 위치 감각을 잃지 않게 하면서
// 속을 들여다본다. 반투명한 것은 클릭이 통과해서, 흐려놓고 바로 아래 것을 집을 수 있다.
const ghosted = new Set();
const ghostCache = new Map();
function ghostOf(base) {
  let g = ghostCache.get(base);
  if (!g) {
    g = base.clone();
    g.transparent = true;
    g.opacity = 0.22;
    g.depthWrite = false;   // 이게 없으면 뒤에 있는 게 가려진다
    ghostCache.set(base, g);
  }
  return g;
}

function updatePeelRow() {
  $('undoPeel').disabled = peeled.length === 0;
  $('resetPeel').disabled = peeled.length === 0 && !soloIds && ghosted.size === 0;
  const bits = [];
  if (soloIds) bits.push('이것만');
  if (peeled.length) bits.push(`${peeled.length}개 숨김`);
  if (ghosted.size) bits.push(`${ghosted.size}개 흐림`);
  $('peelOut').textContent = bits.join(' · ');
}

// --- 하나씩 켜고 끄는 목록 ----------------------------------------------
// 두개골처럼 안쪽에 파묻힌 뼈는 화면에서 누를 수가 없다. 그래서 목록에서 누른다.
// 목록에 나오는 것 = 지금 켠 부위 + 켠 계통. 숨긴 것도 남겨둬야 되돌릴 수 있다.
function listedParts() {
  return parts
    .filter(p => onRegions.has(p.region) && onSystems.has(p.info?.종류))
    .sort((a, b) => label(a.info, a.mesh.userData.id)
      .localeCompare(label(b.info, b.mesh.userData.id), 'ko'));
}

// 층 슬라이더를 끌면 applyVisibility가 연달아 불린다.
// 목록이 500줄일 수 있어서 한 프레임에 한 번만 다시 그린다.
let listPending = false;
function renderList() {
  if ($('list').hidden || listPending) return;
  listPending = true;
  requestAnimationFrame(() => { listPending = false; drawList(); });
}

function drawList() {
  const box = $('list');
  if (box.hidden) return;
  const keepScroll = box.scrollTop;      // 통째로 다시 그리므로 보던 자리를 기억해둔다
  const items = listedParts();
  const peelSet = new Set(peeled);
  box.innerHTML = `<div class="head">${items.length}개 · ● 끄기 / ◐ 흐리게</div>`
    + items.map((p, i) => {
      const id = p.mesh.userData.id;
      const off = peelSet.has(id) || (soloIds && !soloIds.has(id));
      const gh = ghosted.has(id);
      return `<div class="item ${off ? 'off' : ''} ${gh ? 'gh' : ''} ${p === selected ? 'sel' : ''}" data-i="${i}">
                <button class="eye" aria-label="켜고 끄기">${off ? '○' : '●'}</button>
                <button class="fade" aria-label="흐리게">◐</button>
                <div class="nm">${esc(label(p.info, id))}</div>
              </div>`;
    }).join('');
  for (const el of box.querySelectorAll('.item')) {
    const p = items[+el.dataset.i], id = p.mesh.userData.id;
    el.querySelector('.eye').addEventListener('click', (e) => {
      e.stopPropagation();
      if (soloIds) soloIds = null;             // 목록으로 끄기 시작하면 '이것만'은 푼다
      const k = peeled.indexOf(id);
      if (k >= 0) peeled.splice(k, 1); else peeled.push(id);
      applyVisibility();
    });
    // 반투명한 것은 화면에서 클릭이 통과하므로, 되돌릴 자리가 여기밖에 없다
    el.querySelector('.fade').addEventListener('click', (e) => { e.stopPropagation(); toggleGhost(id); });
    el.querySelector('.nm').addEventListener('click', () => { select(p); focusOn(p); });
  }
  box.scrollTop = keepScroll;
}

function focusOn(p) {
  const c = new THREE.Box3().setFromObject(p.mesh).getCenter(new THREE.Vector3());
  controls.target.copy(c);
  controls.update();
}

$('listBtn').addEventListener('click', () => {
  const box = $('list');
  box.hidden = !box.hidden;
  $('listBtn').setAttribute('aria-pressed', String(!box.hidden));
  drawList();
});

// --- 보이기 규칙 --------------------------------------------------------
// 부위가 켜져 있고, 계통이 켜져 있고, 층 슬라이더보다 얕아야 보인다.
// 벗겨낸 것은 무조건 숨기고, '이것만 보기' 중이면 그것만 보인다.
// 근육을 고르면 그 근육의 부착부는 계통 토글과 상관없이 같이 보여준다.
function applyVisibility() {
  const v = +$('layer').value;
  const peelSet = new Set(peeled);
  const linked = linkedAttachmentIds();
  pickable.length = 0;
  for (const p of parts) {
    const id = p.mesh.userData.id;
    let vis;
    if (peelSet.has(id)) vis = false;
    else if (soloIds) vis = soloIds.has(id);
    else if (linked.has(id)) vis = onRegions.has(p.region);
    else vis = onRegions.has(p.region) && onSystems.has(p.info?.종류) && (p.info?.depth ?? 2) <= v;
    p.mesh.visible = vis;
    // 고른 것은 노랑, 고른 근육의 부착부는 이는 곳/닿는 곳을 색으로 구분해준다
    const base = p === selected ? MAT.pick
      : linked.has(id) ? (p.info?.부착구분 === '이는곳' ? MAT.origin : MAT.insertion)
      : matOf(p.info);
    const ghost = ghosted.has(id);
    p.mesh.material = ghost ? ghostOf(base) : base;
    // 반투명한 것은 광선이 통과한다. 그래야 흐려놓고 그 아래를 바로 집을 수 있다
    if (vis && !ghost) pickable.push(p.mesh);
  }
  $('layerOut').textContent = LAYER_LABEL[v];
  updatePeelRow();
  renderList();
}
$('layer').addEventListener('input', applyVisibility);

// 선택한 근육과 이름이 같은 부착부 표시들을 찾는다.
// Z-Anatomy가 'Gluteus maximus muscle.ol' 처럼 근육 이름 그대로 붙여놔서 이름으로 이어진다.
function linkedAttachmentIds() {
  const s = selected?.info;
  if (!s || s.종류 !== '근육') return new Set();
  const out = new Set();
  for (const [id, m] of byMesh) if (m.부착구분 && m.영문명 === s.영문명) out.add(id);
  return out;
}

$('peelBtn').addEventListener('click', () => {
  if (!selected) return;
  peeled.push(selected.mesh.userData.id);
  select(null);
});
// 반투명은 고른 채로 둔다. 흐려진 상태에서 설명을 계속 보면서 아래를 눌러야 하니까.
$('ghostBtn').addEventListener('click', () => {
  if (!selected) return;
  toggleGhost(selected.mesh.userData.id);
});
function toggleGhost(id) {
  if (ghosted.has(id)) ghosted.delete(id); else ghosted.add(id);
  if (selected) $('ghostBtn').textContent =
    ghosted.has(selected.mesh.userData.id) ? '흐림 풀기' : '흐리게';
  applyVisibility();
}
$('soloBtn').addEventListener('click', () => {
  if (!selected) return;
  const id = selected.mesh.userData.id;
  if (soloIds && soloIds.has(id)) soloIds = null;                 // 다시 누르면 해제
  else soloIds = new Set([id, ...linkedAttachmentIds()]);
  $('soloBtn').textContent = soloIds ? '전체로 돌아가기' : '이것만 보기';
  applyVisibility();
});
$('undoPeel').addEventListener('click', () => { peeled.pop(); applyVisibility(); });
$('resetPeel').addEventListener('click', () => {
  peeled.length = 0; soloIds = null; ghosted.clear();
  $('soloBtn').textContent = '이것만 보기';
  $('ghostBtn').textContent = '흐리게';
  applyVisibility();
});

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

// 색칠은 전부 applyVisibility 가 한다. 여기서는 누가 선택됐는지만 정한다.
function select(part) {
  selected = part;
  if (part) renderInfo(part); else $('info').hidden = true;
  applyVisibility();   // 색을 다시 칠하고, 선택한 근육의 부착부를 같이 켜준다
}

// 원문 문장 목록. 요약하지 않고 그대로 보여준다.
function quote(title, list) {
  if (!list?.length) return '';
  return `<dt>${title} <span class="src">원문 그대로</span></dt>
          <dd class="quote">${list.map(t => `<p>${esc(t)}</p>`).join('')}</dd>`;
}

function renderInfo(part) {
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

  let html = '';
  const d = descs[s?.영문명];
  if (d) {
    // 출처 있는 자료. 위키백과 글을 Z-Anatomy 가 파일 안에 넣어둔 것이다.
    html += quote('이는 곳', d.이는곳) + quote('닿는 곳', d.닿는곳) + quote('신경지배', d.신경지배);
    if (d.설명) html += `<dt>설명</dt><dd class="en">${esc(d.설명)}</dd>`;
    const secs = Object.entries(d.절 || {});
    if (secs.length) {
      html += `<details><summary>원문 더 보기 (${secs.map(([k]) => k).join(' · ')})</summary>`
            + secs.map(([k, v]) => `<h3>${esc(k)}</h3><p>${esc(v).replace(/\n/g, '<br>')}</p>`).join('')
            + `</details>`;
    }
    html += `<div class="warn ok">출처: 위키백과 영문판 → Z-Anatomy 수록분 (CC BY-SA).
             ${d.원문제목 ? `이 구조는 <b>${esc(d.원문제목)}</b> 문서에 묶여 있어,
             그 안에서 이 구조 이름이 나온 문장만 골랐습니다.` : ''}
             번역하지 않고 원문 그대로 둡니다. 옮기다 뜻이 바뀌는 걸 막기 위해서입니다.</div>`;
    if (!d.이는곳 && !d.닿는곳 && s?.종류 === '근육') {
      html += `<div class="warn">이 근육은 원문에 이는 곳·닿는 곳이 문장으로 안 적혀 있어 비웠습니다.
               지어내지 않습니다.</div>`;
    }
  } else {
    // 원문이 없을 때만 예전에 손으로 적어둔 표를 쓴다
    const a = attachments[(s?.영문명 || '').toLowerCase().replace(/\s+muscle$/, '')];
    if (a) {
      html += `<dt>이는 곳</dt><dd>${esc(a.이는곳)}</dd><dt>닿는 곳</dt><dd>${esc(a.닿는곳)}</dd>`
            + (a.비고 ? `<dt>비고</dt><dd>${esc(a.비고)}</dd>` : '')
            + `<div class="warn">⚠ <b>미검증</b> — 원문 설명이 없는 구조라, Claude가 쓴 걸 그대로 두었습니다.
               문헌 대조를 거치지 않았습니다.</div>`;
    }
  }
  html += rows.join('');

  if (s && !s.한글명) {
    html += `<div class="warn">한글명이 아직 없습니다. 전신으로 넓히면서 구조가 2천 개대가 되어,
             사람이 확인한 것만 한글명을 넣고 나머지는 비워뒀습니다. 지어내지 않습니다.</div>`;
  }
  html += `<div class="warn">⚠ <b>층(depth)은 계통 기준 일괄 배정</b>입니다.
           근육 하나하나의 깊이를 확인한 값이 아닙니다.</div>`;
  // 이 근육의 부착부가 몇 개 켜졌는지 알려준다
  const nLinked = linkedAttachmentIds().size;
  if (nLinked) html += `<dt>부착부</dt><dd>이 근육의 부착부 ${nLinked}곳을 같이 켰습니다.
    <span style="color:#4a9de0">파란색 = 이는 곳</span>,
    <span style="color:#4ad08a">초록색 = 닿는 곳</span></dd>`;
  html += notesHtml(part.mesh.userData.id);
  $('soloBtn').textContent = (soloIds && soloIds.has(part.mesh.userData.id)) ? '전체로 돌아가기' : '이것만 보기';
  $('ghostBtn').textContent = ghosted.has(part.mesh.userData.id) ? '흐림 풀기' : '흐리게';
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
const ndc = new THREE.Vector2();
let downAt = null;

// 화면 좌표에서 광선을 쏴 맨 앞의 구조를 찾는다. 반투명한 것은 pickable에 없어서 통과한다.
function pickAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickable, false)[0];
  return hit ? parts.find(p => p.mesh === hit.object) : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; hideTip(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const dragged = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
  downAt = null;
  if (dragged) return;                                   // 끌었으면 회전이다
  const p = pickAt(e.clientX, e.clientY);
  // 이미 고른 것을 또 누르면 흐려진다. 흐려지면 클릭이 통과하니 다음 누름은 그 아래가 잡힌다
  if (p && p === selected) toggleGhost(p.mesh.userData.id);
  else select(p);
});

// --- 마우스를 올리면 이름과 설명 ----------------------------------------
// 터치에는 호버가 없다. 손가락으로는 눌러서 보는 게 맞으므로 마우스일 때만 뜬다.
const tip = $('tip');
let hoverAt = null, hoverPart = null;

function hideTip() { hoverAt = null; hoverPart = null; tip.hidden = true; }

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || downAt) { hideTip(); return; }
  hoverAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerleave', hideTip);

// 광선 계산은 프레임당 한 번만. 매 pointermove마다 하면 구조 2천 개에서 버거워진다.
function updateHover() {
  if (!hoverAt) return;
  const { x, y } = hoverAt;
  hoverAt = null;
  const p = pickAt(x, y);
  if (!p) { hoverPart = null; tip.hidden = true; return; }
  if (p !== hoverPart) {
    hoverPart = p;
    const s = p.info;
    const d = descs[s?.영문명];
    const one = (d?.설명 || '').split(/(?<=[.])\s/)[0];
    tip.innerHTML = `<b>${esc(label(s, p.mesh.userData.id))}</b>`
      + (s?.라틴명 ? `<div class="la">${esc(s.라틴명)}</div>` : '')
      + (s ? `<div class="sy">${esc(s.종류)} · ${esc(REGION_LABEL[s.부위] || s.부위)}</div>` : '')
      + (one ? `<div class="de">${esc(one.length > 140 ? one.slice(0, 140) + '…' : one)}</div>` : '');
  }
  tip.hidden = false;
  // 화면 밖으로 나가지 않게 뒤집는다
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = (x + 16 + w > innerWidth ? x - 16 - w : x + 16) + 'px';
  tip.style.top = (y + 16 + h > innerHeight ? y - 16 - h : y + 16) + 'px';
}

// --- 검색 --------------------------------------------------------------
// 아직 안 받아온 부위의 구조도 찾아준다. 고르면 그 부위를 받아온다.
$('q').addEventListener('input', () => {
  const q = $('q').value.trim().toLowerCase();
  const hits = $('hits');
  if (!q) { hits.hidden = true; hits.innerHTML = ''; return; }
  // 부착부 표시가 근육 본체보다 먼저 나오면 찾기 어렵다. 본체를 앞으로 보낸다.
  const all = [];
  for (const s of byMesh.values())
    if (`${s.한글명 || ''} ${s.영문명} ${s.라틴명 || ''}`.toLowerCase().includes(q)) all.push(s);
  all.sort((a, b) => (a.부착구분 ? 1 : 0) - (b.부착구분 ? 1 : 0));
  const found = all.slice(0, 14);
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
      if (p) { select(p); focusOn(p); }
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
window.__dbg = { parts, scene, camera, controls, pickable, pickAt, byMesh: () => byMesh };

renderer.setAnimationLoop(() => {
  controls.update();
  updateHover();
  renderer.render(scene, camera);
});
