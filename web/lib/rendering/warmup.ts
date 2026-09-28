import { Camera,Scene,WebGLRenderer,WebGLRenderTarget } from 'three';
import type { RenderOptimizer } from './render-optimizer';
import { hasStudioStarted } from './startup';

export async function warmRenderer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  optimizer: RenderOptimizer | null,
  projections: Scene,
  cancelled: () => boolean,
) {
  // Subsequent puzzles compile visible materials on their first render, just
  // like the shared puzzle viewport, instead of prewarming every hidden part.
  if (hasStudioStarted()) return;
  // compileAsync also traverses hidden objects: all material/instancing variants
  // are ready before a drag first reveals a spring, groove or magnet.
  await renderer.compileAsync(scene, camera);
  if (cancelled()) return;
  await renderer.compileAsync(projections, camera);
  if (cancelled()) return;
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  optimizer?.updateBounds();
  optimizer?.prepareWarmup();
  const target = new WebGLRenderTarget(32, 32),
    previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.shadowMap.needsUpdate = true;
    // Compile alone does not allocate geometry/instance buffers or shadow maps.
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
    optimizer?.prepareCamera(camera);
  }
}
