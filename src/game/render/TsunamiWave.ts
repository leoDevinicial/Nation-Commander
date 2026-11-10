import * as THREE from 'three';

/**
 * Tsunami (11/11) em low poly: a frente da onda é um anel facetado de espuma branca com uma faixa turquesa atrás, que
 * se abre a partir do ponto da explosão na velocidade da simulação e some ao chegar ao alcance. Fica rente à água: onde
 * há terra mais alta, o terreno esconde o anel, então ele parece correr só pelo mar (a regra da simulação, que contorna
 * as ilhas, decide quem é atingido).
 */
export class TsunamiWave {
  readonly group = new THREE.Group();
  private t = 0;
  private readonly foamMat = new THREE.MeshBasicMaterial({ color: '#f2f7f6', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  private readonly bandMat = new THREE.MeshBasicMaterial({ color: '#5fc4c0', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  private readonly foam: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(
    at: { x: number; y: number },
    /** Velocidade da frente (unidades de mundo por segundo) e alcance, como na simulação. */
    private readonly speed: number,
    private readonly radius: number,
  ) {
    this.group.position.set(at.x, 0.06, at.y);
    this.group.rotation.x = -Math.PI / 2;
    // anel de raio 1 (escalado a cada quadro): espessura relativa pequena na frente e larga na faixa de trás
    const foamGeo = new THREE.RingGeometry(0.97, 1, 48, 1);
    const bandGeo = new THREE.RingGeometry(0.82, 0.97, 48, 1);
    this.geos.push(foamGeo, bandGeo);
    this.foam = new THREE.Mesh(foamGeo, this.foamMat);
    this.band = new THREE.Mesh(bandGeo, this.bandMat);
    this.foam.renderOrder = 3;
    this.band.renderOrder = 2;
    this.group.add(this.band, this.foam);
    this.group.scale.setScalar(0.01);
  }

  /** Avança `dt` segundos; false quando a onda acabou (pode descartar). */
  update(dt: number): boolean {
    this.t += dt;
    const r = Math.max(0.01, this.t * this.speed);
    const life = r / this.radius;
    if (life >= 1.15) return false;
    this.group.scale.setScalar(r);
    // perde força: a espuma afina e esmaece até sumir no alcance
    const fade = Math.max(0, 1 - life);
    this.foamMat.opacity = 0.95 * Math.min(1, fade * 1.6);
    this.bandMat.opacity = 0.55 * fade;
    return true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.foamMat.dispose();
    this.bandMat.dispose();
  }
}
