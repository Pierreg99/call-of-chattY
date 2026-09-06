export class TacticalAudio {
  constructor() { this.ctx = null; this.master = null; this.ready = false; }
  init() {
    if (this.ready) return;
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);
    this.ready = true;
  }
  resume() { if (this.ctx?.state === "suspended") this.ctx.resume(); }
  tone({ frequency=440, duration=.08, type="sine", volume=.2, sweep=0 }={}) {
    if (!this.ready) return;
    const now=this.ctx.currentTime, osc=this.ctx.createOscillator(), gain=this.ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(frequency,now);
    if(sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20,frequency+sweep),now+duration);
    gain.gain.setValueAtTime(volume,now); gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain).connect(this.master); osc.start(now); osc.stop(now+duration+.01);
  }
  fire(){ this.tone({frequency:1250,duration:.055,type:"square",volume:.18,sweep:-620}); this.tone({frequency:92,duration:.11,type:"sawtooth",volume:.09,sweep:180}); }
  hit(){ this.tone({frequency:1800,duration:.045,type:"triangle",volume:.12,sweep:-500}); }
  death(){ this.tone({frequency:210,duration:.16,type:"sawtooth",volume:.12,sweep:-130}); }
  reload(){ this.tone({frequency:540,duration:.07,type:"triangle",volume:.08,sweep:-120}); setTimeout(()=>this.tone({frequency:220,duration:.11,type:"triangle",volume:.07,sweep:160}),110); }
  damage(){ this.tone({frequency:110,duration:.12,type:"sine",volume:.08,sweep:-50}); }
  ui(){ this.tone({frequency:760,duration:.035,type:"triangle",volume:.05,sweep:60}); }
}
