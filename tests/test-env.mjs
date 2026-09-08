/**
 * Realistic Node.js Browser Environment Shim for FPS Engine Testing.
 * Provides standard DOM, Event, WebAudio, and WebSocket globals
 * without external heavy dependencies.
 */

class MockDOMElement {
  constructor(id = "", tagName = "div") {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.style = {
      display: "",
      transform: "",
    };
    this.classList = {
      _classes: new Set(),
      add: (...names) => names.forEach((n) => this.classList._classes.add(n)),
      remove: (...names) => names.forEach((n) => this.classList._classes.delete(n)),
      contains: (n) => this.classList._classes.has(n),
      toggle: (n) => {
        if (this.classList._classes.has(n)) {
          this.classList._classes.delete(n);
          return false;
        }
        this.classList._classes.add(n);
        return true;
      },
    };
    this.listeners = new Map();
    this.offsetWidth = 120;
    this.offsetHeight = 120;
    this.children = [];
    this.parentElement = null;
    this.capturedPointers = new Set();
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.offsetWidth,
      bottom: this.offsetHeight,
      width: this.offsetWidth,
      height: this.offsetHeight,
      x: 0,
      y: 0,
    };
  }

  addEventListener(type, fn, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ fn, options });
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      list.filter((l) => l.fn !== fn)
    );
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    const list = this.listeners.get(event.type) || [];
    for (const item of list) {
      item.fn(event);
      if (item.options?.once) {
        this.removeEventListener(event.type, item.fn);
      }
    }
    return !event.defaultPrevented;
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointers.delete(pointerId);
  }

  closest(selector) {
    if (selector.startsWith("#") && this.id === selector.slice(1)) return this;
    if (selector.startsWith(".") && this.classList.contains(selector.slice(1))) return this;
    return null;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
}

class MockAudioParam {
  constructor(defaultValue = 1) {
    this.value = defaultValue;
    this.events = [];
  }

  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: "setValueAtTime", value: val, time });
  }

  exponentialRampToValueAtTime(val, time) {
    this.events.push({ type: "exponentialRampToValueAtTime", value: val, time });
  }

  linearRampToValueAtTime(val, time) {
    this.events.push({ type: "linearRampToValueAtTime", value: val, time });
  }
}

class MockAudioNode {
  constructor(ctx) {
    this.context = ctx;
    this.connectedTo = [];
  }

  connect(dest) {
    this.connectedTo.push(dest);
    return dest;
  }

  disconnect(dest) {
    if (!dest) {
      this.connectedTo = [];
    } else {
      this.connectedTo = this.connectedTo.filter((d) => d !== dest);
    }
  }
}

class MockGainNode extends MockAudioNode {
  constructor(ctx, defaultGain = 1) {
    super(ctx);
    this.gain = new MockAudioParam(defaultGain);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = "sine";
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
    this.startTime = null;
    this.stopTime = null;
  }

  start(time = 0) {
    this.started = true;
    this.startTime = time;
  }

  stop(time = 0) {
    this.stopped = true;
    this.stopTime = time;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = "lowpass";
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockStereoPannerNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.pan = new MockAudioParam(0);
  }
}

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._channels = [];
    for (let c = 0; c < channels; c++) {
      this._channels.push(new Float32Array(length));
    }
  }

  getChannelData(c) {
    return this._channels[c];
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.started = false;
    this.stopped = false;
  }

  start(time = 0) {
    this.started = true;
  }

  stop(time = 0) {
    this.stopped = true;
  }
}

export class MockAudioContext {
  constructor() {
    this.state = "suspended";
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.destination = new MockAudioNode(this);
    this.nodesCreated = [];
    this.resumeCallCount = 0;
  }

  async resume() {
    this.resumeCallCount++;
    this.state = "running";
    return Promise.resolve();
  }

