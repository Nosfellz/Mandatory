import * as pdfjsLib from "./vendor/pdfjs/package/build/pdf.mjs";
import {
  EventBus,
  FindState,
  PDFFindController,
  PDFLinkService,
  PDFSinglePageViewer,
} from "./vendor/pdfjs/package/web/pdf_viewer.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/package/build/pdf.worker.mjs";

const PDF_URL = "docs/les-lois-fevrier-2026.pdf";
const frameElement = document.getElementById("document-frame");
const pageStatusElement = document.getElementById("page-status");
const searchStatusElement = document.getElementById("search-status");
const searchInputElement = document.getElementById("document-search");
const previousPageButton = document.getElementById("page-prev");
const nextPageButton = document.getElementById("page-next");
const searchSubmitButton = document.getElementById("search-submit");
const previousSearchButton = document.getElementById("search-prev");
const nextSearchButton = document.getElementById("search-next");
const toolbarElement = document.querySelector(".document-toolbar");
const stageElement = document.querySelector(".document-stage");
const searchGroupElement = document.querySelector(".document-toolbar-group-search");
const amendmentsGroupElement = document.querySelector(".document-toolbar-group-amendments");
const outlineContainerElement = document.getElementById("document-outline");
const documentHeaderElement = document.querySelector(".document-viewer-header");
const viewerContainerElement = document.getElementById("viewerContainer");
const viewerElement = document.getElementById("viewer");

const state = {
  eventBus: null,
  pdfDocument: null,
  pdfViewer: null,
  linkService: null,
  findController: null,
  searchQuery: "",
  syncFrameHeightRaf: 0,
  resizeTimeout: 0,
  selectedMatchScrollRaf: 0,
  selectedMatchScrollTimeout: 0,
  toolbarPinRaf: 0,
  pageHeaderCache: new Map(),
  pageTextCache: new Map(),
  preferredZoomValue: "auto-fit",
  exactSearch: {
    query: "",
    total: 0,
    ready: true,
    token: 0,
  },
};

function getNormalizedSearchQuery(value = state.searchQuery) {
  return normalizeSearchText(value);
}

function resetExactSearchState() {
  state.exactSearch = {
    query: "",
    total: 0,
    ready: true,
    token: state.exactSearch.token + 1,
  };
}

function updatePageStatus(pageNumber = 1) {
  if (!state.pdfDocument) {
    pageStatusElement.textContent = "Page - / -";
    return;
  }

  pageStatusElement.textContent = `Page ${pageNumber} / ${state.pdfDocument.numPages}`;
}

function updateSearchStatus(matchesCount = { current: 0, total: 0 }, findState = null) {
  const normalizedQuery = getNormalizedSearchQuery();

  if (!normalizedQuery) {
    searchStatusElement.textContent = "Aucune recherche";
    return;
  }

  if (state.exactSearch.query === normalizedQuery && !state.exactSearch.ready) {
    searchStatusElement.textContent = "Recherche en cours...";
    return;
  }

  const total = state.exactSearch.query === normalizedQuery && state.exactSearch.ready
    ? state.exactSearch.total
    : matchesCount.total;

  if (findState === FindState.NOT_FOUND || total === 0) {
    searchStatusElement.textContent = "Aucun résultat";
    return;
  }

  const current = Math.min(matchesCount.current || 1, total);
  searchStatusElement.textContent = `${current} / ${total} résultat(s)`;
}

const toolbarPlaceholderElement = document.createElement("div");
toolbarPlaceholderElement.className = "document-toolbar-placeholder";
toolbarPlaceholderElement.hidden = true;
toolbarElement?.insertAdjacentElement("afterend", toolbarPlaceholderElement);

function setSearchActiveState(isActive) {
  searchGroupElement?.classList.toggle("is-search-active", isActive);
}

function getLogicalMatchIndex(rawIndex = 0) {
  if (rawIndex <= 0) {
    return 0;
  }

  return Math.ceil(rawIndex / 2);
}

