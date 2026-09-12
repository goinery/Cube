import {
  BackSide,
  BoxGeometry,
  Color,
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  Vector3,
} from 'three';

export function createChassisRelief(anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a0a0a0';
  ctx.fillRect(0, 0, 512, 512);
  const radius = 32,
    height = Math.sqrt(3) * radius;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#555555';
  for (let col = -1; col < 12; col++)
    for (let row = -1; row < 11; row++) {
      const x = col * radius * 1.5,
        y = (row + (col % 2) / 2) * height;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const angle = (i * Math.PI) / 3;
        const px = x + Math.cos(angle) * (radius - 3),
          py = y + Math.sin(angle) * (radius - 3);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = Math.min(anisotropy, 8);
  return texture;
}

export class StudioEnvironment extends Scene {
  constructor() {
    super();
    this.add(
      new Mesh(
        new BoxGeometry(40, 40, 40),
        new MeshBasicMaterial({
          color: '#45494f',
          side: BackSide,
        }),
      ),
    );
    const plane = new PlaneGeometry(1, 1);
    const softbox = (
      position: [number, number, number],
      width: number,
      height: number,
      tint: string,
      intensity: number,
    ) => {
      const light = new Mesh(
        plane,
        new MeshBasicMaterial({
          color: new Color(tint).multiplyScalar(intensity),
          toneMapped: false,
        }),
      );
      light.position.set(...position);
      light.scale.set(width, height, 1);
      light.lookAt(new Vector3());
      this.add(light);
    };
    softbox([-5, 6, 7], 5, 9, '#fffaf3', 2.5);
    softbox([7, 2, 4], 2, 8, '#eef4ff', 2);
    softbox([1, 9, -2], 5, 4, '#ffffff', 2);
    softbox([-3, 3, -7], 2, 7, '#f4f7ff', 1.8);
    // Reflection cards sit below the camera's horizon: the side caps reflect
    // this part of the studio at the elevated product-view angle.
    softbox([8, -3, -6], 1.6, 8, '#ffffff', 2.2);
    softbox([-8, -2, -6], 2, 8, '#ffffff', 1.6);
  }
  dispose() {
    const geometries = new Set<BoxGeometry | PlaneGeometry>();
    this.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        (object.material as MeshBasicMaterial).dispose();
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
  }
}

export function createContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 12, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

export function createPlasticGrain(anisotropy: number) {
  const size = 128,
    noise = new Float32Array(size * size);
  let seed = 0x41584953;
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise[i] = seed / 0x100000000;
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let smooth = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
          smooth +=
            (noise[((y + dy + size) % size) * size + ((x + dx + size) % size)] *
              weight) /
            16;
        }
      const index = (y * size + x) * 4;
      data[index] = Math.round(112 + smooth * 32);
      data[index + 1] = Math.round(229 + smooth * 24);
      data[index + 2] = data[index];
      data[index + 3] = 255;
    }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.name = 'AXIS satin plastic microtexture';
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(anisotropy, 8);
  texture.needsUpdate = true;
  return texture;
}
