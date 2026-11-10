import * as THREE from 'three';

/**
 * Tsunami (11/11) em low poly: uma parede de água facetada (corpo turquesa escuro, crista de espuma branca, frente
 * íngreme e costas em rampa) que se abre a partir da explosão na velocidade da simulação. Começa alta (~7 unidades) e
 * baixa conforme se espalha, até sumir no alcance. Só aparece onde a onda de verdade passa: uma máscara com as células
 * do campo da simulação (`tsunamiField`: mar alcançado e a faixa da costa) recorta o resto, então ela contorna ilhas e
 * para na costa como a regra.
 */
const PROFILE: [number, number][] = [
  [0.8, 0],
  [0.87, 0.16],
  [0.92, 0.42],
  [0.955, 0.72],
  [0.98, 0.93],
  [1.0, 1.0],
  [1.012, 0.88],
  [1.019, 0.55],
  [1.022, 0],
];

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying float vH;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vH = position.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec2 uSize;
  uniform vec3 uBody;
  uniform vec3 uFoam;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying float vH;
  void main() {
    if (texture2D(uMask, vWorld.xz / uSize).r < 0.5) discard;
    // faces chapadas: a normal sai da própria face (low poly)
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float light = 0.5 + 0.5 * abs(dot(n, normalize(vec3(0.35, 1.0, 0.25))));
    vec3 col = mix(uBody, uFoam, smoothstep(0.7, 0.9, vH));
    gl_FragColor = vec4(col * light, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class TsunamiWave {
  readonly group = new THREE.Group();
  private t = 0;
  private readonly material: THREE.ShaderMaterial;
  private readonly geo: THREE.LatheGeometry;
  private readonly mask: THREE.DataTexture;

  constructor(
    at: { x: number; y: number },
    /** Velocidade da frente (unidades de mundo por segundo) e alcance, como na simulação. */
    private readonly speed: number,
    private readonly radius: number,
    map: { width: number; height: number; cellSize: number },
    field: Float32Array,
  ) {
    const data = new Uint8Array(map.width * map.height);
    for (let i = 0; i < data.length; i++) data[i] = field[i]! < Infinity ? 255 : 0;
    this.mask = new THREE.DataTexture(data, map.width, map.height, THREE.RedFormat, THREE.UnsignedByteType);
    this.mask.magFilter = THREE.LinearFilter;
    this.mask.minFilter = THREE.LinearFilter;
    this.mask.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      // a parede é quase opaca: com profundidade, a frente e as costas da própria onda não se misturam
      depthWrite: true,
      side: THREE.DoubleSide,
      uniforms: {
        uMask: { value: this.mask },
        uSize: { value: new THREE.Vector2(map.width * map.cellSize, map.height * map.cellSize) },
        uBody: { value: new THREE.Color('#2a8a96') },
        uFoam: { value: new THREE.Color('#eef6f4') },
        uOpacity: { value: 0.9 },
      },
    });
    this.geo = new THREE.LatheGeometry(
      PROFILE.map(([r, h]) => new THREE.Vector2(r, h)),
      64,
    );
    const wall = new THREE.Mesh(this.geo, this.material);
    wall.renderOrder = 3;
    wall.frustumCulled = false;
    this.group.add(wall);
    // a base fica um pouco abaixo da superfície da água (-0,25), para a parede "sair" do mar
    this.group.position.set(at.x, -0.45, at.y);
    this.group.scale.set(0.01, 0.01, 0.01);
  }

  /** Raio atual da frente (unidades de mundo). */
  get front(): number {
    return this.t * this.speed;
  }

  /** Avança `dt` segundos; false quando a onda acabou (pode descartar). */
  update(dt: number): boolean {
    this.t += dt;
    const r = Math.max(0.01, this.front);
    const life = r / this.radius;
    if (life >= 1.1) return false;
    // alta e ameaçadora perto da explosão, baixando conforme se espalha
    const height = 0.8 + 6.2 * Math.pow(Math.max(0, 1 - life), 0.8);
    this.group.scale.set(r, height, r);
    this.material.uniforms.uOpacity!.value = 0.92 * Math.min(1, Math.max(0, (1.1 - life) / 0.35));
    return true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    this.material.dispose();
    this.mask.dispose();
  }
}
