import { ARP_RATE_EIGHTH_FACTOR, midiToFrequency } from "./arp-fx.js";
import { playArpNote } from "./arp-voices.js";
import { buildNotePool, getArpNote } from "./arp-engine.js";
import { getMeterConfig } from "./drum-machine.js";

const ACCENT_VEL = { strong: 1.0, medium: 0.9, weak: 0.8 };

// Glitch probability distribution:
//   17% silence | 17% octave jump | 8% flam/displacement | 16% intensity variation
//   11% double-time | 12% stutter | 10% truncate | 9% fall-through (normal)
export function scheduleArpSteps(pulseTime, beatDurationSeconds, state, scenes, getKeyInfo) {
  if (!state.arp.enabled || !state.audioContext) return;
  const scene = scenes[state.sceneId];
  if (!scene) return;

  const _ctx = state.audioContext;
  const _voice = state.arp.voice;
  const _arpOut = state.arpEQNode ? state.arpEQNode.input : (state.arpChorusNode ? state.arpChorusNode.input : state.arpGain);

  // Meter-aware timing: compute the actual eighth-note duration for this meter
  const config = getMeterConfig(scene.meter || "4/4");
  const baseUnitsPerPulse = config.baseUnitCount / config.pulseCount;
  const eighthNoteDuration = beatDurationSeconds / baseUnitsPerPulse;

  if (state.arpDelayNode) {
    state.arpDelayNode.setTime((ARP_RATE_EIGHTH_FACTOR[state.arp.delayTime] ?? 1) * eighthNoteDuration);
  }

  const { rootMidi, isMinor } = getKeyInfo(scene.key);
  let notePool;
  if (state.arp.customNotes.length > 0) {
    notePool = [...state.arp.customNotes].sort((a, b) => a - b).map(s => 60 + s);
  } else {
    notePool = buildNotePool(rootMidi + 12, isMinor, state.arp.octaves);
  }
  if (!notePool.length) return;

  const noteDur = (ARP_RATE_EIGHTH_FACTOR[state.arp.rate] ?? 1) * eighthNoteDuration;
  const gateDur = Math.max(0.03, noteDur * (state.arp.gate / 100));
  const beatEnd = pulseTime + beatDurationSeconds;

  // Natural accent: first note of each pulse uses the beat's metric weight
  const pulseAccentLevel = config.accentMap[Math.floor((state.beat - 1) * baseUnitsPerPulse)] || "weak";
  const pulseAccentFactor = state.arp.naturalAccent ? (ACCENT_VEL[pulseAccentLevel] ?? 0.8) : 1.0;
  const weakFactor = state.arp.naturalAccent ? 0.8 : 1.0;

  if (state.arp.nextNoteTime === null) state.arp.nextNoteTime = pulseTime;

  let subStep = 0;
  while (state.arp.nextNoteTime < beatEnd) {
    const noteTime = state.arp.nextNoteTime;
    state.arp.nextNoteTime += noteDur;
    const accentFactor = subStep === 0 ? pulseAccentFactor : weakFactor;
    subStep++;

    let midi = getArpNote(notePool, state.arp.stepIndex, state.arp.mode);
    if (midi !== null) midi += (state.arp.octShift || 0) * 12;
    const isOdd = state.arp.stepIndex % 2 === 1;
    state.arp.stepIndex++;
    if (midi === null) continue;

    const swingOffset = isOdd ? (state.arp.swing / 100) * noteDur : 0;
    const time = noteTime + swingOffset;

    if (state.arp.glitch > 0 && Math.random() * 100 < state.arp.glitch) {
      const roll = Math.random();
      if (roll < 0.17) {
        continue; // silence
      } else if (roll < 0.34) {
        midi += Math.random() < 0.5 ? 12 : -12; // octave jump
      } else if (roll < 0.42) {
        if (Math.random() < 0.5) {
          // Flam: soft grace note 15-40ms before main hit
          const gap = 0.015 + Math.random() * 0.025;
          playArpNote(midiToFrequency(midi), time, Math.min(0.018, gateDur * 0.06), 1, _ctx, _voice, _arpOut);
          playArpNote(midiToFrequency(midi), time + gap, gateDur, 1, _ctx, _voice, _arpOut);
        } else {
          // Grid displacement: note shifted ±20-55ms off the beat
          const shift = (Math.random() < 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.025);
          playArpNote(midiToFrequency(midi), Math.max(time + 0.001, time + shift), gateDur, 1, _ctx, _voice, _arpOut);
        }
        continue;
      } else if (roll < 0.58) {
        // Intensity variation: ±20% volume surprise
        const gmod = 0.8 + Math.random() * 0.4;
        playArpNote(midiToFrequency(midi), time, gateDur, gmod, _ctx, _voice, _arpOut);
        continue;
      } else if (roll < 0.69) {
        // Double-time: two rapid notes at half duration
        playArpNote(midiToFrequency(midi), time, gateDur * 0.42, 1, _ctx, _voice, _arpOut);
        playArpNote(midiToFrequency(midi), time + noteDur * 0.5, gateDur * 0.42, 1, _ctx, _voice, _arpOut);
        continue;
      } else if (roll < 0.81) {
        // Ultra-short stutter burst
        playArpNote(midiToFrequency(midi), time, Math.min(0.035, gateDur * 0.12), 1, _ctx, _voice, _arpOut);
        continue;
      } else if (roll < 0.91) {
        // Hard truncate (transient attack only)
        playArpNote(midiToFrequency(midi), time, Math.min(0.06, gateDur * 0.2), 1, _ctx, _voice, _arpOut);
        continue;
      }
      // else ~10%: fall through — glitch triggers but note plays normally
    }

    // Humanize: timing jitter + velocity variation + gate variation
    const h = state.arp.humanize / 100;
    const hTime = h > 0
      ? Math.max(time + 0.001, time + (Math.random() * 2 - 1) * h * 0.025)
      : time;
    const velMod = h > 0 ? Math.max(0.15, 1 + (Math.random() * 2 - 1) * h * 0.35) : 1;
    const gateMod = h > 0 ? Math.max(0.1, 1 + (Math.random() * 2 - 1) * h * 0.25) : 1;
    playArpNote(midiToFrequency(midi), hTime, gateDur * gateMod, accentFactor * velMod, _ctx, _voice, _arpOut);
  }
}
