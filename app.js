import { buildNotePool, getArpNote, getArpSubdivisions } from "./src/arp-engine.js";
import { midiToFrequency, ARP_RATE_BEAT_FACTOR, createJunoChorus, createArpReverb, createArpEQ, createArpSaturator, createArpDelay, createArpLFO } from "./src/arp-fx.js";
import { playArpNote } from "./src/arp-voices.js";
import { scheduleArpSteps } from "./src/arp-scheduler.js";
import { Knob, StepKnob } from "./src/knob.js";
import { PAD_DEFAULTS, PAD_MOODS } from "./src/pad-data.js";
import {
  DRUM_ACCENT_VELOCITY,
  DRUM_NORMAL_VELOCITY,
  drumInstruments,
  drumKits,
  drumVoices,
} from "./src/music-data.js";
import {
  APP_STATE_ID,
  APP_STATE_STORE_NAME,
  SAMPLE_STORE_NAME,
  STORAGE_KEY,
  readStorage,
  removeStorage,
  requestToPromise,
  withDbStore,
  writeStorage,
} from "./src/storage.js";
import {
  clonePattern,
  createDrumEvent,
  createEmptyPattern,
  createGroovePattern,
  fitPatternToMeter,
  getDrumEvent,
  getDrumEventsAtStep,
  getGrooveDefaultMeter,
  getGroupStartSteps as getMeterGroupStartSteps,
  getMeterConfig as getConfigForMeter,
  normalizeDrumPattern,
} from "./src/drum-machine.js";

const scenes = {
  warm: { name: "Warm Pad", bpm: 72, key: "G", meter: "4/4", groove: "pop", chord: [196, 246.94, 293.66, 392], drumPattern: "soft", padSettings: { mood: "prayer" } },
  deep: { name: "Deep Pad", bpm: 76, key: "Em", meter: "12/8", groove: "blues", chord: [164.81, 196, 246.94, 329.63], drumPattern: "sparse", padSettings: { mood: "dark" } },
  bright: { name: "Bright Pad", bpm: 84, key: "C", meter: "4/4", groove: "rock", chord: [130.81, 196, 261.63, 329.63], drumPattern: "drive", padSettings: { mood: "heaven" } },
};

let sceneOrder = ["warm", "deep", "bright"];

const sceneDrumPatterns = {
  warm: createGroovePattern(scenes.warm.groove, scenes.warm.meter),
  deep: createGroovePattern(scenes.deep.groove, scenes.deep.meter),
  bright: createGroovePattern(scenes.bright.groove, scenes.bright.meter),
};


const NOTE_TO_MIDI = {
  C: 48,
  Db: 49,
  D: 50,
  Eb: 51,
  E: 52,
  F: 53,
  Gb: 54,
  G: 55,
  Ab: 56,
  A: 57,
  Bb: 58,
  B: 59,
};

