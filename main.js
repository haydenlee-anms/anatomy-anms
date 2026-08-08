// 3단계: 층 슬라이더로 근육 벗기기 + 평면 하나로 단면 자르기.
// 검색·클릭 선택·정보 패널·메모는 다음 단계다.
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
  bone:   new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  muscle: new THREE.MeshStandardMaterial({ color: 0xc74d47, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }),
};

const LAYER_LABEL = ['뼈만', '심부까지', '중간층까지', '표층까지(전체)'];
const parts = [];        // { node, depth }
let box, size, center;

Promise.all([
  fetch(BASE + 'structures.json').then(r => r.json()),
  new GLTFLoader().loadAsync(BASE + 'pelvis.glb', (e) => {
    if (e.total) status.textContent = `불러오는 중… ${Math.round((e.loaded / e.total) * 100)}%`;
  }),
]).then(([structures, gltf]) => {
  const depthOf = new Map(structures.map(s => [s.meshName, s.depth]));

  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    // .glb의 노드 이름이 structures.json의 meshName이다 (tools/obj2glb.mjs 참조)
    const d = depthOf.get(o.name) ?? depthOf.get(o.parent?.name);
    o.userData.depth = d ?? 3;                     // 표에 없으면 표층 취급하고 계속 보이게 둔다
    o.material = d === 0 ? MAT.bone : MAT.muscle;
    parts.push(o);
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
  applyLayer();
  applyCut();
}).catch((err) => {
  status.textContent = '불러오지 못했습니다.\n' + err;
});

// --- 층 슬라이더 --------------------------------------------------------
// 값 3 = 전부 보임. 값을 낮추면 depth가 큰 것(표층)부터 사라진다.
function applyLayer() {
  const v = +$('layer').value;
  for (const p of parts) p.visible = p.userData.depth <= v;
  $('layerOut').textContent = LAYER_LABEL[v];
}
$('layer').addEventListener('input', applyLayer);

// --- 단면 자르기 --------------------------------------------------------
// 평면 하나로 전체를 자른다 (three.js 전역 클리핑).
const AXIS = {
  x: new THREE.Vector3(-1, 0, 0),   // 세로로 갈라서 좌우 단면
  y: new THREE.Vector3(0, -1, 0),   // 가로로 잘라서 위아래 단면
  z: new THREE.Vector3(0, 0, -1),   // 앞뒤 단면
};
const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let axis = 'off';

function applyCut() {
  if (axis === 'off' || !box) { renderer.clippingPlanes = []; $('cutRow').hidden = true; return; }
  $('cutRow').hidden = false;
  plane.normal.copy(AXIS[axis]);
  const t = +$('cut').value / 1000;
  // 슬라이더 0~1 을 해당 축의 최소~최대 위치로 옮긴다
  const lo = box.min[axis], hi = box.max[axis];
  const at = lo + (hi - lo) * t;
  plane.constant = -plane.normal[axis] * at;
  renderer.clippingPlanes = [plane];
  $('cutOut').textContent = `${Math.round(t * 100)}%`;
}
$('cut').addEventListener('input', applyCut);
for (const b of document.querySelectorAll('.btns button')) {
  b.addEventListener('click', () => {
    axis = b.dataset.axis;
    for (const o of document.querySelectorAll('.btns button')) o.setAttribute('aria-pressed', String(o === b));
    applyCut();
  });
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
