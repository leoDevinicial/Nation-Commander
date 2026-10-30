import * as THREE from 'three';

/**
 * Detonação nuclear em low poly (formas facetadas, cores chapadas), com cerca de 30 s de linha do tempo:
 * - 0 s: clarão branco;
 * - 0 a 2 s: bola de fogo que cresce;
 * - 1 a 12 s: a bola sobe, esfria (do branco-amarelo ao laranja e ao marrom-fumaça) e vira o chapéu do cogumelo,
 *   que rola para fora;
 * - junto: a coluna que liga o chão ao chapéu, o anel de condensação em volta do chapéu (1,5 a 5 s) e a onda de
 *   poeira rasteira que corre pelo chão;
 * - 18 a 30 s: o cogumelo se desfaz no céu.
 * `radius` é o raio de dano; a altura final do chapéu fica em ~1,7 × raio.
 */
export class NuclearBlast {
  readonly group = new THREE.Group();
  private t = 0;
  private readonly fireMat = new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, toneMapped: false });
  private readonly cloudMat = new THREE.MeshStandardMaterial({ color: '#8b7d6e', emissive: '#ff7a2a', emissiveIntensity: 1.6, roughness: 1, flatShading: true, transparent: true });
  private readonly stemMat = new THREE.MeshStandardMaterial({ color: '#8f8274', emissive: '#ff8a3a', emissiveIntensity: 1, roughness: 1, flatShading: true, transparent: true });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: '#f4f2ee', transparent: true, opacity: 0, depthWrite: false });
  private readonly dustMat = new THREE.MeshStandardMaterial({ color: '#a59680', roughness: 1, flatShading: true, transparent: true });
  private readonly fireball: THREE.Mesh;
  private readonly cap = new THREE.Group();
  private readonly capPuffs: { mesh: THREE.Mesh; angle: number; r: number; y: number; s: number }[] = [];
  private readonly stem: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly dust: { mesh: THREE.Mesh; angle: number; s: number }[] = [];
  private readonly light = new THREE.PointLight('#ffd7a0', 0, 0, 1.4);
  private readonly geos: THREE.BufferGeometry[] = [];
  private shocked = false;

  constructor(
    at: THREE.Vector3,
    private readonly radius: number,
    /** Chamado quando a onda de choque "chega" (som e tremor forte vêm depois do clarão). */
    private readonly onShock: () => void,
    private readonly shockDelay = 0.8,
  ) {
    const R = radius;
    this.group.position.copy(at);
    const ico = this.geo(new THREE.IcosahedronGeometry(1, 1));
    this.fireball = new THREE.Mesh(ico, this.fireMat);
    this.fireball.scale.setScalar(0.01);
    this.group.add(this.fireball);
    // chapéu: um domo central e um anel de bolhas facetadas, que rolam para fora
    const puff = this.geo(new THREE.IcosahedronGeometry(1, 0));
    const dome = new THREE.Mesh(this.geo(new THREE.IcosahedronGeometry(1, 1)), this.cloudMat);
    this.capPuffs.push({ mesh: dome, angle: 0, r: 0, y: 0.2, s: 0.72 });
    // anel de fora (o rolo do cogumelo), um anel de cima e a saia de baixo, que se curva para dentro
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.13;
      this.capPuffs.push({ mesh: new THREE.Mesh(puff, this.cloudMat), angle, r: 0.66 + (i % 3) * 0.04, y: (i % 2) * 0.1, s: 0.42 + ((i * 7) % 5) * 0.03 });
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.4;
      this.capPuffs.push({ mesh: new THREE.Mesh(puff, this.cloudMat), angle, r: 0.38, y: 0.42, s: 0.38 });
    }
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + 0.2;
      this.capPuffs.push({ mesh: new THREE.Mesh(puff, this.cloudMat), angle, r: 0.42, y: -0.22, s: 0.3 });
    }
    for (const p of this.capPuffs) this.cap.add(p.mesh);
    this.cap.visible = false;
    this.group.add(this.cap);
    // coluna: perfil girado (facetado) largo na base, fino no meio e abrindo no alto, onde encontra o chapéu
    const profile = [
      [0.46, 0],
      [0.26, 0.05],
      [0.15, 0.18],
      [0.115, 0.45],
      [0.12, 0.75],
      [0.17, 0.95],
      [0.24, 1],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.stem = new THREE.Mesh(this.geo(new THREE.LatheGeometry(profile, 9)), this.stemMat);
    this.stem.scale.set(R, 0.01, R);
    this.stem.visible = false;
    this.group.add(this.stem);
    // anel de condensação (nuvem de Wilson) em volta do chapéu
    this.ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(1, 0.06, 5, 28)), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);
    // onda de poeira rasteira: bolhas achatadas que correm para fora a partir do centro
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(puff, this.dustMat);
      mesh.visible = false;
      mesh.rotation.y = Math.random() * Math.PI;
      this.group.add(mesh);
      // duas faixas: a da frente, que corre mais, e a de trás, mais densa
      this.dust.push({ mesh, angle: (i / 40) * Math.PI * 2 + Math.random() * 0.15, s: (i % 2 ? 0.75 : 1.05) + Math.random() * 0.35 });
    }
    this.light.position.set(0, R * 0.4, 0);
    this.group.add(this.light);
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** Avança a animação; devolve false quando acabou (o chamador remove e descarta). */
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const R = this.radius;
    if (!this.shocked && t >= this.shockDelay) {
      this.shocked = true;
      this.onShock();
    }
    // esfriamento: 1 (branco-quente) → 0 (fumaça) ao longo de ~10 s
    const heat = Math.max(0, 1 - t / 10);
    // sumir no fim
    const fade = 1 - smooth(18, 30, t);

    // luz: estoura no clarão e cai devagar, ficando laranja
    this.light.intensity = (t < 0.15 ? 9000 : 9000 * Math.exp(-(t - 0.15) / 1.4) + 600 * heat) * (R / 14) ** 2;
    this.light.color.setRGB(1, 0.75 + 0.2 * Math.exp(-t), 0.45 + 0.4 * Math.exp(-t * 2));

    // bola de fogo: cresce em 2 s, sobe e se funde ao chapéu
    const grow = 1 - Math.exp(-t * 2.4);
    const rise = smooth(0.8, 12, t);
    const height = R * (0.35 + 1.9 * rise);
    this.fireball.position.y = height;
    this.fireball.scale.setScalar(R * (0.08 + 0.42 * grow) * (1 - 0.45 * smooth(2, 7, t)));
    this.fireMat.color.setRGB(1, 0.95 - 0.45 * (1 - heat), 0.84 - 0.7 * (1 - heat));
    this.fireMat.opacity = Math.min(1, heat * 1.6) * fade;
    this.fireball.visible = this.fireMat.opacity > 0.01;

    // chapéu: aparece com a bola, rola para fora e achata enquanto sobe
    this.cap.visible = t > 0.6;
    if (this.cap.visible) {
      const k = smooth(0.6, 14, t);
      const spread = R * (0.4 + 0.75 * k);
      this.cap.position.y = height + R * 0.05;
      for (const p of this.capPuffs) {
        const roll = t * 0.25 * (p.r > 0 ? 1 : 0);
        p.mesh.position.set(
          Math.cos(p.angle + roll * 0.15) * p.r * spread,
          p.y * spread * (1 - 0.3 * k) + Math.sin(t * 0.8 + p.angle) * 0.04 * R,
          Math.sin(p.angle + roll * 0.15) * p.r * spread,
        );
        p.mesh.scale.set(p.s * spread, p.s * spread * (0.85 - 0.12 * k), p.s * spread);
        p.mesh.rotation.y = p.angle + t * 0.05;
      }
    }
    // um resto de brilho quente embaixo do chapéu (a sombra não fica preta chapada)
    this.cloudMat.emissiveIntensity = Math.max(0.1, 2.2 * heat * heat);
    this.cloudMat.color.setRGB(0.55 - 0.13 * (1 - heat), 0.49 - 0.1 * (1 - heat), 0.43 - 0.06 * (1 - heat));
    this.cloudMat.opacity = fade;

    // coluna: sobe do chão até o chapéu
    this.stem.visible = t > 1;
    if (this.stem.visible) {
      const k = smooth(1, 9, t);
      this.stem.scale.set(R * (0.8 + 0.5 * k), height * Math.min(1, (t - 1) / 3), R * (0.8 + 0.5 * k));
      this.stemMat.emissiveIntensity = 1.3 * heat * heat;
      this.stemMat.opacity = fade;
    }

    // anel de condensação: abre em volta do chapéu e some
    const rk = (t - 1.5) / 3.5;
    this.ring.visible = rk > 0 && rk < 1;
    if (this.ring.visible) {
      this.ring.position.y = height * 0.92;
      this.ring.scale.setScalar(R * (0.6 + 1.3 * rk));
      this.ringMat.opacity = 0.75 * Math.sin(rk * Math.PI);
    }

    // poeira rasteira: corre até ~2,6 × raio e fica baixa, esfumaçando
    const dk = smooth(0.3, 7, t);
    for (const d of this.dust) {
      d.mesh.visible = t > 0.3;
      const r = R * (0.3 + 2.3 * dk) * (d.s > 1 ? 1 : 0.82);
      d.mesh.position.set(Math.cos(d.angle) * r, R * 0.07 * d.s, Math.sin(d.angle) * r);
      d.mesh.scale.set(R * 0.3 * d.s * (0.5 + dk), R * 0.13 * d.s, R * 0.3 * d.s * (0.5 + dk));
    }
    this.dustMat.opacity = 0.9 * (1 - smooth(8, 22, t));

    return t < 30;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of [this.fireMat, this.cloudMat, this.stemMat, this.ringMat, this.dustMat]) m.dispose();
    this.light.dispose();
  }
}

function smooth(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