  async suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }

  createGain() {
    const node = new MockGainNode(this);
    this.nodesCreated.push(node);
    return node;
  }

  createOscillator() {
    const node = new MockOscillatorNode(this);
    this.nodesCreated.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new MockBiquadFilterNode(this);
    this.nodesCreated.push(node);
    return node;
  }

  createStereoPanner() {
    const node = new MockStereoPannerNode(this);
    this.nodesCreated.push(node);
    return node;
  }

  createBuffer(channels, length, sampleRate) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }

  createBufferSource() {
    const node = new MockAudioBufferSourceNode(this);
    this.nodesCreated.push(node);
    return node;
  }
}

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sentMessages = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;

    // Auto-open in next microtask
    queueMicrotask(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        if (this.onopen) this.onopen();
      }
    });
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  // Test helper to simulate incoming server message
  simulateMessage(payload) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  simulateError() {
    if (this.onerror) this.onerror(new Error("Simulated socket error"));
  }
}

export class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    Object.assign(this, init);
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

// Global Environment Setup
const elements = new Map();

function getOrCreateElement(id) {
  if (!elements.has(id)) {
    elements.set(id, new MockDOMElement(id));
  }
  return elements.get(id);
}

const windowListeners = new Map();

const mockWindow = {
  addEventListener(type, fn, options = {}) {
    const list = windowListeners.get(type) || [];
    list.push({ fn, options });
    windowListeners.set(type, list);
  },
  removeEventListener(type, fn) {
    const list = windowListeners.get(type) || [];
    windowListeners.set(
      type,
      list.filter((l) => l.fn !== fn)
    );
  },
  dispatchEvent(event) {
    const list = windowListeners.get(event.type) || [];
    for (const item of list) {
      item.fn(event);
      if (item.options?.once) {
        this.removeEventListener(event.type, item.fn);
      }
    }
    return !event.defaultPrevented;
  },
  matchMedia(query) {
    return {
      matches: false,
      media: query,
      addListener: () => {},
      removeListener: () => {},
    };
  },
  location: {
    search: "",
  },
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
  WebSocket: MockWebSocket,
};

const mockDocument = {
  body: new MockDOMElement("body", "body"),
  getElementById(id) {
    return getOrCreateElement(id);
  },
  createElement(tag) {
    return new MockDOMElement("", tag);
  },
  addEventListener(type, fn, options) {
    mockWindow.addEventListener(type, fn, options);
  },
  removeEventListener(type, fn) {
    mockWindow.removeEventListener(type, fn);
  },
  dispatchEvent(event) {
    return mockWindow.dispatchEvent(event);
  },
};

const mockNavigator = {
  maxTouchPoints: 0,
};

export function setupEnvironment({ touch = false, touchPoints = 5 } = {}) {
  elements.clear();
  windowListeners.clear();

  // Pre-seed necessary FPS HUD & control elements
  const standardIds = [
    "touch-controls-layer",
    "joystick-zone",
    "joystick-thumb",
    "touch-look-zone",
    "touch-btn-fire",
    "touch-btn-ads",
    "touch-btn-jump",
    "touch-btn-reload",
    "touch-btn-sprint",
    "touch-btn-swap",
    "app",
    "damage",
    "reticle",
    "ammo-counter",
  ];
  for (const id of standardIds) {
    getOrCreateElement(id);
  }

  if (touch) {
    mockWindow.ontouchstart = () => {};
    mockNavigator.maxTouchPoints = touchPoints;
    mockWindow.matchMedia = (q) => ({
      matches: q.includes("coarse"),
      media: q,
      addListener: () => {},
      removeListener: () => {},
    });
  } else {
    delete mockWindow.ontouchstart;
    mockNavigator.maxTouchPoints = 0;
    mockWindow.matchMedia = () => ({
      matches: false,
      media: "",
      addListener: () => {},
      removeListener: () => {},
    });
  }

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.navigator = mockNavigator;
  globalThis.AudioContext = MockAudioContext;
  globalThis.webkitAudioContext = MockAudioContext;
  globalThis.WebSocket = MockWebSocket;
  globalThis.Event = MockEvent;
  globalThis.CustomEvent = MockEvent;
  globalThis.MouseEvent = MockEvent;
  globalThis.TouchEvent = MockEvent;
  globalThis.PointerEvent = MockEvent;
  globalThis.KeyboardEvent = MockEvent;

  return {
    window: mockWindow,
    document: mockDocument,
    navigator: mockNavigator,
    elements,
  };
}

// Automatically setup default environment on import
setupEnvironment();