function clampPercent(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizePadSettings(settings = {}) {
  const moodId = PAD_MOODS[settings.mood] ? settings.mood : PAD_DEFAULTS.mood;
  const mood = PAD_MOODS[moodId];
  return {
    mood: moodId,
    movement: clampPercent(settings.movement, mood.movement),
    shimmer: clampPercent(settings.shimmer, mood.shimmer),
    warmth: clampPercent(settings.warmth, mood.warmth),
    space: clampPercent(settings.space, mood.space),
    texture: clampPercent(settings.texture, mood.texture),
    evolve: typeof settings.evolve === "boolean" ? settings.evolve : PAD_DEFAULTS.evolve,
  };
}

function normalizeScene(scene) {
  return {
    ...scene,
    key: scene.key || "C",
    meter: scene.meter || "4/4",
    groove: scene.groove || "auto",
    drumKitId: scene.drumKitId || null,
    drumRate: scene.drumRate || null,
    drumVoiceIds: scene.drumVoiceIds || null,
    drumSampleEnabled: scene.drumSampleEnabled || null,
    drumSampleNames: scene.drumSampleNames || null,
    padSettings: normalizePadSettings(scene.padSettings),
  };
}

function getBeatsPerBar() {
  return getMeterConfig().pulseCount;
}

function getMeterConfig(meter = scenes[state.sceneId]?.meter || "4/4") {
  return getConfigForMeter(meter);
}

function getCurrentStepCount() {
  const full = getMeterConfig().defaultGridResolution;
  return state.drumSubdivision === "1/8" ? Math.floor(full / 2) : full;
}

function getGroupStartSteps(meter = scenes[state.sceneId]?.meter || "4/4") {
  return getMeterGroupStartSteps(meter);
}

function getClickAccentBeats() {
  return getMeterConfig().accentMap;
}

function getSampleKey(sceneId, instrument) {
  return `${sceneId}:${instrument}`;
}

function getLegacySampleKey(instrument) {
  return `global:${instrument}`;
}

function getStoredSampleRecord(sceneId, instrument) {
  return state.drumSampleLibrary[getSampleKey(sceneId, instrument)] || state.drumSampleLibrary[getLegacySampleKey(instrument)] || null;
}

function applySampleRecordToInstrument(instrument, record) {
  state.drumSampleBuffers[instrument] = null;
  state.drumSampleData[instrument] = record?.data || null;
  state.drumSampleNames[instrument] = record?.name || "";
}

async function saveStoredSample(sceneId, instrument, file, arrayBuffer) {
  const sampleKey = getSampleKey(sceneId, instrument);
  const record = {
    instrument: sampleKey,
    sceneId,
    sampleInstrument: instrument,
    name: file.name,
    type: file.type,
    data: arrayBuffer,
    updatedAt: Date.now(),
  };
  state.drumSampleLibrary[sampleKey] = record;
  await withDbStore(SAMPLE_STORE_NAME, "readwrite", (store) =>
    store.put(record)
  );
}

async function loadStoredSamples() {
  try {
    const records = await withDbStore(SAMPLE_STORE_NAME, "readonly", (store) => requestToPromise(store.getAll()));
    records.forEach((record) => {
      if (!record.data) return;
      if (record.sceneId && drumInstruments.includes(record.sampleInstrument)) {
        state.drumSampleLibrary[getSampleKey(record.sceneId, record.sampleInstrument)] = record;
        return;
      }
      if (drumInstruments.includes(record.instrument)) {
        state.drumSampleLibrary[getLegacySampleKey(record.instrument)] = record;
      }
    });
    if (records.length > 0) {
      applyScenePresetSettings(state.sceneId);
      setStatus("Samples guardados listos para cargar al tocar Play.");
    }
  } catch (error) {
    // IndexedDB can be unavailable in private modes; generated sounds still work.
  }
}

async function saveStoredAppState(snapshot) {
  await withDbStore(APP_STATE_STORE_NAME, "readwrite", (store) =>
    store.put({
      id: APP_STATE_ID,
      snapshot,
      updatedAt: Date.now(),
    })
  );
}

async function loadStoredAppState() {
  try {
    const record = await withDbStore(APP_STATE_STORE_NAME, "readonly", (store) => requestToPromise(store.get(APP_STATE_ID)));
    if (!record?.snapshot) return false;
    applyAppSnapshot(record.snapshot);
    return true;
  } catch (error) {
    return false;
  }
}

let _saveDebounceTimer = null;
function saveAppStateDebounced() {
  clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(saveAppState, 300);
}

function saveAppState() {
  const snapshot = {
    scenes,
    sceneOrder,
    sceneDrumPatterns,
    drumKitId: state.drumKitId,
    drumVoiceIds: state.drumVoiceIds,
    drumRate: state.drumRate,
    drumSubdivision: state.drumSubdivision,
    clickMode: state.clickMode,
    volumes: state.volumes,
    muted: state.muted,
    ui: state.ui,
    padEq: state.padEq,
  };

  const didWriteLocal = writeStorage(STORAGE_KEY, JSON.stringify(snapshot));
  if (!didWriteLocal) {
    setStatus("Cambios activos en esta sesion. El navegador no permitio guardarlos.");
  }
  saveStoredAppState(snapshot).catch(() => {
    // localStorage fallback already has the lightweight project state.
  });
}

function applyAppSnapshot(snapshot) {
  if (snapshot.scenes && snapshot.sceneOrder) {
    Object.keys(scenes).forEach((sceneId) => delete scenes[sceneId]);
    snapshot.sceneOrder.forEach((sceneId) => {
      if (snapshot.scenes[sceneId]) {
        scenes[sceneId] = normalizeScene(snapshot.scenes[sceneId]);
      }
    });
    sceneOrder = snapshot.sceneOrder.filter((sceneId) => scenes[sceneId]);
  }

  if (snapshot.sceneDrumPatterns) {
    Object.keys(sceneDrumPatterns).forEach((sceneId) => delete sceneDrumPatterns[sceneId]);
    sceneOrder.forEach((sceneId) => {
      if (snapshot.sceneDrumPatterns[sceneId]) {
        sceneDrumPatterns[sceneId] = fitPatternToMeter(snapshot.sceneDrumPatterns[sceneId], scenes[sceneId].meter);
      } else if (scenes[sceneId]) {
        sceneDrumPatterns[sceneId] = createGroovePattern(scenes[sceneId].groove || "auto", scenes[sceneId].meter);
      }
    });
  }

  if (snapshot.drumKitId && drumKits[snapshot.drumKitId]) {
    state.drumKitId = snapshot.drumKitId;
  }

  if (snapshot.drumVoiceIds) {
    drumInstruments.forEach((instrument) => {
      const voiceId = snapshot.drumVoiceIds[instrument];
      if (drumVoices[instrument][voiceId]) {
        state.drumVoiceIds[instrument] = voiceId;
      }
    });
  }

  if (["half", "normal", "double", "quad"].includes(snapshot.drumRate)) {
    state.drumRate = snapshot.drumRate;
  }

  if (["1/8", "1/16"].includes(snapshot.drumSubdivision)) {
    state.drumSubdivision = snapshot.drumSubdivision;
  }

  if (["pulse", "subdivision"].includes(snapshot.clickMode)) {
    state.clickMode = snapshot.clickMode;
  }

  if (snapshot.volumes) {
    Object.keys(state.volumes).forEach((channel) => {
      if (typeof snapshot.volumes[channel] === "number") {
        state.volumes[channel] = Math.max(0, Math.min(1, snapshot.volumes[channel]));
      }
    });
  }

  if (snapshot.muted) {
    Object.keys(state.muted).forEach((channel) => {
      if (typeof snapshot.muted[channel] === "boolean") {
        state.muted[channel] = snapshot.muted[channel];
      }
    });
  }

  if (snapshot.ui) {
    state.ui.mixerCollapsed = Boolean(snapshot.ui.mixerCollapsed);
    state.ui.padSynthCollapsed = Boolean(snapshot.ui.padSynthCollapsed);
    state.ui.drumEditorCollapsed = Boolean(snapshot.ui.drumEditorCollapsed);
    state.ui.accentEditMode = Boolean(snapshot.ui.accentEditMode);
  }

  if (snapshot.padEq) {
    if (typeof snapshot.padEq.enabled === "boolean") state.padEq.enabled = snapshot.padEq.enabled;
    if (Array.isArray(snapshot.padEq.bands) && snapshot.padEq.bands.length === 9) state.padEq.bands = [...snapshot.padEq.bands];
    if (Array.isArray(snapshot.padEq.bandsEnabled) && snapshot.padEq.bandsEnabled.length === 9) state.padEq.bandsEnabled = [...snapshot.padEq.bandsEnabled];
    if (typeof snapshot.padEq.hpf === "number") state.padEq.hpf = snapshot.padEq.hpf;
    if (typeof snapshot.padEq.lpf === "number") state.padEq.lpf = snapshot.padEq.lpf;
    if (typeof snapshot.padEq.output === "number") state.padEq.output = snapshot.padEq.output;
  }
}

function loadAppState() {
  const rawSnapshot = readStorage(STORAGE_KEY);
  if (!rawSnapshot) return;

  try {
    applyAppSnapshot(JSON.parse(rawSnapshot));
  } catch (error) {
    removeStorage(STORAGE_KEY);
  }
}

function ensureSceneState() {
  if (sceneOrder.length === 0) {
    const sceneId = "warm";
    scenes[sceneId] = {
      name: "Warm Pad",
      bpm: 72,
      key: "G",
      meter: "4/4",
      groove: "pop",
      chord: [196, 246.94, 293.66, 392],
      drumPattern: "soft",
      padSettings: normalizePadSettings({ mood: "prayer" }),
    };
    sceneDrumPatterns[sceneId] = createGroovePattern("pop", "4/4");
    sceneOrder = [sceneId];
  }

  sceneOrder = sceneOrder.filter((sceneId) => scenes[sceneId]);
  if (!scenes[state.sceneId]) {
    state.sceneId = sceneOrder[0];
  }

  sceneOrder.forEach((sceneId) => {
    scenes[sceneId] = normalizeScene(scenes[sceneId]);
    if (!sceneDrumPatterns[sceneId]) {
      sceneDrumPatterns[sceneId] = createGroovePattern(scenes[sceneId].groove || "auto", scenes[sceneId].meter);
    }
  });
}

const state = {
  audioContext: null,
  masterGain: null,
  padGain: null,
  loopGain: null,
  clickGain: null,
  drumGain: null,
  arpGain: null,
  arpTrimNode: null,
  arpChorusNode: null,
  arpReverbNode: null,
  arpEQNode: null,
  arpSatNode: null,
  arpDelayNode: null,
  arpLFONode: null,
  unlocked: false,
  activePad: null,
  isPlaying: false,
  bpm: 72,
  bar: 1,
  beat: 1,
  displayBar: 1,
  displayBeat: 1,
  tickTimer: null,
  nextPulseTime: 0,
  currentPulseIndex: 0,
  scheduledUiEvents: [],
  pendingStepTap: null,
  recentStepDoubleTap: null,
  schedulerLookaheadMs: 25,
  scheduleAheadSeconds: 0.30,
  tapTimes: [],
  sceneId: "warm",
  pendingSceneId: null,
  metronomeEnabled: false,
  clickMode: "subdivision",
  loopEnabled: false,
  pendingLoopEnabled: null,
  drumsEnabled: false,
  pendingDrumsEnabled: null,
  drumStep: 0,
  currentUiDrumStep: -1,
  drumSubStep: 0,
  drumTimers: [],
  drumRate: "normal",
  drumSubdivision: "1/16",
  drumPatternId: "soft",
  drumKitId: "soft",
  drumVoiceIds: {
    kick: "deep",
    snare: "warm",
    hat: "soft",
  },
  drumSampleBuffers: {
    kick: null,
    snare: null,
    hat: null,
  },
  drumSampleData: {
    kick: null,
    snare: null,
    hat: null,
  },
  drumSampleNames: {
    kick: "",
    snare: "",
    hat: "",
  },
  drumSampleLibrary: {},
  drumSampleEnabled: {
    kick: false,
    snare: false,
    hat: false,
  },
  volumes: {
    pad: 0.84,
    loop: 0.9,
    click: 0.65,
    drum: 0.85,
    arp: 0.16,
  },
  defaultVolumes: {
    pad: 0.84,
    loop: 0.9,
    click: 0.65,
    drum: 0.85,
    arp: 0.27,
  },
  muted: {
    pad: false,
    loop: false,
    click: false,
    drum: false,
    arp: false,
  },
  arp: {
    enabled: false,
    mode: "up",
    rate: "1/8",
    octaves: 1,
    gate: 60,
    swing: 0,
    stepIndex: 0,
    nextNoteTime: null,
    customNotes: [],
    voice: "pluck",
    chorus: 0,
    reverb: 40,
    humanize: 0,
    glitch: 0,
    lowcut: 20,
    highcut: 20000,
    saturation: 0,
    delayTime: "1/8D",
    delayFeedback: 30,
    delayWet: 0,
    fxBypass: false,
    lfoEnabled: false,
    lfoRate: 2.0,
    lfoDepth: 40,
    lfoShape: "sine",
    lfoTarget: "tremolo",
    octShift: 0,
    outputGain: 0,
    naturalAccent: true,
  },
  ui: {
    mixerCollapsed: false,
    padSynthCollapsed: false,
    drumEditorCollapsed: false,
    accentEditMode: false,
  },
  padEq: {
    enabled: false,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    bandsEnabled: [true, true, true, true, true, true, true, true, true],
    hpf: 20,
    lpf: 20000,
    output: 0,
  },
  padEqNode: null,
};

const bpmReadout = document.querySelector("#bpmReadout");
const barReadout = document.querySelector("#barReadout");
const beatReadout = document.querySelector("#beatReadout");
const keyReadout = document.querySelector("#keyReadout");
const meterReadout = document.querySelector("#meterReadout");
const bpmSlider = document.querySelector("#bpmSlider");
const padVolume = document.querySelector("#padVolume");
const loopVolume = document.querySelector("#loopVolume");
const clickVolume = document.querySelector("#clickVolume");
const drumVolume = document.querySelector("#drumVolume");
const arpVolume = document.querySelector("#arpVolume");
const padVolumeReadout = document.querySelector("#padVolumeReadout");
const loopVolumeReadout = document.querySelector("#loopVolumeReadout");
const clickVolumeReadout = document.querySelector("#clickVolumeReadout");
const drumVolumeReadout = document.querySelector("#drumVolumeReadout");
const arpVolumeReadout = document.querySelector("#arpVolumeReadout");
const padMute = document.querySelector("#padMute");
const loopMute = document.querySelector("#loopMute");
const clickMute = document.querySelector("#clickMute");
const drumMute = document.querySelector("#drumMute");
const arpMute = document.querySelector("#arpMute");
const mixerToggle = document.querySelector("#mixerToggle");
const mixerToggleText = document.querySelector("#mixerToggleText");
const mixerToggleIcon = document.querySelector("#mixerToggleIcon");
const mixerPanel = document.querySelector("#mixerPanel");
const padSynthToggle = document.querySelector("#padSynthToggle");
const padSynthToggleIcon = document.querySelector("#padSynthToggleIcon");
const padSynthPanel = document.querySelector("#padSynthPanel");
const padMoodSelect = document.querySelector("#padMoodSelect");
const padMovement = document.querySelector("#padMovement");
const padShimmer = document.querySelector("#padShimmer");
const padWarmth = document.querySelector("#padWarmth");
const padSpace = document.querySelector("#padSpace");
const padTexture = document.querySelector("#padTexture");
const padMovementReadout = document.querySelector("#padMovementReadout");
const padShimmerReadout = document.querySelector("#padShimmerReadout");
const padWarmthReadout = document.querySelector("#padWarmthReadout");
const padSpaceReadout = document.querySelector("#padSpaceReadout");
const padTextureReadout = document.querySelector("#padTextureReadout");
const padEvolveToggle = document.querySelector("#padEvolveToggle");
const padEqToggle = document.querySelector("#padEqToggle");
const padEqPanel = document.querySelector("#padEqPanel");
const padEqKnobsContainer = document.querySelector("#padEqKnobs");
const playToggle = document.querySelector("#playToggle");
const metronomeToggle = document.querySelector("#metronomeToggle");
const loopToggle = document.querySelector("#loopToggle");
const drumsToggle = document.querySelector("#drumsToggle");
const drumGrooveSelect = document.querySelector("#drumGrooveSelect");
const drumKitSelect = document.querySelector("#drumKitSelect");
const stopButton = document.querySelector("#stopButton");
const tapTempo = document.querySelector("#tapTempo");
const pulse = document.querySelector("#pulse");
const statusText = document.querySelector("#statusText");
const sceneGrid = document.querySelector("#sceneGrid");
const sceneNameInput = document.querySelector("#sceneNameInput");
const sceneKeySelect = document.querySelector("#sceneKeySelect");
const sceneMeterSelect = document.querySelector("#sceneMeterSelect");
const applySceneSettings = document.querySelector("#applySceneSettings");
const renameScene = document.querySelector("#renameScene");
const newScene = document.querySelector("#newScene");
const duplicateScene = document.querySelector("#duplicateScene");
const deleteScene = document.querySelector("#deleteScene");
let sceneButtons = document.querySelectorAll(".scene");
const drumEditorToggle = document.querySelector("#drumEditorToggle");
const drumEditorToggleIcon = document.querySelector("#drumEditorToggleIcon");
const drumEditorPanel = document.querySelector("#drumEditorPanel");
const resetPattern = document.querySelector("#resetPattern");
const accentModeToggle = document.querySelector("#accentModeToggle");
const drumSubdivisionToggle = document.querySelector("#drumSubdivisionToggle");
const drumRateSelect = document.querySelector("#drumRateSelect");
const instrumentMenu = document.querySelector("#instrumentMenu");
const instrumentMenuTitle = document.querySelector("#instrumentMenuTitle");
const instrumentMenuSelect = document.querySelector("#instrumentMenuSelect");
const instrumentMenuLoad = document.querySelector("#instrumentMenuLoad");
const instrumentMenuBase = document.querySelector("#instrumentMenuBase");
const kickSampleInput = document.querySelector("#kickSampleInput");
const snareSampleInput = document.querySelector("#snareSampleInput");
const hatSampleInput = document.querySelector("#hatSampleInput");
const sampleInputs = {
  kick: kickSampleInput,
  snare: snareSampleInput,
  hat: hatSampleInput,
};
const stepHeader = document.querySelector("#stepHeader");
const stepContainers = {
  kick: document.querySelector("#kickSteps"),
  snare: document.querySelector("#snareSteps"),
  hat: document.querySelector("#hatSteps"),
};

function setStatus(message) {
  statusText.textContent = message;
}

function renderTransport() {
  const scene = scenes[state.sceneId];
  bpmReadout.textContent = Math.round(state.bpm);
  barReadout.textContent = state.displayBar;
  beatReadout.textContent = state.displayBeat;
  keyReadout.textContent = scene?.key || "C";
  meterReadout.textContent = scene?.meter || "4/4";
  bpmSlider.value = Math.round(state.bpm);
  playToggle.textContent = state.isPlaying ? "Ⅱ" : "▶";
  playToggle.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
  playToggle.classList.toggle("active", state.isPlaying);
  metronomeToggle.setAttribute(
    "aria-label",
    state.metronomeEnabled ? "Metronome on" : "Metronome off"
  );
  metronomeToggle.classList.toggle("active", state.metronomeEnabled);
  loopToggle.textContent = state.loopEnabled ? "Loop On" : "Loop Off";
  drumsToggle.setAttribute("aria-label", state.drumsEnabled ? "Turn drums off" : "Turn drums on");
  drumsToggle.classList.toggle("active", state.drumsEnabled);
  drumGrooveSelect.value = scenes[state.sceneId]?.groove || "auto";
  drumKitSelect.value = state.drumKitId;
  loopToggle.classList.toggle("pending-action", state.pendingLoopEnabled !== null);
  drumsToggle.classList.toggle("pending-action", state.pendingDrumsEnabled !== null);
  padVolume.value = Math.round(state.volumes.pad * 100);
  loopVolume.value = Math.round(state.volumes.loop * 100);
  clickVolume.value = Math.round(state.volumes.click * 100);
  drumVolume.value = Math.round(state.volumes.drum * 100);
  arpVolume.value = Math.round(state.volumes.arp * 100);
  padVolumeReadout.textContent = state.muted.pad ? "Muted" : `${Math.round(state.volumes.pad * 100)}%`;
  loopVolumeReadout.textContent = state.muted.loop ? "Muted" : `${Math.round(state.volumes.loop * 100)}%`;
  clickVolumeReadout.textContent = state.muted.click ? "Muted" : `${Math.round(state.volumes.click * 100)}%`;
  drumVolumeReadout.textContent = state.muted.drum ? "Muted" : `${Math.round(state.volumes.drum * 100)}%`;
  arpVolumeReadout.textContent = state.muted.arp ? "Muted" : `${Math.round(state.volumes.arp * 100)}%`;
  padMute.classList.toggle("active", state.muted.pad);
  loopMute.classList.toggle("active", state.muted.loop);
  clickMute.classList.toggle("active", state.muted.click);
  drumMute.classList.toggle("active", state.muted.drum);
  arpMute.classList.toggle("active", state.muted.arp);
  drumRateSelect.value = state.drumRate;
  drumSubdivisionToggle.textContent = state.drumSubdivision;
  drumSubdivisionToggle.classList.toggle("active", state.drumSubdivision === "1/16");
  accentModeToggle.classList.toggle("active", state.ui.accentEditMode);
  renderPadSynthControls();
  renderSceneControls();
  renderPlayingStep();
}

function renderPadSynthControls() {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  scene.padSettings = normalizePadSettings(scene.padSettings);
  const settings = scene.padSettings;
  if (document.activeElement !== padMoodSelect) {
    padMoodSelect.value = settings.mood;
  }

  const controls = [
    [padMovement, padMovementReadout, settings.movement],
    [padShimmer, padShimmerReadout, settings.shimmer],
    [padWarmth, padWarmthReadout, settings.warmth],
    [padSpace, padSpaceReadout, settings.space],
    [padTexture, padTextureReadout, settings.texture],
  ];

  controls.forEach(([input, readout, value]) => {
    if (document.activeElement !== input) {
      input.value = value;
    }
    readout.textContent = `${value}%`;
  });

  padEvolveToggle.classList.toggle("active", settings.evolve);
  padEqToggle.classList.toggle("active", state.padEq.enabled);
}

function renderSceneControls() {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  if (document.activeElement !== sceneNameInput) {
    sceneNameInput.value = scene.name;
  }
  if (document.activeElement !== sceneKeySelect) {
    sceneKeySelect.value = scene.key || "C";
  }
  if (document.activeElement !== sceneMeterSelect) {
    sceneMeterSelect.value = scene.meter || "4/4";
  }
}

function getCurrentDrumPattern() {
  sceneDrumPatterns[state.sceneId] = normalizeDrumPattern(sceneDrumPatterns[state.sceneId], scenes[state.sceneId].meter);
  return sceneDrumPatterns[state.sceneId];
}

function renderDrumEditor() {
  stepHeader.innerHTML = "<span></span><div class=\"step-grid\" id=\"stepNumbers\"></div>";
  const stepNumbers = document.querySelector("#stepNumbers");
  const { defaultGridResolution: fullSteps } = getMeterConfig();
  const groupStarts = getGroupStartSteps();
  const visibleCount = getCurrentStepCount();
  const stepFactor = fullSteps / visibleCount; // 1 for 1/16, 2 for 1/8

  stepNumbers.style.setProperty("--step-count", visibleCount);

  let beatCount = 0;
  for (let v = 0; v < visibleCount; v++) {
    const internalStep = v * stepFactor;
    const isGroupStart = groupStarts.includes(internalStep);
    if (isGroupStart) beatCount++;
    const number = document.createElement("span");
    number.className = "step-number";
    number.classList.toggle("group-start", isGroupStart);
    number.textContent = isGroupStart ? String(beatCount) : "";
    stepNumbers.appendChild(number);
  }

  Object.entries(stepContainers).forEach(([instrument, container]) => {
    container.innerHTML = "";
    container.style.setProperty("--step-count", visibleCount);
    for (let v = 0; v < visibleCount; v++) {
      const internalStep = v * stepFactor;
      const isGroupStart = groupStarts.includes(internalStep);
      const button = document.createElement("button");
      button.className = "step-button";
      button.type = "button";
      button.dataset.instrument = instrument;
      button.dataset.step = String(internalStep);
      button.classList.toggle("group-start", isGroupStart);
      button.setAttribute("aria-label", `${instrument} step ${v + 1}`);
      button.addEventListener("pointerup", (event) => {
        event.preventDefault();
        handleDrumStepTap(instrument, internalStep);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleDrumStep(instrument, internalStep);
      });
      container.appendChild(button);
    }
  });

  renderDrumSteps();
}

function renderDrumSteps() {
  const fullCount = getMeterConfig().defaultGridResolution;
  const pattern = getCurrentDrumPattern();
  Object.entries(stepContainers).forEach(([instrument, container]) => {
    container.querySelectorAll(".step-button").forEach((button) => {
      const step = Number(button.dataset.step);
      const event = getDrumEvent(pattern, instrument, step);
      button.classList.toggle("active", step < fullCount && Boolean(event));
      button.classList.toggle("accent", Boolean(event?.accent));
      button.title = event?.accent ? "Acento fuerte" : "";
    });
  });
  renderPlayingStep();
}

function renderPlayingStep() {
  const stepCount = getCurrentStepCount();
  const playingStep = state.drumsEnabled ? state.currentUiDrumStep : -1;
  document.querySelectorAll(".step-button").forEach((button) => {
    button.classList.toggle("playing", Number(button.dataset.step) === playingStep);
  });
}

function applyStoredUiState() {
  mixerPanel.classList.toggle("collapsed", state.ui.mixerCollapsed);
  mixerToggle.setAttribute("aria-expanded", String(!state.ui.mixerCollapsed));
  mixerToggleIcon.classList.toggle("up", !state.ui.mixerCollapsed);

  padSynthPanel.classList.toggle("collapsed", state.ui.padSynthCollapsed);
  padSynthToggle.setAttribute("aria-expanded", String(!state.ui.padSynthCollapsed));
  padSynthToggleIcon.classList.toggle("up", !state.ui.padSynthCollapsed);

  drumEditorPanel.classList.toggle("collapsed", state.ui.drumEditorCollapsed);
  drumEditorToggle.setAttribute("aria-expanded", String(!state.ui.drumEditorCollapsed));
  drumEditorToggleIcon.classList.toggle("up", !state.ui.drumEditorCollapsed);
}

function toggleDrumStep(instrument, step) {
  const pattern = getCurrentDrumPattern();
  const stepIndex = pattern.events.findIndex((event) => event.instrument === instrument && event.step === step);

  if (stepIndex >= 0) {
    pattern.events.splice(stepIndex, 1);
  } else {
    pattern.events.push(createDrumEvent(instrument, step, DRUM_NORMAL_VELOCITY));
    pattern.events.sort((a, b) => a.step - b.step || drumInstruments.indexOf(a.instrument) - drumInstruments.indexOf(b.instrument));
  }

  state.drumPatternId = `scene:${state.sceneId}`;
  setStatus(`${instrument.toUpperCase()} step ${step + 1} ${stepIndex >= 0 ? "off" : "on"}.`);
  saveAppState();
  renderDrumSteps();
}

function cycleDrumStepAccent(instrument, step) {
  const pattern = getCurrentDrumPattern();
  let event = getDrumEvent(pattern, instrument, step);

  if (!event) {
    event = createDrumEvent(instrument, step, DRUM_ACCENT_VELOCITY, true);
    pattern.events.push(event);
  } else {
    event.accent = !event.accent;
    event.velocity = event.accent ? DRUM_ACCENT_VELOCITY : DRUM_NORMAL_VELOCITY;
  }

  pattern.events.sort((a, b) => a.step - b.step || drumInstruments.indexOf(a.instrument) - drumInstruments.indexOf(b.instrument));
  state.drumPatternId = `scene:${state.sceneId}`;
  setStatus(`${instrument.toUpperCase()} step ${step + 1} ${event.accent ? "accent" : "normal"}.`);
  saveAppState();
  renderDrumSteps();
}

function markRecentStepDoubleTap(instrument, step) {
  state.recentStepDoubleTap = { instrument, step, time: Date.now() };
}

function wasRecentlyDoubleTapped(instrument, step) {
  return (
    state.recentStepDoubleTap &&
    state.recentStepDoubleTap.instrument === instrument &&
    state.recentStepDoubleTap.step === step &&
    Date.now() - state.recentStepDoubleTap.time < 350
  );
}

function handleDrumStepTap(instrument, step, clickCount = 1) {
  if (state.ui.accentEditMode) {
    if (state.pendingStepTap) {
      window.clearTimeout(state.pendingStepTap.timerId);
      state.pendingStepTap = null;
    }
    cycleDrumStepAccent(instrument, step);
    return;
  }

  if (clickCount >= 2) {
    handleDrumStepDoubleTap(instrument, step);
    return;
  }

  const sameStep =
    state.pendingStepTap &&
    state.pendingStepTap.instrument === instrument &&
    state.pendingStepTap.step === step;

  if (sameStep) {
    window.clearTimeout(state.pendingStepTap.timerId);
    state.pendingStepTap = null;
    cycleDrumStepAccent(instrument, step);
    markRecentStepDoubleTap(instrument, step);
    return;
  }

  if (state.pendingStepTap) {
    window.clearTimeout(state.pendingStepTap.timerId);
    toggleDrumStep(state.pendingStepTap.instrument, state.pendingStepTap.step);
  }

  const timerId = window.setTimeout(() => {
    toggleDrumStep(instrument, step);
    state.pendingStepTap = null;
  }, 420);

  state.pendingStepTap = { instrument, step, timerId };
}

function handleDrumStepDoubleTap(instrument, step) {
  if (wasRecentlyDoubleTapped(instrument, step)) return;

  if (state.pendingStepTap) {
    window.clearTimeout(state.pendingStepTap.timerId);
    state.pendingStepTap = null;
  }

  cycleDrumStepAccent(instrument, step);
  markRecentStepDoubleTap(instrument, step);
}

function resetCurrentDrumPattern() {
  const scene = scenes[state.sceneId];
  if (scene.groove === "auto") {
    sceneDrumPatterns[state.sceneId] = createEmptyPattern("empty");
  } else {
    scene.meter = getGrooveDefaultMeter(scene.groove);
    sceneDrumPatterns[state.sceneId] = createGroovePattern(scene.groove, scene.meter);
  }
  state.drumPatternId = `groove:${scene.groove || "auto"}`;
  state.drumStep = 0;
  state.drumSubStep = 0;
  saveAppState();
  setStatus(`Patron de ${scene.name} restaurado.`);
  renderSceneButtons();
  renderDrumEditor();
}

function applyChannelGain(channel) {
  if (!state[`${channel}Gain`]) return;

  const now = state.audioContext.currentTime;
  const scale = channel === "arp" ? 0.30 : channel === "pad" ? Math.pow(10, 12 / 20) : 1;
  const targetValue = state.muted[channel] ? 0 : state.volumes[channel] * scale;
  state[`${channel}Gain`].gain.cancelScheduledValues(now);
  state[`${channel}Gain`].gain.setTargetAtTime(targetValue, now, 0.02);
}

function setChannelVolume(channel, value) {
  state.volumes[channel] = Math.max(0, Math.min(1, Number(value) / 100));
  applyChannelGain(channel);
  saveAppStateDebounced();
  renderTransport();
}

function toggleMute(channel) {
  state.muted[channel] = !state.muted[channel];
  applyChannelGain(channel);
  setStatus(state.muted[channel] ? `${channel.toUpperCase()} mute activado.` : `${channel.toUpperCase()} mute desactivado.`);
  saveAppState();
  renderTransport();
}

function resetChannelVolume(channel) {
  state.volumes[channel] = state.defaultVolumes[channel];
  if (state.muted[channel]) {
    state.muted[channel] = false;
  }

  applyChannelGain(channel);
  setStatus(`${channel.toUpperCase()} volvio al nivel inicial.`);
  saveAppState();
  renderTransport();
}

function restartPadIfPlaying(fadeSeconds = 0.8) {
  if (!state.isPlaying) return;

  const nextPad = createPad(scenes[state.sceneId], true);
  stopPad(state.activePad, fadeSeconds);
  state.activePad = nextPad;
}

function updatePadSetting(setting, value) {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  const currentSettings = normalizePadSettings(scene.padSettings);
  if (setting === "mood") {
    const moodId = PAD_MOODS[value] ? value : PAD_DEFAULTS.mood;
    const mood = PAD_MOODS[moodId];
    scene.padSettings = normalizePadSettings({
      mood: moodId,
      movement: mood.movement,
      shimmer: mood.shimmer,
      warmth: mood.warmth,
      space: mood.space,
      texture: mood.texture,
      evolve: currentSettings.evolve,
    });
  } else if (setting === "evolve") {
    scene.padSettings = normalizePadSettings({
      ...currentSettings,
      evolve: !currentSettings.evolve,
    });
  } else {
    scene.padSettings = normalizePadSettings({
      ...currentSettings,
      [setting]: value,
    });
  }

  restartPadIfPlaying(0.55);
  saveAppState();
  renderTransport();
  renderSceneButtons();
  setStatus(`Pad ${PAD_MOODS[scene.padSettings.mood].name} actualizado.`);
}

function getDrumVoice(instrument) {
  const voiceId = state.drumVoiceIds[instrument];
  return drumVoices[instrument][voiceId] || Object.values(drumVoices[instrument])[0];
}

function getNextDrumVoiceId(instrument) {
  const voiceIds = Object.keys(drumVoices[instrument]);
  const currentIndex = Math.max(0, voiceIds.indexOf(state.drumVoiceIds[instrument]));
  return voiceIds[(currentIndex + 1) % voiceIds.length];
}

function getInstrumentLabel(instrument) {
  return {
    kick: "Kick",
    snare: "Snare",
    hat: "Hi-hat",
  }[instrument] || instrument;
}

async function decodeDrumSample(instrument) {
  if (!state.audioContext || state.drumSampleBuffers[instrument] || !state.drumSampleData[instrument]) return;

  const sourceData = state.drumSampleData[instrument];
  const decodeData = sourceData.slice ? sourceData.slice(0) : sourceData;
  state.drumSampleBuffers[instrument] = await state.audioContext.decodeAudioData(decodeData);
}

async function decodeStoredDrumSamples() {
  await Promise.all(drumInstruments.map((instrument) => decodeDrumSample(instrument).catch(() => {
    state.drumSampleBuffers[instrument] = null;
  })));
}

function playDrumSample(instrument, time, velocity = 1) {
  if (!state.drumSampleEnabled[instrument]) return false;

  const buffer = state.drumSampleBuffers[instrument];
  if (!buffer) return false;

  const source = state.audioContext.createBufferSource();
  const gain = state.audioContext.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(Math.max(0.001, velocity), time);
  source.connect(gain);
  gain.connect(state.drumGain);
  source.start(time);
  return true;
}


function createPadEQ(ctx) {
  const BAND_FREQS = [80, 150, 250, 400, 800, 2000, 3500, 6000, 12000];
  const input = ctx.createGain();
  const filters = BAND_FREQS.map(freq => {
    const f = ctx.createBiquadFilter();
    f.type = "peaking"; f.frequency.value = freq; f.Q.value = 1.2; f.gain.value = 0;
    return f;
  });
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 20; hpf.Q.value = 0.7;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass"; lpf.frequency.value = 20000; lpf.Q.value = 0.7;
  const outGain = ctx.createGain();
  outGain.gain.value = 1;
  const output = ctx.createGain();
  let prev = input;
  for (const f of filters) { prev.connect(f); prev = f; }
  prev.connect(hpf); hpf.connect(lpf); lpf.connect(outGain); outGain.connect(output);
  return {
    input, output,
    setBand(i, db) { filters[i].gain.setTargetAtTime(db, ctx.currentTime, 0.01); },
    setHPF(hz) { hpf.frequency.setTargetAtTime(Math.max(20, hz), ctx.currentTime, 0.01); },
    setLPF(hz) { lpf.frequency.setTargetAtTime(Math.min(20000, hz), ctx.currentTime, 0.01); },
    setOutput(db) { outGain.gain.setTargetAtTime(Math.pow(10, db / 20), ctx.currentTime, 0.01); },
    setBandEnabled(i, on, s) {
      const db = on && s.enabled ? (s.bands[i] ?? 0) : 0;
      this.setBand(i, db);
    },
    applyState(s) {
      s.bands.forEach((db, i) => {
        const on = s.bandsEnabled ? s.bandsEnabled[i] !== false : true;
        this.setBand(i, s.enabled && on ? db : 0);
      });
      this.setHPF(s.enabled ? s.hpf : 20);
      this.setLPF(s.enabled ? s.lpf : 20000);
      this.setOutput(s.enabled ? s.output : 0);
    },
  };
}

function ensureAudio() {
  if (state.audioContext) return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    setStatus("Este navegador no soporta Web Audio.");
    return;
  }

  state.audioContext = new AudioContext();

  // When iOS resumes the AudioContext after lock-screen suspension, restart the scheduler.
  // safeRestartScheduler has a 1-s cooldown to prevent double-firing if statechange
  // transitions through multiple states.
  state.audioContext.addEventListener('statechange', () => {
    if (state.audioContext.state === 'running' && state.isPlaying) {
      safeRestartScheduler();
    }
  });

  state.masterGain = state.audioContext.createGain();
  state.masterGain.gain.value = 0.9;
  state.masterGain.connect(state.audioContext.destination);

  state.padGain = state.audioContext.createGain();
  state.loopGain = state.audioContext.createGain();
  state.clickGain = state.audioContext.createGain();
  state.drumGain = state.audioContext.createGain();
  state.arpGain = state.audioContext.createGain();
  state.arpTrimNode = state.audioContext.createGain();
  state.arpTrimNode.gain.value = Math.pow(10, (state.arp.outputGain || 0) / 20);
  state.padGain.gain.value = state.muted.pad ? 0 : state.volumes.pad * Math.pow(10, 12 / 20);
  state.loopGain.gain.value = state.muted.loop ? 0 : state.volumes.loop;
  state.clickGain.gain.value = state.muted.click ? 0 : state.volumes.click;
  state.drumGain.gain.value = state.muted.drum ? 0 : state.volumes.drum;
  state.arpGain.gain.value = state.muted.arp ? 0 : state.volumes.arp * 0.30;
  state.padGain.connect(state.masterGain);
  state.padEqNode = createPadEQ(state.audioContext);
  state.padEqNode.output.connect(state.padGain);
  state.padEqNode.applyState(state.padEq);
  state.loopGain.connect(state.masterGain);
  state.clickGain.connect(state.masterGain);
  state.drumGain.connect(state.masterGain);
  state.arpGain.connect(state.arpTrimNode);
  state.arpTrimNode.connect(state.masterGain);

  state.arpEQNode = createArpEQ(state.audioContext);
  state.arpEQNode.setLowCut(state.arp.lowcut);
  state.arpEQNode.setHighCut(state.arp.highcut);

  state.arpSatNode = createArpSaturator(state.audioContext);
  state.arpSatNode.setDrive(state.arp.saturation / 100 * 0.70);

  state.arpChorusNode = createJunoChorus(state.audioContext);
  state.arpChorusNode.setMix(state.arp.chorus / 100);

  state.arpReverbNode = createArpReverb(state.audioContext);
  state.arpReverbNode.setSend(state.arp.reverb / 100);

  state.arpDelayNode = createArpDelay(state.audioContext);
  state.arpDelayNode.setFeedback(state.arp.delayFeedback / 100);
  state.arpDelayNode.setWet(state.arp.delayWet / 100);

  state.arpLFONode = createArpLFO(state.audioContext);
  state.arpLFONode.setRate(state.arp.lfoRate);
  state.arpLFONode.setShape(state.arp.lfoShape);
  state.arpLFONode.setTarget(state.arp.lfoTarget);
  state.arpLFONode.setDepth(state.arp.lfoEnabled ? state.arp.lfoDepth / 100 : 0);

  // Chain: EQ → Sat → Chorus → LFO → [dry + Reverb send + Delay send] → arpGain
  state.arpEQNode.output.connect(state.arpSatNode.input);
  state.arpSatNode.output.connect(state.arpChorusNode.input);
  state.arpChorusNode.output.connect(state.arpLFONode.input);
  state.arpLFONode.output.connect(state.arpGain);
  state.arpLFONode.output.connect(state.arpReverbNode.send);
  state.arpReverbNode.returnGain.connect(state.arpGain);
  state.arpLFONode.output.connect(state.arpDelayNode.input);
  state.arpDelayNode.output.connect(state.arpGain);
}