function dispatchFindCommand(type = "", findPrevious = false) {
  if (!state.searchQuery) {
    return;
  }

  const normalizedQuery = state.searchQuery.trim();

  state.eventBus.dispatch("find", {
    source: window,
    type,
    query: normalizedQuery,
    phraseSearch: true,
    caseSensitive: false,
    entireWord: isSingleWordSearchQuery(normalizedQuery),
    highlightAll: true,
    findPrevious,
    matchDiacritics: false,
  });
}

function syncFrameHeight() {
  const pageElement = viewerElement.querySelector(".page");
  if (!pageElement) {
    return;
  }

  const frameHeight = Math.ceil(pageElement.getBoundingClientRect().height + 36);
  frameElement.style.height = `${frameHeight}px`;
}

function queueSyncFrameHeight() {
  if (state.syncFrameHeightRaf) {
    cancelAnimationFrame(state.syncFrameHeightRaf);
  }

  state.syncFrameHeightRaf = requestAnimationFrame(() => {
    syncFrameHeight();
    state.syncFrameHeightRaf = 0;
  });
}

function getCurrentPageView() {
  if (!state.pdfViewer || !state.pdfDocument) {
    return null;
  }

  const pageIndex = Math.max((state.pdfViewer.currentPageNumber || 1) - 1, 0);
  return state.pdfViewer.getPageView?.(pageIndex)
    ?? state.pdfViewer._pages?.[pageIndex]
    ?? null;
}

function applyResponsiveScale() {
  if (!state.pdfViewer) {
    return;
  }

  const requestedScale = state.preferredZoomValue || "auto-fit";

  if (requestedScale === "auto-fit") {
    if (state.pdfViewer.currentScaleValue === "page-width") {
      queueSyncFrameHeight();
      return;
    }

    state.pdfViewer.currentScaleValue = "page-width";
    queueSyncFrameHeight();
    return;
  }

  const numericScale = Number.parseFloat(requestedScale);
  const pageView = getCurrentPageView();
  const baseViewport = pageView?.pdfPage?.getViewport?.({ scale: 1 });
  const containerWidth = viewerContainerElement?.clientWidth ?? 0;
  const safeContainerWidth = Math.max(containerWidth - 16, 0);

  if (!baseViewport?.width || !safeContainerWidth) {
    return;
  }

  const fitScale = safeContainerWidth / baseViewport.width;
  const nextScale = Math.min(
    Number.isFinite(numericScale) && numericScale > 0 ? numericScale : fitScale,
    fitScale
  );

  if (Math.abs((state.pdfViewer.currentScale || 0) - nextScale) < 0.001) {
    queueSyncFrameHeight();
    return;
  }

  state.pdfViewer.currentScale = nextScale;
  queueSyncFrameHeight();
}

function handleWindowResize() {
  if (state.resizeTimeout) {
    clearTimeout(state.resizeTimeout);
  }

  state.resizeTimeout = window.setTimeout(() => {
    applyResponsiveScale();
    state.resizeTimeout = 0;
  }, 120);
}

function unpinToolbar() {
  if (!toolbarElement) {
    return;
  }

  toolbarElement.classList.remove("is-fixed");
  toolbarElement.style.removeProperty("width");
  toolbarElement.style.removeProperty("left");
  toolbarPlaceholderElement.hidden = true;
  toolbarPlaceholderElement.style.removeProperty("height");
}

function updateToolbarPin() {
  if (!toolbarElement || !stageElement) {
    return;
  }

  const isCompactViewport = window.matchMedia("(max-width: 860px)").matches;
  if (isCompactViewport) {
    unpinToolbar();
    return;
  }

  const toolbarHeight = toolbarElement.offsetHeight;
  const stageRect = stageElement.getBoundingClientRect();
  const toolbarRect = toolbarPlaceholderElement.hidden
    ? toolbarElement.getBoundingClientRect()
    : toolbarPlaceholderElement.getBoundingClientRect();
  const shouldPin = stageRect.top <= 16 && stageRect.bottom > toolbarHeight + 16;

  if (!shouldPin) {
    unpinToolbar();
    return;
  }

  toolbarPlaceholderElement.hidden = false;
  toolbarPlaceholderElement.style.height = `${toolbarHeight}px`;
  toolbarElement.classList.add("is-fixed");
  toolbarElement.style.width = `${toolbarRect.width}px`;
  toolbarElement.style.left = `${toolbarRect.left}px`;
}

