import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/* ───────────────────────── РЕНДЕРЕР ───────────────────────── */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Реализм: мягкие тени + кинематографичный тонмаппинг + корректный цвет
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap; // r185: PCFSoft устарел; VSM даёт мягкие тени
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5; // яркое небо → экспозицию понижаем
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);

/* ─────────────────────────── СЦЕНА ─────────────────────────── */
const scene = new THREE.Scene();
// Лёгкая дымка цвета горизонта — дальняя земля и растительность растворяются в небе.
scene.fog = new THREE.Fog(0xbcd6f0, 60, 700);

/* ──────────────────────── КАМЕРА + УПРАВЛЕНИЕ ──────────────────────── */
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);
camera.position.set(12, 6, 16);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 120;
controls.maxPolarAngle = Math.PI * 0.495; // не проваливаться под землю
controls.target.set(0, 2, 0);

/* ──────────────────────────── СВЕТ ──────────────────────────── */
// Заполняющий свет неба/земли — мягкая подсветка теневых сторон.
scene.add(new THREE.HemisphereLight(0xbcd6f0, 0x4a5d32, 0.6));

// «Солнце» — ключевой источник с направленными тенями.
// Позицию задаём позже из направления солнца на небе (см. updateSun).
const sunLight = new THREE.DirectionalLight(0xfff4e0, 3.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 400;
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.bottom = -60;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.02;
sunLight.shadow.radius = 4;
scene.add(sunLight);
scene.add(sunLight.target);

/* ──────────────────────────── НЕБО ──────────────────────────── */
// Физический sky-шейлер (атмосферное рассеяние). Даёт реальный градиент
// неба, видимое солнце и корректные отражения на металле.
const sky = new Sky();
sky.scale.setScalar(4000);
scene.add(sky);

const skyU = sky.material.uniforms;
skyU['turbidity'].value = 10;
skyU['rayleigh'].value = 2.5;
skyU['mieCoefficient'].value = 0.005;
skyU['mieDirectionalG'].value = 0.8;

const sunVec = new THREE.Vector3();
const sceneEnv = new THREE.Scene(); // временное окружение для съёмки env-карты
let envRT;

function updateSun(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  sunVec.setFromSphericalCoords(1, phi, theta);

  skyU['sunPosition'].value.copy(sunVec); // видимое солнце на небе

  // Направляем источник света вдоль солнца
  sunLight.position.copy(sunVec).multiplyScalar(150);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  // Снимаем с неба карту окружения → даём её сцене для отражений
  if (envRT) envRT.dispose();
  sceneEnv.add(sky);
  envRT = pmrem.fromScene(sceneEnv);
  scene.add(sky);
  scene.environment = envRT.texture;
}

// Невысокое тёплое солнце ≈ «золотой час»: длинные мягкие тени, тёплый свет.
updateSun(12, 180);

/* ──────────────────────────── ЗЕМЛЯ ──────────────────────────── */
// Процедурная травянистая текстура (canvas) — без внешних файлов.
function makeGroundTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#4a5d32';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    if (Math.random() < 0.7) {
      ctx.fillStyle = `rgba(${50 + Math.random() * 40},${85 + Math.random() * 55},${35 + Math.random() * 35},0.25)`;
    } else {
      ctx.fillStyle = `rgba(${90 + Math.random() * 50},${70 + Math.random() * 35},${35 + Math.random() * 25},0.25)`;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 40000; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 50},${70 + Math.random() * 60},${25 + Math.random() * 40},0.3)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ──────────────────────── РАСТИТЕЛЬНОСТЬ (FBX) ──────────────────────── */
const fbxLoader = new FBXLoader();

function loadFBX(url) {
  return new Promise((resolve, reject) => {
    fbxLoader.load(url, resolve, undefined, reject);
  });
}

// Категории: файл, целевая высота (ед. сцены), число экземпляров, тень.
const VEGETATION = [
  { file: 'Tree1.fbx', height: 5.0, count: 5, shadow: true },
  { file: 'Tree2.fbx', height: 5.5, count: 5, shadow: true },
  { file: 'Tree3.fbx', height: 5.0, count: 4, shadow: true },
  { file: 'Tree4.fbx', height: 6.0, count: 4, shadow: true },
  { file: 'Bush1.fbx', height: 1.4, count: 8, shadow: true },
  { file: 'Bush2.fbx', height: 1.2, count: 8, shadow: true },
  { file: 'Bush3.fbx', height: 1.3, count: 8, shadow: true },
  { file: 'Rock1.fbx', height: 1.1, count: 4, shadow: true },
  { file: 'Rock2.fbx', height: 0.9, count: 3, shadow: true },
  { file: 'Rock3.fbx', height: 1.3, count: 3, shadow: true },
  { file: 'Grass1.fbx', height: 0.6, count: 20, shadow: false },
  { file: 'Grass2.fbx', height: 0.5, count: 20, shadow: false },
  { file: 'Grass3.fbx', height: 0.55, count: 20, shadow: false },
];

// Грузим модель один раз, нормализуем по высоте и сдвигаем так, чтобы начало
// координат группы оказалось в нижнем-центре модели → удобно клонировать и
// ставить на землю, вращение будет вокруг центра объекта.
function makeTemplate(item) {
  return loadFBX('models/' + item.file).then((raw) => {
    raw.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = item.shadow;
        c.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    raw.scale.multiplyScalar(item.height / (size.y || 1));
    raw.updateMatrixWorld(true);

    const b = new THREE.Box3().setFromObject(raw);
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    raw.position.set(-cx, -b.min.y, -cz); // низ-центр → в начало координат

    const template = new THREE.Group();
    template.add(raw);
    return template;
  });
}

const FIELD_RADIUS = 55; // радиус засеваемой области
const CLEARING = 8; // пустое место в центре (открытое поле, место для камеры)

function scatter(items) {
  items.forEach(({ item, template }) => {
    for (let i = 0; i < item.count; i++) {
      // sqrt → равномерная плотность по площади; равномерный угол.
      const angle = Math.random() * Math.PI * 2;
      const r = CLEARING + (FIELD_RADIUS - CLEARING) * Math.sqrt(Math.random());

      const inst = template.clone();
      inst.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      inst.rotation.y = Math.random() * Math.PI * 2;
      inst.scale.multiplyScalar(0.85 + Math.random() * 0.3); // ±15 % по высоте
      scene.add(inst);
    }
  });
  console.info('[3d] Растительность расставлена');
}

Promise.all(VEGETATION.map((item) => makeTemplate(item).then((template) => ({ item, template }))))
  .then(scatter)
  .catch((err) => console.error('[3d] Ошибка загрузки FBX:', err));

/* ─────────────────────── РАЗМЕР ОКНА + ЦИКЛ ─────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
