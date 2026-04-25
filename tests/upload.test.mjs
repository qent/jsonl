import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJsonlViewerApp } from '../assets/js/app.mjs';

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    for (const name of names) {
      if (name) {
        this.values.add(name);
      }
    }
  }

  remove(...names) {
    for (const name of names) {
      this.values.delete(name);
    }
  }

  contains(name) {
    return this.values.has(name);
  }

  toString() {
    return [...this.values].join(' ');
  }
}

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.eventListeners = {};
    this.classList = new ClassList();
    this.style = {
      properties: {},
      setProperty: (name, value) => {
        this.style.properties[name] = value;
      }
    };
    this.hidden = false;
    this.value = '';
    this.id = '';
    this.scrollTop = 0;
    this.scrollIntoViewCalls = [];
    this._className = '';
    this._textContent = '';
    this._innerHTML = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const childIndex = this.children.indexOf(child);
    if (childIndex === -1) {
      return child;
    }

    this.children.splice(childIndex, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') {
      this.id = value;
    }
    if (name.startsWith('data-')) {
      const dataKey = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[dataKey] = String(value);
    }
  }

  getAttribute(name) {
    if (!Object.prototype.hasOwnProperty.call(this.attributes, name)) {
      return null;
    }

    return this.attributes[name];
  }

  addEventListener(type, handler) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }

    this.eventListeners[type].push(handler);
  }

  click() {
    const handlers = this.eventListeners.click || [];
    for (const handler of handlers) {
      handler({
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    }
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = value;
    this.classList = new ClassList();
    for (const name of String(value).split(/\s+/).filter(Boolean)) {
      this.classList.add(name);
    }
  }

  get id() {
    return this._id || '';
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument.__registerId(this._id, this);
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
  }

  get childElementCount() {
    return this.children.length;
  }

  scrollIntoView(options) {
    this.scrollIntoViewCalls.push(options);
    this.ownerDocument.__scrollEvents.push({ id: this.id, options });
  }
}

function readIndexHtml() {
  return fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
}

function readStylesCss() {
  return fs.readFileSync(path.join(process.cwd(), 'assets/css/styles.css'), 'utf8');
}

function readAppModule() {
  return fs.readFileSync(path.join(process.cwd(), 'assets/js/app.mjs'), 'utf8');
}

function createHarness() {
  const ids = new Map();
  const clipboardWrites = [];
  const localStorageValues = new Map();
  const windowEventListeners = {};

  const windowObject = {
    innerWidth: 1400,
    matchMedia() {
      return { matches: false };
    },
    addEventListener(type, handler) {
      if (!windowEventListeners[type]) {
        windowEventListeners[type] = [];
      }
      windowEventListeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      const listeners = windowEventListeners[type];
      if (!listeners) {
        return;
      }

      windowEventListeners[type] = listeners.filter((listener) => listener !== handler);
    }
  };

  const document = {
    __scrollEvents: [],
    __eventListeners: {},
    __registerId(id, element) {
      if (!id) {
        return;
      }

      ids.set(id, element);
    },
    addEventListener(type, handler) {
      if (!this.__eventListeners[type]) {
        this.__eventListeners[type] = [];
      }

      this.__eventListeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      const listeners = this.__eventListeners[type];
      if (!listeners) {
        return;
      }

      this.__eventListeners[type] = listeners.filter((listener) => listener !== handler);
    },
    __dispatchEvent(type, event = {}) {
      const listeners = this.__eventListeners[type] || [];
      for (const listener of listeners) {
        listener({
          target: document,
          currentTarget: document,
          preventDefault() {},
          stopPropagation() {},
          ...event
        });
      }
    },
    getElementById(id) {
      if (!ids.has(id)) {
        const element = new Element('div', document);
        element.id = id;
        ids.set(id, element);
      }

      return ids.get(id);
    },
    createElement(tagName) {
      return new Element(tagName, document);
    },
    execCommand() {
      return false;
    }
  };
  document.body = new Element('body', document);
  document.documentElement = new Element('html', document);

  const appApi = createJsonlViewerApp({
    document,
    window: windowObject,
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(String(text));
        }
      }
    },
    localStorage: {
      getItem(key) {
        return localStorageValues.has(key) ? localStorageValues.get(key) : null;
      },
      setItem(key, value) {
        localStorageValues.set(key, String(value));
      }
    },
    setTimeout,
    clearTimeout
  });

  assert.ok(appApi, 'app API should initialize for test harness');

  return {
    ...appApi,
    clipboardWrites,
    scrollEvents: document.__scrollEvents,
    dispatchDocumentEvent(type, event = {}) {
      document.__dispatchEvent(type, event);
    }
  };
}

