export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export const ARP_RATE_BEAT_FACTOR = {
  "1/4": 1, "1/4D": 1.5, "1/4T": 2 / 3,
  "1/8": 0.5, "1/8D": 0.75, "1/8T": 1 / 3,
  "1/16": 0.25, "1/16D": 0.375, "1/16T": 1 / 6,
};

export function createJunoChorus(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  input.connect(dryGain);
  dryGain.connect(output);

  // L: 0.4Hz (Chorus I), R: 0.6Hz (Chorus II), inverted sine for 180° stereo phase
  const lDelay = ctx.createDelay(0.03);
  const rDelay = ctx.createDelay(0.03);
  lDelay.delayTime.value = 0.007; // 7ms base (Juno spec)
  rDelay.delayTime.value = 0.008; // slight asymmetry like original circuit

  const lLfo = ctx.createOscillator();
  const rLfo = ctx.createOscillator();
  lLfo.type = "sine";
  lLfo.frequency.value = 0.4;
  rLfo.frequency.value = 0.6;
  // R gets -sin (180° phase) for max stereo width
  const rReal = new Float32Array([0, 0]);
  const rImag = new Float32Array([0, -1]);
  rLfo.setPeriodicWave(ctx.createPeriodicWave(rReal, rImag));

  const lDepth = ctx.createGain();
  const rDepth = ctx.createGain();
  lDepth.gain.value = 0;
  rDepth.gain.value = 0;
  lLfo.connect(lDepth); lDepth.connect(lDelay.delayTime);
  rLfo.connect(rDepth); rDepth.connect(rDelay.delayTime);

  // BBD-style LP on wet path (~6.5kHz = warmth/coloring)
  const lFilt = ctx.createBiquadFilter();
  const rFilt = ctx.createBiquadFilter();
  lFilt.type = "lowpass"; lFilt.frequency.value = 6500;
  rFilt.type = "lowpass"; rFilt.frequency.value = 6500;

  // Stereo spread (L left, R right)
  const lPan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  const rPan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (ctx.createStereoPanner) { lPan.pan.value = -0.65; rPan.pan.value = 0.65; }

  const lWet = ctx.createGain();
  const rWet = ctx.createGain();
  lWet.gain.value = 0;
  rWet.gain.value = 0;

  input.connect(lDelay); input.connect(rDelay);
  lDelay.connect(lFilt); lFilt.connect(lPan); lPan.connect(lWet); lWet.connect(output);
  rDelay.connect(rFilt); rFilt.connect(rPan); rPan.connect(rWet); rWet.connect(output);

  lLfo.start(); rLfo.start();

  return {
    input,
    output,
    setMix(amount) {
      const t = input.context.currentTime;
      dryGain.gain.setTargetAtTime(1 - amount * 0.18, t, 0.008);
      lWet.gain.setTargetAtTime(amount * 0.65, t, 0.008);
      rWet.gain.setTargetAtTime(amount * 0.65, t, 0.008);
      lDepth.gain.setTargetAtTime(amount * 0.003, t, 0.008);
      rDepth.gain.setTargetAtTime(amount * 0.003, t, 0.008);
    },
  };
}

export function createArpReverb(ctx) {
  // Hall-style IR: 2s decay, longer and bigger than before
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.0);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-2.8 * t) * (0.6 + 0.4 * Math.exp(-t * 4));
    }
    // Early reflections
    if (Math.floor(0.013 * sr) < len) d[Math.floor(0.013 * sr)] += 0.5;
    if (Math.floor(0.027 * sr) < len) d[Math.floor(0.027 * sr)] += 0.35;
    if (Math.floor(0.044 * sr) < len) d[Math.floor(0.044 * sr)] += 0.22;
    if (Math.floor(0.068 * sr) < len) d[Math.floor(0.068 * sr)] += 0.12;
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = ir;
  convolver.normalize = true;

  const send = ctx.createGain();
  send.gain.value = 0;
  const returnGain = ctx.createGain();
  returnGain.gain.value = 0.70;

  send.connect(convolver);
  convolver.connect(returnGain);

  return {
    send,
    returnGain,
    setSend(amount) {
      const t = send.context.currentTime;
      send.gain.setTargetAtTime(amount * 1.85, t, 0.008);
    },
  };
}

