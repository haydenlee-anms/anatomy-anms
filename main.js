// 1단계: .glb 띄우고 손가락으로 회전/확대만. 그 외 기능 없음.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 태블릿에서 3배까지 가면 느려짐
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0, 1.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.2;
controls.maxDistance = 5;

// 조명: 정면/뒤/위에서 하나씩. 근육 표면 굴곡이 보이는 정도면 충분하다.
scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1, 1.5, 2); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-1.5, 0, -1.5); scene.add(fill);

new GLTFLoader().load(
  import.meta.env.BASE_URL + 'pelvis.glb',
  (gltf) => {
    scene.add(gltf.scene);
    // 실제 크기에 맞춰 카메라 거리와 회전 중심을 잡는다
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    camera.position.set(center.x, center.y, center.z + Math.max(size.x, size.y) * 1.4);
    controls.update();
    status.remove();
  },
  (e) => {
    if (e.total) status.textContent = `불러오는 중… ${Math.round((e.loaded / e.total) * 100)}%`;
    else status.textContent = `불러오는 중… ${(e.loaded / 1048576).toFixed(1)} MB`;
  },
  (err) => { status.textContent = '모델을 불러오지 못했습니다.\n' + err; }
);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
