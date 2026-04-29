import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJsonlViewerApp } from '../assets/js/app.mjs';
import {
  formatNavTime,
  formatTimestamp,
  normalizeTodoItems,
  parseJsonLines,
  resolveToolRequestSummary,
  resolveToolNavLabel
} from '../assets/js/entries.mjs';

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

function readClaudeCodeJsonlLineSchema() {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'schemas/claude-code-jsonl-line.v1.schema.json'),
      'utf8'
    )
  );
}

function readAppModule() {
  return fs.readFileSync(path.join(process.cwd(), 'assets/js/app.mjs'), 'utf8');
}

function readRenderModule() {
  return fs.readFileSync(path.join(process.cwd(), 'assets/js/render.mjs'), 'utf8');
}

function createHarness(appDeps = {}) {
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
    clearTimeout,
    ...appDeps
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

function createStreamCapableFile(name, text) {
  const counters = {
    streamCalls: 0,
    textCalls: 0
  };

  return {
    name,
    size: text.length,
    counters,
    stream() {
      counters.streamCalls += 1;
      return new ReadableStream({
        pull(controller) {
          controller.close();
        }
      });
    },
    async text() {
      counters.textCalls += 1;
      return text;
    }
  };
}

function findChildByClass(element, className) {
  return (element.children || []).find((child) => child.classList && child.classList.contains(className));
}

function collectChildrenByClass(element, className, results = []) {
  if (!element || !element.children) {
    return results;
  }

  for (const child of element.children) {
    if (child.classList && child.classList.contains(className)) {
      results.push(child);
    }
    collectChildrenByClass(child, className, results);
  }

  return results;
}

function getRenderedNavItems(api) {
  return collectChildrenByClass(api.navListEl, 'nav-item');
}

function getRenderedCards(api) {
  return collectChildrenByClass(api.outputEl, 'e');
}

test('pure JSONL parser reports malformed physical line numbers', () => {
  assert.throws(
    () => parseJsonLines('{"ok":true}\n\n{"broken":'),
    /Invalid JSON on line 3:/
  );
});

test('time formatters normalize missing seconds to HH:MM:SS', () => {
  assert.equal(formatTimestamp('2026-04-24T12:34:56Z'), '12:34:56');
  assert.equal(formatTimestamp('2026-04-24T12:34Z'), '12:34:00');
  assert.equal(formatNavTime('12:34'), '12:34:00');
  assert.equal(formatNavTime('2026-04-24T12:34:56.123Z'), '12:34:56');
});

test('navigation renders HH:MM timestamps as HH:MM:SS', async () => {
  const api = createHarness();
  const jsonl = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-04-24T13:08Z',
    message: {
      content: [{ type: 'text', text: 'hello' }]
    }
  });

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  assert.equal(api.navListEl.childElementCount, 1);
  assert.equal(api.navListEl.children[0].children[0].textContent, '13:08:00');
});

test('pure tool helpers normalize todo items and navigation labels', () => {
  assert.deepEqual(
    normalizeTodoItems('TodoWrite', {
      todos: [
        { content: 'done', status: 'completed' },
        { content: 'active', status: 'in_progress' },
        { content: 'unknown', status: 'blocked' },
        { content: '   ', status: 'completed' }
      ]
    }),
    [
      { content: 'done', status: 'completed' },
      { content: 'active', status: 'in_progress' },
      { content: 'unknown', status: 'pending' }
    ]
  );
  assert.equal(resolveToolNavLabel('Read', { file_path: '/tmp/in.jsonl' }, 'tool'), 'Read: /tmp/in.jsonl');
  assert.equal(resolveToolNavLabel('Grep', { pattern: 'TODO' }, 'tool'), 'Grep: TODO');
  assert.equal(resolveToolNavLabel('WebSearch', { query: 'status page' }, 'tool'), 'WebSearch: status page');
  assert.equal(resolveToolNavLabel('WebFetch', { url: 'https://example.com/status' }, 'tool'), 'WebFetch: https://example.com/status');
  assert.equal(resolveToolNavLabel('Edit', { file_path: '/tmp/patch.diff' }, 'tool'), 'Edit: /tmp/patch.diff');
  assert.equal(resolveToolNavLabel('Agent', { description: 'Find root cause in API logs' }, 'tool'), 'Agent: Find root cause in API logs');
  assert.equal(resolveToolNavLabel('Skill', { skill: 'Plan markdown' }, 'tool'), '/Plan markdown');
});

test('pure tool request summaries preview Edit paths, Agent descriptions, and AskUserQuestion choices', () => {
  const editSummary = resolveToolRequestSummary('Edit', { file_path: '/tmp/source/file.mjs' });
  const globSummary = resolveToolRequestSummary('Glob', { pattern: '**/*.mjs' });
  const webSearchSummary = resolveToolRequestSummary('WebSearch', { query: 'latest incidents' });
  const webFetchSummary = resolveToolRequestSummary('WebFetch', { url: 'https://example.com/incidents' });
  const writeSummary = resolveToolRequestSummary('Write', { file_path: '/tmp/out.jsonl' });
  const agentSummary = resolveToolRequestSummary('Agent', { description: 'Summarize open incidents for Europe region' });
  const askSummary = resolveToolRequestSummary('AskUserQuestion', {
    questions: [
      {
        question: 'Which import path should be used?',
        options: [
          { label: 'Re-export', description: 'Keep thin modules in build/yandex/ai.' },
          { label: 'Move data', description: 'Move only file_info and README.' }
        ]
      }
    ]
  });

  assert.deepEqual(editSummary, {
    label: 'Edit',
    preview: '/tmp/source/file.mjs'
  });
  assert.deepEqual(globSummary, {
    label: 'Glob',
    preview: '**/*.mjs'
  });
  assert.deepEqual(webSearchSummary, {
    label: 'WebSearch',
    preview: 'latest incidents'
  });
  assert.deepEqual(webFetchSummary, {
    label: 'WebFetch',
    preview: 'https://example.com/incidents'
  });
  assert.deepEqual(writeSummary, {
    label: 'Write',
    preview: '/tmp/out.jsonl'
  });
  assert.deepEqual(agentSummary, {
    label: 'Agent',
    preview: 'Summarize open incidents for Europe region'
  });
  assert.equal(askSummary.label, 'AskUserQuestion');
  assert.equal(
    askSummary.preview,
    'Which import path should be used? Re-export: Keep thin modules in build/yandex/ai. Move data: Move only file_info and README.'
  );
});