function createFile(name, text) {
  return {
    name,
    size: text.length,
    async text() {
      return text;
    }
  };
}

test('clear button stays hidden until something is rendered', () => {
  const api = createHarness();

  assert.equal(api.dropzone.hidden, false);
  assert.equal(api.clearBtn.hidden, true);
  assert.equal(api.collapseAllBtn.disabled, true);
  assert.equal(api.expandAllBtn.disabled, true);
  assert.equal(api.contentGridEl.hidden, true);
  assert.equal(api.outputEl.childElementCount, 0);
  assert.equal(api.dropzone.classList.contains('idle'), true);
  assert.equal(api.navColumnEl.hidden, true);
  assert.equal(api.navFocusPipEl.hidden, true);
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.appEl.classList.contains('has-nav'), false);
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);
});

test('theme button toggles monochrome sun and moon icons on click', () => {
  const api = createHarness();

  assert.equal(api.appEl.attributes['data-theme'], 'light');
  assert.equal(api.themeToggleBtn.textContent, '☀');
  assert.equal(api.themeToggleBtn.attributes['aria-pressed'], 'false');

  api.themeToggleBtn.click();

  assert.equal(api.appEl.attributes['data-theme'], 'dark');
  assert.equal(api.themeToggleBtn.textContent, '☾');
  assert.equal(api.themeToggleBtn.attributes['aria-pressed'], 'true');

  api.themeToggleBtn.click();

  assert.equal(api.appEl.attributes['data-theme'], 'light');
  assert.equal(api.themeToggleBtn.textContent, '☀');
  assert.equal(api.themeToggleBtn.attributes['aria-pressed'], 'false');
});

test('light theme keeps markdown code blocks on a light palette and resets token shadows', () => {
  const stylesCss = readStylesCss();
  const appModule = readAppModule();
  const rootBlockMatch = stylesCss.match(/:root\s*\{([\s\S]*?)\n\s*\}\n\n\s*\.app\[data-theme="dark"\]/);
  assert.ok(rootBlockMatch, 'root theme block not found');

  const rootBlock = rootBlockMatch[1];
  const panelCodeBg = rootBlock.match(/--code-bg:\s*([^;]+);/);
  const markdownCodeBg = rootBlock.match(/--markdown-code-bg:\s*([^;]+);/);

  assert.ok(panelCodeBg, 'panel code background variable not found');
  assert.ok(markdownCodeBg, 'markdown code background variable not found');
  assert.notEqual(
    markdownCodeBg[1].trim(),
    panelCodeBg[1].trim(),
    'markdown code block background should not stay dark in the light theme'
  );

  assert.match(
    appModule,
    /\.markdown-body pre code span\{background:transparent;color:inherit !important;text-shadow:none\}/
  );
});

test('clear button appears after rendering and hides again after clear', async () => {
  const api = createHarness();
  const validJsonl = '{"type":"assistant","timestamp":"2026-04-24T12:00:00Z","message":{"content":[{"type":"text","text":"hello"}]}}';

  await api.handleFiles([createFile('sample.jsonl', validJsonl)]);

  assert.equal(api.outputEl.childElementCount, 1);
  assert.equal(api.dropzone.hidden, true);
  assert.equal(api.dropzone.classList.contains('has-content'), true);
  assert.equal(api.dropzone.classList.contains('idle'), false);
  assert.equal(api.clearBtn.hidden, false);
  assert.equal(api.collapseAllBtn.disabled, true);
  assert.equal(api.expandAllBtn.disabled, true);
  assert.equal(api.contentGridEl.hidden, false);
  assert.equal(api.navListEl.childElementCount, 1);
  assert.equal(api.navColumnEl.hidden, false);
  assert.equal(api.navFocusPipEl.hidden, false);
  assert.equal(api.navFocusPipEl.attributes['aria-pressed'], 'false');
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.appEl.classList.contains('has-nav'), true);
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);

  api.clearOutput();

  assert.equal(api.outputEl.childElementCount, 0);
  assert.equal(api.dropzone.hidden, false);
  assert.equal(api.dropzone.classList.contains('has-content'), false);
  assert.equal(api.dropzone.classList.contains('idle'), true);
  assert.equal(api.clearBtn.hidden, true);
  assert.equal(api.collapseAllBtn.disabled, true);
  assert.equal(api.expandAllBtn.disabled, true);
  assert.equal(api.contentGridEl.hidden, true);
  assert.equal(api.navListEl.childElementCount, 0);
  assert.equal(api.navColumnEl.hidden, true);
  assert.equal(api.navFocusPipEl.hidden, true);
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.appEl.classList.contains('has-nav'), false);
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);
});

