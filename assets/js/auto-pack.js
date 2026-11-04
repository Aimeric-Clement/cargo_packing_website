(() => {
  const trigger = document.querySelector(".auto-pack-trigger");
  if (!trigger) return;

  const frameSideInset = 10;
  const frameTopInset = 14;
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let hasStarted = false;

  function collectTiles() {
    const compositeTileSelector = [
      ".hero-copy",
      ".hero-snapshot",
      ".key-points-list",
      ".feature-card",
      ".showcase-copy",
      ".showcase-media",
      ".teaser-card",
      ".language-selector",
    ].join(", ");

    return [...document.body.querySelectorAll("*")].flatMap((element, sourceIndex) => {
      if (
        ["SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT", "HTML", "BODY", "MAIN", "SECTION", "HEADER", "FOOTER", "NAV"].includes(element.tagName)
        || element.classList.contains("container")
        || (element.closest(".site-header") && !element.matches(".site-header .language-selector"))
        || element.parentElement?.closest(compositeTileSelector)
      ) return [];
      const isCompositeTile = element.matches(compositeTileSelector);

      const bounds = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (bounds.width < 24 || bounds.height < 24 || style.display === "none" || style.visibility === "hidden") return [];
      if (bounds.width >= window.innerWidth * 0.9 && bounds.height >= window.innerHeight * 0.75) return [];
      const hasNestedElements = element.children.length > 0;
      const hasDirectText = [...element.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (hasNestedElements && !hasDirectText && !isCompositeTile && element.namespaceURI !== "http://www.w3.org/2000/svg") return [];

      const tile = element.cloneNode(true);
      const sourceElements = [element, ...element.querySelectorAll("*")];
      const clonedElements = [tile, ...tile.querySelectorAll("*")];
      sourceElements.forEach((sourceElement, cloneIndex) => {
        const clonedElement = clonedElements[cloneIndex];
        const sourceStyle = window.getComputedStyle(sourceElement);
        [...sourceStyle].forEach((property) => clonedElement.style.setProperty(property, sourceStyle.getPropertyValue(property), sourceStyle.getPropertyPriority(property)));
        clonedElement.removeAttribute("id");
      });

      tile.classList.add("auto-pack-tile");
      tile.setAttribute("inert", "");
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

      return [{
        element: tile,
        imageFrame: ["IMG", "VIDEO", "CANVAS"].includes(element.tagName) ? document.createElement("div") : null,
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
    const minimumSupportRatio = 0.65;
    const placements = [];
    const orderedTiles = [...tiles].sort((first, second) => {
      const firstLength = Math.max(first.width, first.height);
      const secondLength = Math.max(second.width, second.height);
      const firstIsFlat = firstLength / Math.min(first.width, first.height) >= 1.8;
      const secondIsFlat = secondLength / Math.min(second.width, second.height) >= 1.8;

      return Number(secondIsFlat) - Number(firstIsFlat)
        || (firstIsFlat && secondIsFlat ? secondLength - firstLength : 0)
        || second.width * second.height - first.width * first.height
        || secondLength - firstLength
        || first.sourceIndex - second.sourceIndex;
    });

    for (const tile of orderedTiles) {
      const isFlat = Math.max(tile.width, tile.height) / Math.min(tile.width, tile.height) >= 1.8;
      const preferredRotation = isFlat && tile.height > tile.width ? 90 : 0;
      const orientations = [preferredRotation, preferredRotation === 0 ? 90 : 0].map((rotation) => ({
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
    let lowerScale = 0;
    let upperScale = 1;
    let bestLayout = { width: 0, height: 0, placements: [], scale: 0 };

    for (let attempt = 0; attempt < 14; attempt += 1) {
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
    document.querySelector(".site-header")?.remove();
    tiles.forEach((tile) => {
      if (!tile.sourceElement.isConnected) return;
      const bounds = tile.sourceElement.getBoundingClientRect();
      tile.sourceLeft = window.scrollX + bounds.left;
      tile.sourceTop = window.scrollY + bounds.top;
    });

    const isNarrowViewport = window.innerWidth < 700;
    const frameAspectRatio = 2.35;
    const maximumFrameWidth = Math.min(window.innerWidth * (isNarrowViewport ? 0.88 : 0.56), isNarrowViewport ? 560 : 720);
    const maximumFrameHeight = Math.min(window.innerHeight * (isNarrowViewport ? 0.28 : 0.56), 500);
    const frameWidth = Math.min(maximumFrameWidth, maximumFrameHeight * frameAspectRatio);
    const frameHeight = frameWidth / frameAspectRatio;
    const frameFloorHeight = frameHeight * 0.12;
    const maximumWidth = frameWidth - frameSideInset * 2;
    const maximumHeight = frameHeight - frameTopInset - frameFloorHeight;
    const layout = layoutTiles(tiles, maximumWidth, maximumHeight);
    const stage = document.createElement("div");
    const frame = document.createElement("div");
    const tileLayer = document.createElement("div");
    const backButton = document.createElement("button");
    const activePlacements = [];
    const frameLeft = isNarrowViewport ? (window.innerWidth - frameWidth) / 2 : window.innerWidth - frameWidth - 24;
    const frameTop = (window.innerHeight - frameHeight) / 2;
    const scale = layout.scale;
    const placementInterval = isReducedMotion ? 0 : 32;
    const maximumPlacementsPerFrame = isReducedMotion ? 12 : 1;
    const startScroll = Math.max(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
    const scrollDuration = isReducedMotion
      ? 1800
      : Math.min(12000, Math.max(4500, startScroll * 1.5, layout.placements.length * placementInterval * 1.5));
    const scrollStartTime = performance.now();
    const stagedPlacements = [...layout.placements]
      .sort((first, second) => second.tile.sourceTop - first.tile.sourceTop || first.tile.sourceIndex - second.tile.sourceIndex);
    let nextPlacement = 0;
    let lastPlacementTime = -Infinity;

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
    window.scrollTo({ top: startScroll, behavior: "instant" });
    const backButtonBounds = backButton.getBoundingClientRect();
    backButton.style.left = `${frameLeft + frameWidth - backButtonBounds.width}px`;
    backButton.style.top = `${Math.max(8, frameTop - backButtonBounds.height - 10)}px`;

    const settlePlacements = () => {
      const settledPlacements = [];
      [...activePlacements]
        .sort((first, second) => first.y - second.y || first.tile.sourceIndex - second.tile.sourceIndex)
        .forEach((placement, stackIndex) => {
          const supportTop = settledPlacements.reduce((lowestSupportedTop, support) => {
            const overlapsHorizontally = placement.x < support.x + support.width
              && placement.x + placement.width > support.x;
            return overlapsHorizontally
              ? Math.max(lowestSupportedTop, support.bottomY + support.height)
              : lowestSupportedTop;
          }, 0);
          placement.bottomY = supportTop;

          const targetCenterX = frameLeft + frameSideInset + placement.x + placement.width / 2;
          const targetCenterY = frameTop + frameTopInset + maximumHeight - placement.bottomY - placement.height / 2;
          placement.tile.element.style.setProperty("left", `${targetCenterX - placement.tile.width / 2}px`);
          placement.tile.element.style.setProperty("top", `${targetCenterY - placement.tile.height / 2}px`);
          placement.tile.element.style.setProperty("z-index", `${10 + stackIndex * 2}`, "important");
          placement.tile.element.style.setProperty("clip-path", `inset(${1 / scale}pt)`, "important");
          placement.tile.element.style.setProperty("--auto-pack-tile-inset", `${1 / scale}pt`);
          placement.tile.element.style.setProperty("--auto-pack-tile-edge", `${2 / scale}px`);
          placement.tile.element.style.setProperty("transform", `rotateZ(${placement.rotation}deg) scale(${scale})`, "important");
          placement.tile.element.style.setProperty("opacity", "0.98", "important");
          if (placement.tile.imageFrame) {
            placement.tile.imageFrame.style.setProperty("left", `${targetCenterX - placement.tile.width / 2}px`);
            placement.tile.imageFrame.style.setProperty("top", `${targetCenterY - placement.tile.height / 2}px`);
            placement.tile.imageFrame.style.setProperty("width", `${placement.tile.width}px`);
            placement.tile.imageFrame.style.setProperty("height", `${placement.tile.height}px`);
            placement.tile.imageFrame.style.setProperty("z-index", `${11 + stackIndex * 2}`);
            placement.tile.imageFrame.style.setProperty("--auto-pack-tile-edge", `${2 / scale}px`);
            placement.tile.imageFrame.style.setProperty("transform", `rotateZ(${placement.rotation}deg) scale(${scale})`);
          }
          settledPlacements.push(placement);
        });
    };

    const collectPlacement = (placement) => {
      activePlacements.push(placement);
      placement.tile.element.style.setProperty("left", `${placement.tile.sourceLeft - window.scrollX}px`);
      placement.tile.element.style.setProperty("top", `${placement.tile.sourceTop - window.scrollY}px`);
      tileLayer.append(placement.tile.element);
      if (placement.tile.imageFrame) {
        placement.tile.imageFrame.className = "auto-pack-image-frame";
        placement.tile.imageFrame.setAttribute("aria-hidden", "true");
        placement.tile.imageFrame.style.setProperty("left", `${placement.tile.sourceLeft - window.scrollX}px`);
        placement.tile.imageFrame.style.setProperty("top", `${placement.tile.sourceTop - window.scrollY}px`);
        placement.tile.imageFrame.style.setProperty("width", `${placement.tile.width}px`);
        placement.tile.imageFrame.style.setProperty("height", `${placement.tile.height}px`);
        tileLayer.append(placement.tile.imageFrame);
      }
      placement.tile.element.getBoundingClientRect();
      placement.tile.sourceElement.style.setProperty("opacity", "0", "important");
      settlePlacements();
    };

    const animateScroll = (time) => {
      const progress = Math.min(1, (time - scrollStartTime) / scrollDuration);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const desiredScrollTop = startScroll * (1 - easedProgress);
      const nextTile = stagedPlacements[nextPlacement]?.tile;
      const scrollHoldPosition = nextTile
        ? Math.min(startScroll, nextTile.sourceTop - window.innerHeight * 0.9)
        : 0;
      const scrollTop = Math.max(desiredScrollTop, scrollHoldPosition);
      window.scrollTo(0, scrollTop);

      const collectionLine = scrollTop + window.innerHeight * 0.58;
      let collectedThisFrame = 0;
      while (
        nextPlacement < stagedPlacements.length
        && collectedThisFrame < maximumPlacementsPerFrame
        && time - lastPlacementTime >= placementInterval
      ) {
        const nextTile = stagedPlacements[nextPlacement].tile;
        const isVisible = nextTile.sourceTop + nextTile.height >= scrollTop
          && nextTile.sourceTop <= scrollTop + window.innerHeight;
        if (!isVisible || (progress < 1 && nextTile.sourceTop < collectionLine)) break;

        collectPlacement(stagedPlacements[nextPlacement]);
        nextPlacement += 1;
        collectedThisFrame += 1;
        lastPlacementTime = time;
      }

      if (progress === 1 && nextPlacement === stagedPlacements.length) {
        window.scrollTo(0, 0);
        backButton.classList.add("is-visible");
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