async function unlockAudio() {
  ensureAudio();
  if (!state.audioContext) return false;

  if (state.audioContext.state !== "running") {
    await state.audioContext.resume();
  }
  await decodeStoredDrumSamples();

  const now = state.audioContext.currentTime;
  const unlockGain = state.audioContext.createGain();
  const unlockOscillator = state.audioContext.createOscillator();

  unlockGain.gain.setValueAtTime(0.0001, now);
  unlockGain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  unlockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  unlockOscillator.type = "sine";
  unlockOscillator.frequency.setValueAtTime(880, now);
  unlockOscillator.connect(unlockGain);
  unlockGain.connect(state.clickGain);
  unlockOscillator.start(now);
  unlockOscillator.stop(now + 0.2);

  state.unlocked = state.audioContext.state === "running";
  return state.unlocked;
}

function playMetronomeClick(accentLevel = "weak", time = state.audioContext?.currentTime) {
  if (!state.audioContext || !state.metronomeEnabled) return;

  const s = {
    strong: { freq: 1800, endFreq: 700, gain: 0.72, decay: 0.032 },
    medium: { freq: 1300, endFreq: 520, gain: 0.50, decay: 0.026 },
    weak:   { freq: 1000, endFreq: 400, gain: 0.33, decay: 0.022 },
  }[accentLevel] ?? { freq: 1000, endFreq: 400, gain: 0.33, decay: 0.022 };

  const oscillator = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(s.freq, time);
  oscillator.frequency.exponentialRampToValueAtTime(s.endFreq, time + s.decay);

  gain.gain.setValueAtTime(s.gain, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + s.decay);

  oscillator.connect(gain);
  gain.connect(state.clickGain);
  oscillator.start(time);
  oscillator.stop(time + s.decay + 0.005);
}

function scheduleMetronomePulse(pulseTime, beatDurationSeconds) {
  if (!state.audioContext || !state.metronomeEnabled) return;

  const config = getMeterConfig();
  const { accentMap, pulseType, accentGroups } = config;
  const pulseIndex = state.beat - 1;

  // For irregular meters where accentGroups cluster pulses into musical beats
  // (e.g. 7/8: pulseCount=7 eighth-note pulses, accentGroups=[2,2,3] → 3 musical beats)
  const hasMusicalGrouping = pulseType === "irregular" && accentGroups.length < config.pulseCount;

  if (state.clickMode === "pulse") {
    if (hasMusicalGrouping) {
      // 7/8 pulse mode: click only at the start of each group (3 clicks at positions 0, 2, 4)
      let pos = 0;
      for (let g = 0; g < accentGroups.length; g++) {
        if (pulseIndex === pos) {
          playMetronomeClick(g === 0 ? "strong" : "weak", pulseTime);
          break;
        }
        pos += accentGroups[g];
      }
    } else {
      // All other meters: one click per scheduler pulse with accentMap
      const baseUnitsPerPulse = config.baseUnitCount / config.pulseCount;
      const baseUnitStart = Math.round(pulseIndex * baseUnitsPerPulse);
      playMetronomeClick(accentMap[baseUnitStart] || "weak", pulseTime);
    }
    return;
  }

  // Subdivision mode
  if (pulseType === "compound") {
    // 6/8, 9/8, 12/8: fire baseUnitsPerPulse clicks per scheduler pulse, use accentMap
    const baseUnitsPerPulse = config.baseUnitCount / config.pulseCount;
    const baseUnitStart = Math.round(pulseIndex * baseUnitsPerPulse);
    const subdivisionSeconds = beatDurationSeconds / baseUnitsPerPulse;
    for (let i = 0; i < baseUnitsPerPulse; i++) {
      playMetronomeClick(accentMap[baseUnitStart + i] || "weak", pulseTime + subdivisionSeconds * i);
    }
  } else if (pulseType === "irregular") {
    // 5/4, 7/8: one click per scheduler pulse using accentMap
    // accentMap has only "strong" on beat 0, rest "weak" → neutral, no grouping imposed
    playMetronomeClick(accentMap[pulseIndex] || "weak", pulseTime);
  } else {
    // Simple (2/4, 3/4, 4/4): 2 eighth notes per pulse, first = pulse accent, second = weak
    const subdivisionSeconds = beatDurationSeconds / 2;
    playMetronomeClick(accentMap[pulseIndex] || "weak", pulseTime);
    playMetronomeClick("weak", pulseTime + subdivisionSeconds);
  }
}