test('navigation focus mode opens from pip and closes on backdrop click', async () => {
  const api = createHarness();
  const validJsonl = '{"type":"assistant","timestamp":"2026-04-24T12:00:00Z","message":{"content":[{"type":"text","text":"hello"}]}}';

  await api.handleFiles([createFile('sample.jsonl', validJsonl)]);

  assert.equal(api.navFocusPipEl.hidden, false);
  assert.equal(api.navFocusPipEl.attributes['aria-pressed'], 'false');
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);

  api.navFocusPipEl.click();

  assert.equal(api.navFocusPipEl.attributes['aria-pressed'], 'true');
  assert.equal(api.navFocusBackdropEl.hidden, false);
  assert.equal(api.appEl.classList.contains('nav-focus-active'), true);

  api.navFocusBackdropEl.click();

  assert.equal(api.navFocusPipEl.attributes['aria-pressed'], 'false');
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);
});

test('navigation focus mode closes on Escape key', async () => {
  const api = createHarness();
  const validJsonl = '{"type":"assistant","timestamp":"2026-04-24T12:00:00Z","message":{"content":[{"type":"text","text":"hello"}]}}';
  let didPreventDefault = false;

  await api.handleFiles([createFile('sample.jsonl', validJsonl)]);
  api.navFocusPipEl.click();

  assert.equal(api.appEl.classList.contains('nav-focus-active'), true);

  api.dispatchDocumentEvent('keydown', {
    key: 'Escape',
    preventDefault() {
      didPreventDefault = true;
    }
  });

  assert.equal(didPreventDefault, true);
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.navFocusPipEl.attributes['aria-pressed'], 'false');
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);
});

test('clearOutput resets navigation focus mode to default state', async () => {
  const api = createHarness();
  const validJsonl = '{"type":"assistant","timestamp":"2026-04-24T12:00:00Z","message":{"content":[{"type":"text","text":"hello"}]}}';

  await api.handleFiles([createFile('sample.jsonl', validJsonl)]);
  api.navFocusPipEl.click();

  assert.equal(api.appEl.classList.contains('nav-focus-active'), true);
  assert.equal(api.navFocusBackdropEl.hidden, false);

  api.clearOutput();

  assert.equal(api.navColumnEl.hidden, true);
  assert.equal(api.navFocusPipEl.hidden, true);
  assert.equal(api.navFocusBackdropEl.hidden, true);
  assert.equal(api.navFocusPipEl.attributes['aria-pressed'], 'false');
  assert.equal(api.appEl.classList.contains('nav-focus-active'), false);
});

test('page title, heading, and subtitle match JSONL viewer branding', () => {
  const html = readIndexHtml();
  assert.match(html, /<title>\s*JSONL Viewer for Claude Code Session History\s*<\/title>/);
  assert.match(html, /<h1 class="page-title">\s*JSONL Viewer\s*<\/h1>/);
  assert.match(html, /<p class="page-subtitle">\s*for Claude Code history\s*<\/p>/);
});

test('index page defines SEO and social metadata for GitHub Pages domain', () => {
  const html = readIndexHtml();
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<meta name="keywords" content="[^"]+">/);
  assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/jsonl\.qent\.io\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/jsonl\.qent\.io\/">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<script type="application\/ld\+json">[\s\S]*"@type": "WebApplication"[\s\S]*<\/script>/);
});

test('index page includes floating GitHub button under theme toggle', () => {
  const html = readIndexHtml();
  assert.match(html, /id="githubLinkBtn"/);
  assert.match(html, /class="github-link-btn floating-btn"/);
  assert.match(html, /href="https:\/\/github\.com\/qent\/jsonl"/);
  assert.match(html, /aria-label="Open JSONL Viewer repository on GitHub"/);
});

test('index page includes floating collapse and expand controls under GitHub button', () => {
  const html = readIndexHtml();
  assert.match(html, /id="collapseAllBtn"/);
  assert.match(html, /class="history-toggle-btn collapse-history-btn floating-btn"/);
  assert.match(html, /aria-label="Collapse all history content blocks"/);
  assert.match(html, /id="expandAllBtn"/);
  assert.match(html, /class="history-toggle-btn expand-history-btn floating-btn"/);
  assert.match(html, /aria-label="Expand all history content blocks"/);
});

test('collapse and expand controls toggle every history details panel', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:16:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-collapse-expand', name: 'Bash', input: { command: 'echo 42' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:16:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-collapse-expand', content: '42' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const toolCard = feed.children[0];
  const requestPanel = toolCard.children[1];
  const resultPanel = toolCard.children[2];

  assert.equal(api.collapseAllBtn.disabled, false);
  assert.equal(api.expandAllBtn.disabled, false);
  assert.notEqual(requestPanel.open, true);
  assert.notEqual(resultPanel.open, true);

  api.expandAllBtn.click();

  assert.equal(requestPanel.open, true);
  assert.equal(resultPanel.open, true);

  api.collapseAllBtn.click();

  assert.equal(requestPanel.open, false);
  assert.equal(resultPanel.open, false);
});

