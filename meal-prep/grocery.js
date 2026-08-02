(function () {
  const root = document.getElementById("grocery");
  const STORAGE_KEY =
    (root && root.dataset.storageKey) ||
    document.body.dataset.storageKey ||
    "meal-prep-grocery-v1";
  const boxes = Array.from(
    document.querySelectorAll('#grocery input[type="checkbox"][data-key]')
  );
  const progress = document.getElementById("progress");
  const clearBtn = document.getElementById("clear-checks");
  if (!boxes.length || !progress) return;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function updateProgress() {
    const total = boxes.length;
    const done = boxes.filter((b) => b.checked).length;
    progress.textContent = done + " / " + total + " done";
  }

  const state = load();
  boxes.forEach((box) => {
    box.checked = !!state[box.dataset.key];
    box.addEventListener("change", () => {
      const next = load();
      next[box.dataset.key] = box.checked;
      save(next);
      updateProgress();
    });
  });
  updateProgress();

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      boxes.forEach((b) => (b.checked = false));
      save({});
      updateProgress();
    });
  }
})();