function playLoopStep(beat, time = state.audioContext?.currentTime) {
  if (!state.audioContext || !state.loopEnabled) return;

  const gain = state.audioContext.createGain();
  const oscillator = state.audioContext.createOscillator();
  const filter = state.audioContext.createBiquadFilter();
  const isAccent = beat === 1 || beat === 3;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(isAccent ? 0.32 : 0.18, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(isAccent ? 900 : 1400, time);
  filter.Q.setValueAtTime(8, time);

  oscillator.type = beat === 2 || beat === 4 ? "triangle" : "sawtooth";
  oscillator.frequency.setValueAtTime(isAccent ? 110 : 220, time);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(state.loopGain);
  oscillator.start(time);
  oscillator.stop(time + 0.2);
}

function applyPendingLoop() {
  if (state.pendingLoopEnabled === null) return;

  state.loopEnabled = state.pendingLoopEnabled;
  state.pendingLoopEnabled = null;
  renderTransport();
  setStatus(state.loopEnabled ? "Loop activo desde este compas." : "Loop detenido desde este compas.");
}

function applyPendingDrums() {
  if (state.pendingDrumsEnabled === null) return;

  state.drumsEnabled = state.pendingDrumsEnabled;
  state.pendingDrumsEnabled = null;
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  clearDrumTimers();
  renderTransport();
  setStatus(state.drumsEnabled ? "Drums activos desde este compas." : "Drums detenidos desde este compas.");
}

function playKick(time, velocity = 1) {
  if (playDrumSample("kick", time, velocity)) return;

  const kit = drumKits[state.drumKitId];
  const voice = getDrumVoice("kick");
  const gain = state.audioContext.createGain();
  const oscillator = state.audioContext.createOscillator();

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(kit.kickLevel * voice.levelScale * velocity, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + voice.decay);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(kit.kickStart * voice.startScale, time);
  oscillator.frequency.exponentialRampToValueAtTime(kit.kickEnd * voice.endScale, time + Math.max(0.08, voice.decay * 0.68));
  oscillator.connect(gain);
  gain.connect(state.drumGain);
  oscillator.start(time);
  oscillator.stop(time + voice.decay + 0.02);
}

function playSnare(time, velocity = 1) {
  if (playDrumSample("snare", time, velocity)) return;

  const kit = drumKits[state.drumKitId];
  const voice = getDrumVoice("snare");
  const bufferSize = state.audioContext.sampleRate * voice.decay;
  const buffer = state.audioContext.createBuffer(1, bufferSize, state.audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  const noise = state.audioContext.createBufferSource();
  const filter = state.audioContext.createBiquadFilter();
  const gain = state.audioContext.createGain();

  for (let index = 0; index < bufferSize; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
  }

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(kit.snareTone * voice.toneScale, time);
  filter.Q.setValueAtTime(voice.q, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(kit.snareLevel * voice.levelScale * velocity, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.04, voice.decay - 0.02));
  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(state.drumGain);
  noise.start(time);
  noise.stop(time + voice.decay);
}

function playHat(time, velocity = 1) {
  if (playDrumSample("hat", time, velocity)) return;

  const kit = drumKits[state.drumKitId];
  const voice = getDrumVoice("hat");
  const bufferSize = state.audioContext.sampleRate * voice.decay;
  const buffer = state.audioContext.createBuffer(1, bufferSize, state.audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  const noise = state.audioContext.createBufferSource();
  const filter = state.audioContext.createBiquadFilter();
  const gain = state.audioContext.createGain();

  for (let index = 0; index < bufferSize; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  filter.type = "highpass";
  filter.frequency.setValueAtTime(kit.hatTone * voice.toneScale, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(kit.hatLevel * voice.levelScale * velocity, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.02, voice.decay - 0.01));
  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(state.drumGain);
  noise.start(time);
  noise.stop(time + voice.decay);
}

function playDrumStep(time = state.audioContext?.currentTime) {
  if (!state.audioContext || !state.drumsEnabled) return null;

  const fullCount = getMeterConfig().defaultGridResolution;
  const stepCount = getCurrentStepCount();
  const stepFactor = fullCount / stepCount;
  const localStep = state.drumStep % stepCount;
  const internalStep = localStep * stepFactor;
  const pattern = getCurrentDrumPattern();
  const events = getDrumEventsAtStep(pattern, internalStep);

  events.forEach((event) => {
    if (event.instrument === "kick") playKick(time, event.velocity);
    if (event.instrument === "snare") playSnare(time, event.velocity);
    if (event.instrument === "hat") playHat(time, event.velocity);
  });

  state.drumStep = (state.drumStep + 1) % stepCount;
  return internalStep;
}

function clearDrumTimers() {
  state.drumTimers.forEach((timerId) => window.clearTimeout(timerId));
  state.drumTimers = [];
}

function advanceDrums(pulseTime, beatDurationSeconds) {
  const config = getMeterConfig();
  const baseStepsPerPulse = getCurrentStepCount() / config.pulseCount;
  const rateMultipliers = { half: 0.5, normal: 1, double: 2, quad: 4 };
  const exactSteps = baseStepsPerPulse * (rateMultipliers[state.drumRate] ?? 1);
  const scheduledSteps = [];

  if (exactSteps < 1) {
    const skip = Math.round(1 / exactSteps);
    if (state.drumSubStep % skip === 0) {
      scheduledSteps.push({ step: playDrumStep(pulseTime), time: pulseTime });
    }
    state.drumSubStep++;
    return scheduledSteps;
  }

  const stepsThisPulse = Math.round(exactSteps);
  const stepInterval = beatDurationSeconds / stepsThisPulse;
  for (let i = 0; i < stepsThisPulse; i++) {
    const time = pulseTime + stepInterval * i;
    scheduledSteps.push({ step: playDrumStep(time), time });
  }
  return scheduledSteps;
}


function getKeyInfo(key = "C") {
  const isMinor = key.endsWith("m");
  const rootName = isMinor ? key.slice(0, -1) : key;
  return {
    rootMidi: NOTE_TO_MIDI[rootName] || NOTE_TO_MIDI.C,
    isMinor,
  };
}

function getPadChordFrequencies(key = "C", mood = PAD_MOODS.prayer) {
  const { rootMidi, isMinor } = getKeyInfo(key);
  const intervals = isMinor ? mood.intervalsMinor : mood.intervalsMajor;
  return intervals.map((interval) => midiToFrequency(rootMidi + mood.octaveShift + interval));
}

function createNoiseBuffer(seconds = 2) {
  const sampleRate = state.audioContext.sampleRate;
  const buffer = state.audioContext.createBuffer(1, sampleRate * seconds, sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * 0.55;
  }
  return buffer;
}

function createSaturationCurve(amount = 1) {
  const sampleCount = 256;
  const curve = new Float32Array(sampleCount);
  const drive = 1 + amount * 18;
  for (let index = 0; index < sampleCount; index += 1) {
    const x = (index * 2) / sampleCount - 1;
    curve[index] = Math.tanh(x * drive);
  }
  return curve;
}

function createPanNode(value = 0) {
  if (state.audioContext.createStereoPanner) {
    const panner = state.audioContext.createStereoPanner();
    panner.pan.value = value;
    return panner;
  }

  const gain = state.audioContext.createGain();
  gain.gain.value = 1;
  return gain;
}

function connectPitchShiftVoice(input, output, options = {}) {
  const now = state.audioContext.currentTime;
  const ratio = options.ratio || 2;
  const mix = options.mix || 0.2;
  const period = options.period || 0.18;
  const minDelay = options.minDelay || 0.012;
  const duration = options.duration || 180;
  const depth = Math.max(0.018, period * (1 - 1 / ratio));
  const voiceGain = state.audioContext.createGain();
  const delayA = state.audioContext.createDelay(1);
  const delayB = state.audioContext.createDelay(1);
  const gainA = state.audioContext.createGain();
  const gainB = state.audioContext.createGain();

  voiceGain.gain.setValueAtTime(mix, now);
  [delayA, delayB].forEach((delay) => {
    delay.delayTime.setValueAtTime(minDelay + depth, now);
  });
  [gainA, gainB].forEach((gain) => {
    gain.gain.setValueAtTime(0.0001, now);
  });

  const scheduleWindow = (delay, gain, offset) => {
    for (let time = now + offset; time < now + duration; time += period) {
      const fade = period * 0.5;
      delay.delayTime.cancelScheduledValues(time);
      delay.delayTime.setValueAtTime(minDelay + depth, time);
      delay.delayTime.linearRampToValueAtTime(minDelay, time + period);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(1, time + fade);
      gain.gain.linearRampToValueAtTime(0.0001, time + period);
    }
  };

  scheduleWindow(delayA, gainA, 0);
  scheduleWindow(delayB, gainB, period / 2);

  input.connect(delayA);
  input.connect(delayB);
  delayA.connect(gainA);
  delayB.connect(gainB);
  gainA.connect(voiceGain);
  gainB.connect(voiceGain);
  voiceGain.connect(output);

  return [voiceGain, delayA, delayB, gainA, gainB];
}

function createPad(scene, isCrossfade = false) {
  const now = state.audioContext.currentTime;
  const settings = normalizePadSettings(scene.padSettings);
  const mood = PAD_MOODS[settings.mood] || PAD_MOODS.prayer;
  const movement = settings.movement / 100;
  const shimmer = settings.shimmer / 100;
  const warmth = (settings.warmth / 100) ** 2;
  const space = settings.space / 100;
  const texture = Math.min(0.35, settings.texture / 100);
  const evolveLift = settings.evolve ? 1.12 : 1;
  const chord = getPadChordFrequencies(scene.key, mood);
  const nodes = [];
  const oscillators = [];

  const output = state.audioContext.createGain();
  const bodyGain = state.audioContext.createGain();
  const textureGain = state.audioContext.createGain();
  const filter = state.audioContext.createBiquadFilter();
  const saturation = state.audioContext.createWaveShaper();
  const delay = state.audioContext.createDelay(2.4);
  const feedback = state.audioContext.createGain();
  const delayGain = state.audioContext.createGain();
  const spaceFilter = state.audioContext.createBiquadFilter();
  // Hybrid FDN shimmer engine (body feed, pre-diffusion, prime delays, stereo decorrelation)
  const shimmerSourceBus = state.audioContext.createGain();
  const bodyShimmerSend = state.audioContext.createGain();
  const shimmerPreDelay = state.audioContext.createDelay(1.0);
  const shimmerHighpass = state.audioContext.createBiquadFilter();
  const shimmerPreDiff1 = state.audioContext.createBiquadFilter();
  const shimmerPreDiff2 = state.audioContext.createBiquadFilter();
  const shimmerPreDiff3 = state.audioContext.createBiquadFilter();
  const fdnDelaysMs = [31, 43, 59, 71, 83, 97];
  const fdnCombs = fdnDelaysMs.map(() => ({
    dly: state.audioContext.createDelay(0.5),
    lp: state.audioContext.createBiquadFilter(),
    fb: state.audioContext.createGain(),
  }));
  const fdnMixBus = state.audioContext.createGain();
  const shimmerDamping = state.audioContext.createBiquadFilter();
  const shimmerPostDiffA = state.audioContext.createBiquadFilter();
  const shimmerPostDiffB = state.audioContext.createBiquadFilter();
  const shimmerStereoL = state.audioContext.createDelay(0.1);
  const shimmerStereoR = state.audioContext.createDelay(0.1);
  const shimmerPanL = createPanNode(-0.62);
  const shimmerPanR = createPanNode(0.62);
  const shimmerOutputGain = state.audioContext.createGain();

  const bodyAttack = isCrossfade ? 0.30 : 1.3;
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime((0.26 + warmth * 0.019) * mood.bodyLevel, now + bodyAttack);
  bodyGain.gain.setValueAtTime((0.28 + warmth * 0.021) * mood.bodyLevel, now);
  textureGain.gain.setValueAtTime(0.001 + texture * 0.0116, now);
  delay.delayTime.setValueAtTime(mood.delayBase + space * 0.58, now);
  feedback.gain.setValueAtTime(Math.min(0.62, mood.feedbackBase + space * 0.24), now);
  delayGain.gain.setValueAtTime(0.02 + space * 0.34, now);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(mood.filterBase + warmth * 44 + shimmer * 180, now);
  filter.Q.setValueAtTime(mood.filterQ + movement * 1.6, now);
  saturation.curve = createSaturationCurve(warmth * 0.019 + (mood.wave === "sawtooth" ? 0.10 : 0));
  saturation.oversample = "2x";
  spaceFilter.type = "lowpass";
  spaceFilter.frequency.setValueAtTime(1800 + shimmer * 3400, now);
  // FDN shimmer parameters
  // Feedback 0.68–0.78 → RT60 ≈ 1.7–2.7 s (longest comb, 97 ms).
  // Steady-state comb gain = 1/(1-feedback). At fb=0.78: max 4.55x — input kept ≤ 0.10.
  // Body feed adds organic grounding; dual detuned shimmer oscs give natural width.
  shimmerSourceBus.gain.setValueAtTime(0.0001, now);
  shimmerSourceBus.gain.exponentialRampToValueAtTime(
    Math.max(0.001, shimmer * 0.11 * mood.shimmerLevel), now + 1.6
  );
  bodyShimmerSend.gain.setValueAtTime(shimmer * 0.42 * mood.shimmerLevel, now);
  shimmerPreDelay.delayTime.setValueAtTime(0.02 + space * 0.08, now);
  shimmerHighpass.type = "highpass";
  shimmerHighpass.frequency.setValueAtTime(settings.mood === "dark" ? 260 : 420, now);
  shimmerPreDiff1.type = "allpass";
  shimmerPreDiff1.frequency.setValueAtTime(560, now);
  shimmerPreDiff1.Q.setValueAtTime(0.88, now);
  shimmerPreDiff2.type = "allpass";
  shimmerPreDiff2.frequency.setValueAtTime(1350, now);
  shimmerPreDiff2.Q.setValueAtTime(0.88, now);
  shimmerPreDiff3.type = "allpass";
  shimmerPreDiff3.frequency.setValueAtTime(3100, now);
  shimmerPreDiff3.Q.setValueAtTime(0.88, now);
  fdnDelaysMs.forEach((ms, i) => {
    fdnCombs[i].dly.delayTime.setValueAtTime(ms / 1000, now);
    fdnCombs[i].lp.type = "lowpass";
    fdnCombs[i].lp.frequency.setValueAtTime(
      Math.max(900, 1400 + mood.shimmerColor * 2800 + shimmer * 1200 + space * 1200 - i * 70), now
    );
    fdnCombs[i].fb.gain.setValueAtTime(Math.min(0.80, 0.60 + space * 0.20), now);
  });
  fdnMixBus.gain.setValueAtTime(1 / 6, now);
  shimmerDamping.type = "lowpass";
  shimmerDamping.frequency.setValueAtTime(
    Math.max(1400, 1800 + mood.shimmerColor * 3000 + shimmer * 1200 + space * 1400), now
  );
  shimmerPostDiffA.type = "allpass";
  shimmerPostDiffA.frequency.setValueAtTime(900, now);
  shimmerPostDiffA.Q.setValueAtTime(0.82, now);
  shimmerPostDiffB.type = "allpass";
  shimmerPostDiffB.frequency.setValueAtTime(2200, now);
  shimmerPostDiffB.Q.setValueAtTime(0.82, now);
  shimmerStereoL.delayTime.setValueAtTime(0.016 + space * 0.024, now);
  shimmerStereoR.delayTime.setValueAtTime(0.026 + space * 0.038, now);
  shimmerOutputGain.gain.setValueAtTime(0.0001, now);
  shimmerOutputGain.gain.exponentialRampToValueAtTime(
    Math.max(0.001, (0.36 + shimmer * 1.21 + space * 0.47) * mood.shimmerLevel), now + (isCrossfade ? 0.45 : 1.8)
  );

  chord.forEach((frequency, index) => {
    // Three-voice unison per chord note: saw outer spread + triangle center warm fill.
    // Balanced gains (≈ 1.4 : 1.1 : 1) produce the "lush unison" chorus effect
    // instead of one dominant voice with a faint shimmer underneath.
    const oscillator = state.audioContext.createOscillator();
    const detunedOscillator = state.audioContext.createOscillator();
    const warmOscillator = state.audioContext.createOscillator();
    const voiceGain = state.audioContext.createGain();
    const detunedGain = state.audioContext.createGain();
    const warmGain = state.audioContext.createGain();
    oscillator.type = index % 2 === 0 ? mood.wave : "triangle";
    detunedOscillator.type = mood.wave === "sine" ? "triangle" : mood.wave;
    warmOscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    detunedOscillator.frequency.setValueAtTime(frequency, now);
    warmOscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(index * 2 - mood.detune * 0.5, now);
    detunedOscillator.detune.setValueAtTime(mood.detune * (0.55 + warmth * 0.056) + index * 2, now);
    warmOscillator.detune.setValueAtTime(mood.detune * (0.36 + index * 0.04), now);
    voiceGain.gain.setValueAtTime((index === 0 ? 0.26 : 0.17) * (1 - index * 0.04), now);
    detunedGain.gain.setValueAtTime((0.10 + warmth * 0.010) * (1 - index * 0.07), now);
    warmGain.gain.setValueAtTime((0.11 + warmth * 0.009) * (1 - index * 0.06), now);
    oscillator.connect(voiceGain);
    detunedOscillator.connect(detunedGain);
    warmOscillator.connect(warmGain);
    voiceGain.connect(filter);
    detunedGain.connect(filter);
    warmGain.connect(filter);
    oscillator.start(now);
    detunedOscillator.start(now);
    warmOscillator.start(now);
    oscillators.push(oscillator, detunedOscillator, warmOscillator);
    nodes.push(voiceGain, detunedGain, warmGain);
  });

  // Shimmer voices: dual detuned oscillators per chord note at octave (+12st = ×2).
  // Voices A (−3 cents) and B (+3 cents) beat slightly against each other creating
  // natural width and a slowly-evolving cloud instead of static pitched tones.
  if (shimmer > 0.02) {
    chord.forEach((frequency, index) => {
      const oscA = state.audioContext.createOscillator();
      const gainA = state.audioContext.createGain();
      oscA.type = "sine";
      oscA.frequency.setValueAtTime(frequency * 2, now);
      oscA.detune.setValueAtTime(-3 + index * 0.7, now);
      gainA.gain.setValueAtTime(Math.max(0.01, 0.12 - index * 0.022), now);
      oscA.connect(gainA);
      gainA.connect(shimmerSourceBus);
      oscA.start(now);
      oscillators.push(oscA);
      nodes.push(gainA);
      const oscB = state.audioContext.createOscillator();
      const gainB = state.audioContext.createGain();
      oscB.type = "sine";
      oscB.frequency.setValueAtTime(frequency * 2, now);
      oscB.detune.setValueAtTime(+3 + index * 0.7, now);
      gainB.gain.setValueAtTime(Math.max(0.01, 0.09 - index * 0.016), now);
      oscB.connect(gainB);
      gainB.connect(shimmerSourceBus);
      oscB.start(now);
      oscillators.push(oscB);
      nodes.push(gainB);
    });
    if (shimmer > 0.44 && (settings.mood === "heaven" || settings.mood === "cinematic" || settings.mood === "epic")) {
      chord.slice(0, 2).forEach((frequency) => {
        const oscFifth = state.audioContext.createOscillator();
        const gainFifth = state.audioContext.createGain();
        oscFifth.type = "sine";
        oscFifth.frequency.setValueAtTime(frequency * 3, now);
        gainFifth.gain.setValueAtTime((shimmer - 0.4) * 0.10 * mood.shimmerLevel, now);
        oscFifth.connect(gainFifth);
        gainFifth.connect(shimmerSourceBus);
        oscFifth.start(now);
        oscillators.push(oscFifth);
        nodes.push(gainFifth);
      });
    }
  }

  const noise = state.audioContext.createBufferSource();
  const textureFilter = state.audioContext.createBiquadFilter();
  const textureAntiHiss = state.audioContext.createBiquadFilter();
  noise.buffer = createNoiseBuffer(2);
  noise.loop = true;
  const isLowTexture = settings.mood === "dark" || settings.mood === "intimate";
  const isAirTexture = settings.mood === "prayer" || settings.mood === "heaven";
  textureFilter.type = isLowTexture ? "lowpass" : isAirTexture ? "highpass" : "bandpass";
  textureFilter.frequency.setValueAtTime(mood.textureTone + settings.texture * 22, now);
  textureFilter.Q.setValueAtTime(isAirTexture ? 0.60 : 0.65 + texture * 4, now);
  textureAntiHiss.type = "highshelf";
  textureAntiHiss.frequency.setValueAtTime(3800, now);
  textureAntiHiss.gain.setValueAtTime(-texture * 26, now);
  const textureFlutterDelay = state.audioContext.createDelay(0.02);
  const textureFlutterLfo = state.audioContext.createOscillator();
  const textureFlutterDepth = state.audioContext.createGain();
  textureFlutterDelay.delayTime.setValueAtTime(0.003, now);
  textureFlutterLfo.type = "sine";
  textureFlutterLfo.frequency.setValueAtTime(1.3 + Math.random() * 0.8, now);
  textureFlutterDepth.gain.setValueAtTime(0.0007, now);
  textureFlutterLfo.connect(textureFlutterDepth);
  textureFlutterDepth.connect(textureFlutterDelay.delayTime);
  textureFlutterLfo.start(now);
  noise.connect(textureFilter);
  textureFilter.connect(textureAntiHiss);
  textureAntiHiss.connect(textureFlutterDelay);
  textureFlutterDelay.connect(textureGain);
  noise.start(now);
  oscillators.push(noise);

  const lfo = state.audioContext.createOscillator();
  const lfoDepth = state.audioContext.createGain();
  const barsPerCycle = 4 + (1 - movement) * 12;
  const barSeconds = (60 / state.bpm) * getBeatsPerBar();
  lfo.frequency.setValueAtTime(1 / Math.max(6, barSeconds * barsPerCycle), now);
  const filterCenter = mood.filterBase + warmth * 44 + shimmer * 180;
  lfoDepth.gain.setValueAtTime(Math.min(filterCenter * 0.82, (140 + movement * 820) * evolveLift), now);
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);
  lfo.start(now);
  oscillators.push(lfo);

  const delayLfo = state.audioContext.createOscillator();
  const delayLfoDepth = state.audioContext.createGain();
  delayLfo.frequency.setValueAtTime(1 / Math.max(5, barSeconds * (2 + movement * 6)), now);
  delayLfoDepth.gain.setValueAtTime(0.006 + movement * 0.035, now);
  delayLfo.connect(delayLfoDepth);
  delayLfoDepth.connect(delay.delayTime);
  delayLfo.start(now);
  oscillators.push(delayLfo);

  // Micro modulation: subtle LFO on two FDN delay lines to prevent metallic character
  const shimmerModLfo = state.audioContext.createOscillator();
  const shimmerModDepth = state.audioContext.createGain();
  shimmerModLfo.frequency.setValueAtTime(0.06 + movement * 0.1, now);
  shimmerModDepth.gain.setValueAtTime(0.0012 + movement * 0.0016, now);
  shimmerModLfo.connect(shimmerModDepth);
  fdnCombs.forEach(({ dly }) => shimmerModDepth.connect(dly.delayTime));
  shimmerModLfo.start(now);
  oscillators.push(shimmerModLfo, textureFlutterLfo);

  filter.connect(saturation);
  saturation.connect(bodyGain);
  saturation.connect(bodyShimmerSend);
  bodyGain.connect(output);
  // FDN shimmer signal chain
  shimmerSourceBus.connect(shimmerPreDelay);
  bodyShimmerSend.connect(shimmerPreDelay);
  shimmerPreDelay.connect(shimmerHighpass);
  shimmerHighpass.connect(shimmerPreDiff1);
  shimmerPreDiff1.connect(shimmerPreDiff2);
  shimmerPreDiff2.connect(shimmerPreDiff3);
  fdnCombs.forEach(({ dly, lp, fb }) => {
    shimmerPreDiff3.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    dly.connect(fdnMixBus);
  });
  fdnMixBus.connect(shimmerDamping);
  shimmerDamping.connect(shimmerPostDiffA);
  shimmerPostDiffA.connect(shimmerPostDiffB);
  shimmerPostDiffB.connect(shimmerStereoL);
  shimmerPostDiffB.connect(shimmerStereoR);
  shimmerStereoL.connect(shimmerPanL);
  shimmerStereoR.connect(shimmerPanR);
  shimmerPanL.connect(shimmerOutputGain);
  shimmerPanR.connect(shimmerOutputGain);
  shimmerOutputGain.connect(output);
  textureGain.connect(output);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(spaceFilter);
  spaceFilter.connect(delayGain);
  delayGain.connect(output);
  output.connect(state.padEqNode ? state.padEqNode.input : state.padGain);

  nodes.push(
    output,
    bodyGain,
    textureGain,
    filter,
    saturation,
    delay,
    feedback,
    delayGain,
    spaceFilter,
    textureFilter,
    textureAntiHiss,
    textureFlutterDelay,
    textureFlutterDepth,
    lfoDepth,
    delayLfoDepth,
    shimmerSourceBus,
    shimmerPreDelay,
    shimmerHighpass,
    fdnMixBus,
    shimmerDamping,
    shimmerPostDiffA,
    shimmerPostDiffB,
    shimmerStereoL,
    shimmerStereoR,
    shimmerPanL,
    shimmerPanR,
    shimmerOutputGain,
    shimmerModDepth,
    bodyShimmerSend,
    shimmerPreDiff1,
    shimmerPreDiff2,
    shimmerPreDiff3,
    ...fdnCombs.flatMap(({ dly, lp, fb }) => [dly, lp, fb]),
  );
  return { output, oscillators, nodes };
}

function stopPad(pad, fadeSeconds = 1) {
  if (!pad) return;

  const now = state.audioContext.currentTime;
  pad.output.gain.cancelScheduledValues(now);
  pad.output.gain.setValueAtTime(Math.max(pad.output.gain.value, 0.0001), now);
  pad.output.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);

  window.setTimeout(() => {
    pad.oscillators.forEach((oscillator) => oscillator.stop());
    pad.nodes.forEach((node) => node.disconnect());
  }, fadeSeconds * 1000 + 80);
}

function startPadForScene(sceneId) {
  ensureAudio();
  const nextPad = createPad(scenes[sceneId]);
  stopPad(state.activePad, 1.4);
  state.activePad = nextPad;
}

function clearScheduledUiEvents() {
  state.scheduledUiEvents.forEach((timerId) => window.clearTimeout(timerId));
  state.scheduledUiEvents = [];
}

function applyPulseBoundary() {
  state.beat += 1;
  if (state.beat > getBeatsPerBar()) {
    state.beat = 1;
    state.bar += 1;
    applyPendingScene();
    applyPendingLoop();
    applyPendingDrums();
  }
}

function scheduleUiPulse(pulseTime, beat, bar) {
  const delayMs = Math.max(0, (pulseTime - state.audioContext.currentTime) * 1000);
  const timerId = window.setTimeout(() => {
    state.displayBeat = beat;
    state.displayBar = bar;
    pulse.classList.add("on");
    window.setTimeout(() => pulse.classList.remove("on"), 110);
    renderTransport();
  }, delayMs);
  state.scheduledUiEvents.push(timerId);
}

function scheduleUiDrumStep(step, stepTime) {
  if (step === null || step === undefined) return;

  const delayMs = Math.max(0, (stepTime - state.audioContext.currentTime) * 1000);
  const timerId = window.setTimeout(() => {
    state.currentUiDrumStep = step;
    renderPlayingStep();
  }, delayMs);
  state.scheduledUiEvents.push(timerId);
}

function schedulePulse(pulseTime) {
  const beatDurationSeconds = 60 / state.bpm;
  const scheduledBeat = state.beat;
  const scheduledBar = state.bar;
  scheduleMetronomePulse(pulseTime, beatDurationSeconds);
  playLoopStep(state.beat, pulseTime);
  scheduleArpSteps(pulseTime, beatDurationSeconds, state, scenes, getKeyInfo);
  advanceDrums(pulseTime, beatDurationSeconds).forEach(({ step, time }) => {
    scheduleUiDrumStep(step, time);
  });
  scheduleUiPulse(pulseTime, scheduledBeat, scheduledBar);
  applyPulseBoundary();
}

function schedulerTick() {
  while (state.nextPulseTime < state.audioContext.currentTime + state.scheduleAheadSeconds) {
    schedulePulse(state.nextPulseTime);
    state.nextPulseTime += 60 / state.bpm;
  }
}

// Restarts the scheduler immediately but ignores further calls for 1 s.
// Guards against statechange firing more than once during an AudioContext transition.
let _restartCooldownUntil = 0;
function safeRestartScheduler() {
  const now = Date.now();
  if (now < _restartCooldownUntil) return;
  if (!state.isPlaying || state.audioContext?.state !== 'running') return;
  _restartCooldownUntil = now + 1000; // set only when a restart actually happens
  state.arp.nextNoteTime = null;
  window.clearInterval(state.tickTimer);
  scheduleTransport();
}

function scheduleTransport() {
  window.clearInterval(state.tickTimer);
  clearDrumTimers();
  clearScheduledUiEvents();
  state.nextPulseTime = state.audioContext.currentTime + 0.04;
  state.tickTimer = window.setInterval(schedulerTick, state.schedulerLookaheadMs);
  schedulerTick();
}

// ── Media Session ─────────────────────────────────────────────────────────────
// iOS PWA limitation: AudioContext suspends on screen lock — this is a WebKit
// restriction that requires native AVAudioSessionCategoryPlayback to bypass.
// What we CAN do: show lock-screen controls via Media Session so the user can
// tap Play to resume audio without unlocking the phone.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.audioContext?.state === 'suspended') {
    state.audioContext.resume(); // statechange listener restarts the scheduler
  }
});

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'ORI',
    artist: scenes[state.sceneId]?.name ?? 'Live Session',
    album: 'ORI',
  });
  navigator.mediaSession.setActionHandler('play', async () => {
    if (state.audioContext?.state === 'suspended') await state.audioContext.resume();
    if (!state.isPlaying) {
      play();
    } else {
      // Was playing before lock — AudioContext resumed, scheduler already restarted via statechange
      updateMediaSession();
    }
  });
  navigator.mediaSession.setActionHandler('pause', () => { if (state.isPlaying) pause(); });
  navigator.mediaSession.setActionHandler('stop',  () => { if (state.isPlaying) pause(); });
}

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  if (navigator.mediaSession.metadata) {
    navigator.mediaSession.metadata.artist = scenes[state.sceneId]?.name ?? 'Live Session';
  }
}
// ─────────────────────────────────────────────────────────────────────────────

