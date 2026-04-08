import * as pdfjsLib from "./vendor/pdfjs/package/build/pdf.mjs?v=20260406-1";
import {
  EventBus,
  FindState,
  PDFFindController,
  PDFLinkService,
  PDFSinglePageViewer,
} from "./vendor/pdfjs/package/web/pdf_viewer.mjs?v=20260406-1";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/package/build/pdf.worker.mjs?v=20260406-1";

const PDF_URL = "docs/les-lois-avril-2026.pdf";
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
const pageCountBadgeElement = document.querySelector(".document-viewer-badge");
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
  searchNavigationCheckTimeout: 0,
  toolbarPinRaf: 0,
  pageHeaderCache: new Map(),
  pageTextCache: new Map(),
  pageLineCache: new Map(),
  articleSearchHits: new Map(),
  preferredZoomValue: "auto-fit",
  exactSearch: {
    query: "",
    total: 0,
    ready: true,
    token: 0,
  },
  pendingSearchNavigation: null,
};

const FIXED_AMENDMENT_PAGES = [
  { label: "1st Amd", pageNumber: 1 },
  { label: "2nd Amd", pageNumber: 3 },
  { label: "3rd Amd", pageNumber: 5 },
  { label: "4th Amd", pageNumber: 7 },
  { label: "5th Amd", pageNumber: 10 },
  { label: "6th Amd", pageNumber: 12 },
  { label: "7th Amd", pageNumber: 15 },
  { label: "8th Amd", pageNumber: 18 },
  { label: "9th Amd", pageNumber: 21 },
  { label: "10th Amd", pageNumber: 23 },
  { label: "11th Amd", pageNumber: 25 },
  { label: "12th Amd", pageNumber: 27 },
  { label: "13th Amd", pageNumber: 29 },
  { label: "14th Amd", pageNumber: 31 },
  { label: "15th Amd", pageNumber: 33 },
];

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

function updatePageCountBadge() {
  if (!pageCountBadgeElement || !state.pdfDocument) {
    return;
  }

  pageCountBadgeElement.textContent = `${state.pdfDocument.numPages} pages`;
}

function updateSearchStatus(matchesCount = { current: 0, total: 0 }, findState = null) {
  const normalizedQuery = getNormalizedSearchQuery();

  if (!normalizedQuery) {
    searchStatusElement.textContent = "Aucune recherche";
    return;
  }
  const total = matchesCount.total ?? 0;

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
  unpinToolbar();
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

  selectedHighlight.scrollIntoView({
    behavior: "auto",
    block: "nearest",
    inline: "nearest",
  });

  const highlightRect = selectedHighlight.getBoundingClientRect();
  const toolbarOffset = toolbarElement?.classList.contains("is-fixed")
    ? (toolbarElement.getBoundingClientRect().height + 24)
    : 32;
  const viewportTopLimit = toolbarOffset + 2;
  let delta = 0;

  if (highlightRect.top < viewportTopLimit) {
    delta = highlightRect.top - viewportTopLimit;
  }

  if (Math.abs(delta) > 1) {
    window.scrollBy({
      behavior: "auto",
      top: delta,
    });
  }

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
  if (attempt === 0) {
    clearQueuedSelectedMatchScroll();
  }

  state.selectedMatchScrollRaf = requestAnimationFrame(() => {
    state.selectedMatchScrollRaf = requestAnimationFrame(() => {
      scrollToSelectedMatch();
      state.selectedMatchScrollRaf = 0;

      if (attempt < 8) {
        state.selectedMatchScrollTimeout = window.setTimeout(() => {
          queueScrollToSelectedMatch(attempt + 1);
        }, 75);
      }
    });
  });
}

function getSelectedMatchSignature() {
  const selectedHighlight = viewerElement.querySelector(".textLayer .highlight.selected");
  if (!selectedHighlight) {
    return "";
  }

  const rect = selectedHighlight.getBoundingClientRect();
  const pageNumber = selectedHighlight.closest(".page")?.dataset.pageNumber
    ?? String(state.pdfViewer?.currentPageNumber ?? "");

  return [
    pageNumber,
    Math.round(rect.left),
    Math.round(rect.top),
    Math.round(rect.width),
    Math.round(rect.height),
    (selectedHighlight.textContent ?? "").trim().toLowerCase(),
  ].join("|");
}

function clearPendingSearchNavigation() {
  state.pendingSearchNavigation = null;

  if (state.searchNavigationCheckTimeout) {
    clearTimeout(state.searchNavigationCheckTimeout);
    state.searchNavigationCheckTimeout = 0;
  }
}

