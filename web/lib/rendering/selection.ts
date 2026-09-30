import { BackSide, Mesh, MeshBasicMaterial, Vector3 } from 'three';

export function createSelectionOutlines(
  caps: ReadonlyMap<string, Mesh>,
  centerFor: (id: string) => Vector3 = () => new Vector3(),
) {
  const material = new MeshBasicMaterial({
    color: '#f0f0f0',
    side: BackSide,
    transparent: true,
    opacity: 0.88,
  });
  const outlines = new Map<string, Mesh>();
  for (const [id, cap] of caps) {
    const outline = new Mesh(cap.geometry, material);
    outline.userData.ignoreBounds = true;
    outline.userData.selectionOutline = true;
    outline.scale.set(1.07, 1.07, 1.08);
    // Scale around the tile, including caps defined in the piece's frame.
    outline.position.copy(centerFor(id)).multiply(
      new Vector3(1, 1, 1).sub(outline.scale),
    );
    outline.visible = false;
    outline.updateMatrix();
    cap.add(outline);
    outlines.set(id, outline);
  }
  return {
    outlines,
    update(selected: readonly string[]) {
      const ids = new Set(selected);
      for (const [id, outline] of outlines) outline.visible = ids.has(id);
    },
    dispose() {
      for (const outline of outlines.values()) outline.removeFromParent();
      material.dispose();
    },
  };
}
