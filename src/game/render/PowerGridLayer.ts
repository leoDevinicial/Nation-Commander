import * as THREE from 'three';
import type { PowerNet } from '../../../shared/sim/power.ts';
import { nameTag } from './BuildingVisuals.ts';
import { RoadPreview } from './RoadPreview.ts';

/** Até quantas células a visão da rede pinta (estradas e construções). */
const MAX_CELLS = 6000;

export interface PowerGridInput {
  width: number;
  height: number;
  /** Células da malha: estradas que levam energia (sem rodovia) e a área das usinas e do Centro de Comando. */
  mesh: readonly number[];
  /** Redes que o servidor mandou (só as do próprio jogador). */
  nets: readonly PowerNet[];
  /** Consumidoras: área e se está com luz. */
  consumers: readonly { cx: number; cy: number; size: number; lit: boolean }[];
  /** Usinas e Centro de Comando (área). */
  plants: readonly { cx: number; cy: number; size: number }[];
}

/** Rede com falta: o que pede é mais do que o que recebe. */
export const netShort = (n: PowerNet): boolean => n.served + 1e-6 < n.demand;

/**
 * Pedaços conexos da malha (8 vizinhas, como na simulação): cada célula recebe o índice da rede do servidor que tem a
 * célula `at` no mesmo pedaço (−1 se nenhuma).
 */
export function netOfCells(width: number, height: number, mesh: readonly number[], nets: readonly PowerNet[]): Map<number, number> {
  const inMesh = new Set(mesh);
  const comp = new Map<number, number>();
  let k = 0;
  for (const start of mesh) {
    if (comp.has(start)) continue;
    const id = k++;
    comp.set(start, id);
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (inMesh.has(j) && !comp.has(j)) {
            comp.set(j, id);
            stack.push(j);
          }
        }
    }
  }
  const netOfComp = new Map<number, number>();
  nets.forEach((n, idx) => {
    const c = comp.get(n.at);
    if (c !== undefined) netOfComp.set(c, idx);
  });
  const out = new Map<number, number>();
  for (const [cell, c] of comp) out.set(cell, netOfComp.get(c) ?? -1);
  return out;
}

/**
 * Visão da rede elétrica (23/11): pinta no chão as estradas que levam energia, verdes na rede que dá conta e vermelhas
 * na rede com falta; as construções com luz em verde, as apagadas em vermelho, as usinas em branco; e uma placa em
 * cada rede com "geração / consumo".
 */
export class PowerGridLayer {
  readonly group = new THREE.Group();
  private readonly cells: RoadPreview;
  private labels: THREE.Sprite[] = [];
  private key = '';

  constructor(
    private readonly cellSize: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.cells = new RoadPreview(cellSize, heightAt, MAX_CELLS);
    this.cells.mesh.name = 'power-grid-view';
    this.group.add(this.cells.mesh);
    this.group.name = 'power-grid';
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  set(input: PowerGridInput): void {
    const key = JSON.stringify([input.mesh.length, input.nets, input.consumers.map((c) => (c.lit ? 1 : 0)).join(''), input.plants.length]);
    if (key === this.key) return;
    this.key = key;
    const netOf = netOfCells(input.width, input.height, input.mesh, input.nets);
    const out: { cx: number; cy: number; state: 'ok' | 'road' | 'bad' | 'hover' }[] = [];
    for (const [i, n] of netOf) {
      const net = n >= 0 ? input.nets[n] : undefined;
      out.push({ cx: i % input.width, cy: Math.floor(i / input.width), state: !net ? 'road' : netShort(net) ? 'bad' : 'ok' });
    }
    const area = (b: { cx: number; cy: number; size: number }, state: 'ok' | 'bad' | 'hover') => {
      for (let y = b.cy; y < b.cy + b.size; y++) for (let x = b.cx; x < b.cx + b.size; x++) out.push({ cx: x, cy: y, state });
    };
    for (const b of input.plants) area(b, 'hover');
    for (const b of input.consumers) area(b, b.lit ? 'ok' : 'bad');
    this.cells.set(out);
    for (const l of this.labels) {
      l.material.map?.dispose();
      l.material.dispose();
      l.removeFromParent();
    }
    this.labels = input.nets.map((n) => {
      const tag = nameTag(`⚡ ${Math.round(n.served)}/${Math.round(n.demand)} · ${Math.round(n.supply)}`, netShort(n) ? '#ff5a4a' : '#5fd38a', false);
      const x = (n.cx + 0.5) * this.cellSize;
      const z = (n.cy + 0.5) * this.cellSize;
      tag.position.set(x, this.heightAt(x, z) + 2.2, z);
      this.group.add(tag);
      return tag;
    });
  }

  dispose(): void {
    this.cells.dispose();
    for (const l of this.labels) {
      l.material.map?.dispose();
      l.material.dispose();
    }
    this.group.removeFromParent();
  }
}
