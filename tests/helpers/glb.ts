/** Builds small GLB files in memory for tests: boxes with optional node transforms. */

export interface TestMesh {
  /** Box size in file units. */
  size: [number, number, number];
  /** Box center in file units (before node transform). */
  center?: [number, number, number];
  translation?: [number, number, number];
  scale?: [number, number, number];
  /** Unit quaternion x, y, z, w. */
  rotation?: [number, number, number, number];
  indexType?: "u16" | "u32" | "none";
  /** Repeat the box's triangles (non-indexed) until at least this many triangles exist. */
  repeatTriangles?: number;
}

export function boxTriangles(size: [number, number, number], center: [number, number, number] = [0, 0, 0]): { positions: number[]; indices: number[] } {
  const [sx, sy, sz] = size.map((v) => v / 2) as [number, number, number];
  const [cx, cy, cz] = center;
  const corners = [
    [-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz],
    [-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz],
  ].map(([x, y, z]) => [x! + cx, y! + cy, z! + cz]);
  const faces = [
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4],
  ];
  const indices: number[] = [];
  for (const [a, b, c, d] of faces) indices.push(a!, b!, c!, a!, c!, d!);
  return { positions: corners.flat(), indices };
}

export function buildGlb(meshes: TestMesh[], options: { scene?: number; extraScene?: boolean } = {}): ArrayBuffer {
  const bufferParts: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const gltfMeshes: object[] = [];
  const nodes: object[] = [];
  let byteLength = 0;

  const pushView = (data: Uint8Array): number => {
    while (byteLength % 4 !== 0) {
      bufferParts.push(new Uint8Array([0]));
      byteLength += 1;
    }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength });
    bufferParts.push(data);
    byteLength += data.byteLength;
    return bufferViews.length - 1;
  };

  meshes.forEach((m, i) => {
    const { positions, indices } = boxTriangles(m.size, m.center);
    let posArray = positions;
    let idx: number[] | null = indices;
    if (m.indexType === "none" || m.repeatTriangles) {
      const flat = indices.flatMap((k) => positions.slice(k * 3, k * 3 + 3));
      const copies = m.repeatTriangles ? Math.ceil(m.repeatTriangles / (indices.length / 3)) : 1;
      posArray = new Array<number>(flat.length * copies);
      for (let c = 0; c < copies; c++) for (let k = 0; k < flat.length; k++) posArray[c * flat.length + k] = flat[k]!;
      idx = null;
    }
    const pos = new Float32Array(posArray);
    const posView = pushView(new Uint8Array(pos.buffer));
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < posArray.length; k++) {
      const c = k % 3;
      min[c] = Math.min(min[c]!, posArray[k]!);
      max[c] = Math.max(max[c]!, posArray[k]!);
    }
    accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
    const posAcc = accessors.length - 1;
    const primitive: Record<string, unknown> = { attributes: { POSITION: posAcc }, mode: 4 };
    if (idx) {
      const u32 = m.indexType === "u32";
      const arr = u32 ? new Uint32Array(idx) : new Uint16Array(idx);
      const idxView = pushView(new Uint8Array(arr.buffer));
      accessors.push({ bufferView: idxView, componentType: u32 ? 5125 : 5123, count: arr.length, type: "SCALAR" });
      primitive["indices"] = accessors.length - 1;
    }
    gltfMeshes.push({ primitives: [primitive] });
    const node: Record<string, unknown> = { mesh: i, name: `body_${i}` };
    if (m.translation) node["translation"] = m.translation;
    if (m.scale) node["scale"] = m.scale;
    if (m.rotation) node["rotation"] = m.rotation;
    nodes.push(node);
  });

  const scenes: object[] = [{ nodes: nodes.map((_, i) => i) }];
  if (options.extraScene) {
    // A second scene that references a huge decoy box; must be ignored when it is not the default scene.
    nodes.push({ mesh: 0, scale: [1000, 1000, 1000] });
    scenes.push({ nodes: [nodes.length - 1] });
  }

  const json = {
    asset: { version: "2.0", generator: "crate-designer tests" },
    scene: options.scene ?? 0,
    scenes,
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  let jsonBytes: Uint8Array = new TextEncoder().encode(JSON.stringify(json));
  while (jsonBytes.length % 4 !== 0) jsonBytes = concat(jsonBytes, new Uint8Array([0x20]));
  let bin: Uint8Array = concatAll(bufferParts);
  while (bin.length % 4 !== 0) bin = concat(bin, new Uint8Array([0]));

  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  u8.set(jsonBytes, 20);
  const binStart = 20 + jsonBytes.length;
  dv.setUint32(binStart, bin.length, true);
  dv.setUint32(binStart + 4, 0x004e4942, true);
  u8.set(bin, binStart + 8);
  return out;
}

/** Rewrites the JSON chunk of a GLB (for malformed-file tests); BIN chunk is kept as is. */
export function patchGlbJson(glb: ArrayBuffer, patch: (json: Record<string, unknown>) => void): ArrayBuffer {
  const dv = new DataView(glb);
  const jsonLength = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength))) as Record<string, unknown>;
  patch(json);
  let jsonBytes: Uint8Array = new TextEncoder().encode(JSON.stringify(json));
  while (jsonBytes.length % 4 !== 0) jsonBytes = concat(jsonBytes, new Uint8Array([0x20]));
  const rest = new Uint8Array(glb, 20 + jsonLength); // BIN chunk header + data
  const total = 20 + jsonBytes.length + rest.length;
  const out = new ArrayBuffer(total);
  const odv = new DataView(out);
  const u8 = new Uint8Array(out);
  u8.set(new Uint8Array(glb, 0, 12), 0);
  odv.setUint32(8, total, true);
  odv.setUint32(12, jsonBytes.length, true);
  odv.setUint32(16, 0x4e4f534a, true);
  u8.set(jsonBytes, 20);
  u8.set(rest, 20 + jsonBytes.length);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
function concatAll(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
