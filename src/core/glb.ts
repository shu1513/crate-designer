import { DesignError, MESSAGES } from "./errors.ts";

/**
 * Minimal glTF 2.0 binary (.glb) reader: default scene, node transforms applied,
 * every triangle-list primitive merged into one flat triangle array. Pure
 * TypeScript so it runs in the worker and in Node tests. Compressed or sparse
 * data is refused with E1 rather than guessed at (SPEC R1, E1).
 */

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const MODE_TRIANGLES = 4;

type Mat4 = Float64Array; // column-major 4x4

interface GltfJson {
  asset?: { version?: string; generator?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: GltfPrimitive[] }[];
  accessors?: GltfAccessor[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers?: { byteLength: number; uri?: string }[];
  extensionsRequired?: string[];
}
interface GltfNode {
  children?: number[];
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface GltfPrimitive {
  attributes: { POSITION?: number };
  indices?: number;
  mode?: number;
  extensions?: Record<string, unknown>;
}
interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  sparse?: unknown;
}

export interface GlbMesh {
  /** 9 floats per triangle (x y z × 3), in the file's own units and frame. */
  positions: Float32Array;
  triangleCount: number;
  /** The program that wrote the file (asset.generator), used only to guess the up axis. */
  generator: string;
}

/**
 * Guesses which axis is up. glTF itself is Y up, and most exporters (Blender, CAD plug-ins) follow
 * that; files written by trimesh keep the source scene's axes, and Hadrian's are Z up.
 */
export function guessUpAxis(generator: string): "Z" | "Y" {
  return /trimesh/i.test(generator) ? "Z" : "Y";
}

function fail(): never {
  throw new DesignError("E1", MESSAGES.E1);
}

export function parseGlb(bytes: ArrayBuffer): GlbMesh {
  if (bytes.byteLength < 20) fail();
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== MAGIC) fail();
  if (view.getUint32(4, true) !== 2) fail();

  let offset = 12;
  let json: GltfJson | null = null;
  let bin: ArrayBuffer | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + chunkLength > bytes.byteLength) fail();
    if (chunkType === CHUNK_JSON) {
      try {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, start, chunkLength))) as GltfJson;
      } catch {
        fail();
      }
    } else if (chunkType === CHUNK_BIN && bin === null) {
      bin = bytes.slice(start, start + chunkLength);
    }
    offset = start + chunkLength;
  }
  if (!json || !bin) fail();
  if (json.extensionsRequired?.some((e) => /draco|meshopt|quantization/i.test(e))) fail();
  // A .glb carries exactly one embedded buffer (index 0, no uri). External buffers cannot be read here.
  if (!json.buffers?.[0] || json.buffers[0].uri !== undefined) fail();

  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  if (!scene) fail();

  const chunks: Float32Array[] = [];
  let total = 0;
  const visit = (nodeIndex: number, parent: Mat4, depth: number): void => {
    if (depth > 64) fail(); // cyclic graph guard
    const node = json.nodes?.[nodeIndex];
    if (!node) fail();
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      if (!mesh) fail();
      for (const prim of mesh.primitives) {
        const tris = readPrimitive(json, bin, prim, world);
        if (tris.length > 0) {
          chunks.push(tris);
          total += tris.length;
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  for (const root of scene.nodes ?? []) visit(root, identity(), 0);

  const positions = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    positions.set(c, at);
    at += c.length;
  }
  return { positions, triangleCount: total / 9, generator: json.asset?.generator ?? "" };
}

function readPrimitive(json: GltfJson, bin: ArrayBuffer, prim: GltfPrimitive, world: Mat4): Float32Array {
  if ((prim.mode ?? MODE_TRIANGLES) !== MODE_TRIANGLES) return new Float32Array(0); // points/lines are not solid geometry
  if (prim.extensions && Object.keys(prim.extensions).some((e) => /draco|meshopt/i.test(e))) fail();
  if (prim.attributes.POSITION === undefined) fail();
  const positions = readAccessor(json, bin, prim.attributes.POSITION, 3, Float32Array);
  const vertexCount = positions.length / 3;
  let indices: ArrayLike<number>;
  if (prim.indices !== undefined) {
    indices = readIndexAccessor(json, bin, prim.indices);
  } else {
    indices = Array.from({ length: vertexCount }, (_, i) => i);
  }
  const triCount = Math.floor(indices.length / 3);
  const out = new Float32Array(triCount * 9);
  for (let t = 0; t < triCount; t++) {
    for (let v = 0; v < 3; v++) {
      const vi = indices[t * 3 + v];
      if (vi === undefined || vi >= vertexCount) fail();
      const x = positions[vi * 3] ?? 0;
      const y = positions[vi * 3 + 1] ?? 0;
      const z = positions[vi * 3 + 2] ?? 0;
      const o = t * 9 + v * 3;
      out[o] = world[0]! * x + world[4]! * y + world[8]! * z + world[12]!;
      out[o + 1] = world[1]! * x + world[5]! * y + world[9]! * z + world[13]!;
      out[o + 2] = world[2]! * x + world[6]! * y + world[10]! * z + world[14]!;
    }
  }
  return out;
}

type TypedCtor<T> = { new (buffer: ArrayBuffer, byteOffset: number, length: number): T; BYTES_PER_ELEMENT: number };

/** Validates a bufferView/accessor pair and returns the absolute byte offset of element 0. */
function accessorBase(json: GltfJson, bin: ArrayBuffer, acc: GltfAccessor, elementSize: number, stride: number): number {
  const bv = json.bufferViews?.[acc.bufferView ?? -1];
  if (!bv || bv.buffer !== 0) fail();
  const viewStart = bv.byteOffset ?? 0;
  if (viewStart + bv.byteLength > bin.byteLength) fail();
  const inView = (acc.byteOffset ?? 0) + (acc.count - 1) * stride + elementSize;
  if (acc.count < 1 || inView > bv.byteLength) fail();
  return viewStart + (acc.byteOffset ?? 0);
}

function readAccessor(json: GltfJson, bin: ArrayBuffer, index: number, components: number, Ctor: TypedCtor<Float32Array>): Float32Array {
  const acc = json.accessors?.[index];
  if (!acc || acc.sparse || acc.bufferView === undefined || acc.componentType !== 5126) fail();
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) fail();
  const elementSize = components * Ctor.BYTES_PER_ELEMENT;
  const stride = bv.byteStride ?? elementSize;
  const base = accessorBase(json, bin, acc, elementSize, stride);
  const out = new Float32Array(acc.count * components);
  if (stride === elementSize) {
    if (base % 4 !== 0) fail();
    out.set(new Ctor(bin, base, acc.count * components));
    return out;
  }
  const dv = new DataView(bin);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = base + i * stride + c * 4;
      if (at + 4 > bin.byteLength) fail();
      out[i * components + c] = dv.getFloat32(at, true);
    }
  }
  return out;
}

