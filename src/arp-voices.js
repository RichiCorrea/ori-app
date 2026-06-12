function _makeTanh(k) {
  const c = new Float32Array(256), d = Math.tanh(k);
  for (let i = 0; i < 256; i++) { const x = (i*2)/255-1; c[i] = Math.tanh(k*x)/d; }
  return c;
}
const _CURVE_PLUCK  = _makeTanh(2);
const _CURVE_ANALOG = _makeTanh(2.5);
const _CURVE_BASS   = _makeTanh(3);
const _CURVE_GATED  = _makeTanh(4);

let _ncCtx = null, _nc = {};
function _getNoise(ctx, key, lenMs, fill) {
  if (_ncCtx !== ctx) { _ncCtx = ctx; _nc = {}; }
  if (!_nc[key]) {
    const n = Math.floor(ctx.sampleRate * lenMs / 1000);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    fill(b.getChannelData(0), n);
    _nc[key] = b;
  }
  return _nc[key];
}

export function playArpNote(freq, time, duration, gainMod = 1, ctx, voice, outputNode) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  const env = ctx.createGain();

  if (voice === "bell") {
    // Bell: 5 inharmonic partials incl 8.93x shimmer — shiny/sparkly (taxonomy #3)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const osc4 = ctx.createOscillator();
    const osc5 = ctx.createOscillator(); // 8.93x ultra-high shimmer at attack
    osc1.type = "sine"; osc2.type = "sine"; osc3.type = "sine"; osc4.type = "sine"; osc5.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 2.756, time);
    osc3.frequency.setValueAtTime(freq * 5.404, time);
    osc4.frequency.setValueAtTime(freq * 0.997, time);
    osc5.frequency.setValueAtTime(Math.min(freq * 8.93, 18000), time);
    const ringOut = time + Math.max(0.85, duration * 2.2);
    const p2 = ctx.createGain(); const p3 = ctx.createGain(); const p4 = ctx.createGain(); const p5 = ctx.createGain();
    p2.gain.setValueAtTime(0.28, time);
    p2.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.65, duration * 1.6));
    p3.gain.setValueAtTime(0.12, time);
    p3.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.22, duration * 0.7));
    p4.gain.setValueAtTime(0.15, time);
    p4.gain.exponentialRampToValueAtTime(0.001, ringOut);
    p5.gain.setValueAtTime(0.07, time);
    p5.gain.exponentialRampToValueAtTime(0.001, time + 0.018);
    osc2.connect(p2); osc3.connect(p3); osc4.connect(p4); osc5.connect(p5);
    osc1.connect(filter); p2.connect(filter); p3.connect(filter); p4.connect(filter); p5.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 8, 12000), time);
    filter.Q.setValueAtTime(0.3, time);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.66, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, ringOut);
    osc1.start(time); osc1.stop(ringOut + 0.05);
    osc2.start(time); osc2.stop(ringOut + 0.05);
    osc3.start(time); osc3.stop(time + Math.min(0.25, duration * 0.8));
    osc4.start(time); osc4.stop(ringOut + 0.05);
    osc5.start(time); osc5.stop(time + 0.022);

  } else if (voice === "keys") {
    // E.Piano (Rhodes): sine fund + inharmonic tine at 2.003x + click — warm/intimate (taxonomy #10)
    const osc1 = ctx.createOscillator(); // fundamental
    const osc2 = ctx.createOscillator(); // tine partial — slightly inharmonic Rhodes character
    const osc3 = ctx.createOscillator(); // 5th overtone shimmer, fast decay
    osc1.type = "sine"; osc2.type = "sine"; osc3.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 2.003, time); // slightly sharp tine = Rhodes timbre
    osc3.frequency.setValueAtTime(freq * 5.01, time);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.30, time); // tine decays faster than fundamental
    g2.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.22, duration * 0.55));
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.05, time);
    g3.gain.exponentialRampToValueAtTime(0.001, time + 0.030);
    osc2.connect(g2); osc3.connect(g3);
    osc1.connect(filter); g2.connect(filter); g3.connect(filter);
    const clickLen = Math.floor(ctx.sampleRate * 0.007);
    const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) {
      cd[i] = Math.sin(2 * Math.PI * freq * 2.8 * i / ctx.sampleRate) * (1 - i / clickLen) * 0.7;
    }
    const click = ctx.createBufferSource(); click.buffer = clickBuf;
    const clickG = ctx.createGain(); clickG.gain.value = 0.22;
    click.connect(clickG); clickG.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 5, 3600), time);
    filter.Q.setValueAtTime(0.5, time);
    const decay = Math.min(0.18, duration * 0.45);
    const release = Math.min(0.12, duration * 0.3);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.62, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.40, time + decay);
    env.gain.setValueAtTime(0.40, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.22);
    osc2.start(time); osc2.stop(time + Math.min(0.25, duration * 0.6));
    osc3.start(time); osc3.stop(time + 0.034);
    click.start(time); click.stop(time + 0.009);

  } else if (voice === "mallet") {
    // Mallet (Kalimba): sines + wood noise + metallic tine noise — organic/intimate (taxonomy #4)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    osc1.type = "sine"; osc2.type = "sine"; osc3.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 2.003, time);
    osc3.frequency.setValueAtTime(freq * 4.01, time);
    const h2 = ctx.createGain(); h2.gain.value = 0.20;
    const h3 = ctx.createGain();
    h3.gain.setValueAtTime(0.08, time);
    h3.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc2.connect(h2); osc3.connect(h3); h2.connect(filter); h3.connect(filter);
    const nBuf = _getNoise(ctx, 'noise14ms', 14, (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i/n); });
    const nSrc = ctx.createBufferSource(); nSrc.buffer = nBuf;
    const woodBP = ctx.createBiquadFilter();
    woodBP.type = "bandpass"; woodBP.frequency.value = Math.min(freq * 2, 900); woodBP.Q.value = 6;
    // Metal tine "ting" — higher BP (kalimba tine ring character)
    const nSrc2 = ctx.createBufferSource(); nSrc2.buffer = nBuf;
    const metalBP = ctx.createBiquadFilter();
    metalBP.type = "bandpass"; metalBP.frequency.value = Math.min(freq * 5, 3200); metalBP.Q.value = 10;
    const metalG = ctx.createGain(); metalG.gain.value = 0.30;
    nSrc.connect(woodBP); woodBP.connect(filter);
    nSrc2.connect(metalBP); metalBP.connect(metalG); metalG.connect(filter);
    osc1.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 5.5, 5000), time);
    filter.Q.setValueAtTime(0.9, time);
    const decayT = Math.min(0.22, duration * 0.55);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.78, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.06, time + decayT);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.08);
    osc2.start(time); osc2.stop(time + Math.min(0.18, duration * 0.5));
    osc3.start(time); osc3.stop(time + 0.05);
    nSrc.start(time); nSrc.stop(time + 0.016);
    nSrc2.start(time); nSrc2.stop(time + 0.016);

  } else if (voice === "pad") {
    // Pad-arp hybrid: 4 detuned saws + sub sine + evolving filter — cinematic/emotional (taxonomy #7)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator(); // sub octave
    const osc4 = ctx.createOscillator(); // 4th saw for ensemble thickness
    osc1.type = "sawtooth"; osc2.type = "sawtooth"; osc3.type = "sine"; osc4.type = "sawtooth";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.0058, time);
    osc3.frequency.setValueAtTime(freq * 0.5, time);
    osc4.frequency.setValueAtTime(freq * 0.9965, time); // -6.1 cents — wider Jupiter-8 ensemble
    const g2 = ctx.createGain(); g2.gain.value = 0.80;
    const g3 = ctx.createGain(); g3.gain.value = 0.38; // heavier sub (Jupiter unison weight)
    const g4 = ctx.createGain(); g4.gain.value = 0.55;
    osc2.connect(g2); osc3.connect(g3); osc4.connect(g4);
    osc1.connect(filter); g2.connect(filter); g3.connect(filter); g4.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 1.5, 700), time); // darker start
    filter.frequency.linearRampToValueAtTime(Math.min(freq * 5, 3800), time + Math.min(0.45, duration * 0.8)); // slower Jupiter bloom
    filter.Q.setValueAtTime(0.7, time);
    const attack = Math.min(0.08, duration * 0.25);
    const release = Math.min(0.18, duration * 0.4);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.55, time + attack);
    env.gain.setValueAtTime(0.55, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.25);
    osc2.start(time); osc2.stop(time + duration + 0.25);
    osc3.start(time); osc3.stop(time + duration + 0.25);
    osc4.start(time); osc4.stop(time + duration + 0.25);

  } else if (voice === "glass") {
    // Glass/Crystal: 4 sines incl 2.997x sparkle partial — ethereal worship (taxonomy #3/#7)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator(); // 1.498x near-5th shimmer
    const osc4 = ctx.createOscillator(); // 2.997x near-3rd-octave sparkle
    osc1.type = "sine"; osc2.type = "sine"; osc3.type = "sine"; osc4.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.002, time);
    osc3.frequency.setValueAtTime(freq * 1.498, time);
    osc4.frequency.setValueAtTime(freq * 2.997, time);
    const g2 = ctx.createGain(); g2.gain.value = 0.65;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.001, time);
    g3.gain.linearRampToValueAtTime(0.25, time + Math.min(0.1, duration * 0.4));
    const g4 = ctx.createGain();
    g4.gain.setValueAtTime(0.001, time);
    g4.gain.linearRampToValueAtTime(0.09, time + Math.min(0.14, duration * 0.45));
    osc2.connect(g2); osc3.connect(g3); osc4.connect(g4);
    osc1.connect(filter); g2.connect(filter); g3.connect(filter); g4.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 4, 7500), time);
    filter.Q.setValueAtTime(0.25, time);
    const attack = Math.min(0.07, duration * 0.28);
    const release = Math.min(0.18, duration * 0.45);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.50, time + attack);
    env.gain.setValueAtTime(0.50, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.22);
    osc2.start(time); osc2.stop(time + duration + 0.22);
    osc3.start(time); osc3.stop(time + duration + 0.22);
    osc4.start(time); osc4.stop(time + duration + 0.22);

  } else if (voice === "analog") {
    // Analog: saw + square + Juno sub-osc + wider detune + pre-filter tanh drive (taxonomy #2)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator(); // Juno-106 sub-oscillator (1 oct below)
    osc1.type = "sawtooth"; osc2.type = "square"; osc3.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.0052, time); // +9 cents — wider Juno chorus spread
    osc3.frequency.setValueAtTime(freq * 0.5, time);
    const g2   = ctx.createGain(); g2.gain.value   = 0.35;
    const gSub = ctx.createGain(); gSub.gain.value = 0.32;
    osc2.connect(g2); osc3.connect(gSub);
    // Juno/Prophet warmth: subtle tanh pre-filter saturation
    const drive = ctx.createWaveShaper();
    drive.curve = _CURVE_ANALOG;
    osc1.connect(drive); g2.connect(drive); gSub.connect(drive); drive.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 4, 2800), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.5, 960), time + 0.14); // darker settle
    filter.Q.setValueAtTime(3.2, time);
    const attack = Math.min(0.014, duration * 0.1);
    const release = Math.min(0.22, duration * 0.45);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.60, time + attack);
    env.gain.setValueAtTime(0.60, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.28);
    osc2.start(time); osc2.stop(time + duration + 0.28);
    osc3.start(time); osc3.stop(time + duration + 0.28);

  } else if (voice === "string") {
    // Pizzicato: plucked strings — sine fund + decaying harmonics + pluck noise (taxonomy #12 variant)
    const osc1 = ctx.createOscillator(); // fundamental
    const osc2 = ctx.createOscillator(); // 2nd harmonic — decays fast
    const osc3 = ctx.createOscillator(); // 3rd harmonic — decays fastest
    const osc4 = ctx.createOscillator(); // slight-detuned triangle for body warmth
    osc1.type = "sine"; osc2.type = "sine"; osc3.type = "sine"; osc4.type = "triangle";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 2.001, time);
    osc3.frequency.setValueAtTime(freq * 3.003, time);
    osc4.frequency.setValueAtTime(freq * 1.003, time);
    // Higher harmonics decay faster (natural string physics)
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.38, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.18, duration * 0.55));
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.14, time);
    g3.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.08, duration * 0.30));
    const g4 = ctx.createGain(); g4.gain.value = 0.22;
    osc2.connect(g2); osc3.connect(g3); osc4.connect(g4);
    osc1.connect(filter); g2.connect(filter); g3.connect(filter); g4.connect(filter);
    // Pluck attack: short BP noise burst (finger on string)
    const pBuf = _getNoise(ctx, 'noise12ms', 12, (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i/n); });
    const pSrc = ctx.createBufferSource(); pSrc.buffer = pBuf;
    const pBP = ctx.createBiquadFilter();
    pBP.type = "bandpass"; pBP.frequency.value = Math.min(freq * 3, 2500); pBP.Q.value = 5;
    const pG = ctx.createGain(); pG.gain.value = 0.30;
    pSrc.connect(pBP); pBP.connect(pG); pG.connect(filter);
    // Filter: bright at pluck → warms as harmonics decay
    filter.frequency.setValueAtTime(Math.min(freq * 8, 6000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 3, 2200), time + 0.06);
    filter.Q.setValueAtTime(0.5, time);
    const decay = Math.min(0.22, duration * 0.65);
    const release = Math.min(0.08, duration * 0.22);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.68, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.15, time + decay);
    env.gain.setValueAtTime(0.15, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.15);
    osc2.start(time); osc2.stop(time + Math.min(0.22, duration * 0.6));
    osc3.start(time); osc3.stop(time + Math.min(0.10, duration * 0.35));
    osc4.start(time); osc4.stop(time + duration + 0.15);
    pSrc.start(time); pSrc.stop(time + 0.014);

  } else if (voice === "texture") {
    // Texture: 3 formant BP bands on noise + louder sines = choir vowel with clear pitch (taxonomy #8)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = _getNoise(ctx, 'long2s', 2000, (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    noiseSrc.loop = true;
    // Three formant bands: fundamental + 2nd formant + 3rd formant (vowel "Ah" quality)
    const bp1 = ctx.createBiquadFilter();
    bp1.type = "bandpass"; bp1.frequency.value = freq; bp1.Q.value = 22;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass"; bp2.frequency.value = freq * 2.8; bp2.Q.value = 14;
    const bp3 = ctx.createBiquadFilter();
    bp3.type = "bandpass"; bp3.frequency.value = freq * 4.8; bp3.Q.value = 9;
    const nG1 = ctx.createGain(); nG1.gain.value = 0.55;
    const nG2 = ctx.createGain(); nG2.gain.value = 0.35;
    const nG3 = ctx.createGain(); nG3.gain.value = 0.20;
    noiseSrc.connect(bp1); noiseSrc.connect(bp2); noiseSrc.connect(bp3);
    bp1.connect(nG1); bp2.connect(nG2); bp3.connect(nG3);
    nG1.connect(filter); nG2.connect(filter); nG3.connect(filter);
    // Louder pitched sines for clear pitch definition
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine"; osc2.type = "sine";
    osc1.frequency.setValueAtTime(freq * 0.998, time);
    osc2.frequency.setValueAtTime(freq * 1.003, time);
    const sg1 = ctx.createGain(); sg1.gain.value = 0.38;
    const sg2 = ctx.createGain(); sg2.gain.value = 0.28;
    osc1.connect(sg1); osc2.connect(sg2);
    sg1.connect(filter); sg2.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 6, 10000), time);
    filter.Q.setValueAtTime(0.3, time);
    const attack = Math.min(0.065, duration * 0.22); // shorter attack for definition
    const release = Math.min(0.22, duration * 0.45);
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(0.52, time + attack);
    env.gain.setValueAtTime(0.52, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    noiseSrc.start(time); noiseSrc.stop(time + duration + 0.38);
    osc1.start(time); osc1.stop(time + duration + 0.38);
    osc2.start(time); osc2.stop(time + duration + 0.38);

  } else if (voice === "fm") {
    // FM Digital: carrier + dual modulators (3.5x + sqrt2) — glassy/metallic (taxonomy #11)
    const carrier = ctx.createOscillator();
    const mod1 = ctx.createOscillator(); // 3.5x primary bell FM
    const mod2 = ctx.createOscillator(); // 1.414x metallic transient complexity
    carrier.type = "sine"; mod1.type = "sine"; mod2.type = "sine";
    carrier.frequency.setValueAtTime(freq, time);
    mod1.frequency.setValueAtTime(freq * 3.5, time);
    mod2.frequency.setValueAtTime(freq * 1.414, time);
    const modGain1 = ctx.createGain();
    modGain1.gain.setValueAtTime(freq * 1.8, time);
    modGain1.gain.exponentialRampToValueAtTime(freq * 0.12, time + Math.min(0.1, duration * 0.35));
    modGain1.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.45, duration * 0.85));
    const modGain2 = ctx.createGain(); // fast decay = metallic attack transient only
    modGain2.gain.setValueAtTime(freq * 0.9, time);
    modGain2.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.045, duration * 0.15));
    mod1.connect(modGain1); mod2.connect(modGain2);
    modGain1.connect(carrier.frequency); modGain2.connect(carrier.frequency);
    carrier.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 10, 14000), time);
    filter.Q.setValueAtTime(0.25, time);
    const ringOut = time + Math.max(0.55, duration * 1.8);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.62, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, ringOut);
    carrier.start(time); carrier.stop(ringOut + 0.05);
    mod1.start(time); mod1.stop(ringOut + 0.05);
    mod2.start(time); mod2.stop(time + Math.min(0.055, duration * 0.18));

  } else if (voice === "bass") {
    // Moog/Juno/Prophet bass: saw + detuned saw + sub-square + pre-filter tanh drive + resonant LP punch
    const osc1 = ctx.createOscillator();  // main sawtooth (Moog/Prophet)
    const osc2 = ctx.createOscillator();  // detuned saw +4.7 cents (unison width)
    const sub  = ctx.createOscillator();  // sub octave square (Juno sub-osc)
    osc1.type = "sawtooth"; osc2.type = "sawtooth"; sub.type = "square";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.0027, time);
    sub.frequency.setValueAtTime(freq * 0.5, time);
    const g2   = ctx.createGain(); g2.gain.value   = 0.65;
    const gSub = ctx.createGain(); gSub.gain.value = 0.45;
    osc2.connect(g2);
    // Pre-mix into single node → WaveShaper (Moog pre-filter drive)
    const preGain = ctx.createGain(); preGain.gain.value = 0.38;
    osc1.connect(preGain); g2.connect(preGain); gSub.connect(preGain);
    const drive = ctx.createWaveShaper();
    drive.curve = _CURVE_BASS;
    sub.connect(gSub); preGain.connect(drive); drive.connect(filter);
    // Moog ladder punch: bright resonant attack → warm dark sustain in 70ms
    filter.frequency.setValueAtTime(Math.min(freq * 10, 3800), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.5, 500), time + 0.070);
    filter.Q.setValueAtTime(5.5, time);
    filter.Q.exponentialRampToValueAtTime(2.2, time + 0.120);
    const release = Math.min(0.28, duration * 0.32);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.76, time + 0.002); // 2ms attack — punchy
    env.gain.setValueAtTime(0.76, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    const stopT = time + duration + 0.35;
    osc1.start(time); osc1.stop(stopT);
    osc2.start(time); osc2.stop(stopT);
    sub.start(time);  sub.stop(stopT);

  } else if (voice === "gated") {
    // Gated: square + sub + click transient — rhythmic/pulsing (taxonomy #9)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "square"; osc2.type = "square";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 0.5, time);
    const g2 = ctx.createGain(); g2.gain.value = 0.50; // heavier sub
    // Moog-style pre-filter grit on square wave
    const drive = ctx.createWaveShaper();
    drive.curve = _CURVE_GATED;
    osc2.connect(g2); osc1.connect(drive); g2.connect(drive);
    // Tight noise burst at gate onset for sharp click punch
    const clickBuf = _getNoise(ctx, 'click3ms', 3, (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i/n); });
    const clickSrc = ctx.createBufferSource(); clickSrc.buffer = clickBuf;
    const clickBP = ctx.createBiquadFilter();
    clickBP.type = "bandpass"; clickBP.frequency.value = Math.min(freq * 3, 2400); clickBP.Q.value = 4;
    const clickG = ctx.createGain(); clickG.gain.value = 0.28;
    clickSrc.connect(clickBP); clickBP.connect(clickG); clickG.connect(drive); drive.connect(filter);
    filter.frequency.setValueAtTime(Math.min(freq * 5, 3200), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2.2, 1600), time + 0.04);
    filter.Q.setValueAtTime(2.5, time); // more resonant punch
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.65, time + 0.002);
    env.gain.setValueAtTime(0.65, time + duration - 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.02);
    osc2.start(time); osc2.stop(time + duration + 0.02);
    clickSrc.start(time); clickSrc.stop(time + 0.005);

  } else if (voice === "reverse") {
    // Reverse: 4-layer swell (saws + sub + noise breath) + evolving harmonics — spectral/textural
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const osc4 = ctx.createOscillator();
    osc1.type = "sawtooth"; osc2.type = "sawtooth";
    osc3.type = "triangle"; osc4.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.0038, time);  // slight detune for width
    osc3.frequency.setValueAtTime(freq * 2.001, time);   // octave harmonic builds in
    osc4.frequency.setValueAtTime(freq * 0.5, time);     // sub for weight at peak
    const g2 = ctx.createGain(); g2.gain.value = 0.75;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.001, time);
    g3.gain.linearRampToValueAtTime(0.22, time + duration * 0.7);  // octave fades in late
    const g4 = ctx.createGain();
    g4.gain.setValueAtTime(0.001, time);
    g4.gain.linearRampToValueAtTime(0.30, time + duration * 0.50); // heavier sub, builds earlier
    osc2.connect(g2); osc3.connect(g3); osc4.connect(g4);
    osc1.connect(filter); g2.connect(filter); g3.connect(filter); g4.connect(filter);
    // Noise swell (reverse cymbal breath — air builds up into the hard cut)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = _getNoise(ctx, 'long2s', 2000, (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    noiseSrc.loop = true;
    const noiseHP = ctx.createBiquadFilter();
    noiseHP.type = "highpass"; noiseHP.frequency.value = 1800; noiseHP.Q.value = 0.5;
    const noiseG = ctx.createGain();
    noiseG.gain.setValueAtTime(0.001, time);
    noiseG.gain.linearRampToValueAtTime(0.050, time + duration * 0.65);
    noiseG.gain.setValueAtTime(0.001, time + duration);
    noiseSrc.connect(noiseHP); noiseHP.connect(noiseG); noiseG.connect(filter);
    // Filter: very dark start → dramatic bright opening
    filter.frequency.setValueAtTime(Math.min(freq * 0.75, 260), time);
    filter.frequency.linearRampToValueAtTime(Math.min(freq * 9, 6000), time + duration);
    filter.Q.setValueAtTime(0.6, time);
    const swellEnd = time + Math.max(0.04, duration - 0.008);
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(0.60, swellEnd);
    env.gain.setValueAtTime(0.001, time + duration); // hard cut
    osc1.start(time); osc1.stop(time + duration + 0.02);
    osc2.start(time); osc2.stop(time + duration + 0.02);
    osc3.start(time); osc3.stop(time + duration + 0.02);
    osc4.start(time); osc4.stop(time + duration + 0.02);
    noiseSrc.start(time); noiseSrc.stop(time + duration + 0.02);

  } else if (voice === "felt") {
    // Music Box (hidden from selector — Una Corda-inspired with shimmer, in development)
    const osc1 = ctx.createOscillator(); // single pure sine — una corda single string
    const osc2 = ctx.createOscillator(); // inharmonic overtone — brighter in treble, warm in bass
    const symR = ctx.createOscillator(); // sympathetic string resonance (long tail)
    osc1.type = "sine"; osc2.type = "sine"; symR.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * (2 + freq / 9000), time); // register-dependent inharmonicity
    symR.frequency.setValueAtTime(freq, time);
    // Inharmonic overtone: fast felt-damped decay
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.22, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.14, duration * 0.38));
    // Sympathetic resonance: silent → barely audible bloom → long whisper tail
    const gSym = ctx.createGain();
    gSym.gain.setValueAtTime(0.001, time);
    gSym.gain.linearRampToValueAtTime(0.038, time + 0.10);
    gSym.gain.exponentialRampToValueAtTime(0.001, time + Math.max(duration, 1.5) + 1.6);
    osc2.connect(g2); symR.connect(gSym);
    osc1.connect(filter); g2.connect(filter); gSym.connect(filter);
    // Felt hammer: softer thud (felt absorbs transient energy vs bare hammer)
    const thudBuf = _getNoise(ctx, 'thud14ms', 14, (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n); });
    const thud = ctx.createBufferSource(); thud.buffer = thudBuf;
    const thudBP = ctx.createBiquadFilter();
    thudBP.type = "bandpass"; thudBP.frequency.value = Math.min(freq * 1.1, 340); thudBP.Q.value = 4;
    const thudG = ctx.createGain(); thudG.gain.value = 0.11; // soft — felt absorbs hammer
    thud.connect(thudBP); thudBP.connect(thudG); thudG.connect(filter);
    // Register-dependent filter: treble crystalline (freq*5), bass warm (capped lower naturally)
    filter.frequency.setValueAtTime(Math.min(freq * 5, 3200), time);
    filter.Q.setValueAtTime(0.4, time);
    const decay   = Math.min(0.24, duration * 0.55);
    const release = Math.min(0.14, duration * 0.32);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.50, time + 0.010); // 10ms — felt slows the attack
    env.gain.exponentialRampToValueAtTime(0.26, time + decay);
    env.gain.setValueAtTime(0.26, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.24);
    osc2.start(time); osc2.stop(time + Math.min(0.16, duration * 0.42));
    symR.start(time); symR.stop(time + Math.max(duration, 1.5) + 1.8);
    thud.start(time); thud.stop(time + 0.016);

    // Shimmer: independent pitch-shifted path — bypasses main filter+env, own tail
    const shim1 = ctx.createOscillator(); // octave up
    const shim2 = ctx.createOscillator(); // two octaves up
    const shim3 = ctx.createOscillator(); // detuned octave (+12 cents) — creates shimmer beat
    shim1.type = "sine"; shim2.type = "sine"; shim3.type = "sine";
    shim1.frequency.setValueAtTime(freq * 2, time);
    shim2.frequency.setValueAtTime(freq * 4, time);
    shim3.frequency.setValueAtTime(freq * 2.007, time);
    const shimTail = Math.max(duration, 1.2) + 1.8;
    const gSh1 = ctx.createGain();
    gSh1.gain.setValueAtTime(0.001, time);
    gSh1.gain.linearRampToValueAtTime(0.055, time + Math.min(0.20, duration * 0.45));
    gSh1.gain.exponentialRampToValueAtTime(0.001, time + shimTail);
    const gSh2 = ctx.createGain();
    gSh2.gain.setValueAtTime(0.001, time);
    gSh2.gain.linearRampToValueAtTime(0.0225, time + Math.min(0.30, duration * 0.60));
    gSh2.gain.exponentialRampToValueAtTime(0.001, time + shimTail + 0.4);
    const gSh3 = ctx.createGain();
    gSh3.gain.setValueAtTime(0.001, time);
    gSh3.gain.linearRampToValueAtTime(0.0375, time + Math.min(0.25, duration * 0.52));
    gSh3.gain.exponentialRampToValueAtTime(0.001, time + shimTail + 0.2);
    // HP filter: shimmer lives in upper harmonics, no low-end mud
    const shimHP = ctx.createBiquadFilter();
    shimHP.type = "highpass"; shimHP.frequency.value = Math.min(freq * 1.6, 1800); shimHP.Q.value = 0.5;
    const shimOut = ctx.createGain(); shimOut.gain.value = gainMod * 0.65;
    shim1.connect(gSh1); shim2.connect(gSh2); shim3.connect(gSh3);
    gSh1.connect(shimHP); gSh2.connect(shimHP); gSh3.connect(shimHP);
    shimHP.connect(shimOut); shimOut.connect(outputNode);
    shim1.start(time); shim1.stop(time + shimTail + 0.1);
    shim2.start(time); shim2.stop(time + shimTail + 0.5);
    shim3.start(time); shim3.stop(time + shimTail + 0.3);

  } else {
    // Pluck (default) — sawtooth + tanh snap + resonant filter sweep (taxonomy #1 King of Arps)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sawtooth"; osc2.type = "sawtooth";
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.0034, time);
    const g2 = ctx.createGain(); g2.gain.value = 0.6;
    // Prophet-style pre-filter snap: subtle tanh drive adds harmonic edge
    const drive = ctx.createWaveShaper();
    drive.curve = _CURVE_PLUCK;
    osc2.connect(g2); osc1.connect(drive); g2.connect(drive);
    const nBuf = _getNoise(ctx, 'noise8ms', 8, (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i/n); });
    const nSrc = ctx.createBufferSource(); nSrc.buffer = nBuf;
    nSrc.connect(drive); drive.connect(filter);
    // Bright → warm filter sweep gives the characteristic pluck "twang"
    filter.frequency.setValueAtTime(Math.min(freq * 10, 8000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2.0, 1600), time + 0.08);
    filter.Q.setValueAtTime(2.0, time); // more resonant twang
    const decay = Math.min(0.10, duration * 0.30);
    const release = Math.min(0.08, duration * 0.22);
    env.gain.setValueAtTime(0.001, time);
    env.gain.exponentialRampToValueAtTime(0.70, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.38, time + decay);
    env.gain.setValueAtTime(0.38, time + duration - release);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc1.start(time); osc1.stop(time + duration + 0.15);
    osc2.start(time); osc2.stop(time + duration + 0.15);
    nSrc.start(time); nSrc.stop(time + 0.01);
  }

  filter.connect(env);

  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (ctx.createStereoPanner) panner.pan.value = (Math.random() - 0.5) * 0.4;
  const velGain = ctx.createGain();
  velGain.gain.value = gainMod;
  env.connect(velGain);
  velGain.connect(panner);
  panner.connect(outputNode);

  const cleanupMs = Math.max(100, (time - ctx.currentTime) * 1000 + duration * 1000 + 2000);
  setTimeout(() => { filter.disconnect(); env.disconnect(); velGain.disconnect(); panner.disconnect(); }, cleanupMs);
}
