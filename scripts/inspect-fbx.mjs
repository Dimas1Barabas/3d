import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const dir = 'public/models';
const loader = new FBXLoader();

function matInfo(m) {
  const info = { type: m.type };
  if (m.color) info.color = '#' + m.color.getHexString();
  if ('roughness' in m) info.roughness = m.roughness;
  if ('metalness' in m) info.metalness = m.metalness;
  if (m.emissive) info.emissive = '#' + m.emissive.getHexString();
  if ('shininess' in m) info.shininess = m.shininess;
  if (m.specular) info.specular = '#' + m.specular.getHexString();
  if (m.map) info.map = true;
  info.transparent = !!m.transparent;
  return info;
}

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.fbx')).sort();
for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  let obj;
  try {
    obj = loader.parse(arrayBuffer, '');
  } catch (e) {
    console.log(`${file}: PARSE ERROR ${e.message}`);
    continue;
  }
  const mats = new Map();
  let meshCount = 0;
  let vertexColorsAny = false;
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = bbox.getSize(new THREE.Vector3());
  obj.traverse((c) => {
    if (c.isMesh) {
      meshCount++;
      if (c.geometry?.attributes?.color) vertexColorsAny = true;
      (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => {
        if (!mats.has(m.uuid)) mats.set(m.uuid, matInfo(m));
      });
    }
  });
  console.log(`\n=== ${file} | meshes=${meshCount} | size=${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} | vertexColors=${vertexColorsAny}`);
  for (const info of mats.values()) console.log('   ', JSON.stringify(info));
}
