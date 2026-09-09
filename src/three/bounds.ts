import * as THREE from "three";

/** Physical boards only: dimension lines and screen-sized labels must never
 * inflate the model's measurements or feed back into automatic camera fitting.
 * Include hidden boards so switching a layer doesn't change the camera target.
 */
export function modelBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const transformed = new THREE.Box3();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      transformed.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      bounds.union(transformed);
    }
  });
  return bounds;
}
