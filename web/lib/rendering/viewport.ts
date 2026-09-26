import * as T from 'three';
import {
  STUDIO_DEFAULTS as DEFAULTS,
  PUZZLE_DEFAULTS,
  type CameraDefaults,
  type Quality,
  type StudioPuzzleId,
} from '../puzzle-config';
import type { FaceDefinition } from '../puzzle/types';
import { RenderOptimizer } from './render-optimizer';
import { StudioEnvironment, createContactShadow } from './studio';

export function pixelRatio(
  quality: Quality,
  mobile = matchMedia(`(max-width: ${DEFAULTS.mobileWidth}px)`).matches,
) {
  const limits = DEFAULTS.pixelRatio;
  return Math.min(
    devicePixelRatio,
    quality === 'auto'
      ? mobile
        ? limits.mobile
        : limits.desktop
      : limits[quality],
  );
}

export function createRenderer(id: StudioPuzzleId) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULTS.exposure;
  renderer.setClearColor(0, 0);
  renderer.setPixelRatio(pixelRatio(PUZZLE_DEFAULTS[id].settings.quality));
  renderer.shadowMap.enabled = PUZZLE_DEFAULTS[id].render.shadows;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  return renderer;
}

export function initialView(
  id: StudioPuzzleId,
  faces: readonly FaceDefinition[] = [],
) {
  const preset: CameraDefaults = PUZZLE_DEFAULTS[id].camera;
  const direction = new T.Vector3(...preset.direction).normalize();
  const up = new T.Vector3(...preset.up).normalize();
  if (preset.face) {
    const face = faces.find((face) => face.id === preset.face);
    if (!face) throw new Error(`Missing initial camera face: ${preset.face}`);
    direction.set(...face.normal);
    up.set(...face.up);
    if (preset.horizontalBottomEdge) {
      // A regular pentagon's edge midpoint points outward in its face plane.
      // The opposite vector is screen-up, putting that edge level at the bottom.
      const midpoint = face.outline
        .map((a, i) => {
          const b = face.outline[(i + 1) % face.outline.length];
          return new T.Vector2((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        })
        .reduce((lowest, point) => (point.y < lowest.y ? point : lowest));
      up.set(...face.right)
        .multiplyScalar(-midpoint.x)
        .addScaledVector(new T.Vector3(...face.up), -midpoint.y)
        .normalize();
    }
  }
  if (preset.initialRollDegrees)
    up.applyAxisAngle(
      direction.clone().normalize(),
      T.MathUtils.degToRad(preset.initialRollDegrees),
    );
  return { direction, up };
}

export function createStudio(
  renderer: T.WebGLRenderer,
  id: StudioPuzzleId,
  faces?: readonly FaceDefinition[],
) {
  const { camera: preset, render: profile } = PUZZLE_DEFAULTS[id];
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(
    preset.fov,
    1,
    preset.near,
    preset.far,
  );
  const target = new T.Vector3(...preset.target);
  const initial = initialView(id, faces);
  camera.position
    .copy(initial.direction)
    .multiplyScalar(preset.distance)
    .add(target);
  camera.up.copy(initial.up);
  camera.lookAt(target);
  const environment = new StudioEnvironment(),
    pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, DEFAULTS.environment.blur);
  scene.environment = env.texture;
  scene.environmentIntensity = DEFAULTS.environment.intensity;
  environment.dispose();
  pmrem.dispose();
  const ambient = DEFAULTS.hemisphere;
  scene.add(
    new T.HemisphereLight(ambient.sky, ambient.ground, ambient.intensity),
  );
  const key = new T.DirectionalLight(
    DEFAULTS.key.color,
    DEFAULTS.key.intensity,
  );
  const fill = new T.DirectionalLight(
    DEFAULTS.fill.color,
    DEFAULTS.fill.intensity,
  );
  const rim = new T.DirectionalLight(
    DEFAULTS.rim.color,
    DEFAULTS.rim.intensity,
  );
  key.position.set(...DEFAULTS.key.position);
  fill.position.set(...DEFAULTS.fill.position);
  rim.position.set(...DEFAULTS.rim.position);
  key.castShadow = profile.shadows;
  const mobile = matchMedia(`(max-width: ${DEFAULTS.mobileWidth}px)`).matches;
  const resolution = mobile
    ? profile.mobileShadowResolution
    : profile.shadowResolution;
  key.shadow.mapSize.set(resolution, resolution);
  Object.assign(key.shadow.camera, {
    left: -profile.shadowExtent,
    right: profile.shadowExtent,
    top: profile.shadowExtent,
    bottom: -profile.shadowExtent,
  });
  key.shadow.normalBias = DEFAULTS.shadow.normalBias;
  key.shadow.bias = DEFAULTS.shadow.bias;
  key.shadow.radius = profile.shadowRadius;
  const rig = new T.Group();
  if (id === 'cube') scene.add(key, key.target, fill, rim);
  else {
    rig.add(key, fill, rim);
    scene.add(rig);
  }
  const ground = new T.Mesh(
    new T.PlaneGeometry(profile.groundSize, profile.groundSize),
    new T.ShadowMaterial({ ...DEFAULTS.ground, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = profile.groundY;
  ground.receiveShadow = true;
  if (profile.shadows) scene.add(ground);
  const contactMap = createContactShadow();
  const contact = new T.Mesh(
    new T.PlaneGeometry(profile.contactSize, profile.contactSize),
    new T.MeshBasicMaterial({
      map: contactMap,
      transparent: true,
      opacity: profile.contactOpacity,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = profile.groundY + 0.004;
  scene.add(contact);
  return {
    scene,
    camera,
    target,
    initial,
    key,
    fill,
    rim,
    rig,
    ground,
    contact,
    dispose() {
      ground.geometry.dispose();
      ground.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
      contactMap.dispose();
      key.shadow.dispose();
      env.dispose();
    },
  };
}

export function attachOptimizer(
  renderer: T.WebGLRenderer,
  scene: T.Scene,
  key: T.DirectionalLight,
  optimizer: RenderOptimizer | null,
) {
  if (optimizer) scene.add(optimizer.group);
  const drawShadows = renderer.shadowMap.render.bind(renderer.shadowMap);
  // Three collects the colour list first. Separate light-view instances keep
  // camera culling from removing off-screen shadow casters.
  renderer.shadowMap.render = (lights, shadowScene, shadowCamera) => {
    if (
      !optimizer ||
      !renderer.shadowMap.enabled ||
      !renderer.shadowMap.needsUpdate
    )
      return drawShadows(lights, shadowScene, shadowCamera);
    key.shadow.updateMatrices(key);
    optimizer.prepareShadow(key.shadow.camera);
    try {
      drawShadows(lights, shadowScene, shadowCamera);
    } finally {
      optimizer.restoreCamera();
    }
  };
  if (import.meta.env.DEV)
    Object.defineProperty(renderer.domElement, 'renderStats', {
      configurable: true,
      get: () => optimizer?.stats,
    });
}

export function createPuzzleOptimizer(
  id: StudioPuzzleId,
  mechanics: T.Mesh[],
  caps: T.Mesh[],
) {
  const profile = PUZZLE_DEFAULTS[id].render;
  return new RenderOptimizer(mechanics, caps, {
    shadows: profile.shadows,
    occlusion: profile.occlusion === 'coverage' ? 'coverage' : undefined,
  });
}

export function renderOverlay(
  renderer: T.WebGLRenderer,
  scene: T.Scene,
  camera: T.Camera,
) {
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  try {
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = autoClear;
  }
}
