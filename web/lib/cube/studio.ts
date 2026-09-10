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

/** Fine moulded hexagonal relief on the internal black shells. */
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

/** Broad softboxes provide continuous highlights without reflecting room furniture. */
export class StudioEnvironment extends Scene {
  constructor() {
    super();
    this.add(
      new Mesh(
        new BoxGeometry(40, 40, 40),
        new MeshBasicMaterial({
          color: '#343940',
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
    softbox([-5, 6, 7], 7, 9, '#fff4e7', 8);
    softbox([7, 2, 4], 2.4, 8, '#e6efff', 5);
    softbox([1, 9, -2], 6, 5, '#ffffff', 5);
    softbox([-3, 3, -7], 3, 7, '#eaf0ff', 4);
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

/** Seamless, mipmapped injection-mould grain: height in R and roughness in G. */
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
