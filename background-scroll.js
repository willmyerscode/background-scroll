(function () {
  const pluginEl = document.querySelector('[data-wm-plugin="scroll-backgrounds"], [data-wm-plugin="background-scroll"]');
  if (!pluginEl) return;

  const sections = Array.from(document.querySelectorAll("#sections > .page-section"));
  if (!sections.length) return;

  const page = document.querySelector("#page") || document.body;

  // Settings (defaults → global → data attributes)
  const defaults = {
    directionalOffsetRatio: 0, // % of viewport height; applied ± based on scroll direction
  };

  const globalSettings = window.wmScrollBackgroundsSettings || {};
  const ds = pluginEl.dataset || {};
  const localSettings = {};

  const parseRatioPercent = (value) => {
    if (value == null) return undefined;
    const str = String(value).trim();
    if (str === "") return undefined;
    if (str.endsWith("%")) {
      const n = Number(str.slice(0, -1));
      if (isFinite(n)) return n / 100;
      return undefined;
    }
    const n = Number(str);
    if (!isFinite(n)) return undefined;
    // If given as whole percent (e.g., 10), convert to ratio; if 0..1 keep as-is
    return Math.abs(n) > 1 ? n / 100 : n;
  };

  if (ds.directionalOffset != null && ds.directionalOffset !== "") {
    localSettings.directionalOffsetRatio = parseRatioPercent(ds.directionalOffset);
  }

  const config = Object.assign({}, defaults, globalSettings, localSettings);
  const normalizeOffsetRatio = (v) => {
    const base = typeof v === "number" && isFinite(v) ? v : defaults.directionalOffsetRatio;
    // Clamp to avoid extreme triggers
    return Math.max(0, Math.min(0.45, base));
  };
  const configDirectionalOffsetRatio = normalizeOffsetRatio(config.directionalOffsetRatio);

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
  // Midpoint-triggered transition: switch active wrapper when the
  // next section's top crosses the viewport midpoint.
  // -------------------------------------------------------------

  const sectionTops = new Array(sections.length).fill(0);

  const computeSectionTops = () => {
    for (let i = 0; i < sections.length; i++) {
      const rect = sections[i].getBoundingClientRect();
      sectionTops[i] = rect.top + window.scrollY;
    }
  };

  let ticking = false;
  let currentActiveIndex = -1;
  let lastScrollY = window.scrollY;
  let scrollDirection = "down"; // or "up"
  const directionalOffsetRatio = configDirectionalOffsetRatio; // 0..0.45
  let scrollDebounceTimer = null;

  const updateActiveByMidpoint = () => {
    const yTop = window.scrollY;
    // Determine scroll direction with a tiny hysteresis to avoid jitter
    if (yTop > lastScrollY + 0.5) scrollDirection = "down";
    else if (yTop < lastScrollY - 0.5) scrollDirection = "up";

    const baseRatio = 0.5;
    const adjustedRatio = baseRatio + (scrollDirection === "down" ? directionalOffsetRatio : -directionalOffsetRatio);
    const clampedRatio = Math.min(0.98, Math.max(0.02, adjustedRatio));
    const triggerY = yTop + window.innerHeight * clampedRatio;

    // Choose the last section whose top is above or equal to the trigger point
    let i = 0;
    for (let idx = 0; idx < sectionTops.length; idx++) {
      if (triggerY >= sectionTops[idx]) i = idx;
      else break;
    }

    if (i !== currentActiveIndex) {
      for (let w = 0; w < wrappers.length; w++) {
        wrappers[w].classList.toggle("is-active", w === i);
      }
      currentActiveIndex = i;
    }

    lastScrollY = yTop;
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateActiveByMidpoint);
    }

    // Debounce a recompute similar to resize, trailing 500ms after scrolling calms
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {
      onResize();
    }, 500);
  };

  const onResize = () => {
    computeSectionTops();
    // Run an immediate update so positions are correct after resize
    updateActiveByMidpoint();
  };

  // Initialize positions and initial state
  computeSectionTops();
  updateActiveByMidpoint();

  // Bind listeners
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
})();
