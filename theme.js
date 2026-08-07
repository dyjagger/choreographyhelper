(function applyInitialTheme() {
  "use strict";
  let theme = "dark";
  try {
    const savedTheme = localStorage.getItem("formation-studio-theme");
    if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
  } catch (error) {
    // Dark mode remains the safe default when storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
})();
