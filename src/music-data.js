export const drumKits = {
  soft: {
    name: "Soft",
    kickLevel: 0.55,
    snareLevel: 0.32,
    hatLevel: 0.12,
    kickStart: 95,
    kickEnd: 52,
    snareTone: 1400,
    hatTone: 5200,
  },
  tight: {
    name: "Tight",
    kickLevel: 0.72,
    snareLevel: 0.42,
    hatLevel: 0.18,
    kickStart: 125,
    kickEnd: 46,
    snareTone: 1900,
    hatTone: 6900,
  },
  big: {
    name: "Big",
    kickLevel: 0.9,
    snareLevel: 0.56,
    hatLevel: 0.15,
    kickStart: 145,
    kickEnd: 42,
    snareTone: 1150,
    hatTone: 6100,
  },
};

export const drumInstruments = ["kick", "snare", "hat"];
export const DRUM_NORMAL_VELOCITY = 0.78;
export const DRUM_ACCENT_VELOCITY = 1;

export const drumVoices = {
  kick: {
    deep: { name: "Deep", levelScale: 1, startScale: 0.86, endScale: 0.82, decay: 0.34 },
    punch: { name: "Punch", levelScale: 1.08, startScale: 1.12, endScale: 0.95, decay: 0.24 },
    tight: { name: "Tight", levelScale: 0.92, startScale: 1.32, endScale: 1.08, decay: 0.16 },
  },
  snare: {
    warm: { name: "Warm", levelScale: 0.92, toneScale: 0.74, decay: 0.2, q: 0.55 },
    crack: { name: "Crack", levelScale: 1.1, toneScale: 1.28, decay: 0.13, q: 1 },
    brush: { name: "Brush", levelScale: 0.7, toneScale: 1.58, decay: 0.11, q: 0.38 },
  },
  hat: {
    soft: { name: "Soft", levelScale: 0.82, toneScale: 0.78, decay: 0.065 },
    bright: { name: "Bright", levelScale: 1, toneScale: 1.18, decay: 0.05 },
    tick: { name: "Tick", levelScale: 0.68, toneScale: 1.5, decay: 0.032 },
  },
};

export const timeSignatures = {
  "2/4": {
    pulseType: "simple",
    pulseCount: 2,
    baseUnitCount: 2,
    defaultGridResolution: 8,
    accentGroups: [1, 1],
    accentMap: ["strong", "weak"],
  },
  "3/4": {
    pulseType: "simple",
    pulseCount: 3,
    baseUnitCount: 3,
    defaultGridResolution: 12,
    accentGroups: [1, 1, 1],
    accentMap: ["strong", "weak", "weak"],
  },
  "4/4": {
    pulseType: "simple",
    pulseCount: 4,
    baseUnitCount: 4,
    defaultGridResolution: 16,
    accentGroups: [1, 1, 1, 1],
    accentMap: ["strong", "weak", "medium", "weak"],
  },
  "5/4": {
    pulseType: "irregular",
    pulseCount: 5,
    baseUnitCount: 5,
    defaultGridResolution: 20,
    accentGroups: [3, 2],
    accentMap: ["strong", "weak", "weak", "weak", "weak"],
  },
  "4/8": {
    pulseType: "simple",
    pulseCount: 4,
    baseUnitCount: 4,
    defaultGridResolution: 8,
    accentGroups: [2, 2],
    accentMap: ["strong", "weak", "medium", "weak"],
  },
  "6/8": {
    pulseType: "compound",
    pulseCount: 2,
    baseUnitCount: 6,
    defaultGridResolution: 12,
    accentGroups: [3, 3],
    accentMap: ["strong", "weak", "weak", "medium", "weak", "weak"],
  },
  "7/8": {
    pulseType: "irregular",
    pulseCount: 7,
    baseUnitCount: 7,
    defaultGridResolution: 14,
    accentGroups: [2, 2, 3],
    accentMap: ["strong", "weak", "weak", "weak", "weak", "weak", "weak"],
  },
  "9/8": {
    pulseType: "compound",
    pulseCount: 3,
    baseUnitCount: 9,
    defaultGridResolution: 18,
    accentGroups: [3, 3, 3],
    accentMap: ["strong", "weak", "weak", "medium", "weak", "weak", "medium", "weak", "weak"],
  },
  "12/8": {
    pulseType: "compound",
    pulseCount: 4,
    baseUnitCount: 12,
    defaultGridResolution: 24,
    accentGroups: [3, 3, 3, 3],
    accentMap: ["strong", "weak", "weak", "medium", "weak", "weak", "medium", "weak", "weak", "medium", "weak", "weak"],
  },
};
