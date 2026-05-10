/** File-coupling analysis utilities: graph, adjacency matrix, Sankey, top-K. */

export type FileCouplingEntry = { fanIn: string[]; fanOut: string[] };
export type FileCouplingResult = Record<string, FileCouplingEntry>;

/**
 * Shortens a file path to "parentFolder/fileName.ext" for display.
 */
export function shorten(label: string): string {
  const parts = label.split('/');
  const file = parts.pop() || '';
  const folder = parts.pop() || '';
  return folder ? `${folder}/${file}` : file;
}

/**
 * Builds nodes + links + degree maps from file-coupling data.
 * Links are created from fanOut entries where the target also exists.
 */
export function buildGraph(fc: FileCouplingResult) {
  // nodes
  const files = Array.from(new Set(Object.keys(fc)));
  const nodes = files.map((id) => ({ id, name: shorten(id), value: 1, symbolSize: 12 }));

  // links (solo fanOut → edge: file -> dep si dep también existe en el set)
  const links: Array<{ source: string; target: string }> = [];
  for (const [src, { fanOut }] of Object.entries(fc)) {
    for (const dst of fanOut || []) {
      if (fc[dst]) links.push({ source: src, target: dst });
    }
  }

  // grados
  const degOut = new Map<string, number>();
  const degIn = new Map<string, number>();
  for (const f of files) { degOut.set(f, 0); degIn.set(f, 0); }
  for (const { source, target } of links) {
    degOut.set(source, (degOut.get(source) || 0) + 1);
    degIn.set(target, (degIn.get(target) || 0) + 1);
  }

  return { files, nodes, links, degIn, degOut };
}

/**
 * Returns top-K entries from a Map sorted descending by value.
 */
export function topK<T extends Record<string, number>>(m: Map<string, number>, k = 10) {
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, v]) => ({ id, name: shorten(id), value: v }));
}

/**
 * Builds an N×N adjacency matrix from file-coupling data.
 */
export function buildAdjacency(fc: FileCouplingResult) {
  const ids = Object.keys(fc);
  const index = new Map(ids.map((id, i) => [id, i]));
  const matrix: number[][] = Array.from({ length: ids.length }, () => Array(ids.length).fill(0));

  for (const [src, { fanOut }] of Object.entries(fc)) {
    const i = index.get(src)!;
    for (const dst of fanOut || []) {
      const j = index.get(dst);
      if (j != null) matrix[i][j] += 1;
    }
  }
  return { ids, matrix };
}

/**
 * Converts file-coupling data to Sankey diagram format (ECharts-compatible).
 */
export function toSankey(fc: FileCouplingResult, limitPerNode = 6) {
  const nodes = Array.from(new Set(Object.keys(fc))).map(id => ({ name: shorten(id) }));
  const idToShort = new Map(nodes.map(n => [n.name, n.name]));
  const fullToShort = new Map<string, string>();
  for (const full of Object.keys(fc)) fullToShort.set(full, shorten(full));

  const links: Array<{ source: string; target: string; value: number }> = [];
  for (const [src, { fanOut }] of Object.entries(fc)) {
    const trimmed = (fanOut || []).filter(d => fc[d]).slice(0, limitPerNode);
    for (const dst of trimmed) {
      links.push({ source: fullToShort.get(src)!, target: fullToShort.get(dst)!, value: 1 });
    }
  }
  return { nodes, links };
}
