export type FNodeId = string; // "file::func"

export function buildFunctionGraph(fc: Record<string, any>) {
  const nodesSet = new Set<FNodeId>();
  const edges: Array<{ source: FNodeId; target: FNodeId; value: number }> = [];

  // 1) recolectar nodos y aristas
  for (const [file, funcs] of Object.entries(fc || {})) {
    for (const [fname, obj] of Object.entries<any>(funcs || {})) {
      const id = `${file}::${fname}`;
      nodesSet.add(id);

      const fanOut: Record<string, number> = obj?.['fan-out'] || {};
      for (const [callee, w] of Object.entries(fanOut)) {
        // asumimos que el callee está en el MISMO archivo salvo que venga calificado; ajusta si tienes nombres calificados
        const targetId =
          callee.includes('::') ? callee : `${file}::${callee}`;
        nodesSet.add(targetId);
        edges.push({ source: id, target: targetId, value: Number(w) || 1 });
      }
    }
  }

  // 2) grados
  const fanIn = new Map<FNodeId, number>();
  const fanOutDeg = new Map<FNodeId, number>();
  for (const n of nodesSet) { fanIn.set(n, 0); fanOutDeg.set(n, 0); }
  for (const e of edges) {
    fanOutDeg.set(e.source, (fanOutDeg.get(e.source) || 0) + 1);
    fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
  }

  // 3) metadatos auxiliares
  const nodes = Array.from(nodesSet).map(id => {
    const [file, func] = id.split('::');
    return {
      id,
      file,
      func,
      fanIn: fanIn.get(id) || 0,
      fanOut: fanOutDeg.get(id) || 0,
      degree: (fanIn.get(id) || 0) + (fanOutDeg.get(id) || 0),
    };
  });

  return { nodes, edges, fanIn, fanOut: fanOutDeg };
}

export function topKFromMap(m: Map<string, number>, k = 10) {
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, v]) => ({ id, value: v }));
}

export function shortenFunc(id: string) {
  // muestra solo carpeta/archivo y nombre de función
  const [file, func] = id.split('::');
  const parts = file.split('/');
  const fileShort = `${parts.at(-2) ?? ''}/${parts.at(-1) ?? ''}`;
  return `${fileShort}::${func}`;
}

export function adjacencyForHeatmap(nodes: {id: string}[], edges: {source: string; target: string; value: number}[]) {
  const ids = nodes.map(n => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const mat = Array.from({ length: ids.length }, () => Array(ids.length).fill(0));
  for (const e of edges) {
    const i = index.get(e.source); const j = index.get(e.target);
    if (i != null && j != null) mat[i][j] += e.value || 1;
  }
  return { ids, mat };
}