test('navigation items define hidden 4px left border and show it only for in-viewport rows', () => {
  const stylesCss = readStylesCss();
  const beforeBlockMatch = stylesCss.match(/\.nav-item::before\s*\{([\s\S]*?)\n\s*\}/);
  const inViewportBlockMatch = stylesCss.match(/\.nav-item\.in-viewport::before\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(beforeBlockMatch, 'nav item pseudo-element block not found');
  assert.ok(inViewportBlockMatch, 'nav item in-viewport pseudo-element block not found');

  const beforeBlock = beforeBlockMatch[1];
  const inViewportBlock = inViewportBlockMatch[1];

  assert.match(beforeBlock, /left:\s*calc\(-0\.8rem \+ 2px\);/);
  assert.match(beforeBlock, /width:\s*4px;/);
  assert.match(beforeBlock, /background:\s*var\(--c,\s*var\(--entry-default\)\);/);
  assert.match(beforeBlock, /opacity:\s*0;/);
  assert.match(inViewportBlock, /opacity:\s*1;/);
});

test('navigation label hover underline is thin and gray when content card is hovered', () => {
  const stylesCss = readStylesCss();
  const rootBlockMatch = stylesCss.match(/:root\s*\{([\s\S]*?)\n\s*\}\n\n\s*\.app\[data-theme="dark"\]/);
  const darkBlockMatch = stylesCss.match(/\.app\[data-theme="dark"\]\s*\{([\s\S]*?)\n\s*\}\n\n\s*\*/);
  const hoverUnderlineBlockMatch = stylesCss.match(/\.nav-item\.content-hover-match \.nav-text\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(rootBlockMatch, 'root theme block not found');
  assert.ok(darkBlockMatch, 'dark theme block not found');
  assert.ok(hoverUnderlineBlockMatch, 'navigation content hover underline block not found');

  const rootBlock = rootBlockMatch[1];
  const darkBlock = darkBlockMatch[1];
  const hoverUnderlineBlock = hoverUnderlineBlockMatch[1];

  assert.match(rootBlock, /--nav-item-hover-underline:\s*#94a3b8;/);
  assert.match(darkBlock, /--nav-item-hover-underline:\s*#9aa7bf;/);
  assert.match(hoverUnderlineBlock, /text-decoration-line:\s*underline;/);
  assert.match(hoverUnderlineBlock, /text-decoration-thickness:\s*1px;/);
  assert.match(hoverUnderlineBlock, /text-decoration-color:\s*var\(--nav-item-hover-underline\);/);
});

test('successful Bash nav label keeps terminal font style without chip background', () => {
  const stylesCss = readStylesCss();
  const terminalBlockMatch = stylesCss.match(/\.nav-text-terminal\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(terminalBlockMatch, 'nav-text-terminal block not found');

  const terminalBlock = terminalBlockMatch[1];
  assert.match(terminalBlock, /font-family:\s*"JetBrains Mono", "SF Mono", "Fira Code", monospace;/);
  assert.match(terminalBlock, /font-weight:\s*600;/);
  assert.match(terminalBlock, /font-variant-ligatures:\s*none;/);
  assert.doesNotMatch(terminalBlock, /background:/);
  assert.doesNotMatch(terminalBlock, /border:/);
  assert.doesNotMatch(terminalBlock, /padding:/);
});

test('navigation focus pip stays visually attached to the navigation column', () => {
  const stylesCss = readStylesCss();
  const html = readIndexHtml();
  const appBlockMatch = stylesCss.match(/\.app\s*\{([\s\S]*?)\n\s*\}/);
  const pipBlockMatch = stylesCss.match(/\.nav-focus-pip\s*\{([\s\S]*?)\n\s*\}/);
  const pipActiveBlockMatch = stylesCss.match(/\.app\.nav-focus-active \.nav-focus-pip\s*\{([\s\S]*?)\n\s*\}/);
  const pipAfterBlockMatch = stylesCss.match(/\.nav-focus-pip::after\s*\{/);

  assert.ok(appBlockMatch, 'app block not found');
  assert.ok(pipBlockMatch, 'nav focus pip block not found');
  assert.ok(pipActiveBlockMatch, 'active nav focus pip block not found');
  assert.equal(pipAfterBlockMatch, null, 'nav focus pip separator block should be removed');

  const appBlock = appBlockMatch[1];
  const pipBlock = pipBlockMatch[1];
  const pipActiveBlock = pipActiveBlockMatch[1];

  assert.match(appBlock, /padding:\s*0 0 0 var\(--page-inline-gap\);/);
  assert.match(pipBlock, /right:\s*calc\(var\(--nav-width\) - 1px\);/);
  assert.match(pipBlock, /border-right:\s*0;/);
  assert.match(pipBlock, /background:\s*var\(--nav-bg\);/);
  assert.match(pipBlock, /border-radius:\s*18px 0 0 18px;/);
  assert.match(pipActiveBlock, /right:\s*calc\(var\(--nav-focus-width\) - 1px\);/);
  assert.match(html, /id="navFocusPipIcon" class="nav-focus-pip-icon">◂<\/span>/);
});

test('navigation focus pip swaps directional triangles when focus mode toggles', async () => {
  const api = createHarness();
  const validJsonl = '{"type":"assistant","timestamp":"2026-04-24T12:00:00Z","message":{"content":[{"type":"text","text":"hello"}]}}';

  await api.handleFiles([createFile('sample.jsonl', validJsonl)]);

  assert.equal(api.navFocusPipIconEl.textContent, '◂');

  api.navFocusPipEl.click();

  assert.equal(api.navFocusPipIconEl.textContent, '▸');

  api.navFocusBackdropEl.click();

  assert.equal(api.navFocusPipIconEl.textContent, '◂');
});

test('navigation labels follow block rules and highlight clears on document click and scroll', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'system',
      timestamp: '2026-04-24T12:00:00Z',
      message: {
        subtype: 'policy_update',
        content: [{ type: 'text', text: 'system block body' }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:01Z',
      message: { content: [{ type: 'text', text: 'hello\nworld' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:02Z',
      message: { content: [{ type: 'text', text: 'agent reply' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:03Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-1', name: 'Skill', input: { skill: 'Plan markdown' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:04Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:05Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-2', name: 'Bash', input: { command: 'echo 42' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:06Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'ok' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:07Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-3', name: 'Glob', input: { pattern: '**/*.mjs' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:08Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-3', content: 'ok' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:09Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-4', name: 'Grep', input: { pattern: 'TODO' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:10Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-4', content: 'ok' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:11Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-5', name: 'Write', input: { file_path: '/tmp/out.jsonl' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:12Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-5', content: 'permission denied', is_error: true }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:00:13Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-6', name: 'Read', input: { file_path: '/tmp/in.jsonl' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:00:14Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-6', content: 'ok' }] }
    },
    {
      type: 'result',
      timestamp: '2026-04-24T12:00:15Z',
      duration_ms: 1200,
      num_turns: 9,
      total_cost_usd: 0.123456
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navTimes = api.navListEl.children.map((item) => item.children[0].textContent);
  const navLabels = api.navListEl.children.map((item) => item.children[2].textContent);
  assert.deepEqual(navTimes, Array(navLabels.length).fill('12:00'));
  assert.deepEqual(navLabels, [
    'policy_update',
    'hello world',
    'agent reply',
    'Plan markdown',
    'echo 42',
    'Glob: **/*.mjs',
    'Grep: TODO',
    'Write: permission denied',
    'Read: /tmp/in.jsonl',
    '0.1235$'
  ]);

  const systemNavText = api.navListEl.children[0].children[2];
  const skillNavText = api.navListEl.children[3].children[2];
  const bashNavText = api.navListEl.children[4].children[2];
  const globNavText = api.navListEl.children[5].children[2];
  const writeErrorNavText = api.navListEl.children[7].children[2];

  assert.equal(systemNavText.children[0].tagName, 'STRONG');
  assert.equal(systemNavText.children[0].textContent, 'policy_update');
  assert.equal(skillNavText.children[0].tagName, 'STRONG');
  assert.equal(skillNavText.children[0].textContent, 'Plan markdown');
  assert.equal(globNavText.children[0].tagName, 'STRONG');
  assert.equal(globNavText.children[0].textContent, 'Glob:');
  assert.equal(globNavText.children[1].textContent, ' **/*.mjs');
  assert.equal(writeErrorNavText.children[0].tagName, 'STRONG');
  assert.equal(writeErrorNavText.children[0].textContent, 'Write:');
  assert.equal(bashNavText.classList.contains('nav-text-terminal'), true);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const cards = feed.children;

  assert.equal(cards.length, navLabels.length);
  for (const card of cards) {
    assert.equal(card.scrollIntoViewCalls.length, 0);
  }

  const firstToolMeta = cards[3].children[0];
  assert.equal(firstToolMeta.children[0].textContent, 'tool');
  assert.equal(firstToolMeta.children[1].classList.contains('tool-duration-badge'), true);
  assert.equal(firstToolMeta.children[1].textContent, '1.0 s');
  assert.equal(firstToolMeta.children[2].textContent, '12:00:03');

  assert.equal(api.navListEl.children[7].classList.contains('error'), true);
  assert.equal(api.navListEl.children[7].style.properties['--c'], 'var(--entry-error)');

  api.navListEl.children[6].click();

  assert.equal(cards[6].scrollIntoViewCalls.length, 1);
  assert.equal(cards[6].scrollIntoViewCalls[0].block, 'center');
  assert.equal(cards[6].scrollIntoViewCalls[0].behavior, 'instant');
  assert.equal(cards[6].children[1].open, true);
  assert.equal(cards[6].classList.contains('nav-target-highlight'), true);

  await new Promise((resolve) => setTimeout(resolve, 16));

  assert.equal(cards[6].classList.contains('nav-target-highlight'), true);

  api.dispatchDocumentEvent('click', {
    target: api.mainColumnEl,
    currentTarget: api.mainColumnEl,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(cards[6].classList.contains('nav-target-highlight'), false);

  api.navListEl.children[6].click();
  assert.equal(cards[6].classList.contains('nav-target-highlight'), true);
  await new Promise((resolve) => setTimeout(resolve, 16));

  const navScrollHandlers = api.navColumnEl.eventListeners.scroll || [];
  assert.equal(navScrollHandlers.length > 0, true);

  for (const handler of navScrollHandlers) {
    handler({
      target: api.navColumnEl,
      currentTarget: api.navColumnEl,
      preventDefault() {},
      stopPropagation() {}
    });
  }

  assert.equal(cards[6].classList.contains('nav-target-highlight'), false);
  assert.equal(api.scrollEvents.length, 2);
  assert.equal(api.scrollEvents[0].id, cards[6].id);
  assert.equal(api.scrollEvents[1].id, cards[6].id);
});

test('tool error navigation label renders one-line tool result content', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:02:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-error-nav', name: 'Bash', input: { command: 'echo fail' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:02:01Z',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-error-nav',
          content: 'line one\nline two',
          is_error: true
        }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navLabels = api.navListEl.children.map((item) => item.children[2].textContent);
  assert.deepEqual(navLabels, ['Bash: line one line two']);
  const navText = api.navListEl.children[0].children[2];
  assert.equal(navText.children[0].tagName, 'STRONG');
  assert.equal(navText.children[0].textContent, 'Bash:');
  assert.equal(navText.children[1].textContent, ' line one line two');
  assert.equal(navText.classList.contains('nav-text-terminal'), false);
});

test('successful Bash nav label with colon stays non-bold and terminal-mono', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:13:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-bash-success', name: 'Bash', input: { command: 'echo status: ok' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:13:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-bash-success', content: 'result payload should not be shown' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navText = api.navListEl.children[0].children[2];
  assert.equal(navText.classList.contains('nav-text-terminal'), true);
  assert.equal(navText.textContent, 'echo status: ok');
  assert.equal(navText.children.length, 0);
});

test('tool duration badge rounds up to tenths of a second', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:03:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-rounding', name: 'Bash', input: { command: 'echo hi' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:03:00Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-rounding', duration_ms: 101, content: 'ok' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const toolCard = feed.children[0];
  const meta = toolCard.children[0];

  assert.equal(meta.children[0].textContent, 'tool');
  assert.equal(meta.children[1].classList.contains('tool-duration-badge'), true);
  assert.equal(meta.children[1].textContent, '0.2 s');
});

test('tool request and result panels expose copy icons and copy panel content', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:10:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-copy', name: 'Bash', input: { command: 'echo copy-me' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:10:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-copy', content: 'copy output' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const toolCard = feed.children[0];

  const requestSummary = toolCard.children[1].children[0];
  const resultSummary = toolCard.children[2].children[0];
  const requestCopyButton = requestSummary.children[0];
  const resultCopyButton = resultSummary.children[0];

  assert.equal(requestCopyButton.classList.contains('panel-copy-btn'), true);
  assert.equal(resultCopyButton.classList.contains('panel-copy-btn'), true);
  assert.equal(requestCopyButton.attributes['aria-label'], 'Copy request');
  assert.equal(resultCopyButton.attributes['aria-label'], 'Copy result');
  assert.equal(requestCopyButton.children[0].classList.contains('panel-copy-icon'), true);
  assert.equal(resultCopyButton.children[0].classList.contains('panel-copy-icon'), true);
  assert.equal(requestCopyButton.children[0].textContent, 'content_copy');
  assert.equal(resultCopyButton.children[0].textContent, 'content_copy');

  requestCopyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resultCopyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const copyToast = api.statusEl.ownerDocument.getElementById('copyToast');
  assert.deepEqual(api.clipboardWrites, ['{\n  "command": "echo copy-me"\n}', 'copy output']);
  assert.equal(copyToast.textContent, 'Copied');
  assert.equal(copyToast.classList.contains('visible'), true);
});

test('text message headers expose copy icons and copy content', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'system',
      timestamp: '2026-04-24T12:11:00Z',
      message: {
        subtype: 'policy_update',
        content: [{ type: 'text', text: 'system block body' }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:11:01Z',
      message: {
        content: [{ type: 'text', text: 'user message body' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const cards = feed.children;

  const systemMetaCopyButton = cards[0].children[0].children[2];
  const userMetaCopyButton = cards[1].children[0].children[2];

  assert.equal(systemMetaCopyButton.classList.contains('meta-copy-btn'), true);
  assert.equal(userMetaCopyButton.classList.contains('meta-copy-btn'), true);
  assert.equal(systemMetaCopyButton.attributes['aria-label'], 'Copy system message');
  assert.equal(userMetaCopyButton.attributes['aria-label'], 'Copy message');

  userMetaCopyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  systemMetaCopyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const copyToast = api.statusEl.ownerDocument.getElementById('copyToast');
  assert.deepEqual(api.clipboardWrites, ['user message body', 'system block body']);
  assert.equal(copyToast.textContent, 'Copied');
  assert.equal(copyToast.classList.contains('visible'), true);
});

test('system raw details summary includes copy icon and copies raw payload', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'system',
      timestamp: '2026-04-24T12:12:00Z',
      message: {
        subtype: 'policy_update',
        policy: 'strict'
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const systemCard = feed.children[0];
  const detailsPanel = systemCard.children[1];
  const summary = detailsPanel.children[0];
  const copyButton = summary.children[0];

  assert.equal(copyButton.classList.contains('panel-copy-btn'), true);
  assert.equal(copyButton.attributes['aria-label'], 'Copy system message');
  assert.equal(copyButton.children[0].classList.contains('panel-copy-icon'), true);

  copyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const copyToast = api.statusEl.ownerDocument.getElementById('copyToast');
  assert.deepEqual(api.clipboardWrites, ['{\n  "subtype": "policy_update",\n  "policy": "strict"\n}']);
  assert.equal(copyToast.textContent, 'Copied');
  assert.equal(copyToast.classList.contains('visible'), true);
});

test('hovering content cards toggles underline class on matching navigation item', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'user',
      timestamp: '2026-04-24T12:07:00Z',
      message: { content: [{ type: 'text', text: 'first line' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:07:01Z',
      message: { content: [{ type: 'text', text: 'second line' }] }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const cards = feed.children;
  const navItems = api.navListEl.children;

  assert.equal(cards.length, 2);
  assert.equal(navItems.length, 2);
  assert.equal(navItems[0].classList.contains('content-hover-match'), false);
  assert.equal(navItems[1].classList.contains('content-hover-match'), false);

  const firstEnterHandlers = cards[0].eventListeners.mouseenter || [];
  for (const handler of firstEnterHandlers) {
    handler({
      target: cards[0],
      currentTarget: cards[0],
      preventDefault() {},
      stopPropagation() {}
    });
  }

  assert.equal(navItems[0].classList.contains('content-hover-match'), true);
  assert.equal(navItems[1].classList.contains('content-hover-match'), false);

  const secondEnterHandlers = cards[1].eventListeners.mouseenter || [];
  for (const handler of secondEnterHandlers) {
    handler({
      target: cards[1],
      currentTarget: cards[1],
      preventDefault() {},
      stopPropagation() {}
    });
  }

  assert.equal(navItems[0].classList.contains('content-hover-match'), false);
  assert.equal(navItems[1].classList.contains('content-hover-match'), true);

  const secondLeaveHandlers = cards[1].eventListeners.mouseleave || [];
  for (const handler of secondLeaveHandlers) {
    handler({
      target: cards[1],
      currentTarget: cards[1],
      preventDefault() {},
      stopPropagation() {}
    });
  }

  assert.equal(navItems[0].classList.contains('content-hover-match'), false);
  assert.equal(navItems[1].classList.contains('content-hover-match'), false);
});

test('navigation marks all rows as in-viewport when layout APIs are unavailable', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'user',
      timestamp: '2026-04-24T12:05:00Z',
      message: { content: [{ type: 'text', text: 'first' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:05:01Z',
      message: { content: [{ type: 'text', text: 'second' }] }
    },
    {
      type: 'result',
      timestamp: '2026-04-24T12:05:02Z',
      duration_ms: 1000,
      num_turns: 2,
      total_cost_usd: 0.001
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  for (const item of api.navListEl.children) {
    assert.equal(item.classList.contains('in-viewport'), true);
  }
});

test('navigation applies in-viewport class only to rows whose cards intersect main viewport', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'user',
      timestamp: '2026-04-24T12:06:00Z',
      message: { content: [{ type: 'text', text: 'first' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:06:01Z',
      message: { content: [{ type: 'text', text: 'second' }] }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:06:02Z',
      message: { content: [{ type: 'text', text: 'third' }] }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const cards = feed.children;

  api.mainColumnEl.getBoundingClientRect = () => ({
    top: 100,
    bottom: 220,
    left: 100,
    right: 740,
    width: 640,
    height: 120
  });
  cards[0].getBoundingClientRect = () => ({ top: 60, bottom: 95 });
  cards[1].getBoundingClientRect = () => ({ top: 115, bottom: 145 });
  cards[2].getBoundingClientRect = () => ({ top: 215, bottom: 240 });

  const mainScrollHandlers = api.mainColumnEl.eventListeners.scroll || [];
  for (const handler of mainScrollHandlers) {
    handler({
      target: api.mainColumnEl,
      currentTarget: api.mainColumnEl,
      preventDefault() {},
      stopPropagation() {}
    });
  }

  assert.equal(api.navListEl.children[0].classList.contains('in-viewport'), false);
  assert.equal(api.navListEl.children[1].classList.contains('in-viewport'), true);
  assert.equal(api.navListEl.children[2].classList.contains('in-viewport'), true);
});

test('TodoWrite renders non-interactive todo list from input.todos', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:01:00Z',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'todo-tool-1',
            name: 'TodoWrite',
            input: {
              todos: [
                {
                  activeForm: 'Уже завершил задачу',
                  content: 'Собрать стек-трейс',
                  status: 'completed'
                },
                {
                  activeForm: 'Сейчас выполняю задачу',
                  content: 'Проверить проблемную строку',
                  status: 'in_progress'
                },
                {
                  activeForm: 'Дальше по плану',
                  content: 'Подготовить отчет',
                  status: 'pending'
                }
              ]
            }
          }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:01:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'todo-tool-1', content: 'ok' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const card = feed.children[0];
  const todoList = card.children[1];
  const todoNavText = api.navListEl.children[0].children[2];

  assert.equal(api.navListEl.children[0].children[2].textContent, 'TodoWrite');
  assert.equal(todoNavText.children[0].tagName, 'STRONG');
  assert.equal(todoNavText.children[0].textContent, 'TodoWrite');
  assert.equal(todoList.classList.contains('todo-list'), true);
  assert.equal(todoList.children.length, 3);

  const completedItem = todoList.children[0];
  const inProgressItem = todoList.children[1];
  const pendingItem = todoList.children[2];

  const completedCheckbox = completedItem.children[0];
  const inProgressCheckbox = inProgressItem.children[0];
  const pendingCheckbox = pendingItem.children[0];

  assert.equal(completedItem.classList.contains('completed'), true);
  assert.equal(completedCheckbox.checked, true);
  assert.equal(completedCheckbox.disabled, true);

  const checkedBeforeClick = completedCheckbox.checked;
  completedCheckbox.click();
  assert.equal(completedCheckbox.checked, checkedBeforeClick);

  assert.equal(inProgressItem.classList.contains('active'), true);
  assert.equal(inProgressCheckbox.checked, false);
  assert.equal(inProgressCheckbox.disabled, true);
  assert.equal(inProgressItem.children[1].textContent, 'Проверить проблемную строку');
  assert.notEqual(inProgressItem.children[1].textContent, 'Сейчас выполняю задачу');

  assert.equal(pendingItem.classList.contains('active'), false);
  assert.equal(pendingCheckbox.checked, false);
  assert.equal(pendingCheckbox.disabled, true);
  assert.equal(card.children[1].tagName, 'DIV');
  assert.equal(card.children.length, 2);
});

test('TodoWrite falls back to default tool panels when todos are empty or invalid', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:02:00Z',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'todo-tool-empty',
            name: 'TodoWrite',
            input: { todos: [] }
          }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:02:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'todo-tool-empty', content: 'ok' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:02:02Z',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'todo-tool-invalid',
            name: 'TodoWrite',
            input: { todos: 'not-an-array' }
          }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:02:03Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'todo-tool-invalid', content: 'ok' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const cards = feed.children;

  assert.equal(cards.length, 2);

  for (const card of cards) {
    assert.equal(card.children.length, 3);
    assert.equal(card.children[1].tagName, 'DETAILS');
    assert.equal(card.children[2].tagName, 'DETAILS');
    assert.equal(card.children[1].children[0].textContent, 'TodoWrite');
    assert.equal(card.children[2].children[0].textContent, 'result');
  }
});
