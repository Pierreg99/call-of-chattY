const DEFAULT_WINDOW = 120;

/**
 * Lightweight main-thread telemetry for a real-time browser game.
 * It measures frame pacing, long tasks and optional JS heap data without
 * changing the game simulation itself. This keeps diagnostics safe to ship.
 */
export class PerformanceTelemetry {
  constructor({ windowSize = DEFAULT_WINDOW, targetFrameMs = 16.67 } = {}) {
    this.windowSize = Math.max(30, Math.trunc(windowSize));
    this.targetFrameMs = targetFrameMs;
    this.frames = [];
    this.last = performance.now();
    this.started = false;
    this.longTasks = 0;
    this.totalLongTaskMs = 0;
    this.observer = null;
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.last = performance.now();
    if (typeof PerformanceObserver !== "undefined") {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTasks += 1;
            this.totalLongTaskMs += entry.duration;
          }
        });
        this.observer.observe({ type: "longtask", buffered: true });
      } catch {
        this.observer = null;
      }
    }
    this.sample();
    return this;
  }

  sample(now = performance.now()) {
    const dt = Math.max(0, now - this.last);
    this.last = now;
    if (dt > 0) {
      this.frames.push(dt);
      if (this.frames.length > this.windowSize) this.frames.shift();
    }
    return this.snapshot();
  }

  snapshot() {
    const frames = this.frames;
    if (!frames.length) return {
      fps: 0,
      frameMs: 0,
      p95FrameMs: 0,
      droppedFrameRatio: 0,
      longTasks: this.longTasks,
      longTaskMs: this.totalLongTaskMs,
      heapMb: null,
    };

    const sorted = [...frames].sort((a, b) => a - b);
    const total = frames.reduce((sum, value) => sum + value, 0);
    const avgMs = total / frames.length;
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const dropped = frames.filter((ms) => ms > this.targetFrameMs * 1.25).length;
    const memory = globalThis.performance?.memory;

    return {
      fps: 1000 / Math.max(0.001, avgMs),
      frameMs: avgMs,
      p95FrameMs: sorted[p95Index],
      droppedFrameRatio: dropped / frames.length,
      longTasks: this.longTasks,
      longTaskMs: this.totalLongTaskMs,
      heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
    };
  }

  status() {
    const s = this.snapshot();
    if (s.p95FrameMs > this.targetFrameMs * 1.75 || s.droppedFrameRatio > 0.15) return "DEGRADED";
    if (s.p95FrameMs > this.targetFrameMs * 1.35 || s.droppedFrameRatio > 0.05) return "WATCH";
    return "STABLE";
  }

  dispose() {
    this.observer?.disconnect();
    this.observer = null;
    this.started = false;
  }
}
