import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Design } from "../core/design.ts";
import { partInCrate } from "../core/design.ts";
import { solids } from "../core/crate.ts";

interface Props {
  design: Design | null;
  partPositions: Float32Array | null; // part alone, before a design exists
  hideLid: boolean;
  hideWalls: boolean;
}

const LID = /^(LP|LC-|TC-)/;
const WALL = /^(SS|ES|SC-|EC-)/;

/** Three.js view of the part and the crate pieces (SPEC 5.1). Falls back to text without WebGL. */
export function Preview3D({ design, partPositions, hideLid, hideWalls }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const failed = useRef(false);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      failed.current = true;
      el.textContent = "3D preview unavailable in this browser.";
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(1, -2, 3);
    scene.add(sun);
    // Our frame is Z up; Three.js defaults to Y up.
    camera.up.set(0, 0, 1);

    const wood = new THREE.MeshLambertMaterial({ color: 0xdeb887 });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0xc69c6d });
    const partMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
    const group = new THREE.Group();
    scene.add(group);

    const addPart = (positions: Float32Array) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, partMat);
      group.add(mesh);
    };

    if (design) {
      for (const piece of design.crate.pieces) {
        if (hideLid && LID.test(piece.id)) continue;
        if (hideWalls && WALL.test(piece.id)) continue;
        const mat = piece.material.type === "plywood" ? wood : woodDark;
        for (const b of solids(piece)) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.dx, b.dy, b.dz), mat);
          mesh.position.set(b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz / 2);
          group.add(mesh);
        }
      }
      for (const o of design.layout.partOrigins) addPart(partInCrate(design.frame, o));
    } else if (partPositions) {
      addPart(partPositions);
    }

    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 100);
    camera.position.set(center.x - radius * 1.2, center.y - radius * 1.6, center.z + radius * 1.0);
    camera.near = radius / 100;
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();

    const resize = () => {
      const w = el.clientWidth || 600;
      const h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    el.appendChild(renderer.domElement);
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    let frame = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [design, partPositions, hideLid, hideWalls]);

  return <div className="preview3d" ref={mount} />;
}
