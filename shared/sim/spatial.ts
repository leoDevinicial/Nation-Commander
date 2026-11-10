/**
 * Grade espacial (10/11): o mapa dividido em quadrados de `size` unidades de mundo, cada um com a lista do que está nele.
 * Serve para buscas por vizinhança (alvo mais próximo, unidades encostadas) olharem só os quadrados em volta em vez do
 * mapa inteiro. Reconstruída quando a simulação pede (posições mudam a cada tick); só guarda referências.
 */
export class SpatialGrid<T> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: T[][];
  /** Quadrados com algo dentro (para limpar só eles na próxima reconstrução). */
  private used: number[] = [];

  constructor(
    width: number,
    height: number,
    readonly size: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / size));
    this.rows = Math.max(1, Math.ceil(height / size));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const i of this.used) this.cells[i]!.length = 0;
    this.used = [];
  }

  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.size)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.size)));
  }

  private push(i: number, item: T): void {
    const cell = this.cells[i]!;
    if (!cell.length) this.used.push(i);
    cell.push(item);
  }

  /** Guarda `item` no quadrado do ponto. */
  insertPoint(x: number, y: number, item: T): void {
    this.push(this.row(y) * this.cols + this.col(x), item);
  }

  /** Guarda `item` em todos os quadrados que o retângulo toca (prédios: a área inteira). */
  insertRect(x0: number, y0: number, x1: number, y1: number, item: T): void {
    const c0 = this.col(x0);
    const c1 = this.col(x1);
    const r1 = this.row(y1);
    for (let r = this.row(y0); r <= r1; r++) for (let c = c0; c <= c1; c++) this.push(r * this.cols + c, item);
  }

  /**
   * Chama `fn` com o conteúdo de cada quadrado que o retângulo toca. Um item guardado em vários quadrados (prédio) pode
   * aparecer mais de uma vez.
   */
  forEachIn(x0: number, y0: number, x1: number, y1: number, fn: (item: T) => void): void {
    const c0 = this.col(x0);
    const c1 = this.col(x1);
    const r1 = this.row(y1);
    for (let r = this.row(y0); r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c]!;
        for (let k = 0; k < cell.length; k++) fn(cell[k]!);
      }
  }
}
