import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { MinimalRenderer } from '@/lib/rendering/minimal';
import { CubeRenderOptimizer } from '@/lib/cube/render-optimizer';
import { buildPuzzle } from '@/lib/puzzle/geometry';
import { paintFace } from '@/lib/puzzle/appearance';
import { fitDistance } from '@/lib/cube/interaction';
import { HiddenFaces } from '@/lib/puzzle/hidden-faces';
import { moveSpec } from '@/lib/puzzle/model';
import type { Session } from '@/lib/puzzle/session';
import type { Track } from '@/lib/puzzle/motion';
import {
  StudioEnvironment,
  createContactShadow,
  createPlasticGrain,
} from '@/lib/cube/studio';
import {
  rotateView,
  zoomView,
  lightRotation,
  PRODUCT_DIRECTION,
  PRODUCT_OCCUPANCY,
  transitionView,
  updateDepthRange,
} from '@/lib/cube/camera';
import { i18n, t } from '@/lib/i18n';

export default function PuzzleViewport({ session }: { session: Session }) {
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const el = host.current!,
      def = session.def;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setError(true);
      return;
    }
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.setClearColor(0, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = 'none';
    el.appendChild(renderer.domElement);
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(30, 1, 0.01, 100),
      target = new T.Vector3();
    camera.position
      .copy(PRODUCT_DIRECTION)
      .multiplyScalar(def.id === 'megaminx' ? 10.4 : 9.5);
    camera.lookAt(target);
    const environment = new StudioEnvironment(),
      pmrem = new T.PMREMGenerator(renderer),
      env = pmrem.fromScene(environment, 0.035);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.5;
    environment.dispose();
    pmrem.dispose();
    scene.add(new T.HemisphereLight(0xf2f4f7, 0x17191d, 0.4));
    const rig = new T.Group(),
      key = new T.DirectionalLight(0xfff3e6, 2.8),
      fill = new T.DirectionalLight(0xfffbf5, 1.2),
      rim = new T.DirectionalLight(0xd6e5ff, 1.15);
    key.position.set(-3, 7, 5);
    fill.position.set(6, 1, 5);
    rim.position.set(4, 3, -5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.normalBias = 0.008;
    key.shadow.bias = -0.00008;
    rig.add(key, fill, rim);
    scene.add(rig);
    const ground = new T.Mesh(
      new T.PlaneGeometry(80, 80),
      new T.ShadowMaterial({
        opacity: 0.1,
        color: '#101720',
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = def.id === 'megaminx' ? -1.98 : -1.57;
    ground.receiveShadow = true;
    scene.add(ground);
    const contactMap = createContactShadow(),
      contact = new T.Mesh(
        new T.PlaneGeometry(5, 5),
        new T.MeshBasicMaterial({
          map: contactMap,
          transparent: true,
          opacity: 0.55,
          toneMapped: false,
          depthWrite: false,
        }),
      );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = ground.position.y + 0.004;
    scene.add(contact);
    const model = buildPuzzle(def, renderer.capabilities.getMaxAnisotropy());
    scene.add(model.root);
    const mechanics: T.Mesh[] = [],
      caps = [...model.caps.values()];
    const capSet = new Set(caps);
    model.root.traverse((object) => {
      if (object instanceof T.Mesh && !capSet.has(object))
        mechanics.push(object);
    });
    const optimizer = new CubeRenderOptimizer(mechanics, caps, {
      occlusion: 'coverage',
    });
    scene.add(optimizer.group);
    // Three builds the colour list before rendering shadows. Keep independent
    // light-view instances so camera culling cannot remove shadow casters.
    const drawShadows = renderer.shadowMap.render.bind(renderer.shadowMap);
    renderer.shadowMap.render = (lights, shadowScene, shadowCamera) => {
      if (!renderer.shadowMap.enabled || !renderer.shadowMap.needsUpdate)
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
        get: () => optimizer.stats,
      });
    const grain = createPlasticGrain(renderer.capabilities.getMaxAnisotropy());
    model.caps.forEach((mesh) => {
      const material = mesh.material as T.MeshPhysicalMaterial;
      material.bumpMap = grain;
      material.bumpScale = 0.0006;
    });
    const textures = new Map<string, T.CanvasTexture>();
    const hiddenMaps = new HiddenFaces(def, model.caps);
    const minimal = new MinimalRenderer([scene], model.caps.values());
    scene.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
    scene.matrixWorldAutoUpdate = false;
    let cameraDestination: {
      position: T.Vector3;
      target: T.Vector3;
      orientation: T.Quaternion;
    } | null = null;
    const raycaster = new T.Raycaster(),
      pointer = new T.Vector2(),
      hitObjects = [
        ...hiddenMaps.hitMeshes,
        ...model.caps.values(),
        ...model.models.map((m) => m.shell),
      ];
    raycaster.layers.enable(1);
    const homes = def.pieces.map((piece) => new T.Vector3(...piece.home)),
      radials = homes.map((home) => home.clone().normalize()),
      poses = homes.map(() => new T.Quaternion()),
      modelBounds = new T.Box3(),
      meshBounds = new T.Box3(),
      surface = new T.Vector3();
    let boundsDirty = true,
      optimizerDirty = true;
    let previousLayout: typeof session.state | undefined,
      wasMoving = false;
    const damp = (value: number, goal: number, rate: number, dt: number) => {
      const next = T.MathUtils.damp(value, goal, rate, dt);
      return Math.abs(next - goal) < 1e-6 ? goal : next;
    };
    let disposed = false,
      frame = 0,
      last = performance.now(),
      art = -1,
      artRequest = 0,
      explode = 0,
      gap = 0.008,
      size = 1,
      internal = 1,
      offset = 0,
      magnetWeight = 1,
      followFit = false;
    let drag: {
      track: Track;
      start: number;
      x: number;
      y: number;
      sx: number;
      sy: number;
      lastAngle: number;
      time: number;
    } | null = null;
    let down: {
      id: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
      hit: T.Intersection | null;
      orbit: boolean;
      moved: boolean;
    } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: {
      x: number;
      y: number;
      distance: number;
      angle: number;
    } | null = null;
    function invalidate() {
      if (!disposed && !frame && !document.hidden)
        frame = requestAnimationFrame(render);
    }
    function updateArt() {
      if (art === session.state.artVersion) return;
      art = session.state.artVersion;
      const request = ++artRequest;
      const appearance = session.state.appearance,
        res =
          session.state.settings.quality === 'low'
            ? 512
            : def.order >= 4
              ? 1024
              : 768;
      void Promise.all(
        def.faces.map(async (face) => {
          const canvas = document.createElement('canvas');
          await paintFace(canvas, def, face.id, appearance, [], res);
          return { face, canvas };
        }),
      )
        .then((items) => {
          if (disposed || request !== artRequest) return;
          for (const { face, canvas } of items) {
            const texture = new T.CanvasTexture(canvas);
            texture.colorSpace = T.SRGBColorSpace;
            texture.anisotropy = Math.min(
              renderer.capabilities.getMaxAnisotropy(),
              8,
            );
            const previous = textures.get(face.id);
            textures.set(face.id, texture);
            def.tiles
              .filter((tile) => tile.face === face.id)
              .forEach((tile) => {
                const mesh = model.caps.get(tile.id)!,
                  material = mesh.material as T.MeshPhysicalMaterial;
                material.color.set('#ffffff');
                material.map = texture;
                material.needsUpdate = true;
              });
            previous?.dispose();
          }
          invalidate();
        })
        .catch(() => {
          if (!disposed) session.notify('art.failed');
        });
    }
    function layout(now: number, dt: number) {
      const state = session.state,
        settings = state.settings;
      const oldExplode = explode,
        oldGap = gap,
        oldSize = size,
        oldInternal = internal,
        oldOffset = offset,
        oldMagnets = magnetWeight;
      explode = damp(explode, settings.explode, 10, dt);
      gap = damp(gap, settings.gap, 10, dt);
      size = damp(size, settings.size, 10, dt);
      internal = damp(internal, settings.internal, 10, dt);
      offset = damp(offset, settings.stickerOffset, 10, dt);
      magnetWeight = damp(magnetWeight, settings.showMagnets ? 1 : 0, 12, dt);
      const separation = explode * 0.7,
        inner = Math.max(0, explode - 1) * internal;
      const partsChanged =
        !previousLayout ||
        oldExplode !== explode ||
        oldInternal !== internal ||
        oldOffset !== offset ||
        oldMagnets !== magnetWeight;
      const poseChanged =
        !previousLayout ||
        state.puzzle !== previousLayout.puzzle ||
        state.motionVersion !== previousLayout.motionVersion ||
        session.motion.moving ||
        wasMoving;
      const shapeChanged =
        partsChanged || poseChanged || oldGap !== gap || oldSize !== size;
      if (poseChanged) session.motion.writePoses(poses, now);
      if (shapeChanged)
        model.models.forEach((piece, i) => {
          const home = homes[i],
            pose = poses[i],
            radial = radials[i];
          piece.root.quaternion.copy(pose);
          piece.root.position
            .copy(home)
            .addScaledVector(radial, separation + gap * 1.5)
            .applyQuaternion(pose);
          piece.root.scale.setScalar(size);
          piece.root.updateMatrix();
          if (partsChanged)
            piece.parts.forEach((part) => {
              part.object.position
                .copy(part.base)
                .addScaledVector(
                  part.direction,
                  inner * part.spread + (part.cap ? offset : 0),
                );
              if (part.magnet) {
                part.object.scale.setScalar(magnetWeight);
                part.object.visible = magnetWeight > 0.001;
              }
              part.object.updateMatrix();
            });
        });
      if (partsChanged) {
        model.core.scale.setScalar(1 + inner * 0.18);
        model.core.updateMatrix();
      }
      if (shapeChanged) {
        boundsDirty = optimizerDirty = true;
        renderer.shadowMap.needsUpdate = true;
      }
      model.caps.forEach((mesh, id) => {
        const mat = mesh.material as T.MeshPhysicalMaterial;
        mat.roughness = damp(mat.roughness, settings.roughness, 10, dt);
        mat.clearcoatRoughness = 0.07 + mat.roughness * 0.25;
        if (state.selected !== previousLayout?.selected)
          mat.emissive.set(state.selected.includes(id) ? '#3b4724' : '#000000');
        mat.emissiveIntensity = 0.2;
      });
      contact.material.opacity = 0.55 / (1 + explode * 2);
      previousLayout = state;
      wasMoving = session.motion.moving;
      return (
        Math.abs(explode - settings.explode) +
          Math.abs(gap - settings.gap) +
          Math.abs(size - settings.size) +
          Math.abs(internal - settings.internal) +
          Math.abs(offset - settings.stickerOffset) +
          Math.abs(magnetWeight - (settings.showMagnets ? 1 : 0)) +
          Math.abs(
            (
              model.caps.values().next().value!
                .material as T.MeshPhysicalMaterial
            ).roughness - settings.roughness,
          ) >
        0.0001
      );
    }
    function updateBounds() {
      if (!boundsDirty) return;
      model.root.updateMatrixWorld();
      modelBounds.makeEmpty();
      for (const mesh of [...mechanics, ...caps])
        modelBounds.union(
          meshBounds
            .copy(mesh.geometry.boundingBox!)
            .applyMatrix4(mesh.matrixWorld),
        );
      modelBounds.getSize(surface);
      boundsDirty = false;
    }
    const previousLightRotation = new T.Quaternion(0, 0, 0, 0);
    let previousShadowRadius = -1;
    function render(now: number) {
      frame = 0;
      if (disposed || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      session.motion.tick(now);
      updateArt();
      const transitioning = layout(now, dt),
        settings = session.state.settings;
      if (followFit) {
        fit(false);
        if (!transitioning) followFit = false;
      }
      if (cameraDestination) {
        const d = cameraDestination;
        transitionView(
          camera,
          target,
          d.position,
          d.target,
          d.orientation,
          1 - Math.exp(-dt * 7),
        );
        if (
          camera.position.distanceTo(d.position) < 0.002 &&
          target.distanceTo(d.target) < 0.002 &&
          camera.quaternion.angleTo(d.orientation) < 0.001
        ) {
          transitionView(
            camera,
            target,
            d.position,
            d.target,
            d.orientation,
            1,
          );
          cameraDestination = null;
        }
      }
      if (settings.autoRotate && !cameraDestination && !drag && !down && !pinch)
        rotateView(camera, target, dt * 0.22, 0);
      rig.quaternion.slerp(
        lightRotation(
          settings.lightAzimuth,
          settings.lightElevation,
          settings.lightFollowCamera,
          camera.quaternion,
        ),
        1 - Math.exp(-10 * dt),
      );
      key.intensity = T.MathUtils.damp(
        key.intensity,
        settings.lightIntensity,
        10,
        dt,
      );
      fill.intensity = (key.intensity * 1.2) / 2.8;
      rim.intensity = (key.intensity * 1.15) / 2.8;
      scene.environmentRotation.setFromQuaternion(rig.quaternion);
      if (!previousLightRotation.equals(rig.quaternion)) {
        previousLightRotation.copy(rig.quaternion);
        rig.updateMatrix();
        renderer.shadowMap.needsUpdate = true;
      }
      camera.lookAt(target);
      camera.updateMatrixWorld();
      updateBounds();
      const box = modelBounds,
        floor = box.min.y - 0.065;
      const shadowRadius = Math.max(3, surface.length() / 2 + 0.5);
      if (shadowRadius !== previousShadowRadius) {
        previousShadowRadius = shadowRadius;
        key.shadow.camera.left = -shadowRadius;
        key.shadow.camera.right = shadowRadius;
        key.shadow.camera.top = shadowRadius;
        key.shadow.camera.bottom = -shadowRadius;
        key.shadow.camera.near = 0.1;
        key.shadow.camera.far = key.position.length() + shadowRadius * 2 + 4;
        key.shadow.camera.updateProjectionMatrix();
        renderer.shadowMap.needsUpdate = true;
      }
      ground.position.y = Math.min(
        floor,
        T.MathUtils.damp(ground.position.y, floor, 10, dt),
      );
      contact.position.set(
        (box.min.x + box.max.x) / 2,
        ground.position.y + 0.002,
        (box.min.z + box.max.z) / 2,
      );
      contact.scale.set((surface.x * 1.65) / 5, (surface.z * 1.65) / 5, 1);
      ground.updateMatrix();
      contact.updateMatrix();
      scene.updateMatrixWorld();
      if (optimizerDirty) {
        optimizer.updateBounds();
        optimizerDirty = false;
      }
      updateDepthRange(camera, box);
      const maps = hiddenMaps.update(
        camera,
        target,
        session.state.view === 'hidden' && !session.state.presentation,
        dt,
      );
      const old = session.state.faceAnchors || {};
      if (JSON.stringify(old) !== JSON.stringify(maps.anchors))
        session.patch({ faceAnchors: maps.anchors });
      const minimalMoving = minimal.update(settings.minimal, dt);
      renderer.shadowMap.needsUpdate ||= minimal.changed;
      optimizer.prepareCamera(camera);
      renderer.render(scene, camera);
      hiddenMaps.render(renderer, camera);
      const direction = camera.position.clone().sub(target).normalize(),
        hidden = def.faces
          .filter((f) => new T.Vector3(...f.normal).dot(direction) < -0.05)
          .map((f) => f.id);
      if (hidden.join('|') !== session.state.hiddenFaces.join('|'))
        session.patch({ hiddenFaces: hidden });
      if (
        session.motion.moving ||
        cameraDestination ||
        settings.autoRotate ||
        transitioning ||
        minimalMoving ||
        maps.moving ||
        Math.abs(ground.position.y - floor) > 0.0001 ||
        Math.abs(key.intensity - settings.lightIntensity) > 0.001 ||
        rig.quaternion.angleTo(
          lightRotation(
            settings.lightAzimuth,
            settings.lightElevation,
            settings.lightFollowCamera,
            camera.quaternion,
          ),
        ) > 0.001
      )
        invalidate();
    }
    let lastWidth = 0,
      lastHeight = 0,
      lastPixelRatio = 0;
    function resize() {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      const q = session.state.settings.quality,
        ratio = Math.min(
          devicePixelRatio,
          q === 'low'
            ? 1
            : q === 'high'
              ? 2
              : matchMedia('(max-width:760px)').matches
                ? 1.5
                : 2,
        );
      if (
        width === lastWidth &&
        height === lastHeight &&
        ratio === lastPixelRatio
      )
        return;
      const resized = lastWidth > 0;
      lastWidth = width;
      lastHeight = height;
      lastPixelRatio = ratio;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height);
      if (resized) fit(false);
      invalidate();
    }
    function moveCamera(
      direction: T.Vector3,
      occupancy = 0.75,
      up = camera.up,
      objects: T.Object3D[] = [model.root],
      instant = false,
    ) {
      updateBounds();
      const box = new T.Box3();
      objects.forEach((object) =>
        box.union(
          object === model.root
            ? modelBounds
            : new T.Box3().setFromObject(object),
        ),
      );
      const center = box.getCenter(new T.Vector3()),
        distance = fitDistance(
          Object.assign(camera.clone(), { up: up.clone() }),
          box,
          direction,
          center,
          occupancy,
        ),
        position = center
          .clone()
          .addScaledVector(direction.clone().normalize(), distance),
        destination = camera.clone();
      destination.position.copy(position);
      destination.up.copy(up);
      destination.lookAt(center);
      cameraDestination = {
        position,
        target: center,
        orientation: destination.quaternion.clone(),
      };
      if (instant) {
        transitionView(
          camera,
          target,
          position,
          center,
          destination.quaternion,
          1,
        );
        cameraDestination = null;
      }
      invalidate();
    }
    function fit(reset = false, instant = false) {
      followFit =
        Math.abs(explode - session.state.settings.explode) +
          Math.abs(internal - session.state.settings.internal) >
        0.001;
      moveCamera(
        reset ? PRODUCT_DIRECTION : camera.position.clone().sub(target),
        reset ? PRODUCT_OCCUPANCY : 0.75,
        reset ? new T.Vector3(0, 1, 0) : camera.up,
        [model.root],
        instant,
      );
    }
    session.camera = {
      fit: () => fit(),
      reset: () => fit(true),
      focus: () => {
        const selected = session.state.selected[0],
          cap = selected ? model.caps.get(selected) : undefined;
        if (!cap) {
          session.notify('camera.select');
          return;
        }
        moveCamera(camera.position.clone().sub(target), 0.9, camera.up, [cap]);
      },
      face: (id) => {
        const face = def.faces.find((f) => f.id === id);
        if (face)
          moveCamera(
            new T.Vector3(...face.normal),
            0.75,
            new T.Vector3(...face.up),
          );
      },
    };
    function hit(x: number, y: number) {
      const rect = el.getBoundingClientRect();
      pointer.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const visible = hitObjects.filter((object) => {
        if (session.state.settings.minimal && !object.userData.tile)
          return false;
        for (let p: T.Object3D | null = object; p; p = p.parent)
          if (!p.visible) return false;
        return optimizer.isVisible(object);
      });
      return (
        raycaster.intersectObjects(
          visible.filter((o) => o.userData.mapping),
          false,
        )[0] ??
        raycaster.intersectObjects(
          visible.filter((o) => !o.userData.mapping),
          false,
        )[0] ??
        null
      );
    }
    function pinchState() {
      const ps = [...pointers.values()];
      if (ps.length < 2) return null;
      return {
        x: (ps[0].x + ps[1].x) / 2,
        y: (ps[0].y + ps[1].y) / 2,
        distance: Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y),
        angle: Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x),
      };
    }
    function finish(cancel = false) {
      if (drag) {
        session.motion.release(drag.track, cancel);
        drag = null;
      }
      down = null;
      invalidate();
    }
    function onDown(e: PointerEvent) {
      if (session.state.solving) return;
      cameraDestination = null;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      renderer.domElement.setPointerCapture(e.pointerId);
      if (pointers.size > 1) {
        finish(true);
        pinch = pinchState();
        return;
      }
      const h = hit(e.clientX, e.clientY);
      down = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        hit: h,
        orbit:
          !h ||
          e.button !== 0 ||
          e.shiftKey ||
          ['camera', 'explode'].includes(session.state.mode),
        moved: false,
      };
      invalidate();
      e.preventDefault();
    }
    function onMove(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) {
        const next = pinchState();
        if (next) {
          zoomView(camera, target, pinch.distance / Math.max(next.distance, 1));
          rotateView(
            camera,
            target,
            (next.x - pinch.x) * 0.005,
            (next.y - pinch.y) * 0.005,
            Math.atan2(
              Math.sin(next.angle - pinch.angle),
              Math.cos(next.angle - pinch.angle),
            ),
          );
          pinch = next;
          invalidate();
        }
        return;
      }
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.startX,
        dy = e.clientY - down.startY;
      if (Math.hypot(dx, dy) > 5) down.moved = true;
      if (down.orbit) {
        rotateView(
          camera,
          target,
          e.shiftKey ? 0 : (e.clientX - down.x) * 0.005,
          e.shiftKey ? 0 : (e.clientY - down.y) * 0.005,
          e.shiftKey ? (e.clientX - down.x) * 0.005 : 0,
        );
        down.x = e.clientX;
        down.y = e.clientY;
        invalidate();
        return;
      }
      if (
        session.state.mode !== 'play' ||
        !down.hit ||
        down.hit.object.userData.mapping
      )
        return;
      if (!drag && Math.hypot(dx, dy) > 5) {
        const piece = down.hit.object.userData.piece as number,
          position = down.hit.point,
          tile = def.tiles.find(
            (tile) => tile.id === down!.hit!.object.userData.tile,
          ),
          normal = tile
            ? new T.Vector3(
                ...def.faces.find((f) => f.id === tile.face)!.normal,
              ).transformDirection(down.hit.object.matrixWorld)
            : down.hit.face?.normal
                .clone()
                .transformDirection(down.hit.object.matrixWorld);
        let best: {
          score: number;
          token: string;
          sx: number;
          sy: number;
        } | null = null;
        for (const token of def.primitiveMoves) {
          const move = moveSpec(def, token);
          if (
            !move.affects(piece, session.state.puzzle.rotations[piece]) ||
            (normal && Math.abs(normal.dot(new T.Vector3(...move.axis))) > 0.97)
          )
            continue;
          const tangent = new T.Vector3(...move.axis).cross(position),
            a = position.clone().project(camera),
            b = position.clone().addScaledVector(tangent, 0.01).project(camera),
            sx = ((b.x - a.x) * el.clientWidth) / 2 / 0.01,
            sy = (-(b.y - a.y) * el.clientHeight) / 2 / 0.01,
            pixels = Math.hypot(sx, sy);
          if (pixels < 12) continue;
          const score = Math.abs(dx * sx + dy * sy) / pixels;
          if (!best || score > best.score) best = { score, token, sx, sy };
        }
        if (best) {
          session.pause();
          session.patch({ player: null });
          const track = session.motion.beginDrag(best.token);
          if (!track) {
            session.notify('motion.outOfTolerance', {
              degrees: session.state.settings.turnTolerance,
            });
            down = null;
            return;
          }
          drag = {
            track,
            start: track.angle,
            x: down.startX,
            y: down.startY,
            sx: best.sx,
            sy: best.sy,
            lastAngle: track.angle,
            time: performance.now(),
          };
        }
      }
      if (drag) {
        const now = performance.now(),
          angle =
            drag.start +
            ((e.clientX - drag.x) * drag.sx + (e.clientY - drag.y) * drag.sy) /
              (drag.sx * drag.sx + drag.sy * drag.sy),
          velocity =
            (angle - drag.lastAngle) /
            Math.max(0.005, (now - drag.time) / 1000);
        session.motion.drag(drag.track, angle, velocity);
        drag.lastAngle = angle;
        drag.time = now;
        invalidate();
      }
    }
    function onUp(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        down = null;
        invalidate();
        return;
      }
      if (down && !down.moved && !drag) {
        const tile = down.hit?.object.userData.tile;
        if (tile && ['customize', 'inspect'].includes(session.state.mode))
          session.select(tile);
        else if (!down.hit) {
          if (session.state.presentation)
            session.settings({
              autoRotate: !session.state.settings.autoRotate,
            });
          else session.patch({ selected: [] });
        }
      }
      finish(e.type === 'pointercancel');
    }
    function wheel(e: WheelEvent) {
      e.preventDefault();
      cameraDestination = null;
      zoomView(camera, target, Math.exp(e.deltaY * 0.001));
      invalidate();
    }
    function double(e: MouseEvent) {
      const h = hit(e.clientX, e.clientY),
        tile = h?.object.userData.tile;
      if (tile) {
        session.select(tile, false);
        session.camera.focus();
      }
    }
    function context(e: Event) {
      e.preventDefault();
    }
    function lostCapture(e: PointerEvent) {
      if (pointers.has(e.pointerId)) {
        pointers.delete(e.pointerId);
        finish(true);
      }
    }
    function contextLost(e: Event) {
      e.preventDefault();
      session.pause();
      session.motion.freeze();
      setError(true);
    }
    function visibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        last = performance.now();
        invalidate();
      }
    }
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', lostCapture);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', double);
    canvas.addEventListener('contextmenu', context);
    document.addEventListener('visibilitychange', visibility);
    const lang = () => canvas.setAttribute('aria-label', t('camera.hint'));
    lang();
    i18n.on('languageChanged', lang);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let previousState = session.state;
    const unsubscribe = session.subscribe(() => {
      const state = session.state,
        before = previousState;
      previousState = state;
      if (state.settings.quality !== before.settings.quality) {
        art = -1;
        resize();
      }
      if (
        state.puzzle !== before.puzzle ||
        state.motionVersion !== before.motionVersion ||
        state.settings !== before.settings ||
        state.selected !== before.selected ||
        state.artVersion !== before.artVersion ||
        state.view !== before.view ||
        state.presentation !== before.presentation
      )
        invalidate();
    });
    updateArt();
    layout(performance.now(), 1);
    fit(true, true);
    invalidate();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unsubscribe();
      observer.disconnect();
      i18n.off('languageChanged', lang);
      document.removeEventListener('visibilitychange', visibility);
      session.motion.freeze();
      canvas.removeEventListener('lostpointercapture', lostCapture);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.remove();
      hiddenMaps.dispose();
      optimizer.dispose();
      model.dispose();
      textures.forEach((texture) => texture.dispose());
      grain.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
      contactMap.dispose();
      env.dispose();
      key.shadow.dispose();
      renderer.dispose();
      session.camera = {
        fit: () => {},
        reset: () => {},
        focus: () => {},
        face: () => {},
      };
    };
  }, [session]);
  return (
    <div className="viewport" ref={host}>
      {error && <div className="fatal-error">{t('common.error')}</div>}
    </div>
  );
}
