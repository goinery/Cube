import * as T from 'three';

/** Fade only the mechanics; cap materials and auxiliary views are untouched. */
export class MinimalRenderer {
  changed = false;
  private weight = 1;
  private materials = new Map<
    T.Material,
    {
      opacity: number;
      lastOpacity: number;
      transparent: boolean;
      visible: boolean;
      depthWrite: boolean;
    }
  >();
  private meshes = new Map<T.Mesh, boolean>();

  constructor(roots: T.Object3D[], caps: Iterable<T.Mesh>) {
    const keep = new Set(caps);
    const capMaterials = new Set(
      [...keep].flatMap((mesh) =>
        Array.isArray(mesh.material) ? mesh.material : [mesh.material],
      ),
    );
    roots.forEach((root) =>
      root.traverse((object) => {
        if (!(object instanceof T.Mesh) || keep.has(object)) return;
        this.meshes.set(object, object.castShadow);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (capMaterials.has(material) || this.materials.has(material))
            continue;
          this.materials.set(material, {
            opacity: material.opacity,
            lastOpacity: material.opacity,
            transparent: material.transparent,
            visible: material.visible,
            depthWrite: material.depthWrite,
          });
        }
      }),
    );
  }

  update(minimal: boolean, dt: number) {
    const goal = minimal ? 0 : 1;
    const previous = this.weight;
    this.weight = T.MathUtils.damp(this.weight, goal, 18, dt);
    if (Math.abs(this.weight - goal) < 0.002) this.weight = goal;
    this.changed = previous !== this.weight;
    for (const [material, original] of this.materials) {
      // Contact shadows can change their base opacity during an explosion.
      if (material.opacity !== original.lastOpacity)
        original.opacity = material.opacity;
      const transparent = this.weight < 1 || original.transparent;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = original.opacity * this.weight;
      original.lastOpacity = material.opacity;
      material.visible = original.visible && this.weight > 0;
      material.depthWrite = original.depthWrite && this.weight === 1;
    }
    for (const [mesh, casts] of this.meshes)
      mesh.castShadow = casts && this.weight === 1;
    return this.weight !== goal;
  }
}
