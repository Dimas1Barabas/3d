import fs from 'node:fs';
const file = process.argv[2] || 'public/models/light_soil_dirt_pile.glb';
const buf = fs.readFileSync(file);
console.log(`file: ${file}`);
console.log(`size on disk: ${(buf.length / 1048576).toFixed(1)} MB`);

const magic = buf.toString('ascii', 0, 4);
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);
console.log(`magic: ${magic}  version: ${version}  totalLength: ${total}`);

let off = 12;
const c0len = buf.readUInt32LE(off); off += 4;
const c0type = buf.readUInt32LE(off); off += 4;
const chunkType = String.fromCharCode(c0type & 0xff, (c0type >> 8) & 0xff, (c0type >> 16) & 0xff, (c0type >> 24) & 0xff);
const json = JSON.parse(buf.toString('utf8', off, off + c0len));

console.log(`json chunk type: "${chunkType}"  len: ${c0len}`);
console.log('extensionsUsed:    ', json.extensionsUsed || 'none');
console.log('extensionsRequired:', json.extensionsRequired || 'none');
console.log(
  `meshes: ${json.meshes?.length ?? 0}  primitives(total): ${json.meshes?.reduce((n, m) => n + m.primitives.length, 0) ?? 0}  ` +
  `accessors: ${json.accessors?.length ?? 0}  images: ${json.images?.length ?? 0}  ` +
  `textures: ${json.textures?.length ?? 0}  materials: ${json.materials?.length ?? 0}  nodes: ${json.nodes?.length ?? 0}`,
);
// BIN chunk size
off += c0len + ((4 - (c0len % 4)) % 4);
if (off + 8 <= buf.length) {
  const binLen = buf.readUInt32LE(off);
  console.log(`bin chunk size: ${(binLen / 1048576).toFixed(1)} MB`);
}
if (json.images?.length) {
  console.log('images:', json.images.map((i) => ({ mime: i.mimeType, bufView: i.bufferView, uri: i.uri ? String(i.uri).slice(0, 20) : undefined })));
}
if (json.materials?.length) {
  for (const m of json.materials.slice(0, 8)) {
    const p = m.pbrMetallicRoughness || {};
    console.log(
      `  mat "${m.name}": rough=${p.roughness} metal=${p.metallicness}` +
      (p.baseColorFactor ? ` base=${p.baseColorFactor.map((v) => v.toFixed(2))}` : '') +
      (m.emissiveFactor && m.emissiveFactor.some((v) => v > 0) ? ` emissive=${m.emissiveFactor.map((v) => v.toFixed(2))}` : ''),
    );
  }
}
