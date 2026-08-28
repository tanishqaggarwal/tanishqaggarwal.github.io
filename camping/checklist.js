(function () {
  const STORAGE_KEY = document.body.dataset.storageKey || "camping-checklist-v1";
  const sections = Array.from(document.querySelectorAll("[data-checklist]"));
  if (!sections.length) return;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private mode / storage disabled — checkboxes still work for this visit */
    }
  }

  const state = load();

  sections.forEach((section) => {
    const boxes = Array.from(
      section.querySelectorAll('input[type="checkbox"][data-key]')
    );
    if (!boxes.length) return;

    const progress = section.querySelector("[data-progress]");
    const clearBtn = section.querySelector("[data-clear]");

    function updateProgress() {
      if (!progress) return;
      const done = boxes.filter((b) => b.checked).length;
      progress.textContent = done + " / " + boxes.length + " done";
    }

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
        const next = load();
        boxes.forEach((b) => {
          b.checked = false;
          delete next[b.dataset.key];
        });
        save(next);
        updateProgress();
      });
    }
  });
})();
