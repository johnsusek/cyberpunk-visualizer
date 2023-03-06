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
  // responsive: true,
  style: {
    width: "100%",
    height: "100%"
  },
  displayModeBar: false
  // pathbar: {
  //   side: "bottom"
  // }
};

let idMap = {};
let nameMap = {};
let cyberdoc = [];

export async function fetchCyberdoc() {
  let apiJsonStored: any[] = await get("cyberdoc-api");

  if (!apiJsonStored) {
    let apiRes = await fetch("/cyberdoc-api.json");
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

export let roots = [];
let allParents = {};

export async function buildLookups() {
  for (let entry of cyberdoc) {
    if (entry.base === 0) {
      entry.base = "";
    }

    idMap[entry.index] = entry;
    nameMap[entry.name.toLowerCase()] = entry;
    entry.parents = buildParents(entry.index);

    allParents = { ...allParents, ...entry.parents };
  }

  for (let entry of cyberdoc) {
    if (entry.base === "" && allParents[entry.index]) {
      roots.push(entry);
    }
  }
}

export function buildTrace(path: string[]) {
  let name = path[0].toLowerCase();
  let target = path[path.length - 1].toLowerCase();
  let rootId = nameMap[name.toLowerCase()].index;
  let filteredEntries = cyberdoc.filter(val => val.index === rootId || val.parents[rootId]);
  let labels = filteredEntries.map(val => val.name);
  let ids = filteredEntries.map(val => val.index.toString());
  let parents = filteredEntries.map(val => val.base.toString());

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
    level: nameMap[target]?.index.toString() || nameMap[name]?.index.toString()
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
