import { TacticalAudio } from "./systems/audio.js";
import { PerformanceTelemetry } from "./systems/performance.js";
import { LocalMultiplayerTransport } from "./net/netcode.js";

const audio = new TacticalAudio();
const perf = new PerformanceTelemetry();
const net = new LocalMultiplayerTransport({ reconnect: true });
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function status(text) {
  const node = document.querySelector("#debug");
  if (node) node.dataset.runtime = text;
}

function bootAudio() {
  audio.init();
  audio.resume();
}

document.addEventListener("click", (event) => {
  if (event.target.closest("button")) { bootAudio(); audio.ui(); }
}, { passive: true });
document.addEventListener("mousedown", (event) => {
  if (event.button === 0) { bootAudio(); audio.fire(); }
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") { bootAudio(); audio.reload(); }
}, { passive: true });

reducedMotion.addEventListener?.("change", () => {
  document.documentElement.dataset.reducedMotion = reducedMotion.matches ? "1" : "0";
});
document.documentElement.dataset.reducedMotion = reducedMotion.matches ? "1" : "0";

perf.start();
setInterval(() => {
  const sample = perf.sample();
  document.documentElement.dataset.perf = perf.status();
  const node = document.querySelector("#debug");
  if (node) {
    node.dataset.fps = sample.fps.toFixed(1);
    node.dataset.frameMs = sample.p95FrameMs.toFixed(2);
    node.dataset.longTasks = String(sample.longTasks);
    if (sample.heapMb !== null) node.dataset.heapMb = sample.heapMb.toFixed(1);
  }
}, 1000);

const wsUrl = globalThis.location?.protocol === "https:"
  ? "wss://" + globalThis.location.host
  : "ws://" + globalThis.location.hostname + ":8787";

try {
  if (net.connect(wsUrl)) {
    net.on("open", () => status("NET ONLINE"));
    net.on("close", () => status("NET RECONNECTING"));
    net.on("error", () => status("NET ERROR"));
    net.on("rtt", (rtt) => {
      const node = document.querySelector("#debug");
      if (node) node.dataset.rtt = `${Math.round(rtt)}ms`;
    });
    net.on("snapshot", (packet) => {
      window.dispatchEvent(new CustomEvent("chattY:snapshot", { detail: packet }));
    });
    net.on("protocol_error", () => status("NET PROTOCOL ERROR"));
    setInterval(() => net.connected && net.ping(), 5000);
  }
} catch {
  status("NET UNAVAILABLE");
}

window.chattYRuntime = Object.freeze({ audio, perf, net, reducedMotion });
window.addEventListener("pagehide", () => {
  perf.dispose();
  net.close();
}, { once: true });
