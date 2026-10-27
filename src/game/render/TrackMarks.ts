import * as THREE from 'three';

/** Quanto tempo uma marca leva para sumir (s). */
const LIFE = 45;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Rastros de esteira no chão: cada veículo de lagartas deixa, a cada trecho percorrido, duas
 * marcas (uma por esteira) com o desenho das garras. As marcas escurecem o solo por multiplicação
 * (respeitam a cor e a textura do terreno) e esmaecem devagar até sumir. Um conjunto fixo de
 * instâncias é reaproveitado em anel: as mais antigas dão lugar às novas.
 */
export class TrackMarks {
  readonly mesh: THREE.InstancedMesh;
  private readonly born: Float32Array;
  private readonly fade: THREE.InstancedBufferAttribute;
  private next = 0;
  private time = 0;

  constructor(capacity = 3000) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFade', this.fade);
    const material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFade;
        void main() {
          // garras transversais (ao longo do comprimento da marca) e bordas suaves
          float cleat = smoothstep(0.25, 0.55, abs(fract(vUv.y * 3.0) - 0.5) * 2.0);
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float ends = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          float k = (0.55 + 0.45 * cleat) * edge * ends * vFade;
          gl_FragColor = vec4(mix(vec3(1.0), vec3(0.58, 0.53, 0.46), k), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'track-marks';
    this.born = new Float32Array(capacity).fill(-1e9);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
  }

  /**
   * Um par de marcas no ponto (x, z) do veículo, com a frente em `angle` (radianos no plano,
   * como o `facing` da simulação). `gauge` é a distância do centro a cada esteira.
   */
  add(x: number, z: number, angle: number, gauge: number, width: number, length: number): void {
    const fx = Math.cos(angle);
    const fz = Math.sin(angle);
    tmpQ.setFromAxisAngle(UP, -angle + Math.PI / 2);
    for (const side of [-1, 1]) {
      const i = this.next;
      this.next = (this.next + 1) % this.born.length;
      // a marca fica sob a esteira: deslocada para o lado (perpendicular à frente)
      tmpP.set(x - fz * gauge * side, 0.035, z + fx * gauge * side);
      tmpM.compose(tmpP, tmpQ, tmpS.set(width, 1, length));
      this.mesh.setMatrixAt(i, tmpM);
      this.born[i] = this.time;
      this.fade.setX(i, 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
  }

  update(dt: number): void {
    this.time += dt;
    // esmaecimento: atualiza aos poucos (a fração muda devagar; não precisa ser por quadro)
    const n = this.born.length;
    const step = Math.max(1, Math.ceil(n / 30));
    const start = Math.floor((this.time * 30) % 30) * step;
    for (let i = start; i < Math.min(n, start + step); i++) {
      const age = this.time - this.born[i]!;
      this.fade.setX(i, age >= LIFE ? 0 : 1 - Math.pow(age / LIFE, 2));
    }
    this.fade.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