test('WebSearch and WebFetch show query and url in request preview and right navigation', async () => {
  const api = createHarness();
  const webSearchQuery = 'latest status page incidents';
  const webFetchUrl = 'https://example.com/status?region=eu';
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:30:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-web-1', name: 'WebSearch', input: { query: webSearchQuery } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:30:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-web-1', content: 'search ok' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:30:02Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-web-2', name: 'WebFetch', input: { url: webFetchUrl } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:30:03Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-web-2', content: 'fetch ok' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navLabels = api.navListEl.children.map((item) => item.children[2].textContent);
  assert.deepEqual(navLabels, [
    `WebSearch: ${webSearchQuery}`,
    `WebFetch: ${webFetchUrl}`
  ]);

  const webSearchNavText = api.navListEl.children[0].children[2];
  const webFetchNavText = api.navListEl.children[1].children[2];
  assert.equal(webSearchNavText.children[0].tagName, 'STRONG');
  assert.equal(webSearchNavText.children[0].textContent, 'WebSearch:');
  assert.equal(webSearchNavText.children[1].textContent, ` ${webSearchQuery}`);
  assert.equal(webFetchNavText.children[0].tagName, 'STRONG');
  assert.equal(webFetchNavText.children[0].textContent, 'WebFetch:');
  assert.equal(webFetchNavText.children[1].textContent, ` ${webFetchUrl}`);

  const cards = getRenderedCards(api);
  assert.equal(cards.length, 2);

  const webSearchRequestSummary = cards[0].children[1].children[0];
  const webFetchRequestSummary = cards[1].children[1].children[0];
  const webSearchPreview = findChildByClass(webSearchRequestSummary, 'summary-preview');
  const webFetchPreview = findChildByClass(webFetchRequestSummary, 'summary-preview');

  assert.equal(webSearchRequestSummary.textContent, 'WebSearch');
  assert.equal(webFetchRequestSummary.textContent, 'WebFetch');
  assert.ok(webSearchPreview, 'WebSearch preview should be present');
  assert.ok(webFetchPreview, 'WebFetch preview should be present');
  assert.equal(webSearchPreview.textContent, ` ${webSearchQuery}`);
  assert.equal(webFetchPreview.textContent, ` ${webFetchUrl}`);
});

test('Edit shows file_path in right navigation label', async () => {
  const api = createHarness();
  const editPath = '/tmp/src/app.mjs';
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:31:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-edit-1', name: 'Edit', input: { file_path: editPath, old_string: 'old', new_string: 'new' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:31:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-edit-1', content: 'edit ok' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navText = api.navListEl.children[0].children[2];
  assert.equal(navText.textContent, `Edit: ${editPath}`);
  assert.equal(navText.children[0].tagName, 'STRONG');
  assert.equal(navText.children[0].textContent, 'Edit:');
  assert.equal(navText.children[1].textContent, ` ${editPath}`);
});

test('Agent shows description in request preview and right navigation label', async () => {
  const api = createHarness();
  const agentDescription = 'Draft release notes from recent merged PRs';
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:32:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-agent-1', name: 'Agent', input: { description: agentDescription } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:32:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-agent-1', content: 'agent done' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navText = api.navListEl.children[0].children[2];
  assert.equal(navText.textContent, `Agent: ${agentDescription}`);
  assert.equal(navText.children[0].tagName, 'STRONG');
  assert.equal(navText.children[0].textContent, 'Agent:');
  assert.equal(navText.children[1].textContent, ` ${agentDescription}`);

  const cards = getRenderedCards(api);
  assert.equal(cards.length, 1);
  const requestSummary = cards[0].children[1].children[0];
  const preview = findChildByClass(requestSummary, 'summary-preview');

  assert.equal(requestSummary.textContent, 'Agent');
  assert.ok(preview, 'Agent preview should be present');
  assert.equal(preview.textContent, ` ${agentDescription}`);
});

test('Claude Code JSONL line schema defines versioned raw event and content block contracts', () => {
  const schema = readClaudeCodeJsonlLineSchema();
  const schemaText = JSON.stringify(schema);
  const topLevelEventDefs = [
    'assistantEvent',
    'userEvent',
    'systemEvent',
    'progressEvent',
    'attachmentEvent',
    'queueOperationEvent',
    'fileHistorySnapshotEvent',
    'permissionModeEvent',
    'lastPromptEvent',
    'agentNameEvent',
    'customTitleEvent',
    'unknownEvent'
  ];
  const contentBlockDefs = [
    'textContentBlock',
    'thinkingContentBlock',
    'toolUseContentBlock',
    'toolResultContentBlock',
    'unknownContentBlock'
  ];

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://jsonl.qent.io/schemas/claude-code-jsonl-line.v1.schema.json');
  assert.deepEqual(schema.required, ['type']);
  assert.equal(schema.additionalProperties, true);

  for (const defName of topLevelEventDefs) {
    assert.ok(schema.$defs[defName], `${defName} should be represented`);
  }

  for (const defName of contentBlockDefs) {
    assert.ok(schema.$defs[defName], `${defName} should be represented`);
  }

  for (const eventType of [
    'assistant',
    'user',
    'system',
    'progress',
    'attachment',
    'queue-operation',
    'file-history-snapshot',
    'permission-mode',
    'last-prompt',
    'agent-name',
    'custom-title'
  ]) {
    assert.match(schemaText, new RegExp(`"${eventType}"`));
  }

  for (const blockType of ['text', 'thinking', 'tool_use', 'tool_result']) {
    assert.match(schemaText, new RegExp(`"${blockType}"`));
  }
});