async function play() {
  const isUnlocked = await unlockAudio();
  if (!isUnlocked) {
    setStatus(`Audio bloqueado por iOS. Estado: ${state.audioContext.state}`);
    return;
  }
  state.isPlaying = true;
  startPadForScene(state.sceneId);
  scheduleTransport();
  setupMediaSession();
  updateMediaSession();
  setStatus(`Sonando: ${scenes[state.sceneId].name}. Audio: ${state.audioContext.state}`);
  renderTransport();
}

function pause() {
  state.isPlaying = false;
  window.clearInterval(state.tickTimer);
  clearDrumTimers();
  clearScheduledUiEvents();
  stopPad(state.activePad, 0.8);
  state.activePad = null;
  updateMediaSession();
  setStatus("Pausado.");
  renderTransport();
}

function stop() {
  pause();
  state.bar = 1;
  state.beat = 1;
  state.displayBar = 1;
  state.displayBeat = 1;
  state.pendingSceneId = null;
  state.loopEnabled = false;
  state.pendingLoopEnabled = null;
  state.pendingDrumsEnabled = null;
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  state.arp.stepIndex = 0;
  state.arp.nextNoteTime = null;
  renderSceneButtons();
  renderTransport();
}

function setBpm(bpm, restartScheduler = true) {
  state.bpm = Math.max(48, Math.min(156, Number(bpm)));
  if (state.isPlaying && restartScheduler) scheduleTransport();
  renderTransport();
}

function renderSceneButtons() {
  sceneGrid.innerHTML = "";
  sceneOrder.forEach((sceneId) => {
    const scene = scenes[sceneId];
    if (!scene) return;

    const button = document.createElement("button");
    button.className = "scene";
    button.dataset.scene = sceneId;
    button.type = "button";
    const name = document.createElement("span");
    const details = document.createElement("small");
    const padMoodName = PAD_MOODS[scene.padSettings?.mood]?.name || PAD_MOODS.prayer.name;
    const arpLabel = scene.arpSettings?.enabled ? "Arp-On" : "Arp-Off";
    name.textContent = scene.name;
    details.textContent = `${scene.key || "C"} - ${scene.meter || "4/4"} - ${Math.round(scene.bpm)} BPM - ${padMoodName} pad - ${arpLabel}`;
    button.append(name, details);
    button.addEventListener("click", () => changeScene(sceneId));
    sceneGrid.appendChild(button);
  });

  sceneButtons = document.querySelectorAll(".scene");
  sceneButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.scene === state.sceneId);
    button.classList.toggle("pending", button.dataset.scene === state.pendingSceneId);
  });
  renderSceneControls();
}

function applyScenePresetSettings(sceneId) {
  const scene = scenes[sceneId];
  if (!scene) return;

  if (scene.drumKitId && drumKits[scene.drumKitId]) {
    state.drumKitId = scene.drumKitId;
  }
  if (["half", "normal", "double", "quad"].includes(scene.drumRate)) {
    state.drumRate = scene.drumRate;
  } else {
    state.drumRate = "normal";
  }
  if (scene.drumVoiceIds) {
    drumInstruments.forEach((instrument) => {
      const voiceId = scene.drumVoiceIds[instrument];
      if (drumVoices[instrument][voiceId]) {
        state.drumVoiceIds[instrument] = voiceId;
      }
    });
  }
  drumInstruments.forEach((instrument) => {
    const hasScenePreference = scene.drumSampleEnabled && typeof scene.drumSampleEnabled[instrument] === "boolean";
    state.drumSampleEnabled[instrument] = hasScenePreference ? scene.drumSampleEnabled[instrument] : false;
    const record = state.drumSampleEnabled[instrument] ? getStoredSampleRecord(sceneId, instrument) : null;
    applySampleRecordToInstrument(instrument, record);
    if (scene.drumSampleNames?.[instrument] && !state.drumSampleNames[instrument]) {
      state.drumSampleNames[instrument] = scene.drumSampleNames[instrument];
    }
    if (state.audioContext && state.drumSampleEnabled[instrument] && state.drumSampleData[instrument]) {
      decodeDrumSample(instrument).catch(() => {
        state.drumSampleBuffers[instrument] = null;
      });
    }
  });
}

function snapshotArpSettings() {
  return {
    enabled: state.arp.enabled,
    mode: state.arp.mode,
    rate: state.arp.rate,
    octaves: state.arp.octaves,
    gate: state.arp.gate,
    swing: state.arp.swing,
    voice: state.arp.voice,
    chorus: state.arp.chorus,
    reverb: state.arp.reverb,
    humanize: state.arp.humanize,
    glitch: state.arp.glitch,
    lowcut: state.arp.lowcut,
    highcut: state.arp.highcut,
    saturation: state.arp.saturation,
    delayTime: state.arp.delayTime,
    delayFeedback: state.arp.delayFeedback,
    delayWet: state.arp.delayWet,
    fxBypass: state.arp.fxBypass,
    lfoEnabled: state.arp.lfoEnabled,
    lfoRate: state.arp.lfoRate,
    lfoDepth: state.arp.lfoDepth,
    lfoShape: state.arp.lfoShape,
    lfoTarget: state.arp.lfoTarget,
    octShift: state.arp.octShift,
    outputGain: state.arp.outputGain,
    naturalAccent: state.arp.naturalAccent,
    customNotes: [...state.arp.customNotes],
  };
}

