<template>
  <div
    v-if="paneSizes?.length"
    class="h-100 flex flex-columns"
  >
    <div
      v-if="rootClasses?.length"
      class="flex justify-content-between align-items-center p-sm"
    >
      <h1 class="m-e-md">Cyberpunk Class Explorer</h1>

      <div class="flex align-items-center">
        <div>
          <div class="select">
            <select
              v-model="selectedClass"
              name="selected-class"
              class="text-large"
              @change="onSelectClass"
            >
              <option
                v-for="rootClass in rootClasses"
                :key="rootClass"
                :value="rootClass"
                :label="rootClass"
              />
            </select>
            <span class="focus" />
          </div>
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
        />
      </pane>

      <pane :size="paneSizes[1]">
        <h2 class="p-sm">{{ focusedPath }}</h2>
        <div
          v-show="focusedPath"
          ref="editorEl"
          class="h-100"
        />

        <!-- <v-ace-editor
          v-model:value="focusedFileContents"
          lang="swift"
          theme="tomorrow_night_bright"
          style="height: 100%"
          @init="editorInit" /> -->
      </pane>
    </splitpanes>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, nextTick } from "vue";
import { Splitpanes, Pane } from "splitpanes";
import * as JSZip from "jszip";
import { get, set } from '@/lib/db';
import "splitpanes/dist/splitpanes.css";
import { useSplitpanesStorage } from "@/composables/useSplitpanesStorage";
import Plotly from "plotly.js/lib/core";
import { fetchCyberdoc, buildLookups, buildRoute, buildTrace, layout, config, roots } from "@/lib/plotlyConfig";
import router from "@/router";
import treemap from "plotly.js/lib/treemap";
Plotly.register([treemap]);

let props = defineProps<{
  name: string[];
}>();

let plotEl = ref(null);
let editorEl = ref(null);
let { paneSizes, onResized } = useSplitpanesStorage();
let locationMap = {};
let focusedPath = ref("");
let focusedClass = ref("");
let selectedClass = ref("");
let rootClasses = ref([]);
let paneReady = ref(false);
let cachedFileContents = {};

let ace = window["ace"];
let editor = null;

async function updateFromName() {
  let name = props.name;

  if (!Array.isArray(name)) name = [name];

  selectedClass.value = name[name.length - 1];
  focusedClass.value = selectedClass.value;

  await focusClass();

  let trace = buildTrace(name);
  // @ts-ignore
  Plotly.react(plotEl.value, [trace], layout, config);
}

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

  rootClasses.value = roots.map(r => r.name);

  addEventListener('popstate', updateFromName);

  await updateFromName();

  plotEl.value.on("plotly_hover", onHoverPlot);
  plotEl.value.on("plotly_click", onClickPlot);

});

async function onPaneReady() {
  await nextTick();
  paneReady.value = true;
}

function onSelectClass() {
  window.location.href = `/class/${selectedClass.value}`;
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
  router.push(`/class/${rt}`);
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
    let codeRes = await fetch("/redscript-code.zip");
    let zipped = await codeRes.blob();
    let unzipped = await JSZip.loadAsync(zipped);

    for (let file of Object.values(unzipped.files)) {
      await set(file.name.replace(/^redscript-code/, "."), await file.async("string"));
    }
  }
}
</script>