export function createArpEQ(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 20; hp.Q.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 20000; lp.Q.value = 1.2;
  hp.connect(lp);
  return {
    input: hp,
    output: lp,
    setLowCut(hz) {
      const t = hp.context.currentTime;
      hp.frequency.cancelScheduledValues(t);
      hp.frequency.setTargetAtTime(Math.max(20, hz), t, 0.008);
    },
    setHighCut(hz) {
      const t = lp.context.currentTime;
      lp.frequency.cancelScheduledValues(t);
      lp.frequency.setTargetAtTime(Math.min(20000, hz), t, 0.008);
    },
  };
}

export function createArpSaturator(ctx) {
  function makeTubeCurve(drive) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = drive * 80 + 0.001;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      const tube = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
      const tanhSat = Math.tanh(x * (1 + k * 0.28));
      curve[i] = tube * 0.4 + tanhSat * 0.6;
    }
    return curve;
  }
  const ws = ctx.createWaveShaper();
  ws.oversample = "2x";
  ws.curve = makeTubeCurve(0.001);
  const preGain = ctx.createGain();
  const postGain = ctx.createGain();
  const trimGain = ctx.createGain();
  preGain.gain.value = 1; postGain.gain.value = 1;
  trimGain.gain.value = 0.35; 
  preGain.connect(ws); ws.connect(postGain); postGain.connect(trimGain);
  return {
    input: preGain,
    output: trimGain,
    setDrive(amount) {
      ws.curve = makeTubeCurve(amount);
      preGain.gain.value = 1 + amount * 2.5;
      postGain.gain.value = 1 / (1 + amount * 1.2);
    },
  };
}

export function createArpLFO(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();

  // Tremolo stage
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 1;

  // Auto-filter stage (20kHz = transparent passthrough when inactive)
  const lpFilter = ctx.createBiquadFilter();
  lpFilter.type = "lowpass";
  lpFilter.frequency.value = 20000;
  lpFilter.Q.value = 3;

  // Auto-pan stage
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

  input.connect(tremoloGain);
  tremoloGain.connect(lpFilter);
  if (panner) { lpFilter.connect(panner); panner.connect(output); }
  else lpFilter.connect(output);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 2;
  lfo.start();

  const tremoloDepth = ctx.createGain();
  const filterDepth = ctx.createGain();
  const panDepth = ctx.createGain();
  tremoloDepth.gain.value = 0;
  filterDepth.gain.value = 0;
  panDepth.gain.value = 0;

  lfo.connect(tremoloDepth);
  lfo.connect(filterDepth);
  if (panner) lfo.connect(panDepth);

  tremoloDepth.connect(tremoloGain.gain);
  filterDepth.connect(lpFilter.frequency);
  if (panner) panDepth.connect(panner.pan);

  let _depth = 0;
  let _target = "tremolo";

  function applyDepths() {
    const t = input.context.currentTime;
    tremoloDepth.gain.setTargetAtTime(_target === "tremolo" && _depth > 0 ? _depth * 0.85 : 0, t, 0.008);
    if (_target === "filter" && _depth > 0) {
      lpFilter.frequency.setTargetAtTime(1200, t, 0.008);
      filterDepth.gain.setTargetAtTime(_depth * 1000, t, 0.008);
    } else {
      lpFilter.frequency.setTargetAtTime(20000, t, 0.008);
      filterDepth.gain.setTargetAtTime(0, t, 0.008);
    }
    if (panner) panDepth.gain.setTargetAtTime(_target === "pan" && _depth > 0 ? _depth * 0.9 : 0, t, 0.008);
  }

  return {
    input,
    output,
    setRate(hz) { lfo.frequency.value = Math.max(0.05, Math.min(12, hz)); },
    setDepth(amount) { _depth = Math.max(0, Math.min(1, amount)); applyDepths(); },
    setShape(shape) { lfo.type = shape; },
    setTarget(target) { _target = target; applyDepths(); },
  };
}

export function createArpDelay(ctx) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.375;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0;
  const output = ctx.createGain();
  input.connect(delay);
  delay.connect(feedback); feedback.connect(delay);
  delay.connect(wetGain); wetGain.connect(output);
  return {
    input, output,
    setTime(s) {
      const t = delay.context.currentTime;
      delay.delayTime.cancelScheduledValues(t);
      delay.delayTime.setTargetAtTime(Math.max(0.001, Math.min(2.0, s)), t, 0.020);
    },
    setFeedback(amount) { feedback.gain.value = Math.min(0.88, amount); },
    setWet(amount) {
      const t = wetGain.context.currentTime;
      wetGain.gain.setTargetAtTime(amount, t, 0.008);
    },
  };
}