function applyArpSceneSettings(sceneId) {
  const scene = scenes[sceneId];
  if (!scene?.arpSettings) {
    state.arp.enabled = false;
    return;
  }
  const a = scene.arpSettings;
  if (typeof a.enabled === "boolean") state.arp.enabled = a.enabled;
  if (a.mode) state.arp.mode = a.mode;
  if (a.rate) state.arp.rate = a.rate;
  if (a.octaves) state.arp.octaves = a.octaves;
  if (typeof a.gate === "number") state.arp.gate = a.gate;
  if (typeof a.swing === "number") state.arp.swing = a.swing;
  if (a.voice) state.arp.voice = a.voice;
  if (typeof a.chorus === "number") state.arp.chorus = a.chorus;
  if (typeof a.reverb === "number") state.arp.reverb = a.reverb;
  if (typeof a.humanize === "number") state.arp.humanize = a.humanize;
  if (typeof a.glitch === "number") state.arp.glitch = a.glitch;
  if (typeof a.lowcut === "number") state.arp.lowcut = a.lowcut;
  if (typeof a.highcut === "number") state.arp.highcut = a.highcut;
  if (typeof a.saturation === "number") state.arp.saturation = a.saturation;
  if (a.delayTime) state.arp.delayTime = a.delayTime;
  if (typeof a.delayFeedback === "number") state.arp.delayFeedback = a.delayFeedback;
  if (typeof a.delayWet === "number") state.arp.delayWet = a.delayWet;
  if (typeof a.fxBypass === "boolean") state.arp.fxBypass = a.fxBypass;
  if (typeof a.lfoEnabled === "boolean") state.arp.lfoEnabled = a.lfoEnabled;
  if (typeof a.lfoRate === "number") state.arp.lfoRate = a.lfoRate;
  if (typeof a.lfoDepth === "number") state.arp.lfoDepth = a.lfoDepth;
  if (a.lfoShape) state.arp.lfoShape = a.lfoShape;
  if (a.lfoTarget) state.arp.lfoTarget = a.lfoTarget;
  if (typeof a.octShift === "number") state.arp.octShift = a.octShift;
  if (typeof a.outputGain === "number") { state.arp.outputGain = a.outputGain; if (state.arpTrimNode) state.arpTrimNode.gain.value = Math.pow(10, a.outputGain / 20); }
  if (state.arpLFONode) {
    state.arpLFONode.setRate(state.arp.lfoRate);
    state.arpLFONode.setShape(state.arp.lfoShape);
    state.arpLFONode.setTarget(state.arp.lfoTarget);
    state.arpLFONode.setDepth(state.arp.lfoEnabled ? state.arp.lfoDepth / 100 : 0);
  }
  if (typeof a.naturalAccent === "boolean") state.arp.naturalAccent = a.naturalAccent;
  if (Array.isArray(a.customNotes)) state.arp.customNotes = [...a.customNotes];
}

function applyPendingScene() {
  if (!state.pendingSceneId) return;

  const sceneId = state.pendingSceneId;
  state.pendingSceneId = null;
  state.sceneId = sceneId;
  state.drumPatternId = scenes[sceneId].drumPattern;
  applyScenePresetSettings(sceneId);
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.arp.stepIndex = 0;
  state.arp.nextNoteTime = null;
  state.beat = 1;
  state.displayBeat = 1;
  setBpm(scenes[sceneId].bpm, false);
  applyArpSceneSettings(sceneId);
  renderSceneButtons();
  renderDrumEditor();
  renderArp();

  if (state.isPlaying) startPadForScene(sceneId);
  setStatus(`Escena activa: ${scenes[sceneId].name}`);
}

function changeScene(sceneId) {
  if (sceneId === state.sceneId && !state.pendingSceneId) {
    setStatus(`Escena actual: ${scenes[sceneId].name}`);
    return;
  }

  if (!state.isPlaying) {
    state.pendingSceneId = null;
    state.sceneId = sceneId;
    state.drumPatternId = scenes[sceneId].drumPattern;
    applyScenePresetSettings(sceneId);
    state.drumStep = 0;
    state.currentUiDrumStep = -1;
    state.arp.stepIndex = 0;
    state.arp.nextNoteTime = null;
    state.beat = 1;
    state.displayBeat = 1;
    setBpm(scenes[sceneId].bpm);
    applyArpSceneSettings(sceneId);
    renderSceneButtons();
    renderDrumEditor();
    renderArp();
    setStatus(`Escena lista: ${scenes[sceneId].name}`);
    return;
  }

  state.pendingSceneId = sceneId;
  renderSceneButtons();
  setStatus(`Pendiente para proximo compas: ${scenes[sceneId].name}`);
}

function getCurrentBpmForPreset() {
  return state.bpm;
}

function saveCurrentPreset() {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  const nextName = sceneNameInput.value.trim();
  const nextBpm = getCurrentBpmForPreset(scene);
  const nextKey = sceneKeySelect.value;
  const nextMeter = sceneMeterSelect.value;
  const previousMeter = scene.meter;

  if (nextName) {
    scene.name = nextName;
  }
  scene.bpm = nextBpm;
  scene.key = nextKey;
  scene.meter = nextMeter;
  scene.drumKitId = state.drumKitId;
  scene.drumRate = state.drumRate;
  scene.drumVoiceIds = { ...state.drumVoiceIds };
  scene.drumSampleEnabled = { ...state.drumSampleEnabled };
  scene.drumSampleNames = { ...state.drumSampleNames };
  scene.padSettings = normalizePadSettings(scene.padSettings);
  scene.arpSettings = snapshotArpSettings();
  if (previousMeter !== nextMeter) {
    scene.groove = "auto";
    sceneDrumPatterns[state.sceneId] = createEmptyPattern("empty");
  } else {
    sceneDrumPatterns[state.sceneId] = fitPatternToMeter(sceneDrumPatterns[state.sceneId], nextMeter);
  }
  if (state.beat > getBeatsPerBar()) {
    state.beat = 1;
    state.bar += 1;
  }
  setBpm(nextBpm, false);
  saveAppState();
  renderSceneButtons();
  renderDrumEditor();
  setStatus(`Preset guardado: ${scene.name}`);
}

function previewSceneMeterChange() {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  const nextMeter = sceneMeterSelect.value;
  if (scene.meter === nextMeter) return;

  scene.meter = nextMeter;
  scene.groove = "auto";
  sceneDrumPatterns[state.sceneId] = createEmptyPattern("empty");
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  if (state.beat > getBeatsPerBar()) {
    state.beat = 1;
    state.displayBeat = 1;
  }
  renderSceneButtons();
  renderDrumEditor();
  renderTransport();
  setStatus(`Compas cambiado a ${nextMeter}. Toca Guardar.`);
}

function previewSceneKeyChange() {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  scene.key = sceneKeySelect.value;
  if (state.isPlaying) {
    startPadForScene(state.sceneId);
  }
  renderSceneButtons();
  renderTransport();
  renderArpPiano();
  setStatus(`Tonalidad cambiada a ${scene.key}. Toca Guardar.`);
}

function renameCurrentScene() {
  const scene = scenes[state.sceneId];
  if (!scene) return;

  const nextName = sceneNameInput.value.trim();
  if (!nextName) {
    setStatus("Escribe un nombre para renombrar la escena.");
    renderSceneControls();
    return;
  }

  scene.name = nextName;
  saveAppState();
  renderSceneButtons();
  setStatus(`Escena renombrada: ${scene.name}`);
}

function createNewScene() {
  const sceneId = `scene-${Date.now()}`;
  const currentKey = scenes[state.sceneId]?.key || "C";
  scenes[sceneId] = {
    name: "Nueva Escena",
    bpm: state.bpm,
    key: "C",
    meter: "4/4",
    groove: "auto",
    chord: [130.81, 196, 261.63, 329.63],
    drumPattern: "soft",
    drumKitId: state.drumKitId,
    drumRate: state.drumRate,
    drumVoiceIds: { ...state.drumVoiceIds },
    drumSampleEnabled: { ...state.drumSampleEnabled },
    drumSampleNames: { ...state.drumSampleNames },
    padSettings: normalizePadSettings(PAD_DEFAULTS),
    ...(currentKey === "C" && { arpSettings: snapshotArpSettings() }),
  };
  sceneDrumPatterns[sceneId] = createGroovePattern("auto", "4/4");
  sceneOrder.push(sceneId);
  state.sceneId = sceneId;
  state.pendingSceneId = null;
  state.drumPatternId = scenes[sceneId].drumPattern;
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  state.displayBeat = 1;
  setBpm(scenes[sceneId].bpm);
  saveAppState();
  renderSceneButtons();
  renderDrumEditor();
  setStatus("Nueva escena creada.");
}

function activateSceneImmediately(sceneId) {
  state.sceneId = sceneId;
  state.pendingSceneId = null;
  state.drumPatternId = scenes[sceneId].drumPattern;
  applyScenePresetSettings(sceneId);
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  state.beat = 1;
  state.displayBeat = 1;
  setBpm(scenes[sceneId].bpm);

  if (state.isPlaying) {
    startPadForScene(sceneId);
  }
}

function deleteCurrentScene() {
  if (sceneOrder.length <= 1) {
    setStatus("No se puede borrar la unica escena.");
    return;
  }

  const sceneId = state.sceneId;
  const sceneName = scenes[sceneId]?.name || "esta escena";
  const confirmed = window.confirm(`Borrar "${sceneName}"?`);
  if (!confirmed) return;

  const currentIndex = sceneOrder.indexOf(sceneId);
  const nextSceneId = sceneOrder[currentIndex + 1] || sceneOrder[currentIndex - 1];
  sceneOrder = sceneOrder.filter((id) => id !== sceneId);
  delete scenes[sceneId];
  delete sceneDrumPatterns[sceneId];

  if (state.pendingSceneId === sceneId) {
    state.pendingSceneId = null;
  }

  activateSceneImmediately(nextSceneId);
  saveAppState();
  renderSceneButtons();
  renderDrumEditor();
  setStatus(`Escena borrada: ${sceneName}`);
}

function duplicateCurrentScene() {
  const sourceScene = scenes[state.sceneId];
  if (!sourceScene) return;

  const sceneId = `scene-${Date.now()}`;
  scenes[sceneId] = {
    ...sourceScene,
    chord: [...sourceScene.chord],
    drumVoiceIds: { ...(sourceScene.drumVoiceIds || state.drumVoiceIds) },
    drumSampleEnabled: { ...(sourceScene.drumSampleEnabled || state.drumSampleEnabled) },
    drumSampleNames: { ...(sourceScene.drumSampleNames || state.drumSampleNames) },
    padSettings: normalizePadSettings(sourceScene.padSettings),
    arpSettings: sourceScene.arpSettings ? { ...sourceScene.arpSettings, customNotes: [...(sourceScene.arpSettings.customNotes || [])] } : snapshotArpSettings(),
    name: `${sourceScene.name} Copy`,
  };
  sceneDrumPatterns[sceneId] = clonePattern(getCurrentDrumPattern(), scenes[state.sceneId].meter);

  const currentIndex = sceneOrder.indexOf(state.sceneId);
  sceneOrder.splice(currentIndex + 1, 0, sceneId);
  state.sceneId = sceneId;
  state.pendingSceneId = null;
  state.drumPatternId = `scene:${sceneId}`;
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  state.displayBeat = 1;
  setBpm(scenes[sceneId].bpm);
  saveAppState();
  renderSceneButtons();
  renderDrumEditor();
  setStatus(`Escena duplicada: ${scenes[sceneId].name}`);
}

playToggle.addEventListener("click", () => {
  if (state.isPlaying) {
    pause();
    return;
  }

  play();
});

metronomeToggle.addEventListener("click", async () => {
  const isUnlocked = await unlockAudio();
  if (!isUnlocked) {
    setStatus(`Audio bloqueado por iOS. Estado: ${state.audioContext.state}`);
    return;
  }
  state.metronomeEnabled = !state.metronomeEnabled;
  setStatus(state.metronomeEnabled ? "Click activado." : "Click desactivado.");
  renderTransport();
});

loopToggle.addEventListener("click", async () => {
  const isUnlocked = await unlockAudio();
  if (!isUnlocked) {
    setStatus(`Audio bloqueado por iOS. Estado: ${state.audioContext.state}`);
    return;
  }

  const nextLoopState = !state.loopEnabled;
  if (!state.isPlaying) {
    state.loopEnabled = nextLoopState;
    state.pendingLoopEnabled = null;
    setStatus(state.loopEnabled ? "Loop listo." : "Loop apagado.");
    renderTransport();
    return;
  }

  state.pendingLoopEnabled = nextLoopState;
  setStatus(nextLoopState ? "Loop pendiente para proximo compas." : "Loop se apagara en proximo compas.");
  renderTransport();
});

drumsToggle.addEventListener("click", async () => {
  const isUnlocked = await unlockAudio();
  if (!isUnlocked) {
    setStatus(`Audio bloqueado por iOS. Estado: ${state.audioContext.state}`);
    return;
  }

  const nextDrumState = !state.drumsEnabled;
  if (!state.isPlaying) {
    state.drumsEnabled = nextDrumState;
    state.pendingDrumsEnabled = null;
    state.drumStep = 0;
    state.currentUiDrumStep = -1;
    state.drumSubStep = 0;
    setStatus(state.drumsEnabled ? "Drums listos." : "Drums apagados.");
    renderTransport();
    return;
  }

  state.pendingDrumsEnabled = nextDrumState;
  setStatus(nextDrumState ? "Drums pendientes para proximo compas." : "Drums se apagaran en proximo compas.");
  renderTransport();
});

drumRateSelect.addEventListener("change", (event) => {
  state.drumRate = event.target.value;
  state.drumStep = 0;
  state.currentUiDrumStep = -1;
  state.drumSubStep = 0;
  clearDrumTimers();
  setStatus(`Drum rate: ${drumRateSelect.options[drumRateSelect.selectedIndex].text}`);
  saveAppState();
  renderTransport();
});

drumSubdivisionToggle.addEventListener("click", () => {
  const oldCount = getCurrentStepCount();
  state.drumSubdivision = state.drumSubdivision === "1/16" ? "1/8" : "1/16";
  const newCount = getCurrentStepCount();
  if (state.isPlaying) {
    state.drumStep = Math.round((state.drumStep / oldCount) * newCount) % newCount;
  }
  saveAppState();
  renderTransport();
  renderDrumEditor();
});

drumGrooveSelect.addEventListener("change", (event) => {
  const scene = scenes[state.sceneId];
  scene.groove = event.target.value;
  if (scene.groove === "auto") {
    sceneDrumPatterns[state.sceneId] = createEmptyPattern("empty");
  } else {
    scene.meter = getGrooveDefaultMeter(scene.groove);
    sceneDrumPatterns[state.sceneId] = createGroovePattern(scene.groove, scene.meter);
  }
  state.drumPatternId = `groove:${scene.groove}`;
  state.drumStep = 0;
  state.drumSubStep = 0;
  saveAppState();
  renderSceneButtons();
  renderDrumEditor();
  setStatus(`Groove: ${drumGrooveSelect.options[drumGrooveSelect.selectedIndex].text}`);
});

padMoodSelect.addEventListener("change", (event) => updatePadSetting("mood", event.target.value));
padMovement.addEventListener("input", (event) => updatePadSetting("movement", event.target.value));
padShimmer.addEventListener("input", (event) => updatePadSetting("shimmer", event.target.value));
padWarmth.addEventListener("input", (event) => updatePadSetting("warmth", event.target.value));
padSpace.addEventListener("input", (event) => updatePadSetting("space", event.target.value));
padTexture.addEventListener("input", (event) => updatePadSetting("texture", event.target.value));
padEvolveToggle.addEventListener("click", () => updatePadSetting("evolve"));

padVolume.addEventListener("input", (event) => {
  setChannelVolume("pad", event.target.value);
});

loopVolume.addEventListener("input", (event) => {
  setChannelVolume("loop", event.target.value);
});

clickVolume.addEventListener("input", (event) => {
  setChannelVolume("click", event.target.value);
});

drumVolume.addEventListener("input", (event) => {
  setChannelVolume("drum", event.target.value);
});

drumKitSelect.addEventListener("change", (event) => {
  state.drumKitId = event.target.value;
  setStatus(`Drum kit: ${drumKits[state.drumKitId].name}`);
  saveAppState();
  renderTransport();
});

function setDrumVoice(instrument, voiceId) {
  if (!drumVoices[instrument][voiceId]) return;

  state.drumVoiceIds[instrument] = voiceId;
  clearDrumSample(instrument, false);
  setStatus(`${instrument.toUpperCase()} sound: ${drumVoices[instrument][voiceId].name}`);
  saveAppState();
  renderTransport();
}

