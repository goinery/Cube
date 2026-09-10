import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';

export const PRODUCT_DIRECTION = new Vector3(1, 0.65, 1).normalize();
export const PRODUCT_OCCUPANCY = 0.68;

export function rotateView(
  camera: PerspectiveCamera,
  target: Vector3,
  yaw: number,
  pitch: number,
  roll = 0,
) {
  const offset = camera.position.clone().sub(target);
  const backward = offset.clone().normalize();
  const right = camera.up.clone().cross(backward).normalize();
  const rotation = new Quaternion().setFromAxisAngle(camera.up, -yaw);
  rotation.multiply(new Quaternion().setFromAxisAngle(right, -pitch));
  rotation.multiply(new Quaternion().setFromAxisAngle(backward, roll));
  offset.applyQuaternion(rotation);
  camera.up.applyQuaternion(rotation).normalize();
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

export function zoomView(
  camera: PerspectiveCamera,
  target: Vector3,
  factor: number,
) {
  const offset = camera.position.clone().sub(target);
  offset.setLength(MathUtils.clamp(offset.length() * factor, 0.08, 100));
  camera.position.copy(target).add(offset);
}

export function transitionView(
  camera: PerspectiveCamera,
  target: Vector3,
  destination: Vector3,
  destinationTarget: Vector3,
  orientation: Quaternion,
  alpha: number,
) {
  const distance = MathUtils.lerp(
    camera.position.distanceTo(target),
    destination.distanceTo(destinationTarget),
    alpha,
  );
  target.lerp(destinationTarget, alpha);
  camera.quaternion.slerp(orientation, alpha);
  camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  camera.position
    .set(0, 0, distance)
    .applyQuaternion(camera.quaternion)
    .add(target);
}

export function lightDirection(azimuth: number, elevation: number) {
  const a = MathUtils.degToRad(azimuth),
    e = MathUtils.degToRad(elevation);
  return new Vector3(
    Math.sin(a) * Math.cos(e),
    Math.sin(e),
    Math.cos(a) * Math.cos(e),
  );
}

export function lightRotation(
  azimuth: number,
  elevation: number,
  followCamera: boolean,
  camera: Quaternion,
) {
  const rotation = new Quaternion().setFromUnitVectors(
    lightDirection(-31, 50),
    lightDirection(azimuth, elevation),
  );
  return followCamera ? rotation.premultiply(camera) : rotation;
}