function queueValidateSearchNavigation() {
  if (!state.pendingSearchNavigation) {
    return;
  }

  if (state.searchNavigationCheckTimeout) {
    clearTimeout(state.searchNavigationCheckTimeout);
  }

  state.searchNavigationCheckTimeout = window.setTimeout(() => {
    const pendingNavigation = state.pendingSearchNavigation;
    state.searchNavigationCheckTimeout = 0;

    if (!pendingNavigation) {
      return;
    }

    const currentSignature = getSelectedMatchSignature();

    if (!currentSignature) {
      if (pendingNavigation.attempts >= 2) {
        clearPendingSearchNavigation();
      } else {
        queueValidateSearchNavigation();
      }
      return;
    }

    if (currentSignature !== pendingNavigation.baselineSignature) {
      clearPendingSearchNavigation();
      return;
    }

    if (pendingNavigation.attempts >= 2) {
      clearPendingSearchNavigation();
      return;
    }

    pendingNavigation.attempts += 1;
    dispatchFindCommand("again", pendingNavigation.findPrevious);
    queueScrollToSelectedMatch();
    queueValidateSearchNavigation();
  }, 120);
}

function preserveToolbarViewportPosition(callback) {
  if (!toolbarElement) {
    callback();
    return;
  }

  const previousTop = toolbarElement.getBoundingClientRect().top;
  callback();

  requestAnimationFrame(() => {
    const nextTop = toolbarElement.getBoundingClientRect().top;
    const delta = nextTop - previousTop;

    if (Math.abs(delta) > 1) {
      window.scrollBy({
        behavior: "auto",
        top: delta,
      });
    }

    queueToolbarPinUpdate();
  });
}

function getSiblingText(node) {
  return node?.nodeType === Node.TEXT_NODE ? node.textContent ?? "" : "";
}

function moveHighlightText(highlightElement, beforeText, matchText, afterText) {
  if (beforeText) {
    highlightElement.before(document.createTextNode(beforeText));
  }

  highlightElement.textContent = matchText;

  if (afterText) {
    highlightElement.after(document.createTextNode(afterText));
  }
}

function normalizeHighlightToQuery(highlightElement, query) {
  const content = highlightElement.textContent ?? "";

  if (!content || !query) {
    return;
  }

  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const directIndex = lowerContent.indexOf(lowerQuery);

  if (directIndex !== -1) {
    moveHighlightText(
      highlightElement,
      content.slice(0, directIndex),
      content.slice(directIndex, directIndex + query.length),
      content.slice(directIndex + query.length)
    );
    return;
  }

  const previousText = getSiblingText(highlightElement.previousSibling);
  const nextText = getSiblingText(highlightElement.nextSibling);
  const combinedContent = `${previousText}${content}${nextText}`;
  const combinedIndex = combinedContent.toLowerCase().indexOf(lowerQuery);

  if (combinedIndex === -1) {
    return;
  }

  const combinedMatchEnd = combinedIndex + query.length;
  const previousLength = previousText.length;
  const contentEnd = previousLength + content.length;
  const matchStartInHighlight = Math.max(combinedIndex - previousLength, 0);
  const matchEndInHighlight = Math.min(combinedMatchEnd - previousLength, content.length);
  const prefixInsideHighlight = content.slice(0, matchStartInHighlight);
  const matchInsideHighlight = content.slice(matchStartInHighlight, matchEndInHighlight);
  const suffixInsideHighlight = content.slice(matchEndInHighlight);
  const missingPrefix = combinedIndex < previousLength
    ? previousText.slice(combinedIndex, previousLength)
    : "";
  const missingSuffix = combinedMatchEnd > contentEnd
    ? nextText.slice(0, combinedMatchEnd - contentEnd)
    : "";

  if (missingPrefix && highlightElement.previousSibling?.nodeType === Node.TEXT_NODE) {
    highlightElement.previousSibling.textContent = previousText.slice(0, combinedIndex);
  }

  if (missingSuffix && highlightElement.nextSibling?.nodeType === Node.TEXT_NODE) {
    highlightElement.nextSibling.textContent = nextText.slice(combinedMatchEnd - contentEnd);
  }

  moveHighlightText(
    highlightElement,
    prefixInsideHighlight,
    `${missingPrefix}${matchInsideHighlight}${missingSuffix}`,
    suffixInsideHighlight
  );
}

