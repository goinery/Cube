import { Mesh, type BufferGeometry, type Material, type Object3D } from 'three';

export function disposeMeshes(root: Object3D) {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