function queueToolbarPinUpdate() {
  if (state.toolbarPinRaf) {
    cancelAnimationFrame(state.toolbarPinRaf);
  }

  state.toolbarPinRaf = requestAnimationFrame(() => {
    updateToolbarPin();
    state.toolbarPinRaf = 0;
  });
}

function scrollToSelectedMatch() {
  const selectedHighlight = viewerElement.querySelector(".textLayer .highlight.selected");
  if (!selectedHighlight) {
    return false;
  }

  const highlightRect = selectedHighlight.getBoundingClientRect();
  const viewerRect = viewerContainerElement.getBoundingClientRect();
  const preferredTopOffset = 150;
  const desiredTop = Math.max(
    window.scrollY + highlightRect.top - preferredTopOffset,
    window.scrollY + viewerRect.top - 40
  );

  window.scrollTo({
    behavior: "auto",
    top: desiredTop,
  });

  return true;
}

function clearQueuedSelectedMatchScroll() {
  if (state.selectedMatchScrollRaf) {
    cancelAnimationFrame(state.selectedMatchScrollRaf);
    state.selectedMatchScrollRaf = 0;
  }

  if (state.selectedMatchScrollTimeout) {
    clearTimeout(state.selectedMatchScrollTimeout);
    state.selectedMatchScrollTimeout = 0;
  }
}

function queueScrollToSelectedMatch(attempt = 0) {
  clearQueuedSelectedMatchScroll();

  state.selectedMatchScrollRaf = requestAnimationFrame(() => {
    state.selectedMatchScrollRaf = requestAnimationFrame(() => {
      const hasScrolled = scrollToSelectedMatch();
      state.selectedMatchScrollRaf = 0;

      if (!hasScrolled && attempt < 6) {
        state.selectedMatchScrollTimeout = window.setTimeout(() => {
          queueScrollToSelectedMatch(attempt + 1);
        }, 60);
      }
    });
  });
}

