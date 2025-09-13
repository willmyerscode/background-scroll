(function () {
  const pluginEl = document.querySelector('[data-wm-plugin="scroll-backgrounds"], [data-wm-plugin="background-scroll"]');
  if (!pluginEl) return;

  const sections = Array.from(document.querySelectorAll("#sections > .page-section"));
  if (!sections.length) return;

  const page = document.querySelector("#page") || document.body;

  // Build overlay container that holds background-only clones inside wrappers
  const scrollContainer = document.createElement("div");
  scrollContainer.id = "wm-scroll-section-container";
  const stickyWrapper = document.createElement("div");
  stickyWrapper.className = "wm-scroll-sticky";
  scrollContainer.appendChild(stickyWrapper);

  const wrappers = [];
  const clones = sections.map((section, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "wm-scroll-wrapper";
    wrapper.setAttribute("data-wrapper-index", String(index));
    // Ensure higher z-index for earlier sections so the current (top) section sits above the next
    wrapper.style.zIndex = String(100000 - index);

    const clone = section.cloneNode(true);
    clone.setAttribute("data-section-index", String(index));

    // Remove foreground content if present; keep background elements/styles
    const contentWrapper = clone.querySelector(".content-wrapper");
    if (contentWrapper) contentWrapper.remove();

    wrapper.appendChild(clone);
    stickyWrapper.appendChild(wrapper);
    wrappers.push(wrapper);
    return clone;
  });

  // Initial append: mount into the last section hidden, per Squarespace expectations
  const lastSection = sections[sections.length - 1];
  if (lastSection && !scrollContainer.parentNode) {
    scrollContainer.classList.add("is-staging");
    lastSection.appendChild(scrollContainer);
  }

  // On DOMContentLoaded, move to page and activate
  const mountActive = () => {
    if (scrollContainer.parentNode !== page) page.appendChild(scrollContainer);
    scrollContainer.classList.remove("is-staging");
    scrollContainer.classList.add("is-active");
  };
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", mountActive, { once: true });
  } else {
    mountActive();
  }

  // Watch for Squarespace Edit Mode and remove the scroll container when entering it
  (function watchEditMode() {
    const isBackend = window.self !== window.top;
    if (!isBackend) return;

    const removeScrollContainer = () => {
      const existing = document.getElementById("wm-scroll-section-container");
      if (existing && existing.parentNode) existing.remove();
    };

    if (document.body.classList.contains("sqs-edit-mode-active") || document.body.classList.contains("sqs-is-page-editing")) {
      removeScrollContainer();
      return;
    }

    const bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          const classList = document.body.classList;
          if (classList.contains("sqs-edit-mode-active") || classList.contains("sqs-is-page-editing")) {
            removeScrollContainer();
            bodyObserver.disconnect();
            break;
          }
        }
      }
    });

    bodyObserver.observe(document.body, { attributes: true });
  })();

  // -------------------------------------------------------------
  // Scroll-driven crossfade: show the cloned section that matches
  // the visible page section by adjusting wrapper opacity.
  // -------------------------------------------------------------
  // Fade configuration (in pixels)
  const fadeOffsetPx = 0;    // scroll distance after section start to begin fading
  const fadeLengthPx = 100;   // scroll distance over which the fade completes

  const sectionTops = new Array(sections.length).fill(0);

  const computeSectionTops = () => {
    for (let i = 0; i < sections.length; i++) {
      const rect = sections[i].getBoundingClientRect();
      sectionTops[i] = rect.top + window.scrollY;
    }
  };

  let ticking = false;

  const updateActiveOpacity = () => {
    const y = window.scrollY;
    // Find the current index i such that sectionTops[i] <= y < sectionTops[i+1]
    let i = 0;
    for (let idx = 0; idx < sectionTops.length; idx++) {
      if (y >= sectionTops[idx]) i = idx;
      else break;
    }

    const start = sectionTops[i] ?? 0;
    const isLast = i >= sectionTops.length - 1;
    const rawLocal = (y - (start + fadeOffsetPx)) / Math.max(1, fadeLengthPx);
    const progress = isLast ? 0 : Math.min(1, Math.max(0, rawLocal));

    for (let w = 0; w < wrappers.length; w++) {
      let opacity;
      if (w < i) {
        // Past sections are fully hidden
        opacity = 0;
      } else if (w === i) {
        // Only the active (top) section's opacity changes
        opacity = 1 - progress;
      } else {
        // All following sections are fully opaque to avoid double partial overlays
        opacity = 1;
      }

      wrappers[w].style.opacity = String(opacity);
      wrappers[w].classList.toggle("is-active", w === i);
    }

    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateActiveOpacity);
    }
  };

  const onResize = () => {
    computeSectionTops();
    // Run an immediate update so positions are correct after resize
    updateActiveOpacity();
  };

  // Initialize positions and initial state
  computeSectionTops();
  updateActiveOpacity();

  // Bind listeners
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
})();
