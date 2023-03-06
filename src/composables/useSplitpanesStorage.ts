// mouse.js
import { ref } from "vue";

// by convention, composable function names start with "use"
export function useSplitpanesStorage() {
  let paneSizes = ref(null);

  let defaultSizes = [75, 25];

  try {
    let storedPanes = localStorage.getItem("panes") || "";
    let stored = JSON.parse(storedPanes);

    paneSizes.value = stored?.length ? stored : defaultSizes;
  } catch (error) {
    paneSizes.value = defaultSizes;
  }

  function onResized(panes) {
    localStorage.setItem("panes", JSON.stringify(panes.map(p => p.size)));
    window.dispatchEvent(new Event("resize"));
  }

  return { paneSizes, onResized };
}
