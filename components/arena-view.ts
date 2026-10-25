import { Box3, OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from "three/webgpu";
import { ROOM, inside, type Point } from "../lib/simulation";

/** Classic isometric view; fit all eight room bounds, including the rear walls. */
export function fitCamera(camera: OrthographicCamera, width: number, height: number) {
  camera.position.set(ROOM.width / 2 + 1000, 1030, ROOM.height / 2 + 1000);
  camera.lookAt(ROOM.width / 2, 30, ROOM.height / 2);
  camera.updateMatrixWorld();
  const bounds = new Box3();
  for (const x of [-45, ROOM.width + 45]) for (const y of [-18, 150]) for (const z of [-45, ROOM.height + 45]) {
    bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  const aspect = width / Math.max(1, height);
  const halfHeight = Math.max((bounds.max.y - bounds.min.y) / 2, (bounds.max.x - bounds.min.x) / 2 / aspect) * 1.12;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
  camera.top = cy + halfHeight; camera.bottom = cy - halfHeight;
  camera.updateProjectionMatrix();
}

const ray = new Raycaster(), pointer = new Vector2(), intersection = new Vector3();
const floor = new Plane(new Vector3(0, 1, 0), 0);
/** NDC pointer onto the gameplay floor, never onto visual projectile height. */
export function floorAim(camera: OrthographicCamera, x: number, y: number): Point | null {
  pointer.set(x, y); ray.setFromCamera(pointer, camera);
  if (!ray.ray.intersectPlane(floor, intersection)) return null;
  const point = { x: intersection.x, y: intersection.z };
  return inside(point) ? point : null;
}