function scrollToDocumentHeader() {
  documentHeaderElement?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function resolveDestinationPageNumber(dest) {
  if (!dest || !state.pdfDocument) {
    return null;
  }

  let explicitDest = dest;
  if (typeof dest === "string") {
    explicitDest = await state.pdfDocument.getDestination(dest);
  }

  if (!Array.isArray(explicitDest) || explicitDest.length === 0) {
    return null;
  }

  const destinationRef = explicitDest[0];
  if (Number.isInteger(destinationRef)) {
    return destinationRef + 1;
  }

  if (destinationRef && typeof destinationRef === "object") {
    try {
      const pageIndex = await state.pdfDocument.getPageIndex(destinationRef);
      return pageIndex + 1;
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeHeading(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOrdinalWords(value) {
  return value
    .replace(/\bfirst\b/gi, "1st")
    .replace(/\bsecond\b/gi, "2nd")
    .replace(/\bthird\b/gi, "3rd")
    .replace(/\bfourth\b/gi, "4th")
    .replace(/\bfifth\b/gi, "5th")
    .replace(/\bsixth\b/gi, "6th")
    .replace(/\bseventh\b/gi, "7th")
    .replace(/\beighth\b/gi, "8th")
    .replace(/\bninth\b/gi, "9th")
    .replace(/\btenth\b/gi, "10th")
    .replace(/\beleventh\b/gi, "11th")
    .replace(/\btwelfth\b/gi, "12th")
    .replace(/\bthirteenth\b/gi, "13th")
    .replace(/\bfourteenth\b/gi, "14th")
    .replace(/\bfifteen\b/gi, "15th")
    .replace(/\bsixteenth\b/gi, "16th")
    .replace(/\bseventeenth\b/gi, "17th")
    .replace(/\beighteenth\b/gi, "18th")
    .replace(/\bnineteenth\b/gi, "19th")
    .replace(/\btwentieth\b/gi, "20th");
}

function normalizeSearchText(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isSearchWordCharacter(value = "") {
  return /[\p{L}\p{N}]/u.test(value);
}

function isSingleWordSearchQuery(value) {
  return value.length > 0 && !/\s/.test(value);
}

function countExactOccurrences(text, query, entireWord = false) {
  if (!text || !query) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (startIndex < text.length) {
    const matchIndex = text.indexOf(query, startIndex);

    if (matchIndex === -1) {
      break;
    }

    const matchEnd = matchIndex + query.length;
    const previousCharacter = text[matchIndex - 1] ?? "";
    const nextCharacter = text[matchEnd] ?? "";
    const hasWordBoundary = !entireWord
      || (!isSearchWordCharacter(previousCharacter) && !isSearchWordCharacter(nextCharacter));

    if (hasWordBoundary) {
      count += 1;
      startIndex = matchEnd;
      continue;
    }

    startIndex = matchIndex + 1;
  }

  return count;
}

function dedupeSearchLines(lines) {
  const normalizedLines = lines.map((line) => normalizeSearchText(line)).filter(Boolean);
  const uniqueConsecutiveLines = normalizedLines.filter((line, index) => line !== normalizedLines[index - 1]);
  const halfLength = uniqueConsecutiveLines.length / 2;

  if (Number.isInteger(halfLength) && halfLength > 0) {
    const firstHalf = uniqueConsecutiveLines.slice(0, halfLength);
    const secondHalf = uniqueConsecutiveLines.slice(halfLength);
    const isDuplicatedSequence = firstHalf.every((line, index) => line === secondHalf[index]);

    if (isDuplicatedSequence) {
      return firstHalf;
    }
  }

  return uniqueConsecutiveLines;
}

function extractPageLines(items) {
  const tolerance = 2;
  const lines = [];

  items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .forEach((item) => {
      const y = item.transform?.[5] ?? 0;
      const x = item.transform?.[4] ?? 0;
      const existingLine = lines.find((line) => Math.abs(line.y - y) <= tolerance);

      if (existingLine) {
        existingLine.items.push({ x, text: item.str.trim() });
        existingLine.y = (existingLine.y + y) / 2;
        return;
      }

      lines.push({
        y,
        items: [{ x, text: item.str.trim() }],
      });
    });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function getPageHeader(pageNumber, fallbackTitle = "") {
  if (!pageNumber || !state.pdfDocument) {
    return null;
  }

  if (state.pageHeaderCache.has(pageNumber)) {
    return state.pageHeaderCache.get(pageNumber);
  }

  const page = await state.pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const lines = extractPageLines(textContent.items).slice(0, 6);
  const normalizedFallback = normalizeHeading(fallbackTitle);
  let primaryLine = null;
  let secondaryLine = null;

  if (normalizedFallback) {
    const matchingIndex = lines.findIndex((line) => normalizeHeading(line) === normalizedFallback);
    if (matchingIndex !== -1) {
      primaryLine = lines[matchingIndex];
      secondaryLine = lines.slice(matchingIndex + 1).find(Boolean) ?? null;
    }
  }

  if (!primaryLine && lines.length > 0) {
    primaryLine = lines[0];
    secondaryLine = lines.slice(1).find(Boolean) ?? null;
  }

  const header = primaryLine && secondaryLine ? `${primaryLine} - ${secondaryLine}` : primaryLine || fallbackTitle || null;
  const normalizedHeader = header ? normalizeOrdinalWords(header) : header;
  state.pageHeaderCache.set(pageNumber, normalizedHeader);
  return normalizedHeader;
}

async function getPageSearchText(pageNumber) {
  if (!pageNumber || !state.pdfDocument) {
    return "";
  }

  if (state.pageTextCache.has(pageNumber)) {
    return state.pageTextCache.get(pageNumber);
  }

  const page = await state.pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const pageText = dedupeSearchLines(extractPageLines(textContent.items)).join(" ");

  state.pageTextCache.set(pageNumber, pageText);
  return pageText;
}

async function updateExactSearchCount(query) {
  const normalizedQuery = getNormalizedSearchQuery(query);
  const token = state.exactSearch.token + 1;

  state.exactSearch = {
    query: normalizedQuery,
    total: 0,
    ready: false,
    token,
  };

  updateSearchStatus();

  if (!normalizedQuery || !state.pdfDocument) {
    state.exactSearch = {
      query: normalizedQuery,
      total: 0,
      ready: true,
      token,
    };
    updateSearchStatus();
    return;
  }

  const entireWord = isSingleWordSearchQuery(normalizedQuery);
  let total = 0;

  for (let pageNumber = 1; pageNumber <= state.pdfDocument.numPages; pageNumber += 1) {
    const pageText = await getPageSearchText(pageNumber);

    if (state.exactSearch.token !== token) {
      return;
    }

    total += countExactOccurrences(pageText, normalizedQuery, entireWord);
  }

  if (total > 0) {
    total = Math.ceil(total / 2);
  }

  if (state.exactSearch.token !== token) {
    return;
  }

  state.exactSearch = {
    query: normalizedQuery,
    total,
    ready: true,
    token,
  };

  updateSearchStatus(getViewerMatchesCount(), state.findController?.state ?? null);
}

function syncSearchQueryFromInput() {
  const nextQuery = searchInputElement.value.trim();

  setSearchActiveState(Boolean(nextQuery));

  if (nextQuery) {
    state.searchQuery = nextQuery;
  }

  return state.searchQuery;
}

function ensureExactSearchCount() {
  if (state.searchQuery && state.exactSearch.query !== getNormalizedSearchQuery()) {
    void updateExactSearchCount(state.searchQuery);
  }
}

function changePage(changeHandler) {
  if (!state.pdfViewer) {
    return;
  }

  changeHandler(state.pdfViewer);
}

function handleSearchNavigation(findPrevious = false) {
  syncSearchQueryFromInput();
  ensureExactSearchCount();
  const previousRawMatches = getRawViewerMatchesCount();
  const previousLogicalCurrent = getLogicalMatchIndex(previousRawMatches.current);

  dispatchFindCommand("again", findPrevious);

  requestAnimationFrame(() => {
    const nextRawMatches = getRawViewerMatchesCount();
    const nextLogicalCurrent = getLogicalMatchIndex(nextRawMatches.current);
    const nextLogicalTotal = state.exactSearch.ready && state.exactSearch.query === getNormalizedSearchQuery()
      ? state.exactSearch.total
      : getLogicalMatchIndex(nextRawMatches.total);

    const isStuckOnDuplicatedMatch = nextLogicalTotal > 0
      && nextLogicalCurrent === previousLogicalCurrent
      && nextRawMatches.current !== previousRawMatches.current;

    if (isStuckOnDuplicatedMatch) {
      dispatchFindCommand("again", findPrevious);
    }
  });
}

function getRawViewerMatchesCount() {
  const fallback = { current: 0, total: 0 };

  if (!state.findController) {
    return fallback;
  }

  const selected = state.findController.selected;
  const pageMatches = state.findController.pageMatches ?? [];
  const total = pageMatches.reduce((sum, matches) => sum + (matches?.length ?? 0), 0);

  if (!selected || selected.pageIdx < 0 || selected.matchIdx < 0) {
    return { current: 0, total };
  }

  let current = 0;
  for (let pageIndex = 0; pageIndex < selected.pageIdx; pageIndex += 1) {
    current += pageMatches[pageIndex]?.length ?? 0;
  }
  current += selected.matchIdx + 1;

  return { current, total };
}

function getViewerMatchesCount() {
  const rawMatches = getRawViewerMatchesCount();

  return {
    current: getLogicalMatchIndex(rawMatches.current),
    total: getLogicalMatchIndex(rawMatches.total),
  };
}

async function flattenOutlineItems(items, depth = 0, result = []) {
  for (const item of items) {
    const title = item.title?.trim();

    if (title) {
      const pageNumber = await resolveDestinationPageNumber(item.dest);
      const titleGroup = getOutlineTitleGroup(title);
      const fallbackTitle = normalizeOrdinalWords(titleGroup?.label ?? title);
      const pageHeader = pageNumber ? await getPageHeader(pageNumber, fallbackTitle) : null;

      result.push({
        title: normalizeOrdinalWords(title),
        displayTitle: pageHeader || fallbackTitle,
        dest: item.dest,
        depth,
        pageNumber,
      });
    }

    if (Array.isArray(item.items) && item.items.length > 0) {
      await flattenOutlineItems(item.items, depth + 1, result);
    }
  }

  return result;
}

function createOutlineItemElement(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "document-outline-item";
  button.textContent = item.pageNumber ? `${item.title} · p. ${item.pageNumber}` : item.title;
  button.style.setProperty("--outline-depth", item.depth);

  if (item.dest) {
    button.addEventListener("click", () => {
      void state.linkService.goToDestination(item.dest);
      scrollToDocumentHeader();
    });
  } else {
    button.disabled = true;
  }

  return button;
}

function getOutlineGroupLabel(groupKey) {
  if (groupKey === "autres") {
    return "Autres sections";
  }

  return groupKey;
}

function splitSummaryTitleParts(summaryLabel) {
  const match = summaryLabel.match(/^(.+?)\s*-\s*(.+)$/);

  if (!match) {
    return {
      amendment: summaryLabel,
      title: "",
    };
  }

  return {
    amendment: match[1].trim(),
    title: match[2].trim(),
  };
}

function getOutlineTitleGroup(title) {
  const normalizedTitle = title.trim();
  const match = normalizedTitle.match(/^(\d+)(st|nd|rd|th)\b(?:\s+(Amd))?/i);

  if (!match) {
    return null;
  }

  const [, number, suffix, amendment] = match;
  return {
    label: amendment ? `${number}${suffix} Amd` : `${number}${suffix}`,
    order: Number(number),
  };
}

function groupOutlineItems(items) {
  const groups = new Map();

  items.forEach((item) => {
    let groupKey = "autres";
    let groupOrder = Number.POSITIVE_INFINITY;

    const titleGroup = getOutlineTitleGroup(item.title);
    if (titleGroup) {
      groupKey = titleGroup.label;
      groupOrder = titleGroup.order;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        order: groupOrder,
        summaryTitle: item.displayTitle || item.title,
        items: [],
      });
    }

    groups.get(groupKey).items.push(item);
  });

  return groups;
}

async function renderOutline(items) {
  outlineContainerElement.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const emptyState = document.createElement("span");
    emptyState.className = "document-outline-empty";
    emptyState.textContent = "Aucun amendement disponible";
    outlineContainerElement.appendChild(emptyState);
    return;
  }

  const flatItems = await flattenOutlineItems(items);
  const groupedItems = groupOutlineItems(flatItems);

  if (flatItems.length === 0) {
    const emptyState = document.createElement("span");
    emptyState.className = "document-outline-empty";
    emptyState.textContent = "Aucun amendement disponible";
    outlineContainerElement.appendChild(emptyState);
    return;
  }

  const orderedGroups = [...groupedItems.entries()].sort(([groupA, dataA], [groupB, dataB]) => {
    if (groupA === "autres") {
      return 1;
    }
    if (groupB === "autres") {
      return -1;
    }
    return dataA.order - dataB.order;
  });

  const seenSummaryTitles = new Set();

  for (const [, [groupKey, groupData]] of orderedGroups.entries()) {
    const summaryLabel = groupData.summaryTitle || getOutlineGroupLabel(groupKey);
    const normalizedSummaryLabel = normalizeHeading(summaryLabel);

    if (seenSummaryTitles.has(normalizedSummaryLabel)) {
      continue;
    }
    seenSummaryTitles.add(normalizedSummaryLabel);

    const details = document.createElement("details");
    details.className = "document-outline-group";

    const summary = document.createElement("summary");
    summary.className = "document-outline-group-summary";
    const summaryParts = splitSummaryTitleParts(summaryLabel);
    const amendmentSpan = document.createElement("span");
    amendmentSpan.className = "document-outline-summary-amendment";
    amendmentSpan.textContent = summaryParts.amendment;
    summary.appendChild(amendmentSpan);

    if (summaryParts.title) {
      const separatorSpan = document.createElement("span");
      separatorSpan.className = "document-outline-summary-separator";
      separatorSpan.textContent = " - ";
      summary.appendChild(separatorSpan);

      const titleSpan = document.createElement("span");
      titleSpan.className = "document-outline-summary-title";
      titleSpan.textContent = summaryParts.title;
      summary.appendChild(titleSpan);
    }

    const countSpan = document.createElement("span");
    countSpan.className = "document-outline-summary-count";
    countSpan.textContent = ` (${groupData.items.length})`;
    summary.appendChild(countSpan);
    details.appendChild(summary);

    const groupList = document.createElement("div");
    groupList.className = "document-outline-group-list";
    groupData.items.forEach((item) => {
      groupList.appendChild(createOutlineItemElement(item));
    });

    details.appendChild(groupList);
    outlineContainerElement.appendChild(details);
  }
}

function bindEvents() {
  state.eventBus.on("pagesinit", () => {
    applyResponsiveScale();
    updatePageStatus(state.pdfViewer.currentPageNumber);
  });

  state.eventBus.on("pagechanging", (event) => {
    updatePageStatus(event.pageNumber);
  });

  state.eventBus.on("pagerendered", () => {
    queueSyncFrameHeight();
  });

  state.eventBus.on("scalechanging", () => {
    queueSyncFrameHeight();
  });

  state.eventBus.on("updatefindmatchescount", () => {
    updateSearchStatus(getViewerMatchesCount());
  });

  state.eventBus.on("updatefindcontrolstate", (event) => {
    updateSearchStatus(getViewerMatchesCount(), event.state);
    if (event.state !== FindState.NOT_FOUND) {
      queueScrollToSelectedMatch();
    }
  });

  previousPageButton.addEventListener("click", () => {
    changePage((pdfViewer) => pdfViewer.previousPage());
  });

  nextPageButton.addEventListener("click", () => {
    changePage((pdfViewer) => pdfViewer.nextPage());
  });

  window.addEventListener("resize", handleWindowResize);
  window.addEventListener("resize", queueToolbarPinUpdate);
  window.addEventListener("scroll", queueToolbarPinUpdate, { passive: true });

  searchSubmitButton.addEventListener("click", () => {
    state.searchQuery = searchInputElement.value.trim();

    if (!state.searchQuery) {
      state.eventBus.dispatch("findbarclose", { source: window });
      resetExactSearchState();
      setSearchActiveState(false);
      updateSearchStatus();
      return;
    }

    setSearchActiveState(true);
    if (amendmentsGroupElement?.open) {
      amendmentsGroupElement.open = false;
    }
    void updateExactSearchCount(state.searchQuery);
    dispatchFindCommand("");
  });

  previousSearchButton.addEventListener("click", () => {
    handleSearchNavigation(true);
  });

  nextSearchButton.addEventListener("click", () => {
    handleSearchNavigation();
  });

  searchInputElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchSubmitButton.click();
    }
  });
}

async function initDocumentViewer() {
  try {
    state.eventBus = new EventBus();
    state.linkService = new PDFLinkService({ eventBus: state.eventBus });
    state.findController = new PDFFindController({
      linkService: state.linkService,
      eventBus: state.eventBus,
    });
    state.pdfViewer = new PDFSinglePageViewer({
      container: viewerContainerElement,
      viewer: viewerElement,
      eventBus: state.eventBus,
      linkService: state.linkService,
      findController: state.findController,
      textLayerMode: 1,
      useOnlyCssZoom: true,
      removePageBorders: true,
    });

    state.linkService.setViewer(state.pdfViewer);
    bindEvents();

    const loadingTask = pdfjsLib.getDocument(PDF_URL);
    state.pdfDocument = await loadingTask.promise;
    const outline = await state.pdfDocument.getOutline();

    state.pdfViewer.setDocument(state.pdfDocument);
    state.linkService.setDocument(state.pdfDocument, null);
    state.findController.setDocument(state.pdfDocument);
    await renderOutline(outline);
    updatePageStatus(1);
    updateSearchStatus();
  } catch (error) {
    console.error(error);
    searchStatusElement.textContent = "Lecteur indisponible";
  }
}

void initDocumentViewer();
