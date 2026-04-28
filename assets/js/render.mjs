import {
  formatNavTime,
  getTypeLabel,
  toSingleLineText
} from "./entries.mjs";

export function collectDetailsNodes(node, detailsNodes = []) {
  if (!node || !node.children || node.children.length === 0) {
    return detailsNodes;
  }

  for (const child of node.children) {
    if (!child) {
      continue;
    }

    if (child.tagName === "DETAILS") {
      detailsNodes.push(child);
    }

    collectDetailsNodes(child, detailsNodes);
  }

  return detailsNodes;
}

export function createRenderer(options) {
  const {
    document,
    navigator,
    showCopyToast,
    createAnchorId,
    navListEl,
    syncVisibleNavItemBorders,
    onCardHover,
    onCardLeave,
    onNavItemClick
  } = options;

  function fallbackCopyText(text) {
    const hasDomApi = typeof document !== "undefined"
      && typeof document.createElement === "function"
      && document.body
      && typeof document.body.appendChild === "function"
      && typeof document.body.removeChild === "function"
      && typeof document.execCommand === "function";
    if (!hasDomApi) {
      return false;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-2000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    if (typeof textarea.select === "function") {
      textarea.select();
    }

    let copied = false;
    try {
      copied = Boolean(document.execCommand("copy"));
    } catch (_error) {
      copied = false;
    }

    document.body.removeChild(textarea);
    return copied;
  }

  async function copyTextToClipboard(text) {
    const safeText = String(text || "");
    const clipboard = navigator && navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      try {
        await clipboard.writeText(safeText);
        return true;
      } catch (_error) {
        return fallbackCopyText(safeText);
      }
    }

    return fallbackCopyText(safeText);
  }

  function createCopyButton(copyText, copyLabel = "Copy", extraClassName = "") {
    const copyAriaLabel = String(copyLabel || "Copy");
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = `panel-copy-btn ${extraClassName}`.trim();

    const copyIcon = document.createElement("span");
    copyIcon.className = "panel-copy-icon";
    copyIcon.textContent = "content_copy";
    copyIcon.setAttribute("aria-hidden", "true");
    copyButton.appendChild(copyIcon);

    copyButton.title = copyAriaLabel;
    copyButton.setAttribute("aria-label", copyAriaLabel);
    copyButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const copied = await copyTextToClipboard(copyText);
      if (copied) {
        showCopyToast("Copied");
        return;
      }
      showCopyToast("Copy failed");
    });

    return copyButton;
  }

  function hasTextParts(entry) {
    return (entry.parts || []).some((part) => part && part.kind === "text");
  }

  function collectTextRenderBlocks(node, textRenderBlocks = []) {
    if (!node || !node.children || node.children.length === 0) {
      return textRenderBlocks;
    }

    for (const child of node.children) {
      if (!child) {
        continue;
      }
      if (child.classList && child.classList.contains("txt-block")) {
        textRenderBlocks.push(child);
        continue;
      }
      collectTextRenderBlocks(child, textRenderBlocks);
    }

    return textRenderBlocks;
  }

  function createMarkdownToggleButton(card) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-copy-btn meta-markdown-btn";
    button.title = "Render markdown";
    button.setAttribute("aria-label", "Render markdown");
    button.setAttribute("aria-pressed", "false");

    const icon = document.createElement("span");
    icon.className = "panel-copy-icon";
    icon.textContent = "markdown";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextMarkdownState = button.getAttribute("aria-pressed") !== "true";
      setCardMarkdownState(card, nextMarkdownState);
      button.setAttribute("aria-pressed", String(nextMarkdownState));
      button.title = nextMarkdownState ? "Render plain text" : "Render markdown";
      button.setAttribute("aria-label", nextMarkdownState ? "Render plain text" : "Render markdown");
      if (nextMarkdownState) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    return button;
  }

  function createPanel(label, code, panelOptions = {}) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const summaryLabel = toSingleLineText(label || "");
    summary.textContent = summaryLabel;
    const summaryPreviewText = toSingleLineText(panelOptions.summaryPreviewText || "");
    if (summaryPreviewText) {
      const preview = document.createElement("span");
      preview.className = "summary-preview";
      if (panelOptions.summaryPreviewVariant === "error") {
        preview.classList.add("summary-preview-error");
      }
      preview.textContent = summaryLabel ? ` ${summaryPreviewText}` : summaryPreviewText;
      summary.appendChild(preview);
    }
    if (Object.prototype.hasOwnProperty.call(panelOptions, "copyText")) {
      summary.classList.add("summary-with-copy");
      const copyButton = createCopyButton(panelOptions.copyText, panelOptions.copyLabel || "Copy");
      summary.appendChild(copyButton);
    }

    const pre = document.createElement("pre");
    pre.textContent = code;

    details.appendChild(summary);
    details.appendChild(pre);

    return details;
  }

  function createMetaRow(entry, card = null) {
    const meta = document.createElement("div");
    meta.className = "m";

    const badge = document.createElement("span");
    badge.className = "b";
    badge.textContent = entry.type || "";

    meta.appendChild(badge);

    if (entry.tool_duration_badge) {
      const toolDurationBadge = document.createElement("span");
      toolDurationBadge.className = "b tool-duration-badge";
      toolDurationBadge.textContent = entry.tool_duration_badge;
      meta.appendChild(toolDurationBadge);
    }

    const time = document.createElement("span");
    time.className = "t";
    time.textContent = entry.time || "";

    meta.appendChild(time);

    if (card && hasTextParts(entry)) {
      meta.appendChild(createMarkdownToggleButton(card));
    }

    if (entry.copy_in_meta && entry.copy_text && !entry.error) {
      const copyLabel = entry.type === "system" ? "Copy system message" : "Copy message";
      meta.appendChild(createCopyButton(entry.copy_text, copyLabel, "meta-copy-btn"));
    }

    if (entry.error) {
      const errorBadge = document.createElement("span");
      errorBadge.className = "err";
      errorBadge.textContent = "error";
      meta.appendChild(errorBadge);
    }

    return meta;
  }

  function createPlainTextBlock(text) {
    const plain = document.createElement("div");
    plain.className = "txt txt-plain";
    plain.textContent = text;
    return plain;
  }

  function createMarkdownBlock(markdownText) {
    const markdown = document.createElement("zero-md");
    markdown.className = "txt";

    const template = document.createElement("template");
    template.setAttribute("data-merge", "append");
    template.innerHTML = [
      "<style>",
      ".markdown-body{font-size:13px;color:var(--markdown-text);background:transparent}",
      ".markdown-body,.markdown-body p,.markdown-body li,.markdown-body ul,.markdown-body ol{color:var(--markdown-text)}",
      ".markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{color:var(--markdown-heading);border-bottom-color:var(--markdown-rule)}",
      ".markdown-body a{color:var(--markdown-link)}",
      ".markdown-body blockquote{color:var(--markdown-quote);border-left-color:var(--markdown-rule)}",
      ".markdown-body hr{background:var(--markdown-rule)}",
      ".markdown-body code{background:var(--markdown-inline-code-bg);color:var(--markdown-inline-code-text)}",
      ".markdown-body pre{background:var(--markdown-code-bg);color:var(--markdown-code-text);border:1px solid var(--markdown-code-border)}",
      ".markdown-body pre code{background:transparent;color:inherit;text-shadow:none}",
      ".markdown-body pre code span{background:transparent;color:inherit !important;text-shadow:none}",
      ".markdown-body table th,.markdown-body table td{border-color:var(--markdown-table-border)}",
      ".markdown-body table tr{background:transparent}",
      ".markdown-body table tr:nth-child(2n){background:var(--markdown-table-row-alt)}",
      "</style>"
    ].join("");

    const script = document.createElement("script");
    script.type = "text/markdown";
    script.textContent = markdownText;

    markdown.appendChild(template);
    markdown.appendChild(script);

    return markdown;
  }

  function setTextBlockMarkdownState(textBlock, isMarkdownEnabled) {
    if (!textBlock) {
      return;
    }

    const plainText = String(textBlock._plainText || "");
    const markdownText = String(textBlock._markdownText || plainText);
    textBlock.textContent = "";
    textBlock.className = isMarkdownEnabled
      ? "txt-block markdown-enabled"
      : "txt-block";
    textBlock.appendChild(isMarkdownEnabled
      ? createMarkdownBlock(markdownText)
      : createPlainTextBlock(plainText));
  }

  function setCardMarkdownState(card, isMarkdownEnabled) {
    const textBlocks = collectTextRenderBlocks(card, []);
    for (const textBlock of textBlocks) {
      setTextBlockMarkdownState(textBlock, isMarkdownEnabled);
    }
  }

  function createTextRenderBlock(part) {
    const block = document.createElement("div");
    block.className = "txt-block";
    block._plainText = String(
      Object.prototype.hasOwnProperty.call(part, "raw_text")
        ? part.raw_text
        : part.text || ""
    );
    block._markdownText = String(part.text || block._plainText);
    setTextBlockMarkdownState(block, false);
    return block;
  }

  function createResultStatsBlock(statsItem) {
    const stats = document.createElement("div");
    stats.className = "stats";

    const duration = document.createElement("span");
    duration.textContent = `Duration: ${statsItem.duration}`;

    const turns = document.createElement("span");
    turns.textContent = `Turns: ${statsItem.turns}`;

    const cost = document.createElement("span");
    cost.textContent = `Total cost: ${statsItem.cost}$`;

    stats.appendChild(duration);
    stats.appendChild(turns);
    stats.appendChild(cost);

    return stats;
  }

  function createTodoList(todoItems) {
    const list = document.createElement("div");
    list.className = "todo-list";

    for (const todo of todoItems) {
      const item = document.createElement("div");
      item.className = `todo-item ${todo.status || "pending"}`;
      if (todo.status === "in_progress") {
        item.classList.add("active");
      }
      if (todo.status === "completed") {
        item.classList.add("completed");
      }

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "todo-item-checkbox";
      checkbox.disabled = true;
      checkbox.checked = todo.status === "completed";
      checkbox.tabIndex = -1;

      const text = document.createElement("span");
      text.className = "todo-item-text";
      text.textContent = String(todo.content || "");

      item.appendChild(checkbox);
      item.appendChild(text);
      list.appendChild(item);
    }

    return list;
  }

  function appendToolEntry(card, entry) {
    if (entry.tool_variant === "todowrite" && Array.isArray(entry.todos) && entry.todos.length > 0) {
      card.appendChild(createTodoList(entry.todos));
      return;
    }

    const requestPanel = createPanel(
      entry.request_summary_label || entry.tool_name || "tool",
      entry.request_json || "{}",
      {
        summaryPreviewText: entry.request_summary_preview || "",
        copyText: entry.request_json || "{}",
        copyLabel: "Copy request"
      }
    );

    card.appendChild(requestPanel);

    if (entry.result_missing) {
      return;
    }

    const resultPanel = createPanel(
      entry.result_summary_label || "",
      entry.result_json || "",
      {
        summaryPreviewText: entry.result_summary_preview || "",
        summaryPreviewVariant: entry.result_summary_variant || "default",
        copyText: entry.result_json || "",
        copyLabel: "Copy result"
      }
    );

    card.appendChild(resultPanel);
  }

  function appendRegularEntryParts(card, entry) {
    for (const part of entry.parts || []) {
      if (part.kind === "text") {
        card.appendChild(createTextRenderBlock(part));
        continue;
      }

      if (part.kind === "result_stats") {
        card.appendChild(createResultStatsBlock(part));
        continue;
      }

      if (part.kind === "tool") {
        card.appendChild(createPanel(`tool ${part.name || ""}`, part.json || ""));
        continue;
      }

      if (part.kind === "result") {
        card.appendChild(createPanel(`result ${part.name || ""}`, part.json || ""));
        continue;
      }

      if (part.kind === "raw" && entry.type === "system") {
        card.appendChild(createPanel(part.label || "raw", part.json || "", {
          copyText: part.json || "",
          copyLabel: "Copy system message"
        }));
        continue;
      }

      card.appendChild(createPanel(part.label || "raw", part.json || ""));
    }
  }

  function openToolInputPanel(targetCard) {
    if (!targetCard || !targetCard.classList || !targetCard.classList.contains("tool")) {
      return;
    }

    const children = targetCard.children || [];
    for (const child of children) {
      if (!child || child.tagName !== "DETAILS") {
        continue;
      }

      child.open = true;
      return;
    }
  }

  function resolveNavLabelParts(entry, labelText) {
    if (!labelText) {
      return [{ text: "", bold: false }];
    }

    if (entry.type === "tool" && entry.nav_label_variant === "bash-success") {
      return [{ text: labelText, bold: false }];
    }

    if (entry.type === "system") {
      return [{ text: labelText, bold: true }];
    }

    if (entry.type === "tool" && (entry.tool_name || "") === "Skill") {
      return [{ text: labelText, bold: true }];
    }

    if (entry.type === "tool") {
      if (!entry.error && !labelText.includes(":")) {
        return [{ text: labelText, bold: true }];
      }

      const colonIndex = labelText.indexOf(":");
      if (colonIndex > 0) {
        return [
          { text: labelText.slice(0, colonIndex + 1), bold: true },
          { text: labelText.slice(colonIndex + 1), bold: false }
        ];
      }
    }

    return [{ text: labelText, bold: false }];
  }

  function renderNavLabel(textNode, entry, labelText) {
    const labelParts = resolveNavLabelParts(entry, labelText);
    const hasStrongPart = labelParts.some((labelPart) => labelPart.bold);
    if (!hasStrongPart) {
      textNode.textContent = labelText;
      textNode._textContent = labelText;
      return;
    }

    textNode.textContent = "";
    for (const labelPart of labelParts) {
      if (!labelPart.text) {
        continue;
      }

      const partNode = document.createElement(labelPart.bold ? "strong" : "span");
      if (labelPart.bold) {
        partNode.className = "nav-text-strong";
      }
      partNode.textContent = labelPart.text;
      textNode.appendChild(partNode);
    }

    if (textNode.childElementCount === 0) {
      textNode.textContent = labelText;
    }
    textNode._textContent = labelText;
  }

  function createNavItem(entry, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-item ${entry.cls || ""}`;
    if (button.dataset) {
      button.dataset.targetCardId = String(options.targetCardId || "");
      if (options.entryIndex !== undefined) {
        button.dataset.entryIndex = String(options.entryIndex);
      }
    }
    if (entry.error) {
      button.classList.add("error");
      button.style.setProperty("--c", "var(--entry-error)");
    }

    const navTime = document.createElement("span");
    navTime.className = "nav-time";
    const normalizedNavTime = formatNavTime(entry.time || "");
    navTime.textContent = /^\d{2}:\d{2}$/.test(normalizedNavTime)
      ? `${normalizedNavTime}:00`
      : normalizedNavTime;

    const dot = document.createElement("span");
    dot.className = "nav-dot";

    const text = document.createElement("span");
    text.className = "nav-text";
    if (entry.nav_label_variant === "bash-success") {
      text.classList.add("nav-text-terminal");
    }
    const navLabel = String(entry.nav_label || getTypeLabel(entry.type));
    renderNavLabel(text, entry, navLabel);

    button.appendChild(navTime);
    button.appendChild(dot);
    button.appendChild(text);
    button.addEventListener("click", () => {
      if (typeof options.onClick === "function") {
        options.onClick();
      }
    });

    return button;
  }

  function applyDetailsOpenState(card, nextOpenState) {
    if (typeof nextOpenState !== "boolean") {
      return;
    }

    const detailsNodes = collectDetailsNodes(card, []);
    for (const detailsNode of detailsNodes) {
      detailsNode.open = nextOpenState;
    }
  }

  function appendEntryCardBody(card, entry) {
    card.appendChild(createMetaRow(entry, card));

    if (entry.type === "tool") {
      appendToolEntry(card, entry);
      return;
    }

    appendRegularEntryParts(card, entry);
  }

  function createEntryCard(entry, cardOptions = {}) {
    const card = document.createElement("div");
    card.className = `e ${entry.cls || ""}`;
    card.id = cardOptions.anchorId || entry.anchor_id || createAnchorId();

    if (entry.error) {
      card.style.setProperty("--c", "var(--entry-error)");
    }

    if (cardOptions.entryIndex !== undefined && card.dataset) {
      card.dataset.entryIndex = String(cardOptions.entryIndex);
    }

    card.addEventListener("mouseenter", () => {
      onCardHover(card);
    });
    card.addEventListener("mouseleave", () => {
      onCardLeave();
    });

    appendEntryCardBody(card, entry);
    applyDetailsOpenState(card, cardOptions.detailsOpenState);
    return card;
  }

  function renderEntries(entries, mountNode) {
    const feed = document.createElement("div");
    feed.className = "feed";

    for (const entry of entries) {
      const card = createEntryCard(entry);
      feed.appendChild(card);
      navListEl.appendChild(createNavItem(entry, {
        targetCardId: card.id,
        onClick: () => onNavItemClick(card)
      }));
    }

    mountNode.appendChild(feed);
    syncVisibleNavItemBorders();
  }

  return {
    createPanel,
    openToolInputPanel,
    renderEntries
  };
}