function cycleDrumVoice(instrument) {
  setDrumVoice(instrument, getNextDrumVoiceId(instrument));
}

function closeInstrumentMenu() {
  instrumentMenu.classList.add("hidden");
  instrumentMenu.dataset.instrument = "";
}

function openInstrumentMenu(instrument, trigger) {
  if (!drumVoices[instrument]) return;

  instrumentMenu.dataset.instrument = instrument;
  instrumentMenuTitle.textContent = state.drumSampleEnabled[instrument] && state.drumSampleNames[instrument] ? `${getInstrumentLabel(instrument)} Sample` : getInstrumentLabel(instrument);
  instrumentMenuSelect.innerHTML = "";
  Object.entries(drumVoices[instrument]).forEach(([voiceId, voice]) => {
    const option = document.createElement("option");
    option.value = voiceId;
    option.textContent = voice.name;
    instrumentMenuSelect.appendChild(option);
  });
  instrumentMenuSelect.value = state.drumVoiceIds[instrument];

  const panelRect = drumEditorPanel.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  instrumentMenu.style.left = `${Math.max(0, triggerRect.right - panelRect.left + 8)}px`;
  instrumentMenu.style.top = `${Math.max(0, triggerRect.top - panelRect.top - 6)}px`;
  instrumentMenu.classList.remove("hidden");
}

function clearDrumSample(instrument, showStatus = true) {
  state.drumSampleEnabled[instrument] = false;
  state.drumSampleBuffers[instrument] = null;
  state.drumSampleData[instrument] = null;
  const scene = scenes[state.sceneId];
  if (scene) {
    scene.drumSampleEnabled = { ...(scene.drumSampleEnabled || {}), [instrument]: false };
  }
  if (showStatus) {
    setStatus(`${instrument.toUpperCase()} volvio al sonido base.`);
  }
}

async function loadDrumSample(instrument, file) {
  if (!file) return;
  const isUnlocked = await unlockAudio();
  if (!isUnlocked) {
    setStatus(`Audio bloqueado por iOS. Estado: ${state.audioContext?.state || "unknown"}`);
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer.slice(0));
    state.drumSampleBuffers[instrument] = audioBuffer;
    state.drumSampleData[instrument] = arrayBuffer;
    state.drumSampleNames[instrument] = file.name;
    state.drumSampleEnabled[instrument] = true;
    const scene = scenes[state.sceneId];
    if (scene) {
      scene.drumSampleEnabled = { ...(scene.drumSampleEnabled || {}), [instrument]: true };
      scene.drumSampleNames = { ...(scene.drumSampleNames || {}), [instrument]: file.name };
    }
    saveStoredSample(state.sceneId, instrument, file, arrayBuffer).catch(() => {
      setStatus(`${instrument.toUpperCase()} sample activo, pero no se pudo guardar permanente.`);
    });
    saveAppState();
    setStatus(`${instrument.toUpperCase()} sample cargado: ${file.name}`);
    if (instrumentMenu.dataset.instrument === instrument) {
      instrumentMenuTitle.textContent = `${getInstrumentLabel(instrument)} Sample`;
    }
    playDrumSample(instrument, state.audioContext.currentTime + 0.02, 0.9);
  } catch (error) {
    setStatus(`No pude cargar ese audio para ${instrument.toUpperCase()}.`);
  }
}

document.querySelectorAll("[data-instrument-menu]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const instrument = button.dataset.instrumentMenu;
    if (instrumentMenu.dataset.instrument === instrument && !instrumentMenu.classList.contains("hidden")) {
      closeInstrumentMenu();
      return;
    }
    openInstrumentMenu(instrument, button);
  });
});

instrumentMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});

instrumentMenuSelect.addEventListener("change", (event) => {
  const instrument = instrumentMenu.dataset.instrument;
  setDrumVoice(instrument, event.target.value);
  instrumentMenuSelect.value = state.drumVoiceIds[instrument];
  instrumentMenuTitle.textContent = getInstrumentLabel(instrument);
});

instrumentMenuLoad.addEventListener("click", () => {
  const instrument = instrumentMenu.dataset.instrument;
  sampleInputs[instrument]?.click();
});

instrumentMenuBase.addEventListener("click", () => {
  const instrument = instrumentMenu.dataset.instrument;
  clearDrumSample(instrument);
  instrumentMenuTitle.textContent = getInstrumentLabel(instrument);
});

Object.entries(sampleInputs).forEach(([instrument, input]) => {
  input.addEventListener("change", (event) => {
    loadDrumSample(instrument, event.target.files[0]);
    event.target.value = "";
  });
});

document.addEventListener("click", closeInstrumentMenu);

padMute.addEventListener("click", () => toggleMute("pad"));
loopMute.addEventListener("click", () => toggleMute("loop"));
clickMute.addEventListener("click", () => toggleMute("click"));
drumMute.addEventListener("click", () => toggleMute("drum"));

mixerToggle.addEventListener("click", () => {
  const isCollapsed = mixerPanel.classList.toggle("collapsed");
  state.ui.mixerCollapsed = isCollapsed;
  mixerToggle.setAttribute("aria-expanded", String(!isCollapsed));
  mixerToggleText.textContent = "Mixer";
  mixerToggleIcon.classList.toggle("up", !isCollapsed);
  saveAppState();
});

padSynthToggle.addEventListener("click", () => {
  const isCollapsed = padSynthPanel.classList.toggle("collapsed");
  state.ui.padSynthCollapsed = isCollapsed;
  padSynthToggle.setAttribute("aria-expanded", String(!isCollapsed));
  padSynthToggleIcon.classList.toggle("up", !isCollapsed);
  saveAppState();
});

drumEditorToggle.addEventListener("click", () => {
  const isCollapsed = drumEditorPanel.classList.toggle("collapsed");
  state.ui.drumEditorCollapsed = isCollapsed;
  drumEditorToggle.setAttribute("aria-expanded", String(!isCollapsed));
  drumEditorToggleIcon.classList.toggle("up", !isCollapsed);
  saveAppState();
});

resetPattern.addEventListener("click", resetCurrentDrumPattern);

accentModeToggle.addEventListener("click", () => {
  state.ui.accentEditMode = !state.ui.accentEditMode;
  accentModeToggle.classList.toggle("active", state.ui.accentEditMode);
  setStatus(state.ui.accentEditMode ? "Modo Accent activo." : "Modo Accent apagado.");
});

padVolume.addEventListener("dblclick", () => resetChannelVolume("pad"));
loopVolume.addEventListener("dblclick", () => resetChannelVolume("loop"));
clickVolume.addEventListener("dblclick", () => resetChannelVolume("click"));
drumVolume.addEventListener("dblclick", () => resetChannelVolume("drum"));

document.querySelectorAll(".mixer-channel").forEach((channelElement) => {
  let lastTap = 0;
  channelElement.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTap < 320) {
      event.preventDefault();
      resetChannelVolume(channelElement.dataset.channel);
    }
    lastTap = now;
  });
});

stopButton.addEventListener("click", stop);

const bpmSliderReadout = document.querySelector("#bpmSliderReadout");
bpmSlider.addEventListener("input", (event) => {
  const v = Math.round(Number(event.target.value));
  bpmModalInput.value = v;
  if (bpmSliderReadout) bpmSliderReadout.textContent = `${v} BPM`;
});
bpmSlider.addEventListener("change", (event) => {
  setBpm(event.target.value);
  setStatus(`Tempo cambiado a ${Math.round(state.bpm)} BPM. Toca Guardar.`);
});

const bpmModal = document.querySelector("#bpmModal");
const bpmModalInput = document.querySelector("#bpmModalInput");
const bpmModalClose = document.querySelector("#bpmModalClose");
const bpmMinus5 = document.querySelector("#bpmMinus5");
const bpmPlus5 = document.querySelector("#bpmPlus5");
const bpmModalTap = document.querySelector("#bpmModalTap");
const bpmModalOk = document.querySelector("#bpmModalOk");
const clickModePulseBtn = document.querySelector("#clickModePulse");
const clickModeSubdivisionBtn = document.querySelector("#clickModeSubdivision");
let modalTapTimes = [];

function openBpmModal() {
  const rounded = Math.round(state.bpm);
  bpmModalInput.value = rounded;
  bpmSlider.value = rounded;
  if (bpmSliderReadout) bpmSliderReadout.textContent = `${rounded} BPM`;
  modalTapTimes = [];
  clickModePulseBtn.classList.toggle("active", state.clickMode === "pulse");
  clickModeSubdivisionBtn.classList.toggle("active", state.clickMode === "subdivision");
  bpmModal.hidden = false;
  setTimeout(() => bpmModalInput.focus(), 80);
}

function closeBpmModal() {
  bpmModal.hidden = true;
}

function applyBpmModal() {
  const val = parseInt(bpmModalInput.value, 10);
  if (!isNaN(val)) {
    setBpm(val);
    scenes[state.sceneId].bpm = state.bpm;
    saveAppState();
  }
  closeBpmModal();
}

bpmReadout.addEventListener("click", openBpmModal);
bpmModalClose.addEventListener("click", closeBpmModal);
bpmModalOk.addEventListener("click", applyBpmModal);

clickModePulseBtn.addEventListener("click", () => {
  state.clickMode = "pulse";
  clickModePulseBtn.classList.add("active");
  clickModeSubdivisionBtn.classList.remove("active");
  saveAppState();
  setStatus("Click: Pulso");
});

clickModeSubdivisionBtn.addEventListener("click", () => {
  state.clickMode = "subdivision";
  clickModeSubdivisionBtn.classList.add("active");
  clickModePulseBtn.classList.remove("active");
  saveAppState();
  setStatus("Click: Subdivisión");
});

bpmMinus5.addEventListener("click", () => {
  const v = Math.max(48, (parseInt(bpmModalInput.value, 10) || Math.round(state.bpm)) - 5);
  bpmModalInput.value = v; bpmSlider.value = v;
  if (bpmSliderReadout) bpmSliderReadout.textContent = `${v} BPM`;
});
bpmPlus5.addEventListener("click", () => {
  const v = Math.min(156, (parseInt(bpmModalInput.value, 10) || Math.round(state.bpm)) + 5);
  bpmModalInput.value = v; bpmSlider.value = v;
  if (bpmSliderReadout) bpmSliderReadout.textContent = `${v} BPM`;
});

bpmModalTap.addEventListener("click", () => {
  const now = Date.now();
  modalTapTimes = modalTapTimes.filter((t) => now - t < 2400);
  modalTapTimes.push(now);
  if (modalTapTimes.length >= 2) {
    const gaps = modalTapTimes.slice(1).map((t, i) => t - modalTapTimes[i]);
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const tapBpm = Math.max(48, Math.min(156, Math.round(60000 / avg)));
    bpmModalInput.value = tapBpm;
    bpmSlider.value = tapBpm;
    if (bpmSliderReadout) bpmSliderReadout.textContent = `${tapBpm} BPM`;
  }
});

bpmModal.addEventListener("click", (e) => { if (e.target === bpmModal) closeBpmModal(); });
bpmModalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyBpmModal();
  if (e.key === "Escape") closeBpmModal();
});

tapTempo.addEventListener("click", () => {
  const now = Date.now();
  state.tapTimes = state.tapTimes.filter((time) => now - time < 2400);
  state.tapTimes.push(now);

  if (state.tapTimes.length >= 2) {
    const gaps = state.tapTimes.slice(1).map((time, index) => time - state.tapTimes[index]);
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    setBpm(60000 / averageGap);
  }
});

sceneKeySelect.addEventListener("change", previewSceneKeyChange);
sceneMeterSelect.addEventListener("change", previewSceneMeterChange);

sceneButtons.forEach((button) => {
  button.addEventListener("click", () => changeScene(button.dataset.scene));
});

renameScene.addEventListener("click", renameCurrentScene);
applySceneSettings.addEventListener("click", saveCurrentPreset);
newScene.addEventListener("click", createNewScene);
duplicateScene.addEventListener("click", duplicateCurrentScene);
deleteScene.addEventListener("click", deleteCurrentScene);

// --- Arp ---
const arpOnOff = document.querySelector("#arpOnOff");
const arpModeSelect = document.querySelector("#arpModeSelect");
const arpRateSelect = document.querySelector("#arpRateSelect");
const arpOctavesSelect = document.querySelector("#arpOctavesSelect");
const arpVoiceSelect = document.querySelector("#arpVoiceSelect");
const arpGateSlider = document.querySelector("#arpGate");
const arpGateReadout = document.querySelector("#arpGateReadout");
const arpSwingSlider = document.querySelector("#arpSwing");
const arpSwingReadout = document.querySelector("#arpSwingReadout");
const arpHumanizeSlider = document.querySelector("#arpHumanize");
const arpHumanizeReadout = document.querySelector("#arpHumanizeReadout");
const arpGlitchSlider = document.querySelector("#arpGlitch");
const arpGlitchReadout = document.querySelector("#arpGlitchReadout");
const arpPiano = document.querySelector("#arpPiano");
const arpPianoClear = document.querySelector("#arpPianoClear");
const arpOctMinus = document.querySelector("#arpOctMinus");
const arpOctPlus  = document.querySelector("#arpOctPlus");
const arpPianoRootName = document.querySelector("#arpPianoRootName");
const arpToggle = document.querySelector("#arpToggle");
const arpToggleIcon = document.querySelector("#arpToggleIcon");
const arpPanel = document.querySelector("#arpPanel");
const arpFxToggle = document.querySelector("#arpFxToggle");
const arpFxToggleIcon = document.querySelector("#arpFxToggleIcon");
const arpFxPanel = document.querySelector("#arpFxPanel");
const arpFxBypassBtn = document.querySelector("#arpFxBypass");
const arpNaturalAccentBtn = document.querySelector("#arpNaturalAccent");
const arpDelayTimeSelect = document.querySelector("#arpDelayTimeSelect");
const arpOutputGainSlider = document.querySelector("#arpOutputGainSlider");
const arpOutputGainReadout = document.querySelector("#arpOutputGainReadout");
const arpLfoOnOff = document.querySelector("#arpLfoOnOff");

// FX knobs — instantiated below after DOM is ready
let knobChorus, knobReverb, knobSat, knobDlyWet, knobDlyFeed, knobLowCut, knobHiCut, knobLfoRate, knobLfoDepth;
let stepKnobShape, stepKnobType;

const PIANO_NOTE_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const PIANO_NOTE_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const FLAT_ROOTS = new Set([1, 3, 6, 8, 10]); // Db Eb Gb Ab Bb

function renderArpPiano() {
  if (!arpPiano) return;
  const scene = scenes[state.sceneId];
  const { rootMidi, isMinor } = getKeyInfo(scene?.key);
  // scaleSet: absolute chromatic positions (0=C … 11=B) that belong to the current key
  const root = rootMidi % 12;
  const intervals = isMinor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
  const scaleSet = new Set(intervals.map(i => (root + i) % 12));

  arpPiano.querySelectorAll("[data-note]").forEach((key) => {
    const semi = Number(key.dataset.note);
    // semi % 12 gives the absolute chromatic position (C=0, C#=1 … B=11)
    const inScale = scaleSet.has(semi % 12);
    const isActive = state.arp.customNotes.includes(semi);
    // Labels stay fixed — never overwritten — like a real keyboard
    key.classList.toggle("active", isActive);
    key.classList.toggle("off-scale", !inScale);
  });

  const hasNotes = state.arp.customNotes.length > 0;
  arpPianoClear.textContent = hasNotes ? "Clear" : "Scale";
  arpPianoClear.classList.toggle("has-notes", hasNotes);
  if (arpPianoRootName) {
    const noteNames = FLAT_ROOTS.has(root) ? PIANO_NOTE_NAMES_FLAT : PIANO_NOTE_NAMES_SHARP;
    arpPianoRootName.textContent = `${noteNames[root]} ${isMinor ? "Min" : "Maj"}`;
  }
}