test('clear button stays hidden until something is rendered', () => {
  const api = createHarness();

  assert.equal(api.dropzone.hidden, false);
  assert.equal(api.clearBtn.hidden, true);
  assert.equal(api.collapseAllBtn.hidden, true);
  assert.equal(api.expandAllBtn.hidden, true);
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

test('app API exposes destroy cleanup hook', () => {
  const api = createHarness();

  assert.equal(typeof api.destroy, 'function');
  assert.doesNotThrow(() => api.destroy());
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
  const renderModule = readRenderModule();
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
    renderModule,
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
  assert.equal(api.collapseAllBtn.hidden, true);
  assert.equal(api.expandAllBtn.hidden, true);
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
  assert.equal(api.collapseAllBtn.hidden, true);
  assert.equal(api.expandAllBtn.hidden, true);
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
  assert.match(html, /<span class="history-toggle-icon" aria-hidden="true">close_fullscreen<\/span>/);
  assert.match(html, /id="expandAllBtn"/);
  assert.match(html, /class="history-toggle-btn expand-history-btn floating-btn"/);
  assert.match(html, /aria-label="Expand all history content blocks"/);
  assert.match(html, /<span class="history-toggle-icon" aria-hidden="true">open_in_full<\/span>/);
});

test('global hidden attribute rule uses display none important', () => {
  const stylesCss = readStylesCss();
  assert.match(stylesCss, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('dropzone hides during rendering and stays hidden after successful render', async () => {
  const api = createHarness();
  let resolveFileText;
  const fileTextPromise = new Promise((resolve) => {
    resolveFileText = resolve;
  });
  const deferredFile = {
    name: 'slow.jsonl',
    size: 2,
    async text() {
      return fileTextPromise;
    }
  };
  const handlePromise = api.handleFiles([deferredFile]);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.dropzone.hidden, true);

  resolveFileText('{"type":"assistant","timestamp":"2026-04-24T12:20:00Z","message":{"content":[{"type":"text","text":"done"}]}}');
  await handlePromise;

  assert.equal(api.dropzone.hidden, true);
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

  assert.equal(api.collapseAllBtn.hidden, false);
  assert.equal(api.expandAllBtn.hidden, false);
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
  const navTimeBlockMatch = stylesCss.match(/\.nav-time\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(beforeBlockMatch, 'nav item pseudo-element block not found');
  assert.ok(inViewportBlockMatch, 'nav item in-viewport pseudo-element block not found');
  assert.ok(navTimeBlockMatch, 'nav-time block not found');

  const beforeBlock = beforeBlockMatch[1];
  const inViewportBlock = inViewportBlockMatch[1];
  const navTimeBlock = navTimeBlockMatch[1];

  assert.match(beforeBlock, /left:\s*calc\(-0\.8rem \+ 2px\);/);
  assert.match(beforeBlock, /width:\s*4px;/);
  assert.match(beforeBlock, /background:\s*var\(--c,\s*var\(--entry-default\)\);/);
  assert.match(beforeBlock, /opacity:\s*0;/);
  assert.match(inViewportBlock, /opacity:\s*1;/);
  assert.match(navTimeBlock, /flex:\s*0 0 9ch;/);
  assert.match(navTimeBlock, /min-width:\s*9ch;/);
  assert.match(navTimeBlock, /white-space:\s*nowrap;/);
  assert.match(navTimeBlock, /text-align:\s*left;/);
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

test('tool summary preview styles define theme-aware default and error colors', () => {
  const stylesCss = readStylesCss();
  const rootBlockMatch = stylesCss.match(/:root\s*\{([\s\S]*?)\n\s*\}\n\n\s*\.app\[data-theme="dark"\]/);
  const darkBlockMatch = stylesCss.match(/\.app\[data-theme="dark"\]\s*\{([\s\S]*?)\n\s*\}\n\n\s*\*/);
  const previewBlockMatch = stylesCss.match(/\.summary-preview\s*\{([\s\S]*?)\n\s*\}/);
  const previewErrorBlockMatch = stylesCss.match(/\.summary-preview-error\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(rootBlockMatch, 'root theme block not found');
  assert.ok(darkBlockMatch, 'dark theme block not found');
  assert.ok(previewBlockMatch, 'summary preview block not found');
  assert.ok(previewErrorBlockMatch, 'summary preview error block not found');

  const rootBlock = rootBlockMatch[1];
  const darkBlock = darkBlockMatch[1];
  const previewBlock = previewBlockMatch[1];
  const previewErrorBlock = previewErrorBlockMatch[1];

  assert.match(rootBlock, /--summary-preview-text:\s*#64748b;/);
  assert.match(rootBlock, /--summary-preview-error-text:\s*var\(--danger-strong\);/);
  assert.match(darkBlock, /--summary-preview-text:\s*#9aa7bf;/);
  assert.match(darkBlock, /--summary-preview-error-text:\s*#fda4af;/);
  assert.match(previewBlock, /color:\s*var\(--summary-preview-text\);/);
  assert.match(previewErrorBlock, /color:\s*var\(--summary-preview-error-text\);/);
});

test('navigation focus pip stays visually attached to the navigation column', () => {
  const stylesCss = readStylesCss();
  const html = readIndexHtml();
  const rootBlockMatch = stylesCss.match(/:root\s*\{([\s\S]*?)\n\s*\}\n\n\s*\.app\[data-theme="dark"\]/);
  const layoutGridBlockMatch = stylesCss.match(/\.layout-grid\s*\{([\s\S]*?)\n\s*\}/);
  const hasNavLayoutGridBlockMatch = stylesCss.match(/\.app\.has-nav \.layout-grid\s*\{([\s\S]*?)\n\s*\}/);
  const hasNavMainColumnBlockMatch = stylesCss.match(/\.app\.has-nav \.main-column\s*\{([\s\S]*?)\n\s*\}/);
  const navFocusMainColumnBlockMatch = stylesCss.match(/\.app\.nav-focus-active \.main-column\s*\{([\s\S]*?)\n\s*\}/);
  const appBlockMatch = stylesCss.match(/\.app\s*\{([\s\S]*?)\n\s*\}/);
  const pipBlockMatch = stylesCss.match(/\.nav-focus-pip\s*\{([\s\S]*?)\n\s*\}/);
  const pipActiveBlockMatch = stylesCss.match(/\.app\.nav-focus-active \.nav-focus-pip\s*\{([\s\S]*?)\n\s*\}/);
  const pipAfterBlockMatch = stylesCss.match(/\.nav-focus-pip::after\s*\{/);

  assert.ok(rootBlockMatch, 'root block not found');
  assert.ok(layoutGridBlockMatch, 'layout grid block not found');
  assert.ok(hasNavLayoutGridBlockMatch, 'app has-nav layout-grid block not found');
  assert.ok(hasNavMainColumnBlockMatch, 'app has-nav main-column block not found');
  assert.ok(navFocusMainColumnBlockMatch, 'app nav-focus-active main-column block not found');
  assert.ok(appBlockMatch, 'app block not found');
  assert.ok(pipBlockMatch, 'nav focus pip block not found');
  assert.ok(pipActiveBlockMatch, 'active nav focus pip block not found');
  assert.equal(pipAfterBlockMatch, null, 'nav focus pip separator block should be removed');

  const rootBlock = rootBlockMatch[1];
  const layoutGridBlock = layoutGridBlockMatch[1];
  const hasNavLayoutGridBlock = hasNavLayoutGridBlockMatch[1];
  const hasNavMainColumnBlock = hasNavMainColumnBlockMatch[1];
  const navFocusMainColumnBlock = navFocusMainColumnBlockMatch[1];
  const appBlock = appBlockMatch[1];
  const pipBlock = pipBlockMatch[1];
  const pipActiveBlock = pipActiveBlockMatch[1];

  assert.match(rootBlock, /--nav-width:\s*24vw;/);
  assert.match(rootBlock, /--nav-focus-width:\s*70vw;/);
  assert.match(layoutGridBlock, /justify-content:\s*center;/);
  assert.match(hasNavLayoutGridBlock, /justify-content:\s*flex-end;/);
  assert.match(hasNavMainColumnBlock, /margin-left:\s*0;/);
  assert.match(navFocusMainColumnBlock, /margin-right:\s*var\(--nav-width\);/);
  assert.match(appBlock, /padding:\s*0 0 0 var\(--page-inline-gap\);/);
  assert.match(stylesCss, /@media \(min-width:\s*1121px\)\s*\{[\s\S]*?\.app\.has-nav \.main-column\s*\{[\s\S]*?padding-left:\s*max\(var\(--column-inline-gap\),\s*3\.9rem\);/);
  assert.match(stylesCss, /@media \(min-width:\s*1121px\)\s*\{[\s\S]*?\.app\.has-nav \.clear-btn\s*\{[\s\S]*?right:\s*calc\(var\(--nav-width\) \+ var\(--column-inline-gap\) \+ var\(--scrollbar-safe-gap\)\);/);
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

test('raw Claude Code message variants render string content, thinking, array tool results, and unknown blocks', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'user',
      timestamp: '2026-04-24T12:30:00Z',
      message: {
        role: 'user',
        content: 'plain prompt from Claude Code'
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:30:01Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'let me reason', signature: 'sig' },
          { type: 'text', text: 'agent answer' },
          { type: 'redacted', reason: 'future block' },
          { type: 'tool_use', id: 'tool-array-result', name: 'Bash', input: { command: 'echo hi' } }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:30:02Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-array-result',
            content: [{ type: 'text', text: 'array result text' }]
          }
        ]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navLabels = getRenderedNavItems(api).map((item) => item.children[2].textContent);
  assert.deepEqual(navLabels, [
    'plain prompt from Claude Code',
    'thinking: let me reason',
    'agent answer',
    'agent: redacted',
    'echo hi'
  ]);

  const feed = api.outputEl.children[0].children[1];
  const cards = feed.children;
  assert.equal(cards.length, 5);
  assert.equal(cards[0].classList.contains('user'), true);
  assert.equal(cards[1].classList.contains('system'), true);
  assert.equal(cards[1].children.length, 1);
  assert.equal(cards[1].children[0].children[0].textContent, 'thinking');
  assert.equal(cards[2].classList.contains('agent'), true);
  assert.equal(cards[3].children[1].tagName, 'DETAILS');
  assert.equal(cards[4].classList.contains('tool'), true);
  assert.equal(cards[4].children[2].children[1].textContent, 'array result text');
});

test('thinking entries render only metadata and do not enable history expand controls', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:30:01Z',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'private reasoning', signature: 'sig' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('thinking-only.jsonl', jsonl)]);

  const cards = getRenderedCards(api);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].children.length, 1);
  assert.equal(cards[0].children[0].children.length, 2);
  assert.equal(cards[0].children[0].children[0].textContent, 'thinking');
  assert.equal(cards[0].children[0].children[1].textContent, '12:30:01');
  assert.equal(api.collapseAllBtn.hidden, true);
  assert.equal(api.expandAllBtn.hidden, true);
});

test('top-level Claude Code service events render visible cards and filter hook progress noise', async () => {
  const api = createHarness();
  const jsonlObjects = [
    {
      type: 'system',
      subtype: 'api_error',
      level: 'error',
      timestamp: '2026-04-24T12:31:00Z',
      error: { message: 'connection failed' }
    },
    {
      type: 'progress',
      timestamp: '2026-04-24T12:31:01Z',
      data: {
        type: 'bash_progress',
        output: 'line one',
        fullOutput: 'line one\nline two',
        elapsedTimeSeconds: 1,
        totalLines: 2
      }
    },
    {
      type: 'progress',
      timestamp: '2026-04-24T12:31:01Z',
      data: {
        type: 'hook_progress',
        hookEvent: 'PostToolUse',
        message: 'suppressed hook progress'
      }
    },
    {
      type: 'attachment',
      timestamp: '2026-04-24T12:31:02Z',
      attachment: {
        type: 'file',
        filename: '/tmp/index.html',
        displayPath: 'index.html',
        content: { type: 'text', text: '<main></main>' }
      }
    },
    {
      type: 'queue-operation',
      operation: 'enqueue',
      timestamp: '2026-04-24T12:31:03Z',
      content: 'queued command body'
    },
    {
      type: 'file-history-snapshot',
      messageId: 'message-1',
      snapshot: { trackedFileBackups: {} },
      isSnapshotUpdate: false
    },
    {
      type: 'permission-mode',
      permissionMode: 'default',
      sessionId: 'session-1'
    },
    {
      type: 'last-prompt',
      lastPrompt: 'continue the implementation',
      sessionId: 'session-1'
    },
    {
      type: 'agent-name',
      agentName: 'worker-one',
      sessionId: 'session-1'
    },
    {
      type: 'custom-title',
      customTitle: 'Claude JSONL support',
      sessionId: 'session-1'
    },
    {
      type: 'future-event',
      payload: { ok: true }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navItems = getRenderedNavItems(api);
  const navLabels = navItems.map((item) => item.children[2].textContent);
  assert.deepEqual(navLabels, [
    'api_error',
    'bash_progress: line one',
    'file: index.html',
    'queue enqueue: queued command body',
    'file history snapshot',
    'permission: default',
    'continue the implementation',
    'agent: worker-one',
    'title: Claude JSONL support',
    'future-event'
  ]);
  assert.equal(navItems[0].classList.contains('error'), true);

  const cards = api.outputEl.children[0].children[1].children;
  assert.equal(cards.length, 10);
  assert.equal(cards[0].classList.contains('error'), true);
  assert.equal(cards[0].children[1].tagName, 'DETAILS');
  assert.equal(cards[1].children[1].children[1].textContent.includes('"bash_progress"'), true);
  assert.equal(cards[2].children[1].children[1].textContent.includes('"displayPath": "index.html"'), true);
  assert.equal(cards[3].children.length, 2);
  assert.equal(cards[3].children[1].classList.contains('txt-block'), true);
  assert.equal(cards[3].children[1].children[0].classList.contains('txt-plain'), true);
  assert.equal(cards[3].children[1].children[0].textContent, 'queued command body');
  const queueMarkdownButton = findChildByClass(cards[3].children[0], 'meta-markdown-btn');
  const queueCopyButton = findChildByClass(cards[3].children[0], 'meta-copy-btn');
  assert.ok(queueMarkdownButton, 'queue-operation markdown button should be present');
  assert.ok(queueCopyButton, 'queue-operation copy button should be present');
  assert.equal(cards[3].children[0].children.indexOf(queueMarkdownButton) < cards[3].children[0].children.indexOf(queueCopyButton), true);
  queueCopyButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(api.clipboardWrites, ['queued command body']);
  assert.equal(cards[9].children[1].children[1].textContent.includes('"future-event"'), true);
});

test('agent_progress prompt renders as a subagent text card with Agent navigation preview', async () => {
  const api = createHarness();
  const prompt = 'Find nested files and configs';
  const jsonlObjects = [
    {
      type: 'progress',
      timestamp: '2026-04-24T12:40:00Z',
      data: {
        type: 'agent_progress',
        agentId: 'agent-a1234567890',
        prompt,
        message: {
          type: 'user',
          timestamp: '2026-04-24T12:40:00Z',
          uuid: 'nested-user-1',
          message: {
            role: 'user',
            content: [{ type: 'text', text: prompt }]
          }
        }
      },
      toolUseID: 'agent_msg_1',
      parentToolUseID: 'parent-agent-tool'
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navItems = getRenderedNavItems(api);
  assert.equal(navItems.length, 1);
  assert.equal(navItems[0].children[2].textContent, `Agent: ${prompt}`);
  assert.equal(navItems[0].children[2].textContent.includes('[object Object]'), false);
  assert.equal(navItems[0].children[2].children[0].tagName, 'STRONG');
  assert.equal(navItems[0].children[2].children[0].textContent, 'Agent:');

  const cards = getRenderedCards(api);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].classList.contains('user'), true);
  assert.equal(cards[0].children[0].children[0].textContent, 'user');
  assert.equal(cards[0].children[0].children[1].textContent, 'Subagent');
  assert.equal(cards[0].children[1].classList.contains('txt-block'), true);
  assert.equal(cards[0].children[1].children[0].textContent, prompt);
});

test('agent_progress tool_use and tool_result render as subagent tool cards', async () => {
  const api = createHarness();
  const readPath = '/tmp/nested.txt';
  const writePath = '/tmp/out.txt';
  const jsonlObjects = [
    {
      type: 'progress',
      timestamp: '2026-04-24T12:41:00Z',
      data: {
        type: 'agent_progress',
        agentId: 'agent-a1234567890',
        prompt: '',
        message: {
          type: 'assistant',
          timestamp: '2026-04-24T12:41:00Z',
          uuid: 'nested-assistant-1',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'nested-read', name: 'Read', input: { file_path: readPath } }]
          }
        }
      }
    },
    {
      type: 'progress',
      timestamp: '2026-04-24T12:41:02Z',
      data: {
        type: 'agent_progress',
        agentId: 'agent-a1234567890',
        prompt: '',
        message: {
          type: 'user',
          timestamp: '2026-04-24T12:41:02Z',
          uuid: 'nested-user-1',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'nested-read', content: 'read result' }]
          }
        }
      }
    },
    {
      type: 'progress',
      timestamp: '2026-04-24T12:41:03Z',
      data: {
        type: 'agent_progress',
        agentId: 'agent-a1234567890',
        prompt: '',
        message: {
          type: 'assistant',
          timestamp: '2026-04-24T12:41:03Z',
          uuid: 'nested-assistant-2',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'nested-write', name: 'Write', input: { file_path: writePath } }]
          }
        }
      }
    },
    {
      type: 'progress',
      timestamp: '2026-04-24T12:41:04Z',
      data: {
        type: 'agent_progress',
        agentId: 'agent-a1234567890',
        prompt: '',
        message: {
          type: 'user',
          timestamp: '2026-04-24T12:41:04Z',
          uuid: 'nested-user-2',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'nested-write', content: 'permission denied', is_error: true }]
          }
        }
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const navItems = getRenderedNavItems(api);
  assert.deepEqual(
    navItems.map((item) => item.children[2].textContent),
    [
      `Agent: Read: ${readPath}`,
      'Agent: Write: permission denied'
    ]
  );
  assert.equal(navItems[1].classList.contains('error'), true);
  assert.equal(navItems[1].style.properties['--c'], 'var(--entry-error)');

  const cards = getRenderedCards(api);
  assert.equal(cards.length, 2);

  assert.equal(cards[0].classList.contains('tool'), true);
  assert.equal(cards[0].children[0].children[0].textContent, 'tool');
  assert.equal(cards[0].children[0].children[1].textContent, 'Subagent');
  assert.equal(cards[0].children[0].children[2].textContent, '2.0 s');
  assert.equal(cards[0].children[1].children[0].textContent, 'Read');
  assert.equal(findChildByClass(cards[0].children[1].children[0], 'summary-preview').textContent, ` ${readPath}`);
  assert.equal(cards[0].children[2].children[0].textContent, '');
  assert.equal(findChildByClass(cards[0].children[2].children[0], 'summary-preview').textContent, 'read result');

  assert.equal(cards[1].classList.contains('tool'), true);
  assert.equal(cards[1].children[0].children[1].textContent, 'Subagent');
  assert.equal(cards[1].style.properties['--c'], 'var(--entry-error)');
  assert.equal(cards[1].children[1].children[0].textContent, 'Write');
  assert.equal(findChildByClass(cards[1].children[1].children[0], 'summary-preview').textContent, ` ${writePath}`);
  const errorPreview = findChildByClass(cards[1].children[2].children[0], 'summary-preview');
  assert.equal(errorPreview.textContent, 'permission denied');
  assert.equal(errorPreview.classList.contains('summary-preview-error'), true);
});

test('unmatched tool_use renders a request-only tool card after full parse', async () => {
  const api = createHarness();
  const file = createStreamCapableFile('pending-tool.jsonl', JSON.stringify({
    type: 'assistant',
    timestamp: '2026-04-24T12:32:00Z',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'pending-tool', name: 'Bash', input: { command: 'echo pending' } }]
    }
  }));

  await api.handleFiles([file]);

  const navItems = getRenderedNavItems(api);
  assert.equal(file.counters.textCalls, 1);
  assert.equal(file.counters.streamCalls, 0);
  assert.equal(navItems.length, 1);
  assert.equal(navItems[0].children[2].textContent, 'echo pending');

  const card = getRenderedCards(api)[0];
  assert.equal(card.classList.contains('tool'), true);
  assert.equal(card.children.length, 2);
  assert.equal(card.children[1].tagName, 'DETAILS');
  assert.equal(card.children[1].children[0].textContent, 'Bash');
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
  assert.deepEqual(navTimes, [
    '12:00:00',
    '12:00:01',
    '12:00:02',
    '12:00:03',
    '12:00:05',
    '12:00:07',
    '12:00:09',
    '12:00:11',
    '12:00:13',
    '12:00:15'
  ]);
  assert.deepEqual(navLabels, [
    'policy_update',
    'hello world',
    'agent reply',
    '/Plan markdown',
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
  assert.equal(skillNavText.children[0].textContent, '/Plan markdown');
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

test('tool panel summaries render contextual previews and truncation rules', async () => {
  const api = createHarness();
  const longReadPath = `/tmp/${'segment-'.repeat(12)}file.jsonl`;
  const grepPattern = 'TODO\\s+items';
  const globPattern = '**/*.{mjs,js}';
  const longBashCommand = `printf "start" && ${'echo very-long-command-part '.repeat(5)}done`;
  const longSuccessResult = `success output ${'x'.repeat(120)}`;
  const longErrorResult = `line one\n${'error-token '.repeat(20)}`;
  const editPath = '/tmp/edit-target.jsonl';
  const askQuestion = 'Как должен выглядеть импорт после переноса?';
  const askPreview = [
    askQuestion,
    'Оставить re-export: Оставить в build/yandex/ai/ тонкие модули-реэкспорты.',
    'Только данные: Перенести только file_info + README.',
    'Полный перенос: Создать __init__.py и добавить tools/ в PYTHONPATH.'
  ].join(' ');
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-1', name: 'Skill', input: { skill: 'Plan markdown' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-1', content: 'skill done' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:02Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-2', name: 'Read', input: { file_path: longReadPath } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:03Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-2', content: 'read ok' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:04Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-3', name: 'Grep', input: { pattern: grepPattern } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:05Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-3', content: 'grep ok' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:06Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-4', name: 'Glob', input: { pattern: globPattern } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:07Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-4', content: 'glob ok' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:08Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-5', name: 'Bash', input: { command: longBashCommand } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:09Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-5', content: longSuccessResult }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:10Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-6', name: 'Write', input: { file_path: '/tmp/out.jsonl' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:11Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-6', content: longErrorResult, is_error: true }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:12Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-summary-7', name: 'Edit', input: { file_path: editPath, old_string: 'old', new_string: 'new' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:13Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-7', content: 'edit ok' }]
      }
    },
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:20:14Z',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-summary-8',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: askQuestion,
                  options: [
                    {
                      label: 'Оставить re-export',
                      description: 'Оставить в build/yandex/ai/ тонкие модули-реэкспорты.'
                    },
                    {
                      label: 'Только данные',
                      description: 'Перенести только file_info + README.'
                    },
                    {
                      label: 'Полный перенос',
                      description: 'Создать __init__.py и добавить tools/ в PYTHONPATH.'
                    }
                  ],
                  multiSelect: false
                }
              ]
            }
          }
        ]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:20:15Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-summary-8', content: 'answered' }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');
  const toSingleLine = (value) => String(value).replace(/\s+/g, ' ').trim();
  const truncateEnd = (value, maxLength) => {
    const normalized = toSingleLine(value);
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  };
  const truncateStart = (value, maxLength) => {
    const normalized = toSingleLine(value);
    return normalized.length > maxLength ? `...${normalized.slice(-maxLength)}` : normalized;
  };

  await api.handleFiles([createFile('sample.jsonl', jsonl)]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const cards = feed.children;
  assert.equal(cards.length, 8);

  const skillRequestSummary = cards[0].children[1].children[0];
  const readRequestSummary = cards[1].children[1].children[0];
  const grepRequestSummary = cards[2].children[1].children[0];
  const globRequestSummary = cards[3].children[1].children[0];
  const bashRequestSummary = cards[4].children[1].children[0];
  const bashResultSummary = cards[4].children[2].children[0];
  const writeRequestSummary = cards[5].children[1].children[0];
  const writeErrorResultSummary = cards[5].children[2].children[0];
  const editRequestSummary = cards[6].children[1].children[0];
  const askRequestSummary = cards[7].children[1].children[0];

  const skillPreview = findChildByClass(skillRequestSummary, 'summary-preview');
  const readPreview = findChildByClass(readRequestSummary, 'summary-preview');
  const grepPreview = findChildByClass(grepRequestSummary, 'summary-preview');
  const globPreview = findChildByClass(globRequestSummary, 'summary-preview');
  const bashPreview = findChildByClass(bashRequestSummary, 'summary-preview');
  const writePreview = findChildByClass(writeRequestSummary, 'summary-preview');
  const bashResultPreview = findChildByClass(bashResultSummary, 'summary-preview');
  const writeErrorPreview = findChildByClass(writeErrorResultSummary, 'summary-preview');
  const editPreview = findChildByClass(editRequestSummary, 'summary-preview');
  const askPreviewElement = findChildByClass(askRequestSummary, 'summary-preview');

  assert.equal(skillRequestSummary.textContent, 'Skill');
  assert.equal(readRequestSummary.textContent, 'Read');
  assert.equal(grepRequestSummary.textContent, 'Grep');
  assert.equal(globRequestSummary.textContent, 'Glob');
  assert.equal(bashRequestSummary.textContent, 'Bash');
  assert.equal(writeRequestSummary.textContent, 'Write');
  assert.equal(bashResultSummary.textContent, '');
  assert.equal(writeErrorResultSummary.textContent, '');
  assert.equal(editRequestSummary.textContent, 'Edit');
  assert.equal(askRequestSummary.textContent, 'AskUserQuestion');

  assert.ok(skillPreview, 'Skill preview should be present');
  assert.ok(readPreview, 'Read preview should be present');
  assert.ok(grepPreview, 'Grep preview should be present');
  assert.ok(globPreview, 'Glob preview should be present');
  assert.ok(bashPreview, 'Bash preview should be present');
  assert.ok(writePreview, 'Write preview should be present');
  assert.ok(bashResultPreview, 'successful result preview should be present');
  assert.ok(writeErrorPreview, 'error result preview should be present');
  assert.ok(editPreview, 'Edit file path preview should be present');
  assert.ok(askPreviewElement, 'AskUserQuestion preview should be present');

  assert.equal(skillPreview.textContent, ' /Plan markdown');
  assert.equal(readPreview.textContent, ` ${truncateStart(longReadPath, 90)}`);
  assert.equal(grepPreview.textContent, ` ${toSingleLine(grepPattern)}`);
  assert.equal(globPreview.textContent, ` ${toSingleLine(globPattern)}`);
  assert.equal(bashPreview.textContent, ` ${truncateEnd(longBashCommand, 90)}`);
  assert.equal(writePreview.textContent, ' /tmp/out.jsonl');
  assert.equal(bashResultPreview.textContent, truncateEnd(longSuccessResult, 110));
  assert.equal(writeErrorPreview.textContent, truncateEnd(longErrorResult, 110));
  assert.equal(editPreview.textContent, ` ${editPath}`);
  assert.equal(askPreviewElement.textContent, ` ${askPreview}`);
  assert.equal(writeErrorPreview.classList.contains('summary-preview-error'), true);
  assert.equal(bashResultPreview.classList.contains('summary-preview-error'), false);
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
  const requestCopyButton = findChildByClass(requestSummary, 'panel-copy-btn');
  const resultCopyButton = findChildByClass(resultSummary, 'panel-copy-btn');
  const requestPreview = findChildByClass(requestSummary, 'summary-preview');
  const resultPreview = findChildByClass(resultSummary, 'summary-preview');

  assert.ok(requestCopyButton, 'request copy button should be present');
  assert.ok(resultCopyButton, 'result copy button should be present');
  assert.ok(requestPreview, 'request preview should be present');
  assert.ok(resultPreview, 'result preview should be present');
  assert.equal(requestSummary.textContent, 'Bash');
  assert.equal(resultSummary.textContent, '');
  assert.equal(requestPreview.textContent, ' echo copy-me');
  assert.equal(resultPreview.textContent, 'copy output');
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

  const systemMetaMarkdownButton = findChildByClass(cards[0].children[0], 'meta-markdown-btn');
  const userMetaMarkdownButton = findChildByClass(cards[1].children[0], 'meta-markdown-btn');
  const systemMetaCopyButton = findChildByClass(cards[0].children[0], 'meta-copy-btn');
  const userMetaCopyButton = findChildByClass(cards[1].children[0], 'meta-copy-btn');

  assert.ok(systemMetaMarkdownButton, 'system markdown button should be present');
  assert.ok(userMetaMarkdownButton, 'user markdown button should be present');
  assert.equal(systemMetaCopyButton.classList.contains('meta-copy-btn'), true);
  assert.equal(userMetaCopyButton.classList.contains('meta-copy-btn'), true);
  assert.equal(cards[0].children[0].children.indexOf(systemMetaMarkdownButton) < cards[0].children[0].children.indexOf(systemMetaCopyButton), true);
  assert.equal(cards[1].children[0].children.indexOf(userMetaMarkdownButton) < cards[1].children[0].children.indexOf(userMetaCopyButton), true);
  assert.equal(systemMetaMarkdownButton.attributes['aria-pressed'], 'false');
  assert.equal(userMetaMarkdownButton.attributes['aria-pressed'], 'false');
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

test('text content renders as plain text until markdown toggle is clicked', async () => {
  const api = createHarness();
  const markdownText = '# Heading\n\n**bold** & <tag>';
  const jsonlObjects = [
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:11:02Z',
      message: {
        content: [{ type: 'text', text: markdownText }]
      }
    }
  ];
  const jsonl = jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n');

  await api.handleFiles([createFile('markdown-toggle.jsonl', jsonl)]);

  const card = getRenderedCards(api)[0];
  const meta = card.children[0];
  const markdownButton = findChildByClass(meta, 'meta-markdown-btn');
  const copyButton = findChildByClass(meta, 'meta-copy-btn');
  const textBlock = card.children[1];

  assert.ok(markdownButton, 'markdown button should be present');
  assert.ok(copyButton, 'copy button should be present');
  assert.equal(meta.children.indexOf(markdownButton) < meta.children.indexOf(copyButton), true);
  assert.equal(textBlock.classList.contains('txt-block'), true);
  assert.equal(textBlock.children[0].classList.contains('txt-plain'), true);
  assert.equal(textBlock.children[0].textContent, markdownText);

  markdownButton.click();

  assert.equal(markdownButton.attributes['aria-pressed'], 'true');
  assert.equal(markdownButton.classList.contains('active'), true);
  assert.equal(textBlock.classList.contains('markdown-enabled'), true);
  assert.equal(textBlock.children[0].tagName, 'ZERO-MD');

  markdownButton.click();

  assert.equal(markdownButton.attributes['aria-pressed'], 'false');
  assert.equal(markdownButton.classList.contains('active'), false);
  assert.equal(textBlock.classList.contains('markdown-enabled'), false);
  assert.equal(textBlock.children[0].classList.contains('txt-plain'), true);
  assert.equal(textBlock.children[0].textContent, markdownText);
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
    assert.equal(card.children[2].children[0].textContent, '');
  }
});

