import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/* ───────────────────────── РЕНДЕРЕР ───────────────────────── */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // чёткие, отчётливые тени
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);

/* ─────────────────────────── СЦЕНА ─────────────────────────── */
const scene = new THREE.Scene();
// Зелёноватая дымка джунглей — дальняя растительность растворяется в тумане.
scene.fog = new THREE.Fog(0xb0bca0, 70, 850);

/* ──────────────────────── КАМЕРА + УПРАВЛЕНИЕ ──────────────────────── */
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);
camera.position.set(14, 8, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 150;
controls.maxPolarAngle = Math.PI * 0.495; // не проваливаться под землю
controls.target.set(0, 3, 0);

/* ──────────────────────────── СВЕТ ──────────────────────────── */
// Слабый ambient — именно поэтому тени получаются тёмными и заметными
// (затенённые зоны почти не заливаются светом, контраст с освещёнными высок).
scene.add(new THREE.HemisphereLight(0xbcd4e8, 0x3a4a2a, 0.22));

// «Солнце» — единственный сильный источник, пробивающийся сквозь джунгли.
const sunLight = new THREE.DirectionalLight(0xfff0d6, 3.8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 400;
sunLight.shadow.camera.left = -70;
sunLight.shadow.camera.right = 70;
sunLight.shadow.camera.top = 70;
sunLight.shadow.camera.bottom = -70;
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.01;
sunLight.shadow.radius = 2;
scene.add(sunLight);
scene.add(sunLight.target);

/* ──────────────────────────── НЕБО ──────────────────────────── */
const sky = new Sky();
sky.scale.setScalar(4000);
scene.add(sky);

const skyU = sky.material.uniforms;
skyU['turbidity'].value = 10;
skyU['rayleigh'].value = 2.5;
skyU['mieCoefficient'].value = 0.005;
skyU['mieDirectionalG'].value = 0.8;

const sunVec = new THREE.Vector3();
const sceneEnv = new THREE.Scene();
let envRT;

function updateSun(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  sunVec.setFromSphericalCoords(1, phi, theta);

  skyU['sunPosition'].value.copy(sunVec);

  sunLight.position.copy(sunVec).multiplyScalar(150);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  if (envRT) envRT.dispose();
  sceneEnv.add(sky);
  envRT = pmrem.fromScene(sceneEnv);
  scene.add(sky);
  scene.environment = envRT.texture;
}

// Тёплое низковатое солнце ≈ «золотой час»: насыщенные цвета и богатый свет.
updateSun(20, 180);

/* ──────────────────────────── ЗЕМЛЯ ──────────────────────────── */
function makeGroundTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#3c4a28';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    if (Math.random() < 0.7) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 40},${70 + Math.random() * 55},${28 + Math.random() * 32},0.28)`;
    } else {
      ctx.fillStyle = `rgba(${80 + Math.random() * 50},${60 + Math.random() * 35},${30 + Math.random() * 25},0.25)`;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 45000; i++) {
    ctx.fillStyle = `rgba(${32 + Math.random() * 48},${60 + Math.random() * 60},${22 + Math.random() * 38},0.32)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(80, 80);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// envMapIntent низкий — карта окружения не заливает тени, они остаются тёмными.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({
    map: makeGroundTexture(),
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.3,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ──────────────────────── РАСТИТЕЛЬНОСТЬ (FBX → InstancedMesh) ──────────────────────── */
// Используем инстансинг: тысячи объектов рисуются за считанные draw-call'ы.
const fbxLoader = new FBXLoader();

function loadFBX(url) {
  return new Promise((resolve, reject) => {
    fbxLoader.load(url, resolve, undefined, reject);
  });
}

// file, целевая высота, число экземпляров (трава сажается кластерами, count не важен), тень.
const VEGETATION = [
  { file: 'Tree1.fbx', height: 5.0, count: 90, shadow: true },
  { file: 'Tree2.fbx', height: 5.5, count: 90, shadow: true },
  { file: 'Tree3.fbx', height: 5.0, count: 90, shadow: true },
  { file: 'Tree4.fbx', height: 6.0, count: 90, shadow: true },
  { file: 'Bush1.fbx', height: 1.4, count: 35, shadow: true },
  { file: 'Bush2.fbx', height: 1.2, count: 35, shadow: true },
  { file: 'Bush3.fbx', height: 1.3, count: 35, shadow: true },
  { file: 'Rock1.fbx', height: 1.1, count: 12, shadow: true },
  { file: 'Rock2.fbx', height: 0.9, count: 12, shadow: true },
  { file: 'Rock3.fbx', height: 1.3, count: 12, shadow: true },
  { file: 'Grass1.fbx', height: 0.6, count: 0, shadow: false },
  { file: 'Grass2.fbx', height: 0.5, count: 0, shadow: false },
  { file: 'Grass3.fbx', height: 0.55, count: 0, shadow: false },
];

const FIELD_RADIUS = 50; // радиус засеваемой области (плотные джунгли)
const CLEARING = 10; // открытая поляна в центре

// Грузим модель один раз, нормализуем по высоте, ставим начало координат
// группы в нижний-центр модели.
function makeTemplate(item) {
  return loadFBX('models/' + item.file).then((raw) => {
    raw.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = item.shadow;
        c.receiveShadow = true;
        // IBL не должен заливать тени — гасим влияние окружения на материал.
        if (c.material && 'envMapIntensity' in c.material) c.material.envMapIntensity = 0.3;
      }
    });

    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    raw.scale.multiplyScalar(item.height / (size.y || 1));
    raw.updateMatrixWorld(true);

    const b = new THREE.Box3().setFromObject(raw);
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    raw.position.set(-cx, -b.min.y, -cz);

    const template = new THREE.Group();
    template.add(raw);
    template.updateMatrixWorld(true);
    return template;
  });
}

// Случайная позиция на поле (sqrt → равномерность по площади), вне поляны.
function fieldPos() {
  const angle = Math.random() * Math.PI * 2;
  const r = CLEARING + (FIELD_RADIUS - CLEARING) * Math.sqrt(Math.random());
  return new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
}

// Набор трансформаций (позиция, поворот, масштаб) для одного типа растительности.
function transformsFor(item) {
  const out = [];
  const push = (pos) =>
    out.push({ pos, rotY: Math.random() * Math.PI * 2, scale: 0.8 + Math.random() * 0.4 });

  if (item.file.startsWith('Grass')) {
    // Трава — плотными пятнами (кластерами), густой подлесок.
    const CLUSTERS = 260;
    const PER_CLUSTER = 8;
    const CLUSTER_RADIUS = 2.2;
    for (let c = 0; c < CLUSTERS; c++) {
      const center = fieldPos();
      for (let k = 0; k < PER_CLUSTER; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * CLUSTER_RADIUS;
        push(new THREE.Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d));
      }
    }
  } else {
    for (let i = 0; i < item.count; i++) push(fieldPos());
  }
  return out;
}

// Из шаблона и списка трансформаций строим InstancedMesh (по одному на меш модели).
const _yAxis = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _instMat = new THREE.Matrix4();
const _m = new THREE.Matrix4();

function buildInstanced(template, transforms) {
  const result = [];
  template.traverse((c) => {
    if (!c.isMesh) return;
    const im = new THREE.InstancedMesh(c.geometry, c.material, transforms.length);
    im.castShadow = c.castShadow;
    im.receiveShadow = true;
    im.frustumCulled = false;
    const meshWorld = c.matrixWorld; // включает нормализацию шаблона (масштаб + сдвиг)
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      _q.setFromAxisAngle(_yAxis, t.rotY);
      _s.set(t.scale, t.scale, t.scale);
      _instMat.compose(t.pos, _q, _s);
      _m.multiplyMatrices(_instMat, meshWorld);
      im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
    result.push(im);
  });
  return result;
}

function scatter(items) {
  let total = 0;
  items.forEach(({ item, template }) => {
    const transforms = transformsFor(item);
    total += transforms.length;
    if (!transforms.length) return;
    buildInstanced(template, transforms).forEach((im) => scene.add(im));
  });
  console.info(`[3d] Джунгли засажены: ${total} объектов (инстансинг)`);
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
