export class Tree {
  constructor() {
    this.rootNodes = [];
    this.nodeMap = new Map();
  }

  buildTree(data) {
    const sorted = data.sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((entry) => {
      this.updateBuildTree(entry);
    });

    return this.rootNodes;
  }

  updateBuildTree(entry) {
    if (entry.subtype === "init") {
      const uniqueKey = `${entry.n}-${entry.timestamp}`;
      const node = {
        ...entry,
        children: [],
        events: [],
        m: { ...(entry.m || {}) },
      };

      this.nodeMap.set(uniqueKey, node);

      const parentNode = [...this.nodeMap.values()].find((n) => n.n === entry.pn);
      if (parentNode) {
        parentNode.children.push(node);
        node.parent = parentNode;
      } else {
        this.rootNodes.push(node);
      }
    } else {
      const targetNode = [...this.nodeMap.values()]
        .reverse()
        .find((n) => n.n === entry.n);

      if (targetNode) {
        targetNode.events.push(entry);

        if (entry.m) {
          targetNode.m = {
            ...targetNode.m,
            ...entry.m,
          };
        }
      } else {
        console.warn("Append sans init pour n=" + entry.n);
      }
    }
  }
}
