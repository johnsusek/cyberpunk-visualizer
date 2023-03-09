<template>
  <div
    v-if="paneSizes?.length"
    class="h-100 flex flex-columns"
  >
    <div class="flex  justify-content-between align-items-center p-sm">
      <div class="flex">
        <h1 class="m-e-md">Cyberpunk 2077 Explorer</h1>
      </div>

      <div class="flex align-items-center">
        <div class="flex align-items-center">
          <form @submit.prevent="onSearch">
            <input
              v-model="keyword"
              placeholder="Filter..."
              class="text-large"
              type="search"
              @search="onSearch"
            >
          </form>
        </div>

        <div>
          <a
            href="https://github.com/johnsusek/cyberpunk-visualizer"
            target="_blank"
            class="flex m-w-md"
          >
            <img
              src="/github-mark-white.svg"
              style="height: 22px"
            >
          </a>
        </div>
      </div>
    </div>

    <splitpanes
      v-show="paneReady"
      class="h-100"
      horizontal
      @resized="onResized"
      @ready="onPaneReady"
    >
      <pane :size="paneSizes[0]">
        <div
          v-if="paneReady"
          ref="plotEl"
          class="h-100"
        >
          <h1
            v-if="!plotLoaded"
            class="p-sm"
          >
            Loading...
          </h1>
        </div>
      </pane>

      <pane :size="paneSizes[1]">
        <h2 class="p-sm">{{ focusedPath }}</h2>
        <div
          v-show="focusedPath"
          ref="editorEl"
          class="h-100"
        />
      </pane>
    </splitpanes>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, nextTick, watch } from "vue";
import { Splitpanes, Pane } from "splitpanes";
import * as JSZip from "jszip";
import { get, set } from '@/lib/db';
import "splitpanes/dist/splitpanes.css";
import { useSplitpanesStorage } from "@/composables/useSplitpanesStorage";
import Plotly from "plotly.js/lib/core";
import { fetchCyberdoc, buildLookups, buildRoute, buildTrace, layout, config } from "@/lib/plotlyConfig";
import treemap from "plotly.js/lib/treemap";
import { useRoute, useRouter } from 'vue-router';

Plotly.register([treemap]);

let props = defineProps<{
  name: string[];
}>();

let plotEl = ref(null);
let editorEl = ref(null);
let focusedPath = ref("");
let focusedClass = ref("");
let keyword = ref("");
let paneReady = ref(false);
let plotLoaded = ref(false);

let { paneSizes, onResized } = useSplitpanesStorage();
let route = useRoute();
let router = useRouter();

let locationMap = {};
let cachedFileContents = {};
let ace = window["ace"];
let editor = null;

onMounted(async () => {
  if (!editor) {
    editor = ace.edit(editorEl.value);
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.setShowPrintMargin(false);
    editor.session.setMode("ace/mode/swift");
    editor.session.setValue("");
  }

  await fetchCyberdoc();
  await Promise.all([buildLookups(), buildLocationMap(), storeFileContents()]);

  watch(() => route.query.filter, f => {
    updateFromRoute();
  });
  addEventListener('popstate', updateFromRoute);
  await updateFromRoute();

  plotLoaded.value = true;

  plotEl.value.on("plotly_hover", onHoverPlot);
  plotEl.value.on("plotly_click", onClickPlot);
});

async function updateFromRoute() {
  let path = props.name;
  if (!Array.isArray(path)) path = [path];

  let filters = [];

  if (route.query.filter) {
    if (!Array.isArray(route.query.filter)) filters = [route.query.filter];
    else filters = route.query.filter;
    keyword.value = filters.join(' ');
  }

  focusedClass.value = path[path.length - 1];

  await focusClass();

  let trace = buildTrace(path, filters);

  // @ts-ignore
  Plotly.react(plotEl.value, [trace], layout, config);
}

function onSearch() {
  if (keyword.value) {
    router.replace({ path: route.path, query: { filter: keyword.value } });
  }
  else {
    router.replace({ path: route.path, query: null });
  }
}

async function onPaneReady() {
  await nextTick();
  paneReady.value = true;
}

async function onHoverPlot(evt) {
  let point = evt.points[0];
  focusedClass.value = point.label;
  await focusClass();
}

async function focusClass() {
  let className = focusedClass.value;
  let location = locationMap[className];

  if (!location) {
    console.log("No location for ", location);
    focusedPath.value = "";
    return;
  }

  focusedPath.value = location.path.substr(2);

  await loadFileContents(className, location);

  editor.session.setValue(cachedFileContents[className]);
  editor.gotoLine(location.line, 0, false);
}

async function onClickPlot(evt) {
  let point = evt.points[0];
  let rt = buildRoute(parseInt(point.id, 10));

  router.push({ path: `/class/${rt}`, query: route.query });
}

async function loadFileContents(className: string, location: any) {
  if (!location) return;

  try {
    if (!cachedFileContents[className]) {
      cachedFileContents[className] = await get(location.path);
    }
  }
  catch (error) {
    console.log(error);
  }
}

async function buildLocationMap() {
  let stored: string[] = await get("class-locations");
  let locLines = [];

  if (!stored) {
    let locRes = await fetch("https://raw.githubusercontent.com/johnsusek/cyberpunk-visualizer/main/public/class-locations.txt");
    let locData = await locRes.text();
    locLines = locData.split("\n");
    await set("class-locations", locLines);
  }
  else {
    locLines = stored;
  }

  for (let locationLine of locLines) {
    if (!locationLine) continue;

    let [path, lineno, entry] = locationLine.split(":");

    if (!entry) continue;

    let line = parseInt(lineno, 10);
    let classMatch = entry.match(/class (\w+) /);

    if (!classMatch) continue;

    let name = classMatch[1];
    let base = entry.match(/ extends (\w+)/)?.[1] || undefined;

    locationMap[name] = { path, line, base };
  }
}

async function storeFileContents() {
  let stored = await get("./orphans.script");

  if (!stored) {
    let codeRes = await fetch("https://raw.githubusercontent.com/johnsusek/cyberpunk-visualizer/main/public/redscript-code.zip");
    let zipped = await codeRes.blob();
    let unzipped = await JSZip.loadAsync(zipped);

    for (let file of Object.values(unzipped.files)) {
      await set(file.name.replace(/^redscript-code/, "."), await file.async("string"));
    }
  }
}
</script>