function trimHighlightWhitespace() {
  const rawQuery = (state.findController?.state?.query ?? state.searchQuery ?? "").trim();
  const singleWordQuery = rawQuery && !/\s/.test(rawQuery) ? rawQuery : "";
  const highlightElements = viewerElement.querySelectorAll(".textLayer .highlight.appended");

  highlightElements.forEach((highlightElement) => {
    if (singleWordQuery) {
      normalizeHighlightToQuery(highlightElement, singleWordQuery);
    }

    const content = highlightElement.textContent ?? "";
    if (!content) {
      return;
    }

    const leadingWhitespace = content.match(/^\s+/)?.[0] ?? "";
    const trailingWhitespace = content.match(/\s+$/)?.[0] ?? "";
    const trimmedContent = content.trim();

    if (!trimmedContent || (!leadingWhitespace && !trailingWhitespace)) {
      return;
    }

    if (leadingWhitespace) {
      highlightElement.before(document.createTextNode(leadingWhitespace));
    }

    highlightElement.textContent = trimmedContent;

    if (trailingWhitespace) {
      highlightElement.after(document.createTextNode(trailingWhitespace));
    }
  });
}

function queueTrimHighlightWhitespace() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      trimHighlightWhitespace();
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

function normalizeArticleText(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseMatchText(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function getArticleMatchKey(value) {
  const normalizedValue = normalizeArticleText(value);
  const match = normalizedValue.match(/^article\s+(\d+(?:\s+(?:bis|ter|quater|quinquies|sexies))?)/i);

  if (!match) {
    return normalizedValue;
  }

  return `article ${match[1]}`;
}

function getArticleDisplayPrefix(value) {
  const trimmedValue = value.trim();
  const articleNumberMatch = trimmedValue.match(/^article\s+\d+/i);

  if (articleNumberMatch) {
    return articleNumberMatch[0];
  }

  const firstPeriodIndex = trimmedValue.indexOf(".");
  if (firstPeriodIndex !== -1) {
    return trimmedValue.slice(0, firstPeriodIndex + 1);
  }

  return trimmedValue;
}

function isSearchWordCharacter(value = "") {
  return /[\p{L}\p{N}]/u.test(value);
}

function isSingleWordSearchQuery(value) {
  return value.length > 0 && !/\s/.test(value);
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

function extractPageLineData(items) {
  const tolerance = 2;
  const lines = [];

  items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .forEach((item) => {
      const y = item.transform?.[5] ?? 0;
      const x = item.transform?.[4] ?? 0;
      const existingLine = lines.find((line) => Math.abs(line.y - y) <= tolerance);
      const lineItem = {
        x,
        y,
        text: item.str.trim(),
        width: item.width ?? 0,
        height: item.height ?? 0,
        transform: item.transform,
      };

      if (existingLine) {
        existingLine.items.push(lineItem);
        existingLine.y = (existingLine.y + y) / 2;
        return;
      }

      lines.push({
        y,
        items: [lineItem],
      });
    });

  return lines
    .sort((lineA, lineB) => lineB.y - lineA.y)
    .map((line) => {
      const orderedItems = line.items.sort((itemA, itemB) => itemA.x - itemB.x);
      return {
        y: line.y,
        items: orderedItems,
        text: orderedItems.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
      };
    })
    .filter((line) => line.text);
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

async function getPageSearchLines(pageNumber) {
  if (!pageNumber || !state.pdfDocument) {
    return [];
  }

  if (state.pageTextCache.has(pageNumber)) {
    return state.pageTextCache.get(pageNumber);
  }

  const page = await state.pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const lines = extractPageLines(textContent.items);

  state.pageTextCache.set(pageNumber, lines);
  return lines;
}

async function getPageLineData(pageNumber) {
  if (!pageNumber || !state.pdfDocument) {
    return [];
  }

  if (state.pageLineCache.has(pageNumber)) {
    return state.pageLineCache.get(pageNumber);
  }

  const page = await state.pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const lines = extractPageLineData(textContent.items);

  state.pageLineCache.set(pageNumber, lines);
  return lines;
}

function extractArticleBlocks(lines) {
  const blocks = [];
  let currentBlock = null;

  lines.forEach((line) => {
    const lineText = typeof line === "string" ? line : line?.text ?? "";
    const trimmedLine = lineText.trim();

    if (!trimmedLine) {
      return;
    }

    if (/^article\b/i.test(trimmedLine)) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      currentBlock = {
        label: trimmedLine,
        key: getArticleMatchKey(trimmedLine),
        content: [trimmedLine],
      };
      return;
    }

    if (currentBlock) {
      currentBlock.content.push(trimmedLine);
    }
  });

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

async function updateArticleSearchHits(query) {
  const normalizedQuery = normalizeSearchText(query);
  state.articleSearchHits.clear();

  if (!normalizedQuery || !state.pdfDocument) {
    return;
  }

  for (let pageNumber = 1; pageNumber <= state.pdfDocument.numPages; pageNumber += 1) {
    const lines = await getPageLineData(pageNumber);
    const articleKeys = extractArticleBlocks(lines)
      .filter((block) => normalizeArticleText(block.content.join(" ")).includes(normalizedQuery))
      .map((block) => block.key);

    if (articleKeys.length > 0) {
      state.articleSearchHits.set(pageNumber, articleKeys);
    }
  }
}

function collectTextLayerLineGroups(textDivs) {
  const tolerance = 2;
  const groups = [];

  textDivs
    .filter((element) => element instanceof HTMLElement && (element.textContent ?? "").trim())
    .forEach((element) => {
      const top = Number.parseFloat(element.style.top || "0");
      const left = Number.parseFloat(element.style.left || "0");
      const existingGroup = groups.find((group) => Math.abs(group.top - top) <= tolerance);

      if (existingGroup) {
        existingGroup.elements.push({ left, element });
        existingGroup.top = (existingGroup.top + top) / 2;
        return;
      }

      groups.push({
        top,
        elements: [{ left, element }],
      });
    });

  return groups
    .sort((groupA, groupB) => groupA.top - groupB.top)
    .map((group) => {
      const orderedElements = group.elements.sort((elementA, elementB) => elementA.left - elementB.left);
      const rawText = orderedElements.map(({ element }) => element.textContent ?? "").join("");

      return {
        text: rawText.replace(/\s+/g, " ").trim(),
        looseText: normalizeLooseMatchText(rawText),
        elements: orderedElements.map(({ element }) => element),
      };
    });
}

function clearArticleSearchHighlight() {
  viewerElement
    .querySelectorAll(".article-search-overlay")
    .forEach((element) => element.remove());

  viewerElement
    .querySelectorAll(".textLayer .article-search-hit")
    .forEach((element) => element.classList.remove("article-search-hit"));
}

function getLineOverlayBounds(line, viewport) {
  const prefixText = getArticleDisplayPrefix(line.text);
  const targetLooseKey = normalizeLooseMatchText(prefixText);
  const selectedItems = [];
  let accumulatedLooseText = "";

  for (const item of line.items) {
    selectedItems.push(item);
    accumulatedLooseText += normalizeLooseMatchText(item.text);

    if (
      targetLooseKey
      && accumulatedLooseText.startsWith(targetLooseKey)
      && accumulatedLooseText.length >= targetLooseKey.length
    ) {
      break;
    }
  }

  const transformedItems = (selectedItems.length ? selectedItems : line.items)
    .filter((item) => Array.isArray(item.transform))
    .map((item) => {
      const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const left = transformed[4];
      const height = Math.max(item.height * viewport.scale, Math.abs(transformed[3]), 12);
      const top = transformed[5] - height;
      const width = Math.max(item.width * viewport.scale, 12);

      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
      };
    });

  const allTransformedItems = line.items
    .filter((item) => Array.isArray(item.transform))
    .map((item) => {
      const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const left = transformed[4];
      const height = Math.max(item.height * viewport.scale, Math.abs(transformed[3]), 12);
      const top = transformed[5] - height;
      const width = Math.max(item.width * viewport.scale, 12);

      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
      };
    });

  if (!transformedItems.length || !allTransformedItems.length) {
    return null;
  }

  const fullLeft = Math.min(...allTransformedItems.map((item) => item.left));
  const fullTop = Math.min(...allTransformedItems.map((item) => item.top));
  const fullRight = Math.max(...allTransformedItems.map((item) => item.right));
  const fullBottom = Math.max(...allTransformedItems.map((item) => item.bottom));
  const selectedRight = Math.max(...transformedItems.map((item) => item.right));
  const visiblePrefixLength = Math.max(prefixText.length, 1);
  const visibleLineLength = Math.max(line.text.length, visiblePrefixLength);
  const estimatedRight = fullLeft + ((fullRight - fullLeft) * (visiblePrefixLength / visibleLineLength));
  const left = fullLeft;
  const top = fullTop;
  const right = Math.min(selectedRight, estimatedRight + 4);
  const bottom = fullBottom;

  return {
    left: Math.max(left - 6, 0),
    top: Math.max(top - 2, 0),
    width: Math.max(right - left + 12, 24),
    height: Math.max(bottom - top + 4, 16),
  };
}

async function applyArticleSearchHighlight() {
  clearArticleSearchHighlight();

  if (!state.searchQuery || !state.pdfViewer) {
    return;
  }

  const currentPageNumber = state.pdfViewer.currentPageNumber || 1;
  const articleKeys = state.articleSearchHits.get(currentPageNumber);

  if (!articleKeys?.length) {
    return;
  }

  const pageView = state.pdfViewer.getPageView?.(currentPageNumber - 1)
    ?? state.pdfViewer._pages?.[currentPageNumber - 1]
    ?? null;
  const pageElement = pageView?.div ?? null;

  if (!pageElement || !pageView?.viewport) {
    return;
  }

  const lines = await getPageLineData(currentPageNumber);

  lines.forEach((line) => {
    const lineKey = getArticleMatchKey(line.text);

    if (!articleKeys.some((key) => lineKey === key)) {
      return;
    }

    const bounds = getLineOverlayBounds(line, pageView.viewport);
    if (!bounds) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "article-search-overlay";
    overlay.style.left = `${bounds.left}px`;
    overlay.style.top = `${bounds.top}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
    pageElement.appendChild(overlay);
  });
}

function syncSearchQueryFromInput() {
  const nextQuery = searchInputElement.value.trim();

  setSearchActiveState(Boolean(nextQuery));

  if (nextQuery) {
    state.searchQuery = nextQuery;
  }

  return state.searchQuery;
}

function changePage(changeHandler) {
  if (!state.pdfViewer) {
    return;
  }

  changeHandler(state.pdfViewer);
}

function handleSearchNavigation(findPrevious = false) {
  syncSearchQueryFromInput();
  state.pendingSearchNavigation = {
    findPrevious,
    baselineSignature: getSelectedMatchSignature(),
    attempts: 0,
  };
  dispatchFindCommand("again", findPrevious);
  queueScrollToSelectedMatch();
  queueValidateSearchNavigation();
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
    current: rawMatches.current,
    total: rawMatches.total,
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
  } else if (item.pageNumber) {
    button.addEventListener("click", () => {
      state.linkService.goToPage(item.pageNumber);
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

function buildFixedOutlineItems() {
  return FIXED_AMENDMENT_PAGES.map((item) => ({
    title: "Voir l'amendement",
    displayTitle: item.label,
    dest: null,
    depth: 0,
    pageNumber: item.pageNumber,
  }));
}

async function renderOutline(items) {
  if (!outlineContainerElement) {
    return;
  }

  outlineContainerElement.innerHTML = "";

  const flatItems = buildFixedOutlineItems();
  const groupedItems = groupOutlineItems(flatItems);

  if (flatItems.length === 0) {
    const emptyState = document.createElement("span");
    emptyState.className = "document-outline-empty";
    emptyState.textContent = "Aucun amendement disponible";
    outlineContainerElement.appendChild(emptyState);
    return;
  }

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
    queueToolbarPinUpdate();
  });

  state.eventBus.on("pagechanging", (event) => {
    updatePageStatus(event.pageNumber);
  });

  state.eventBus.on("pagerendered", () => {
    queueSyncFrameHeight();
    queueToolbarPinUpdate();
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
      queueTrimHighlightWhitespace();
      queueValidateSearchNavigation();
    } else {
      clearPendingSearchNavigation();
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
      clearPendingSearchNavigation();
      clearArticleSearchHighlight();
      updateSearchStatus();
      queueToolbarPinUpdate();
      return;
    }

    setSearchActiveState(true);
    queueToolbarPinUpdate();
    clearPendingSearchNavigation();
    clearArticleSearchHighlight();
    dispatchFindCommand("");
    queueTrimHighlightWhitespace();
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

  searchInputElement.addEventListener("input", () => {
    const nextQuery = searchInputElement.value.trim();

    if (nextQuery) {
      setSearchActiveState(true);
      return;
    }

    state.searchQuery = "";
    setSearchActiveState(false);
    clearPendingSearchNavigation();
    queueToolbarPinUpdate();
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

    state.pdfViewer.setDocument(state.pdfDocument);
    state.linkService.setDocument(state.pdfDocument, null);
    state.findController.setDocument(state.pdfDocument);
    await renderOutline();
    updatePageCountBadge();
    updatePageStatus(1);
    updateSearchStatus();
  } catch (error) {
    console.error(error);
    searchStatusElement.textContent = "Lecteur indisponible";
  }
}

void initDocumentViewer();
