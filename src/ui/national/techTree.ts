/**
 * Layout da árvore de pesquisa de uma área: cada nó vai para a coluna da sua profundidade (o maior caminho de
 * pré-requisitos dentro da área) e as linhas de cada coluna seguem a ordem da lista, puxando cada nó para perto da
 * linha dos seus pré-requisitos. Pré-requisitos de outras áreas não entram no desenho: viram uma etiqueta no nó.
 */
export interface TreeNode {
  id: string;
  col: number;
  row: number;
  /** Pré-requisitos de fora da área. */
  external: string[];
}

export interface TreeLayout {
  nodes: TreeNode[];
  edges: { from: string; to: string }[];
  cols: number;
  rows: number;
}

export function treeLayout(ids: readonly string[], prereqsOf: (id: string) => readonly string[]): TreeLayout {
  const inArea = new Set(ids);
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    let d = 0;
    for (const p of prereqsOf(id)) if (inArea.has(p)) d = Math.max(d, depthOf(p, seen) + 1);
    depth.set(id, d);
    return d;
  };
  for (const id of ids) depthOf(id);
  const cols = ids.length ? Math.max(...ids.map((id) => depth.get(id)!)) + 1 : 0;
  const rowOf = new Map<string, number>();
  const used: Set<number>[] = Array.from({ length: cols }, () => new Set());
  for (let c = 0; c < cols; c++) {
    for (const id of ids) {
      if (depth.get(id) !== c) continue;
      // perto da linha média dos pré-requisitos da área; a primeira linha livre a partir dela
      const parents = prereqsOf(id).filter((p) => inArea.has(p) && rowOf.has(p));
      let want = parents.length ? Math.round(parents.reduce((a, p) => a + rowOf.get(p)!, 0) / parents.length) : 0;
      while (used[c]!.has(want)) want++;
      used[c]!.add(want);
      rowOf.set(id, want);
    }
  }
  const nodes = ids.map((id) => ({ id, col: depth.get(id)!, row: rowOf.get(id)!, external: prereqsOf(id).filter((p) => !inArea.has(p)) }));
  const edges = ids.flatMap((id) => prereqsOf(id).filter((p) => inArea.has(p)).map((p) => ({ from: p, to: id })));
  const rows = nodes.length ? Math.max(...nodes.map((n) => n.row)) + 1 : 0;
  return { nodes, edges, cols, rows };
}
