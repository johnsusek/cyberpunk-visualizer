import { get, set } from "@/lib/db";

export let layout = {
  paper_bgcolor: "#181818",
  // autosize: true,
  margin: {
    b: 0,
    l: 10,
    r: 10,
    t: 20
  }
};

export let config = {
  responsive: true,
  style: {
    width: "100%",
    height: "100%"
  },
  displayModeBar: false
  // pathbar: {
  //   side: "bottom"
  // }
};

type CyberDocEntry = {
  base: number | string;
  index: number;
  name: string;
  parents: Record<number, boolean>;
};

let idMap: Record<number, CyberDocEntry> = {};
let nameMap: Record<string, CyberDocEntry> = {};
let cyberdoc: CyberDocEntry[] = [];
let allParents = {};

export async function fetchCyberdoc() {
  let apiJsonStored: any[] = await get("cyberdoc-api");

  if (!apiJsonStored) {
    let apiRes = await fetch(
      "https://raw.githubusercontent.com/johnsusek/cyberpunk-visualizer/main/public/cyberdoc-api.json"
    );
    let apiJson = await apiRes.json();
    await set("cyberdoc-api", apiJson);
    cyberdoc = apiJson;
  } else {
    cyberdoc = apiJsonStored;
  }
}

function buildParents(src: number) {
  let entryParentId = idMap[src].base;
  let parents = {};

  while (entryParentId) {
    parents[idMap[entryParentId].index] = true;
    entryParentId = idMap[entryParentId].base;
  }

  return parents;
}

export async function buildLookups() {
  for (let node of cyberdoc) {
    if (node.base === 0) {
      node.base = "";
    }

    idMap[node.index] = node;
    nameMap[node.name.toLowerCase()] = node;
    node.parents = buildParents(node.index);

    allParents = { ...allParents, ...node.parents };
  }
}

export function buildTrace(path: string[], filters: string[]) {
  let rootNodeName = path[0].toLowerCase();
  let rootNodeId = nameMap[rootNodeName].index;

  let nodes = cyberdoc.filter(node => node.index === rootNodeId || node.parents[rootNodeId]);

  if (filters.length) {
    let filteredNodeIds = {};

    for (let filter of filters) {
      for (let node of nodes) {
        if (filteredNodeIds[node.index]) continue;

        if (node.name.toLowerCase().includes(filter.toLowerCase())) {
          filteredNodeIds[node.index] = idMap[node.index];

          for (let key of Object.keys(node.parents)) {
            filteredNodeIds[key] = idMap[key];
          }
        }
      }
    }

    nodes = Object.values(filteredNodeIds);
  }

  let labels = nodes.map(val => val.name);
  let ids = nodes.map(val => val.index.toString());
  let parents = nodes.map(val => val.base.toString());

  let target = path[path.length - 1].toLowerCase();
  let level = nameMap[target]?.index.toString() || nameMap[rootNodeName]?.index.toString();

  return {
    type: "treemap",
    hoverinfo: "skip",
    textfont: {
      color: "white"
    },
    tiling: {
      squarifyratio: 1.618034
    },
    // maxdepth: 4,
    ids,
    labels,
    parents,
    level
  };
}

export function buildRoute(src: number) {
  let srcEntry = idMap[src];
  let entryParentId = srcEntry.base;
  let route = [srcEntry.name];

  while (entryParentId) {
    route.unshift(idMap[entryParentId].name);
    entryParentId = idMap[entryParentId].base;
  }

  return route.join("/");
}
