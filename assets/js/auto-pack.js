(() => {
  const trigger = document.querySelector(".auto-pack-trigger");
  if (!trigger) return;

  const frameInset = 4;
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let hasStarted = false;

  function collectTiles() {
    return [...document.body.querySelectorAll("*")].flatMap((element, sourceIndex) => {
      if (["SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT"].includes(element.tagName)) return [];

      const bounds = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (bounds.width < 2 || bounds.height < 2 || style.display === "none" || style.visibility === "hidden") return [];

      const tile = element.cloneNode(false);
      if (element.namespaceURI === "http://www.w3.org/2000/svg") {
        element.childNodes.forEach((child) => tile.append(child.cloneNode(true)));
      } else {
        element.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) tile.append(child.cloneNode());
        });
      }

      [...style].forEach((property) => tile.style.setProperty(property, style.getPropertyValue(property), style.getPropertyPriority(property)));
      tile.classList.add("auto-pack-tile");
      tile.removeAttribute("id");
      tile.setAttribute("aria-hidden", "true");
      tile.style.setProperty("position", "absolute", "important");
      tile.style.setProperty("display", "block", "important");
      tile.style.setProperty("box-sizing", "border-box", "important");
      tile.style.setProperty("width", `${bounds.width}px`, "important");
      tile.style.setProperty("height", `${bounds.height}px`, "important");
      tile.style.setProperty("left", `${window.scrollX + bounds.left}px`);
      tile.style.setProperty("top", `${window.scrollY + bounds.top}px`);
      tile.style.setProperty("opacity", "1", "important");
      tile.style.setProperty("visibility", "visible", "important");
      tile.style.setProperty("z-index", "10", "important");
      tile.style.setProperty("transform", "rotateZ(0deg) scale(1)");
      tile.style.setProperty("transform-origin", "center", "important");
      tile.style.setProperty("animation", "none", "important");
      tile.style.setProperty("transition", "none", "important");

      return [{
        element: tile,
        sourceElement: element,
        width: bounds.width,
        height: bounds.height,
        sourceLeft: window.scrollX + bounds.left,
        sourceTop: window.scrollY + bounds.top,
        sourceIndex,
      }];
    });
  }

  function packAtScale(tiles, scale, maximumWidth, maximumHeight) {
    const supportHeightTolerance = Math.max(3, scale * 10);
    const minimumSupportRatio = 0.62;
    const placements = [];
    const orderedTiles = [...tiles].sort((first, second) => (
      second.width * second.height - first.width * first.height
      || Math.max(second.width, second.height) - Math.max(first.width, first.height)
      || first.sourceIndex - second.sourceIndex
    ));

    for (const tile of orderedTiles) {
      const orientations = [0, 90].map((rotation) => ({
        rotation,
        width: (rotation === 0 ? tile.width : tile.height) * scale,
        height: (rotation === 0 ? tile.height : tile.width) * scale,
      }));
      let bestPlacement;

      for (const orientation of orientations) {
        if (orientation.width > maximumWidth || orientation.height > maximumHeight) continue;

        const candidatePositions = new Map();
        const addCandidate = (x, y) => candidatePositions.set(`${x}:${y}`, { x, y });
        addCandidate(0, 0);
        placements.forEach((placement) => {
          const supportTop = placement.y + placement.height;
          addCandidate(placement.x, supportTop);
          addCandidate(placement.x + placement.width - orientation.width, supportTop);
          if (placement.y === 0) addCandidate(placement.x + placement.width, 0);
        });

        const candidates = [...candidatePositions.values()].sort((first, second) => first.y - second.y || first.x - second.x);
        for (const { x, y } of candidates) {
          if (x < 0 || x + orientation.width > maximumWidth || y + orientation.height > maximumHeight) continue;

          const collides = placements.some((placement) => (
            x < placement.x + placement.width
            && x + orientation.width > placement.x
            && y < placement.y + placement.height
            && y + orientation.height > placement.y
          ));
          if (collides) continue;

          const supportIntervals = placements
            .filter((placement) => Math.abs(placement.y + placement.height - y) <= supportHeightTolerance)
            .map((placement) => ({
              left: Math.max(x, placement.x),
              right: Math.min(x + orientation.width, placement.x + placement.width),
            }))
            .filter((interval) => interval.right > interval.left)
            .sort((first, second) => first.left - second.left);
          let supportedWidth = 0;
          let supportRight = -Infinity;
          supportIntervals.forEach((interval) => {
            supportedWidth += Math.max(0, interval.right - Math.max(interval.left, supportRight));
            supportRight = Math.max(supportRight, interval.right);
          });
          if (y !== 0 && supportedWidth < orientation.width * minimumSupportRatio) continue;

          bestPlacement = { tile, x, y, ...orientation };
          break;
        }

        if (bestPlacement) break;
      }

      if (!bestPlacement) return { width: Infinity, height: Infinity, placements: [], scale };
      placements.push(bestPlacement);
    }

    return {
      width: Math.max(...placements.map((placement) => placement.x + placement.width)),
      height: Math.max(...placements.map((placement) => placement.y + placement.height)),
      placements,
      scale,
    };
  }

  function layoutTiles(tiles, maximumWidth, maximumHeight) {
    const totalArea = tiles.reduce((area, tile) => area + tile.width * tile.height, 0);
    let lowerScale = 0;
    let upperScale = Math.min(1, Math.sqrt((maximumWidth * maximumHeight) / totalArea));
    let bestLayout = { width: 0, height: 0, placements: [], scale: 0 };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = (lowerScale + upperScale) / 2;
      const layout = packAtScale(tiles, scale, maximumWidth, maximumHeight);
      if (layout.height <= maximumHeight) {
        lowerScale = scale;
        bestLayout = layout;
      } else {
        upperScale = scale;
      }
    }

    return bestLayout;
  }

  function startPacking() {
    if (hasStarted) return;
    hasStarted = true;
    trigger.disabled = true;

    const tiles = collectTiles();
    if (!tiles.length) return;

    const isNarrowViewport = window.innerWidth < 700;
    const frameAspectRatio = 2.35;
    const maximumFrameWidth = Math.min(window.innerWidth * (isNarrowViewport ? 0.88 : 0.56), isNarrowViewport ? 560 : 720);
    const maximumFrameHeight = Math.min(window.innerHeight * (isNarrowViewport ? 0.28 : 0.56), 500);
    const frameWidth = Math.min(maximumFrameWidth, maximumFrameHeight * frameAspectRatio);
    const frameHeight = frameWidth / frameAspectRatio;
    const maximumWidth = frameWidth - frameInset * 2;
    const maximumHeight = frameHeight - frameInset * 2;
    const layout = layoutTiles(tiles, maximumWidth, maximumHeight);
    const stage = document.createElement("div");
    const frame = document.createElement("div");
    const tileLayer = document.createElement("div");
    const backButton = document.createElement("button");
    const animationCompletions = [];
    const frameLeft = isNarrowViewport ? (window.innerWidth - frameWidth) / 2 : window.innerWidth - frameWidth - 24;
    const frameTop = (window.innerHeight - frameHeight) / 2;
    const scale = layout.scale;
    const startScroll = window.scrollY;
    const scrollDuration = isReducedMotion ? 1800 : Math.min(9000, Math.max(4500, startScroll * 1.5));
    const scrollStartTime = performance.now();
    const stagedPlacements = [...layout.placements]
      .sort((first, second) => second.tile.sourceTop - first.tile.sourceTop || first.tile.sourceIndex - second.tile.sourceIndex);
    let nextPlacement = 0;

    stage.className = "auto-pack-overlay";
    frame.className = "auto-pack-frame";
    tileLayer.className = "auto-pack-tile-layer";
    backButton.className = "btn btn-ghost btn-small auto-pack-return";
    backButton.type = "button";
    backButton.setAttribute("aria-label", document.body.dataset.autoPackBack || "Back");
    backButton.innerHTML = '<i class="fi-rr-arrow-left" aria-hidden="true"></i><span></span>';
    backButton.querySelector("span").textContent = document.body.dataset.autoPackBack || "Back";
    backButton.addEventListener("click", () => window.location.reload());
    frame.style.left = `${frameLeft}px`;
    frame.style.top = `${frameTop}px`;
    frame.style.width = `${frameWidth}px`;
    frame.style.height = `${frameHeight}px`;
    stage.append(frame, tileLayer, backButton);
    document.body.append(stage);
    document.body.classList.add("auto-pack-active");
    const backButtonBounds = backButton.getBoundingClientRect();
    backButton.style.left = `${frameLeft + frameWidth - backButtonBounds.width}px`;
    backButton.style.top = `${Math.max(8, frameTop - backButtonBounds.height - 10)}px`;

    const collectPlacement = ({ tile, x, y, width, height, rotation }, placementIndex) => {
      const sourceLeft = tile.sourceLeft - window.scrollX;
      const sourceTop = tile.sourceTop - window.scrollY;
      const targetCenterX = frameLeft + frameInset + x + width / 2;
      const targetCenterY = frameTop + frameInset + layout.height - y - height / 2;
      const targetLeft = targetCenterX - tile.width / 2;
      const targetTop = targetCenterY - tile.height / 2;

      tile.element.style.setProperty("left", `${sourceLeft}px`);
      tile.element.style.setProperty("top", `${sourceTop}px`);
      tile.element.style.setProperty("z-index", `${10 + placementIndex}`, "important");
      tile.element.style.setProperty("outline", `${Math.min(14, 1 / scale)}px solid rgb(from var(--c-primary) r g b / 0.22)`, "important");
      tileLayer.append(tile.element);
      tile.sourceElement.style.setProperty("transition", "opacity 180ms ease");
      tile.sourceElement.style.setProperty("opacity", "0", "important");

      const animation = tile.element.animate([
        { left: `${sourceLeft}px`, top: `${sourceTop}px`, transform: "rotateZ(0deg) scale(1)", opacity: 1 },
        { left: `${targetLeft}px`, top: `${targetTop}px`, transform: `rotateZ(${rotation}deg) scale(${scale})`, opacity: 0.98 },
      ], {
        duration: isReducedMotion ? 1 : 850 + (placementIndex * 37) % 220,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      });
      animationCompletions.push(animation.finished.catch(() => {}));
    };

    const animateScroll = (time) => {
      const progress = Math.min(1, (time - scrollStartTime) / scrollDuration);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const scrollTop = startScroll * (1 - easedProgress);
      window.scrollTo(0, scrollTop);

      const collectionLine = scrollTop + window.innerHeight * 0.58;
      let collectedThisFrame = 0;
      while (
        nextPlacement < stagedPlacements.length
        && (stagedPlacements[nextPlacement].tile.sourceTop >= collectionLine || progress === 1)
        && collectedThisFrame < 12
      ) {
        collectPlacement(stagedPlacements[nextPlacement], nextPlacement);
        nextPlacement += 1;
        collectedThisFrame += 1;
      }

      if (progress === 1 && nextPlacement === stagedPlacements.length) {
        window.scrollTo(0, 0);
        Promise.all(animationCompletions).then(() => backButton.classList.add("is-visible"));
        return;
      }

      requestAnimationFrame(animateScroll);
    };

    const preventManualScroll = (event) => event.preventDefault();
    const preventScrollKeys = (event) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) event.preventDefault();
    };
    window.addEventListener("wheel", preventManualScroll, { passive: false });
    window.addEventListener("touchmove", preventManualScroll, { passive: false });
    window.addEventListener("keydown", preventScrollKeys);
    requestAnimationFrame(animateScroll);
  }

  trigger.addEventListener("click", startPacking, { once: true });
})();