test('large stream-capable files are fully read and render every entry', async () => {
  const api = createHarness();
  const jsonlObjects = Array.from({ length: 60 }, (_, index) => ({
    type: 'user',
    timestamp: `2026-04-24T12:${String(index).padStart(2, '0')}:00Z`,
    message: { content: [{ type: 'text', text: `line ${index}` }] }
  }));
  const file = createStreamCapableFile('large.jsonl', jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n'));

  await api.handleFiles([file]);

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];

  assert.equal(file.counters.textCalls, 1);
  assert.equal(file.counters.streamCalls, 0);
  assert.equal(feed.children.length, 60);
  assert.equal(api.navListEl.children.length, 60);
  assert.match(api.statusEl.textContent, /Done\. Rendered 1 file\(s\)\./);
});

test('navigation click opens target tool entry after full parse', async () => {
  const api = createHarness();
  const jsonlObjects = [
    ...Array.from({ length: 15 }, (_, index) => ({
      type: 'user',
      timestamp: `2026-04-24T12:${String(index).padStart(2, '0')}:00Z`,
      message: { content: [{ type: 'text', text: `line ${index}` }] }
    })),
    {
      type: 'assistant',
      timestamp: '2026-04-24T12:15:00Z',
      message: {
        content: [{ type: 'tool_use', id: 'tool-full', name: 'Bash', input: { command: 'echo full' } }]
      }
    },
    {
      type: 'user',
      timestamp: '2026-04-24T12:15:01Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-full', content: 'full output' }]
      }
    }
  ];
  const file = createStreamCapableFile('large-tools.jsonl', jsonlObjects.map((objectItem) => JSON.stringify(objectItem)).join('\n'));

  await api.handleFiles([file]);

  const toolNavItem = api.navListEl.children[15];
  assert.ok(toolNavItem, 'target tool nav item should be rendered');

  toolNavItem.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const fileSection = api.outputEl.children[0];
  const feed = fileSection.children[1];
  const toolCard = feed.children[15];

  assert.equal(file.counters.textCalls, 1);
  assert.equal(file.counters.streamCalls, 0);
  assert.ok(toolCard, 'target tool card should be rendered');
  assert.equal(toolCard.classList.contains('tool'), true);
  assert.equal(toolCard.classList.contains('nav-target-highlight'), true);
  assert.equal(toolCard.children[1].tagName, 'DETAILS');
  assert.equal(toolCard.children[1].open, true);
  assert.equal(toolCard.children[1].children[0].textContent, 'Bash');
});

test('full JSONL parser reports invalid physical line numbers', async () => {
  const api = createHarness();
  const validLine = JSON.stringify({
    type: 'user',
    timestamp: '2026-04-24T12:00:00Z',
    message: { content: [{ type: 'text', text: 'ok' }] }
  });
  const file = createStreamCapableFile('broken.jsonl', `${validLine}\r\n\r\n{"type":`);

  await api.handleFiles([file]);

  const errorSection = api.outputEl.children[0];
  const pre = errorSection.children[1];

  assert.equal(file.counters.textCalls, 1);
  assert.equal(file.counters.streamCalls, 0);
  assert.equal(errorSection.children[0].textContent, 'broken.jsonl');
  assert.match(pre.textContent, /Invalid JSON on line 3/);
  assert.equal(api.statusEl.textContent, 'Done. Rendered 1 file(s).');
});
