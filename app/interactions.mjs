import { openFullTab } from "./runtime.mjs";

export function bindInteractions({
  clear,
  disconnect,
  filteredRows,
  narrowLayout,
  paint,
  root,
  run,
  setDetailOpen,
  setError,
  setLive,
  state,
}) {
  for (const button of root.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.selectedId = narrowLayout.matches ? null : filteredRows()[0]?.threadId || null;
      setDetailOpen(false);
      paint();
    });
  }
  root.querySelector("#search-input").addEventListener("input", (event) => {
    state.search = event.currentTarget.value;
    state.selectedId = narrowLayout.matches ? null : filteredRows()[0]?.threadId || null;
    paint();
  });
  root.querySelector("#thread-list").addEventListener("click", (event) => {
    const card = event.target.closest("[data-thread-id]");
    if (!card) return;
    state.selectedId = card.dataset.threadId;
    state.lastTriggerId = card.dataset.threadId;
    paint({ focusDetail: true });
  });
  root.querySelector("#detail-back").addEventListener("click", () => {
    const triggerId = state.lastTriggerId;
    setDetailOpen(false);
    state.selectedId = null;
    paint();
    [...root.querySelectorAll("[data-thread-id]")]
      .find(({ dataset }) => dataset.threadId === triggerId)?.focus();
  });
  root.querySelector("#run-button").addEventListener("click", run);
  root.querySelector("#clear-button").addEventListener("click", clear);
  root.querySelector("#disconnect-button").addEventListener("click", disconnect);
  root.querySelector("#expand-button").addEventListener("click", async () => {
    setError();
    try {
      await openFullTab();
      setLive("Opened Inbox Island in a full tab.");
    } catch (error) {
      setError(`Could not open a full tab: ${error.message}`);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && document.body.classList.contains("detail-open")) {
      event.preventDefault();
      root.querySelector("#detail-back").focus();
      return;
    }
    if (event.key === "Escape" && document.body.classList.contains("detail-open")) {
      root.querySelector("#detail-back").click();
    }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey
      && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      root.querySelector("#search-input").focus();
    }
  });
}