function renderArp() {
  if (!arpOnOff) return;
  arpOnOff.classList.toggle("active", state.arp.enabled);
  arpOnOff.setAttribute("aria-label", state.arp.enabled ? "Turn Arp off" : "Turn Arp on");
  arpModeSelect.value = state.arp.mode;
  arpRateSelect.value = state.arp.rate;
  arpOctavesSelect.value = String(state.arp.octaves);
  updateOctBtnColors();
  arpOutputGainSlider.value = state.arp.outputGain;
  arpOutputGainReadout.textContent = state.arp.outputGain === 0 ? "0 dB" : `${state.arp.outputGain > 0 ? "+" : ""}${state.arp.outputGain} dB`;
  arpVoiceSelect.value = state.arp.voice;
  arpGateSlider.value = state.arp.gate;
  arpGateReadout.textContent = `${state.arp.gate}%`;
  arpSwingSlider.value = state.arp.swing;
  arpSwingReadout.textContent = `${state.arp.swing}%`;
  arpHumanizeSlider.value = state.arp.humanize;
  arpHumanizeReadout.textContent = `${state.arp.humanize}%`;
  arpGlitchSlider.value = state.arp.glitch;
  arpGlitchReadout.textContent = `${state.arp.glitch}%`;
  arpDelayTimeSelect.value = state.arp.delayTime;
  arpNaturalAccentBtn.classList.toggle("active", state.arp.naturalAccent);
  arpLfoOnOff.classList.toggle("active", state.arp.lfoEnabled);
  stepKnobShape?.setValue(state.arp.lfoShape);
  stepKnobType?.setValue(state.arp.lfoTarget);
  knobChorus?.setValue(state.arp.chorus, false);
  knobReverb?.setValue(state.arp.reverb, false);
  knobSat?.setValue(state.arp.saturation, false);
  knobDlyWet?.setValue(state.arp.delayWet, false);
  knobDlyFeed?.setValue(state.arp.delayFeedback, false);
  knobLowCut?.setValue(state.arp.lowcut, false);
  knobHiCut?.setValue(Math.round(Math.log(state.arp.highcut / 200) / Math.log(100) * 100), false);
  knobLfoRate?.setValue(Math.round(state.arp.lfoRate * 10), false);
  knobLfoDepth?.setValue(state.arp.lfoDepth, false);
  renderArpPiano();
}

arpOnOff.addEventListener("click", () => {
  state.arp.enabled = !state.arp.enabled;
  if (!state.arp.enabled) { state.arp.stepIndex = 0; state.arp.nextNoteTime = null; }
  renderArp();
});
arpModeSelect.addEventListener("change", () => { state.arp.mode = arpModeSelect.value; });
arpRateSelect.addEventListener("change", () => {
  state.arp.rate = arpRateSelect.value;
  state.arp.stepIndex = 0;
  // Clamp nextNoteTime if switching to a faster rate left a long gap ahead.
  // Avoids the note pool changes causing overlap/click by NOT resetting to null.
  if (state.isPlaying && state.audioContext && state.arp.nextNoteTime !== null &&
      state.arp.nextNoteTime > state.audioContext.currentTime + 0.15) {
    state.arp.nextNoteTime = state.audioContext.currentTime + 0.08;
  }
});
arpOctavesSelect.addEventListener("change", () => {
  state.arp.octaves = Number(arpOctavesSelect.value);
  state.arp.stepIndex = 0;
  // No nextNoteTime reset — note pool rebuilds on next schedulerTick naturally.
});
const VOICE_DEFAULT_GATE = {
  pluck: 45, bell: 88, keys: 68, mallet: 52, pad: 90,
  glass: 85, analog: 62, string: 80, texture: 85, fm: 72,
  gated: 35, reverse: 95, felt: 65,
};
arpVoiceSelect.addEventListener("change", () => {
  state.arp.voice = arpVoiceSelect.value;
  const defaultGate = VOICE_DEFAULT_GATE[state.arp.voice];
  if (defaultGate !== undefined) {
    state.arp.gate = defaultGate;
    arpGateSlider.value = defaultGate;
    arpGateReadout.textContent = `${defaultGate}%`;
  }
});
arpGateSlider.addEventListener("input", () => {
  state.arp.gate = Number(arpGateSlider.value);
  arpGateReadout.textContent = `${state.arp.gate}%`;
});
arpSwingSlider.addEventListener("input", () => {
  state.arp.swing = Number(arpSwingSlider.value);
  arpSwingReadout.textContent = `${state.arp.swing}%`;
});
// --- FX Knobs ---
const row1 = document.querySelector("#knobRow1");
const row2 = document.querySelector("#knobRow2");
const row3 = document.querySelector("#knobRow3");

// Row 1: Low Cut · Hi Cut · Sat · Chorus
knobLowCut = new Knob({ label: "Low Cut", min: 20, max: 800, value: state.arp.lowcut,
  format: v => v <= 22 ? "Off" : `${Math.round(v)}Hz`,
  onChange: v => { state.arp.lowcut = Math.round(v); state.arpEQNode?.setLowCut(v); } });
row1.appendChild(knobLowCut.el);

knobHiCut = new Knob({ label: "Hi Cut", min: 0, max: 100,
  value: Math.round(Math.log(state.arp.highcut / 200) / Math.log(100) * 100),
  format: v => { const hz = Math.round(200 * Math.pow(100, v / 100)); return hz >= 19900 ? "Off" : hz >= 1000 ? `${(hz/1000).toFixed(1)}kHz` : `${hz}Hz`; },
  onChange: v => { const hz = Math.round(200 * Math.pow(100, v / 100)); state.arp.highcut = hz; state.arpEQNode?.setHighCut(hz); } });
row1.appendChild(knobHiCut.el);

knobSat = new Knob({ label: "Sat", min: 0, max: 100, value: state.arp.saturation,
  format: v => `${Math.round(v)}%`,
  onChange: v => { state.arp.saturation = Math.round(v); state.arpSatNode?.setDrive(v / 100 * 0.70); } });
row1.appendChild(knobSat.el);

knobChorus = new Knob({ label: "Chorus", min: 0, max: 100, value: state.arp.chorus,
  format: v => `${Math.round(v)}%`,
  onChange: v => { state.arp.chorus = Math.round(v); state.arpChorusNode?.setMix(v / 100); } });
row1.appendChild(knobChorus.el);

// Row 2: [Dly Time select in HTML] · Dly Wet · Dly Feed · Reverb
knobDlyWet = new Knob({ label: "Dly Wet", min: 0, max: 100, value: state.arp.delayWet,
  format: v => `${Math.round(v)}%`,
  onChange: v => { state.arp.delayWet = Math.round(v); state.arpDelayNode?.setWet(v / 100); } });
row2.appendChild(knobDlyWet.el);

knobDlyFeed = new Knob({ label: "Dly Feed", min: 0, max: 88, value: state.arp.delayFeedback,
  format: v => `${Math.round(v)}%`,
  onChange: v => { state.arp.delayFeedback = Math.round(v); state.arpDelayNode?.setFeedback(v / 100); } });
row2.appendChild(knobDlyFeed.el);

knobReverb = new Knob({ label: "Reverb", min: 0, max: 100, value: state.arp.reverb,
  format: v => `${Math.round(v)}%`,
  onChange: v => { state.arp.reverb = Math.round(v); state.arpReverbNode?.setSend(v / 100); } });
row2.appendChild(knobReverb.el);

// Row 4: Shape · Type · Rate · Depth
stepKnobShape = new StepKnob({
  label: "Shape",
  options: [{ value: "sine", label: "Sine" }, { value: "triangle", label: "Triangle" }, { value: "square", label: "Square" }],
  value: state.arp.lfoShape,
  onChange: v => { state.arp.lfoShape = v; state.arpLFONode?.setShape(v); },
});
row3.appendChild(stepKnobShape.el);

stepKnobType = new StepKnob({
  label: "Type",
  options: [{ value: "tremolo", label: "Tremolo" }, { value: "filter", label: "Filter" }, { value: "pan", label: "Pan" }],
  value: state.arp.lfoTarget,
  onChange: v => { state.arp.lfoTarget = v; state.arpLFONode?.setTarget(v); },
});
row3.appendChild(stepKnobType.el);

knobLfoRate = new Knob({ label: "Rate", min: 1, max: 80, value: Math.round(state.arp.lfoRate * 10),
  format: v => `${(v / 10).toFixed(1)}Hz`,
  onChange: v => { state.arp.lfoRate = v / 10; state.arpLFONode?.setRate(state.arp.lfoRate); } });
row3.appendChild(knobLfoRate.el);

knobLfoDepth = new Knob({ label: "Depth", min: 0, max: 100, value: state.arp.lfoDepth,
  format: v => `${Math.round(v)}%`,
  onChange: v => { state.arp.lfoDepth = Math.round(v); if (state.arp.lfoEnabled) state.arpLFONode?.setDepth(v / 100); } });
row3.appendChild(knobLfoDepth.el);

arpHumanizeSlider.addEventListener("input", () => {
  state.arp.humanize = Number(arpHumanizeSlider.value);
  arpHumanizeReadout.textContent = `${state.arp.humanize}%`;
});
arpGlitchSlider.addEventListener("input", () => {
  state.arp.glitch = Number(arpGlitchSlider.value);
  arpGlitchReadout.textContent = `${state.arp.glitch}%`;
});
arpDelayTimeSelect.addEventListener("change", () => {
  state.arp.delayTime = arpDelayTimeSelect.value;
});
arpLfoOnOff.addEventListener("click", () => {
  state.arp.lfoEnabled = !state.arp.lfoEnabled;
  state.arpLFONode?.setDepth(state.arp.lfoEnabled ? state.arp.lfoDepth / 100 : 0);
  arpLfoOnOff.classList.toggle("active", state.arp.lfoEnabled);
});

// --- Pad EQ knobs ---
const PAD_EQ_BANDS = [
  { freq: "80Hz",   idx: 0 },
  { freq: "150Hz",  idx: 1 },
  { freq: "250Hz",  idx: 2 },
  { freq: "400Hz",  idx: 3 },
  { freq: "800Hz",  idx: 4 },
  { freq: "2kHz",   idx: 5 },
  { freq: "3.5kHz", idx: 6 },
  { freq: "6kHz",   idx: 7 },
  { freq: "12kHz",  idx: 8 },
];
const padEqBandKnobs = PAD_EQ_BANDS.map(({ freq, idx }) => {
  const k = new Knob({
    label: freq, min: -12, max: 12, value: state.padEq.bands[idx],
    format: v => (v >= 0 ? "+" : "") + v.toFixed(1) + " dB",
    onTap: () => {
      state.padEq.bandsEnabled[idx] = !state.padEq.bandsEnabled[idx];
      const on = state.padEq.bandsEnabled[idx];
      k.el.classList.toggle("knob-bypassed", !on);
      state.padEqNode?.setBandEnabled(idx, on, state.padEq);
      saveAppState();
    },
    onChange: v => {
      state.padEq.bands[idx] = v;
      if (state.padEq.enabled && state.padEq.bandsEnabled[idx]) state.padEqNode?.setBand(idx, v);
      saveAppState();
    },
  });
  k.el.classList.toggle("knob-bypassed", !state.padEq.bandsEnabled[idx]);
  padEqKnobsContainer.appendChild(k.el);
  return k;
});

const padEqHpfKnob = new Knob({
  label: "HPF", min: 20, max: 800, value: state.padEq.hpf,
  format: v => v <= 22 ? "OFF" : `${Math.round(v)} Hz`,
  onChange: v => {
    state.padEq.hpf = Math.round(v);
    if (state.padEq.enabled) state.padEqNode?.setHPF(v);
    saveAppState();
  },
});
padEqKnobsContainer.appendChild(padEqHpfKnob.el);

const padEqLpfKnob = new Knob({
  label: "LPF", min: 1000, max: 20000, value: state.padEq.lpf,
  format: v => v >= 19900 ? "OFF" : v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`,
  onChange: v => {
    state.padEq.lpf = Math.round(v);
    if (state.padEq.enabled) state.padEqNode?.setLPF(v);
    saveAppState();
  },
});
padEqKnobsContainer.appendChild(padEqLpfKnob.el);

const padEqOutputKnob = new Knob({
  label: "OUTPUT", min: -12, max: 12, value: state.padEq.output,
  format: v => (v >= 0 ? "+" : "") + v.toFixed(1) + " dB",
  onChange: v => {
    state.padEq.output = v;
    if (state.padEq.enabled) state.padEqNode?.setOutput(v);
    saveAppState();
  },
});
padEqKnobsContainer.appendChild(padEqOutputKnob.el);

padEqToggle.addEventListener("click", () => {
  state.padEq.enabled = !state.padEq.enabled;
  padEqToggle.classList.toggle("active", state.padEq.enabled);
  padEqPanel.classList.toggle("collapsed", !state.padEq.enabled);
  state.padEqNode?.applyState(state.padEq);
  saveAppState();
});

arpFxToggle.addEventListener("click", () => {
  const open = !arpFxPanel.classList.contains("collapsed");
  arpFxPanel.classList.toggle("collapsed", open);
  arpFxToggleIcon.classList.toggle("up", !open);
  arpFxToggleIcon.classList.toggle("down", open);
});

function applyFxBypass(bypass) {
  if (!state.arpChorusNode) return;
  if (bypass) {
    state.arpChorusNode.setMix(0);
    state.arpReverbNode.setSend(0);
    state.arpDelayNode.setWet(0);
    state.arpSatNode.setDrive(0);
    state.arpEQNode.setLowCut(20);
    state.arpEQNode.setHighCut(20000);
    state.arpLFONode?.setDepth(0);
  } else {
    state.arpChorusNode.setMix(state.arp.chorus / 100);
    state.arpReverbNode.setSend(state.arp.reverb / 100);
    state.arpDelayNode.setWet(state.arp.delayWet / 100);
    state.arpSatNode.setDrive(state.arp.saturation / 100 * 0.70);
    state.arpEQNode.setLowCut(state.arp.lowcut);
    state.arpEQNode.setHighCut(state.arp.highcut);
    state.arpLFONode?.setDepth(state.arp.lfoEnabled ? state.arp.lfoDepth / 100 : 0);
  }
}

arpFxBypassBtn.addEventListener("click", () => {
  state.arp.fxBypass = !state.arp.fxBypass;
  applyFxBypass(state.arp.fxBypass);
  arpFxBypassBtn.classList.toggle("active", state.arp.fxBypass);
  arpFxBypassBtn.textContent = state.arp.fxBypass ? "Bypass ON" : "Bypass";
});

arpNaturalAccentBtn.addEventListener("click", () => {
  state.arp.naturalAccent = !state.arp.naturalAccent;
  renderArp();
  saveAppState();
});
arpPiano.addEventListener("click", (e) => {
  const key = e.target.closest("[data-note]");
  if (!key) return;
  const note = Number(key.dataset.note);
  const idx = state.arp.customNotes.indexOf(note);
  if (idx >= 0) {
    state.arp.customNotes.splice(idx, 1);
  } else {
    state.arp.customNotes.push(note);
    state.arp.customNotes.sort((a, b) => a - b);
  }
  state.arp.stepIndex = 0;
  // Do NOT reset nextNoteTime — resetting causes the scheduler to reprogram a note
  // at the current beat boundary, overlapping with any note still in decay → click.
  // The note pool is rebuilt on every scheduleArpSteps call so the change is immediate.
  renderArpPiano();
});
arpPianoClear.addEventListener("click", () => {
  state.arp.customNotes = [];
  state.arp.stepIndex = 0;
  renderArpPiano();
});

function updateOctBtnColors() {
  const s = state.arp.octShift;
  const abs = Math.abs(s);
  arpOctMinus.className = "arp-oct-btn" + (s < 0 ? ` oct-shift-${abs}` : "");
  arpOctPlus.className  = "arp-oct-btn" + (s > 0 ? ` oct-shift-${abs}` : "");
}
let _lastOctMinus = 0, _lastOctPlus = 0;
arpOutputGainSlider.addEventListener("input", () => {
  const db = Number(arpOutputGainSlider.value);
  state.arp.outputGain = db;
  if (state.arpTrimNode) state.arpTrimNode.gain.value = Math.pow(10, db / 20);
  arpOutputGainReadout.textContent = db === 0 ? "0 dB" : `${db > 0 ? "+" : ""}${db} dB`;
});
arpOctMinus.addEventListener("click", () => {
  const now = Date.now();
  if (now - _lastOctPlus < 300) { state.arp.octShift = 0; }
  else { _lastOctMinus = now; state.arp.octShift = Math.max(-3, state.arp.octShift - 1); }
  updateOctBtnColors();
});
arpOctPlus.addEventListener("click", () => {
  const now = Date.now();
  if (now - _lastOctMinus < 300) { state.arp.octShift = 0; }
  else { _lastOctPlus = now; state.arp.octShift = Math.min(3, state.arp.octShift + 1); }
  updateOctBtnColors();
});
arpMute.addEventListener("click", () => toggleMute("arp"));
arpVolume.addEventListener("input", (e) => setChannelVolume("arp", e.target.value));
arpVolume.addEventListener("dblclick", () => resetChannelVolume("arp"));
arpToggle.addEventListener("click", () => {
  const isCollapsed = arpPanel.classList.toggle("collapsed");
  arpToggleIcon.classList.toggle("up", !isCollapsed);
});

renderArp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      setStatus("Audio listo. Offline se activara al publicar con HTTPS.");
    });
  });
}

async function initializeApp() {
  await loadStoredAppState();
  loadAppState();
  ensureSceneState();
  renderDrumEditor();
  renderSceneButtons();
  applyStoredUiState();
  renderTransport();
  loadStoredSamples();
}

initializeApp();
