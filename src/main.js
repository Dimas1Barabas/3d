import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
// Лёгкая дымка цвета горизонта — дальняя земля растворяется в небе.
scene.fog = new THREE.Fog(0xbcd6f0, 60, 700);

/* ──────────────────────── КАМЕРА + УПРАВЛЕНИЕ ──────────────────────── */
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);
camera.position.set(7, 3.5, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.495; // не проваливаться под землю
controls.target.set(0, 1, 0);

/* ──────────────────────────── СВЕТ ──────────────────────────── */
// Заполняющий свет неба/земли — мягкая подсветка теневых сторон.
const hemi = new THREE.HemisphereLight(0xbcd6f0, 0x4a5d32, 0.6);
scene.add(hemi);

// «Солнце» — ключевой источник с направленными тенями.
// Позицию задаём позже из направления солнца на небе (см. updateSun).
const sunLight = new THREE.DirectionalLight(0xfff4e0, 3.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 300;
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.02;
sunLight.shadow.radius = 4;
scene.add(sunLight);
scene.add(sunLight.target);

/* ──────────────────────────── НЕБО ──────────────────────────── */
// Физический sky-шейлер (атмосферное рассеяние). Даёт реальный градиент
// неба, видимое солнце и — главное — корректные отражения на металле.
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

  // Видимое солнце на небе
  skyU['sunPosition'].value.copy(sunVec);

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

  // Базовый зелёный
  ctx.fillStyle = '#4a5d32';
  ctx.fillRect(0, 0, size, size);

  // Крупные неровные пятна зелени/земли — естественная «поляна»
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    const tone = Math.random();
    if (tone < 0.7) {
      ctx.fillStyle = `rgba(${50 + Math.random() * 40},${85 + Math.random() * 55},${35 + Math.random() * 35},0.25)`;
    } else {
      // землянистые проплешины
      ctx.fillStyle = `rgba(${90 + Math.random() * 50},${70 + Math.random() * 35},${35 + Math.random() * 25},0.25)`;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Мелкая травяная крошка для фактуры вблизи
  for (let i = 0; i < 40000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(${40 + Math.random() * 50},${70 + Math.random() * 60},${25 + Math.random() * 40},0.3)`;
    ctx.fillRect(x, y, 2, 2);
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
  new THREE.MeshStandardMaterial({
    map: makeGroundTexture(),
    roughness: 1,
    metalness: 0,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ──────────────────── ДЕМО-ОБЪЕКТЫ (показывают реализм) ──────────────────── */
// Удали этот блок, когда добавишь свою модель — он только чтобы сцена не
// была пустой и было видно, как работают PBR + отражения неба.
const demo = new THREE.Group();

const metalKnot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.7, 0.24, 220, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 1 }),
);
metalKnot.position.set(0, 1.3, 0);
metalKnot.castShadow = true;
metalKnot.receiveShadow = true;
demo.add(metalKnot);

const ballMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xe23c57, roughness: 0.2, metalness: 0 }),
  new THREE.MeshStandardMaterial({ color: 0x3c7be2, roughness: 0.6, metalness: 0 }),
];
[-2.6, 2.6].forEach((x, i) => {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 64, 64), ballMaterials[i]);
  ball.position.set(x, 0.7, 0.8);
  ball.castShadow = true;
  ball.receiveShadow = true;
  demo.add(ball);
});

scene.add(demo);

/* ────────────────────── ЗАГРУЗЧИК МОДЕЛЕЙ (glTF / .glb) ────────────────────── */
const gltfLoader = new GLTFLoader();

function placeModel(model) {
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1;
  model.scale.multiplyScalar(3 / maxDim);

  const reboxed = new THREE.Box3().setFromObject(model);
  const center = reboxed.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= reboxed.min.y; // ставим на землю

  scene.remove(demo);
  scene.add(model);
  controls.target.set(0, 1.2, 0);
}

// Автозагрузка public/models/scene.glb.
// Vite отдаёт index.html (200) для несуществующих путей, поэтому проверяем не
// статус, а сигнатуру файла: GLB начинается с 'glTF', JSON-вариант .gltf — с '{'.
const MODEL_URL = 'models/scene.glb';
fetch(MODEL_URL)
  .then((r) => r.arrayBuffer())
  .then((buf) => {
    const view = new Uint8Array(buf);
    const magic = String.fromCharCode(...view.slice(0, 4));
    if (magic === 'glTF' || view[0] === 0x7b /* '{' */) {
      gltfLoader.parse(
        buf,
        '',
        (gltf) => {
          placeModel(gltf.scene);
          console.info(`[3d] Модель загружена: ${MODEL_URL}`);
        },
        (err) => console.error('[3d] Ошибка парсинга модели:', err),
      );
    } else {
      console.info(
        '[3d] Модель не найдена. Положи .glb в public/models/scene.glb — и он появится в сцене.',
      );
    }
  })
  .catch(() => {
    console.info(
      '[3d] Модель не найдена. Положи .glb в public/models/scene.glb — и он появится в сцене.',
    );
  });

/* ─────────────────────── РАЗМЕР ОКНА + ЦИКЛ ─────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const t = performance.now() * 0.001;
  metalKnot.rotation.y = t * 0.4;
  metalKnot.rotation.x = t * 0.2;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
