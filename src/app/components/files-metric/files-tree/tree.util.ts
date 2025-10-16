// tree.util.ts
export type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  fileCount: number;       // N° de archivos en este subárbol (archivos: 1)
  children?: TreeNode[];   // visibles
  _children?: TreeNode[];  // colapsados
};

export function pathsToTree(paths: string[], rootName = "/"): TreeNode {
  const root: TreeNode = { name: rootName, path: "", isDir: true, fileCount: 0, children: [] };

  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let cur = root;
    let curPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      curPath = curPath ? `${curPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isDir = !isLast;

      if (!cur.children) cur.children = [];
      let next = cur.children.find(c => c.name === part);
      if (!next) {
        next = { name: part, path: curPath, isDir, fileCount: isDir ? 0 : 1 };
        cur.children.push(next);
      }
      cur = next;
    }
  }

  // ordena: carpetas primero, luego archivos; alfabético
  const sortRec = (n: TreeNode) => {
    if (n.children) {
      n.children.forEach(sortRec);
      n.children.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
  };
  sortRec(root);

  // calcula fileCount (postorden)
  const countRec = (n: TreeNode): number => {
    if (!n.isDir) return 1;
    const sum = (n.children ?? []).reduce((acc, ch) => acc + countRec(ch), 0);
    n.fileCount = sum;
    return sum;
  };
  countRec(root);

  return root;
}
