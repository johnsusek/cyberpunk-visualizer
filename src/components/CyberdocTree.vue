<template>
  <div
    v-if="paneSizes?.length"
    class="h-100">
    <div
      v-if="rootClasses?.length"
      class="flex justify-content-between align-items-center p-sm">
      <h1 class="m-e-md">Cyberpunk Class Explorer</h1>

      <div class="flex align-items-center">
        <div>
          <div class="select">
            <select
              v-model="selectedClass"
              name="selected-class"
              class="text-large"
              @change="onChange">
              <option
                v-for="rootClass in rootClasses"
                :key="rootClass"
                :value="rootClass"
                :label="rootClass" />
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
      @ready="onPaneReady">
      <pane :size="paneSizes[0]">
        <div
          v-if="paneReady"
          ref="plotEl"
          class="h-100" />
      </pane>

      <pane :size="paneSizes[1]">
        <h2 class="p-sm">{{ focusedPath }}</h2>
        <div
          v-show="focusedPath"
          ref="editorEl"
          class="h-100" />

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
let selectedClass = ref("");
let rootClasses = ref([]);
let paneReady = ref(false);
let cachedFileContents = {};

let ace = window["ace"];
let editor = null;

onMounted(async () => {
  try {
    editor = ace.edit(editorEl.value);
    editor.setTheme("ace/theme/tomorrow_night_bright");
    editor.setShowPrintMargin(false);
    editor.session.setMode("ace/mode/swift");
    editor.session.setValue("<h1>Ace Editor works great in Angular!</h1>");
  }
  catch (error) {
    console.log(error);
  }

  selectedClass.value = props.name[0];

  await fetchCyberdoc();
  await Promise.all([buildLookups(), buildLocationMap(), storeFileContents()]);

  rootClasses.value = roots.map(r => r.name);

  let trace = buildTrace(props.name);

  await nextTick();
  // @ts-ignore
  Plotly.newPlot(plotEl.value, [trace], layout, config);
  plotEl.value.on("plotly_hover", onHover);
  plotEl.value.on("plotly_click", onClick);
});

async function onPaneReady() {
  await nextTick();
  paneReady.value = true;
}

function onChange(evt) {
  window.location.href = `/class/${selectedClass.value}`;
}

async function onHover(evt) {
  let point = evt.points[0];
  await setFocusedClass(point.label);
}

async function onClick(evt) {
  let point = evt.points[0];
  let rt = buildRoute(parseInt(point.id, 10));
  router.push(`/class/${rt}`);
}

async function setFocusedClass(className) {
  let location = locationMap[className];

  if (!location) {
    console.log("No location for " + className);
  }
  else {
    try {
      if (!cachedFileContents[className]) {
        cachedFileContents[className] = await get(location.path);
      }
      focusedPath.value = location.path.substr(2);
      await nextTick();
      editor.session.setValue(cachedFileContents[className]);
      editor.gotoLine(location.line, 0, false);
    }
    catch (error) {
      console.log(error);
    }
  }
}

async function buildLocationMap() {
  let stored: string[] = await get("class-locations");
  let locLines = [];

  if (!stored) {
    let locRes = await fetch("/class-locations.txt");
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
