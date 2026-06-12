import {
  DRUM_ACCENT_VELOCITY,
  DRUM_NORMAL_VELOCITY,
  drumInstruments,
  timeSignatures,
} from "./music-data.js";

export function getMeterConfig(meter = "4/4") {
  return timeSignatures[meter] || timeSignatures["4/4"];
}

export function createDrumEvent(instrument, step, velocity = DRUM_NORMAL_VELOCITY, accent = false) {
  return {
    instrument,
    step,
    accent: Boolean(accent),
    velocity: Math.max(0.1, Math.min(1, velocity)),
  };
}

export function createEmptyPattern(name = "empty") {
  return { name, events: [] };
}

export function legacyPatternEvents(pattern) {
  return drumInstruments.flatMap((instrument) => {
    if (!Array.isArray(pattern[instrument])) return [];
    return pattern[instrument].map((step) => createDrumEvent(instrument, step));
  });
}

export function normalizeDrumPattern(pattern = createEmptyPattern(), meter = "4/4") {
  const stepCount = getMeterConfig(meter).defaultGridResolution;
  const rawEvents = Array.isArray(pattern.events) ? pattern.events : legacyPatternEvents(pattern);
  const events = rawEvents
    .filter((event) => drumInstruments.includes(event.instrument))
    .map((event) => {
      const accent = typeof event.accent === "boolean" ? event.accent : false;
      const velocity = accent ? DRUM_ACCENT_VELOCITY : DRUM_NORMAL_VELOCITY;
      return createDrumEvent(event.instrument, Number(event.step), velocity, accent);
    })
    .filter((event) => Number.isInteger(event.step) && event.step >= 0 && event.step < stepCount)
    .sort((a, b) => a.step - b.step || drumInstruments.indexOf(a.instrument) - drumInstruments.indexOf(b.instrument));

  return {
    name: pattern.name || "empty",
    events,
  };
}

export function clonePattern(pattern, meter = "4/4") {
  const normalizedPattern = normalizeDrumPattern(pattern, meter);
  return {
    name: normalizedPattern.name,
    events: normalizedPattern.events.map((event) => ({ ...event })),
  };
}

export function fitPatternToMeter(pattern, meter) {
  return normalizeDrumPattern(pattern, meter);
}

export function getGroupStartSteps(meter = "4/4") {
  const config = getMeterConfig(meter);
  const stepsPerBaseUnit = config.defaultGridResolution / config.baseUnitCount;
  const starts = [0];
  let baseUnitCursor = 0;

  config.accentGroups.slice(0, -1).forEach((groupSize) => {
    baseUnitCursor += groupSize;
    starts.push(Math.round(baseUnitCursor * stepsPerBaseUnit));
  });

  return starts;
}

export function everyStep(start, interval, max) {
  const steps = [];
  for (let step = start; step < max; step += interval) {
    steps.push(step);
  }
  return steps;
}

export function resolveGroove(groove, meter) {
  if (groove !== "auto") return groove;
  if (meter === "3/4") return "waltz";
  if (["6/8", "9/8", "12/8"].includes(meter)) return "blues";
  return "pop";
}

export function getGrooveDefaultMeter(groove) {
  const defaults = {
    auto: "4/4",
    rock: "4/4",
    pop: "4/4",
    blues: "12/8",
    waltz: "3/4",
    bossa: "2/4",
  };
  return defaults[groove] || "4/4";
}

export function addPatternHits(pattern, instrument, steps, velocity = DRUM_NORMAL_VELOCITY, accent = velocity >= DRUM_ACCENT_VELOCITY) {
  steps.forEach((step) => {
    pattern.events.push(createDrumEvent(instrument, step, velocity, accent));
  });
}

export function createGroovePattern(groove, meter) {
  const resolvedGroove = resolveGroove(groove, meter);
  const patternMeter = groove === "auto" ? meter : getGrooveDefaultMeter(resolvedGroove);
  const { defaultGridResolution: steps, accentGroups } = getMeterConfig(patternMeter);
  const groupSize = accentGroups[0] || 4;
  const groups = Math.max(1, Math.floor(steps / groupSize));
  const groupStarts = Array.from({ length: groups }, (_, index) => index * groupSize);
  const pattern = createEmptyPattern(resolvedGroove);

  if (resolvedGroove === "waltz") {
    addPatternHits(pattern, "kick", [0], 1);
    addPatternHits(pattern, "snare", groupStarts.slice(1), 0.75);
    addPatternHits(pattern, "hat", groupStarts, 0.7);
    return fitPatternToMeter(pattern, patternMeter);
  }

  if (resolvedGroove === "blues") {
    addPatternHits(pattern, "kick", [0, groupStarts[2] || Math.floor(steps / 2)], 1);
    addPatternHits(pattern, "snare", [groupStarts[1] || groupSize, groupStarts[3] || Math.floor(steps * 0.75)], 0.8);
    addPatternHits(pattern, "hat", everyStep(0, Math.max(1, Math.floor(groupSize / 1)), steps), 0.65);
    return fitPatternToMeter(pattern, patternMeter);
  }

  if (resolvedGroove === "bossa") {
    addPatternHits(pattern, "kick", [0, 3, 8, 11], 0.9);
    addPatternHits(pattern, "snare", [2, 6, 10, 14], 0.72);
    addPatternHits(pattern, "hat", everyStep(0, 2, steps), 0.55);
    return fitPatternToMeter(pattern, patternMeter);
  }

  if (resolvedGroove === "rock") {
    addPatternHits(pattern, "kick", [0, Math.floor(steps / 2)], 1);
    addPatternHits(pattern, "snare", [Math.floor(steps / 4), Math.floor((steps / 4) * 3)], 0.86);
    addPatternHits(pattern, "hat", everyStep(0, 2, steps), 0.6);
    return fitPatternToMeter(pattern, patternMeter);
  }

  addPatternHits(pattern, "kick", [0, Math.floor(steps * 0.375), Math.floor(steps / 2)], 0.92);
  addPatternHits(pattern, "snare", [Math.floor(steps / 4), Math.floor((steps / 4) * 3)], 0.82);
  addPatternHits(pattern, "hat", everyStep(0, 2, steps), 0.58);
  return fitPatternToMeter(pattern, patternMeter);
}

export function getDrumEventsAtStep(pattern, step) {
  return pattern.events.filter((event) => event.step === step);
}

export function getDrumEvent(pattern, instrument, step) {
  return pattern.events.find((event) => event.instrument === instrument && event.step === step);
}

export function hasDrumEvent(pattern, instrument, step) {
  return Boolean(getDrumEvent(pattern, instrument, step));
}
