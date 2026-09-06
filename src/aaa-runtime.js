import { TacticalAudio } from "./systems/audio.js";
import { LocalMultiplayerTransport } from "./net/netcode.js";

const audio = new TacticalAudio();
const net = new LocalMultiplayerTransport();
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

reducedMotion.addEventListener?.("change", () => document.documentElement.dataset.reducedMotion = reducedMotion.matches ? "1" : "0");
document.documentElement.dataset.reducedMotion = reducedMotion.matches ? "1" : "0";

const wsUrl = globalThis.location?.protocol === "https:" ? "wss://" + globalThis.location.host : "ws://" + globalThis.location.hostname + ":8787";
try {
  if (net.connect(wsUrl)) {
    net.on("open", () => status("NET ONLINE"));
    net.on("close", () => status("NET OFFLINE"));
    net.on("snapshot", (packet) => { window.dispatchEvent(new CustomEvent("chattY:snapshot", { detail: packet })); });
  }
} catch { status("NET UNAVAILABLE"); }

window.chattYRuntime = Object.freeze({ audio, net, reducedMotion });
