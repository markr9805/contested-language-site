/* Contested Language — theme controller.
   Auto (follows OS) by default; Light/Dark persisted in localStorage.
   Sets data-theme on <html>; style.css keys every token off it.
   Fires "themechange" so chart renderers can re-read CSS variables. */
"use strict";
(function () {
  const KEY = "cl-theme";
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const mode = () => localStorage.getItem(KEY) || "auto";

  function apply() {
    const m = mode();
    const dark = m === "auto" ? mq.matches : m === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    for (const b of document.querySelectorAll("[data-theme-btn]")) {
      b.setAttribute("aria-pressed", String(b.dataset.themeBtn === m));
    }
    document.dispatchEvent(new CustomEvent("themechange"));
  }

  mq.addEventListener("change", () => { if (mode() === "auto") apply(); });

  document.addEventListener("DOMContentLoaded", () => {
    for (const b of document.querySelectorAll("[data-theme-btn]")) {
      b.addEventListener("click", () => {
        localStorage.setItem(KEY, b.dataset.themeBtn);
        apply();
      });
    }
    apply();
  });

  // apply immediately too, before DOMContentLoaded, to avoid a flash
  apply();
})();