function readIndexAccessor(json: GltfJson, bin: ArrayBuffer, index: number): ArrayLike<number> {
  const acc = json.accessors?.[index];
  if (!acc || acc.sparse || acc.bufferView === undefined || acc.type !== "SCALAR") fail();
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) fail();
  const size = acc.componentType === 5121 ? 1 : acc.componentType === 5123 ? 2 : acc.componentType === 5125 ? 4 : 0;
  if (size === 0) fail();
  const stride = bv.byteStride ?? size;
  const base = accessorBase(json, bin, acc, size, stride);
  const dv = new DataView(bin);
  const out = new Uint32Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const at = base + i * stride;
    out[i] = size === 1 ? dv.getUint8(at) : size === 2 ? dv.getUint16(at, true) : dv.getUint32(at, true);
  }
  return out;
}

function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function localMatrix(node: GltfNode): Mat4 {
  if (node.matrix && node.matrix.length === 16) return Float64Array.from(node.matrix);
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const m = new Float64Array(16);
  // Rotation from unit quaternion, then scale columns, then translation (glTF: T * R * S).
  const xx = qx! * qx!, yy = qy! * qy!, zz = qz! * qz!;
  const xy = qx! * qy!, xz = qx! * qz!, yz = qy! * qz!;
  const wx = qw! * qx!, wy = qw! * qy!, wz = qw! * qz!;
  m[0] = (1 - 2 * (yy + zz)) * sx!; m[1] = 2 * (xy + wz) * sx!;       m[2] = 2 * (xz - wy) * sx!;
  m[4] = 2 * (xy - wz) * sy!;       m[5] = (1 - 2 * (xx + zz)) * sy!; m[6] = 2 * (yz + wx) * sy!;
  m[8] = 2 * (xz + wy) * sz!;       m[9] = 2 * (yz - wx) * sz!;       m[10] = (1 - 2 * (xx + yy)) * sz!;
  m[12] = tx!; m[13] = ty!; m[14] = tz!; m[15] = 1;
  return m;
}
