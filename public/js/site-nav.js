(() => {
  const disclosures = document.querySelectorAll("[data-site-projects]");

  for (const disclosure of disclosures) {
    const summary = disclosure.querySelector("summary");

    disclosure.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !disclosure.open) return;
      event.preventDefault();
      disclosure.open = false;
      summary?.focus();
    });

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (disclosure.open && !disclosure.contains(event.target)) {
          disclosure.open = false;
        }
      },
      { passive: true },
    );
  }
})();
