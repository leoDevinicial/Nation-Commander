import * as THREE from 'three';
import type { Snapshot } from '../../../shared/sim/snapshot.ts';
import { factionMaterial, sharedGeometry, sharedMaterial } from './palette.ts';

type MineSnap = NonNullable<Snapshot['mines']>[number];

/**
 * Minas antitanque à vista do jogador (lote 3, seção 2): só chegam no snapshot as próprias e as
 * inimigas já detectadas. Disco metálico meio enterrado; as próprias com um anel na cor da facção,
 * as inimigas com um anel vermelho que pisca. Na remoção, o anel encolhe com o progresso.
 */
export class MineLayer {
  readonly group = new THREE.Group();
  private readonly marks = new Map<number, { root: THREE.Group; ring: THREE.Mesh; own: boolean; clearing: number }>();
  private time = 0;

  constructor(
    private readonly mySlot: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'mines';
  }

  update(mines: readonly MineSnap[]): void {
    const seen = new Set<number>();
    for (const m of mines) {
      seen.add(m.id);
      let mark = this.marks.get(m.id);
      if (!mark) {
        mark = this.create(m);
        this.marks.set(m.id, mark);
        this.group.add(mark.root);
      }
      mark.clearing = m.clearing ?? 0;
    }
    for (const [id, mark] of this.marks)
      if (!seen.has(id)) {
        this.group.remove(mark.root);
        this.marks.delete(id);
      }
  }

  private create(m: MineSnap): {
    root: THREE.Group;
    ring: THREE.Mesh;
    own: boolean;
    clearing: number;
  } {
    const own = m.owner === this.mySlot;
    const root = new THREE.Group();
    root.position.set(m.x, this.heightAt(m.x, m.y) + 0.02, m.y);
    const body = new THREE.Mesh(
      sharedGeometry('mine-body', () => new THREE.CylinderGeometry(0.32, 0.36, 0.1, 14)),
      sharedMaterial(
        'mine-body',
        () =>
          new THREE.MeshStandardMaterial({
            color: '#4a5236',
            roughness: 0.7,
            metalness: 0.45,
          }),
      ),
    );
    body.position.y = 0.03;
    root.add(body);
    const fuse = new THREE.Mesh(
      sharedGeometry('mine-fuse', () => new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8)),
      sharedMaterial(
        'mine-fuse',
        () =>
          new THREE.MeshStandardMaterial({
            color: '#2a2d26',
            roughness: 0.5,
            metalness: 0.6,
          }),
      ),
    );
    fuse.position.y = 0.1;
    root.add(fuse);
    const ring = new THREE.Mesh(
      sharedGeometry('mine-ring', () => new THREE.RingGeometry(0.55, 0.68, 24).rotateX(-Math.PI / 2)),
      own
        ? factionMaterial(m.owner)
        : sharedMaterial(
            'mine-warn',
            () =>
              new THREE.MeshBasicMaterial({
                color: '#ff3b2f',
                transparent: true,
                opacity: 0.85,
                depthWrite: false,
              }),
          ),
    );
    ring.position.y = 0.04;
    root.add(ring);
    return { root, ring, own, clearing: 0 };
  }

  /** Anel inimigo pisca; durante a remoção, encolhe até sumir. */
  tick(dt: number): void {
    this.time += dt;
    const blink = 0.75 + 0.25 * Math.sin(this.time * 6);
    for (const mark of this.marks.values()) {
      const s = (mark.own ? 1 : blink) * (1 - 0.8 * mark.clearing);
      mark.ring.scale.set(s, 1, s);
    }
  }

  dispose(): void {
    this.group.clear();
    this.marks.clear();
  }
}
