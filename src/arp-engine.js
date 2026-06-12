const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

export function buildNotePool(rootMidi, isMinor, octaves = 1) {
  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;
  const notes = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (const interval of intervals) {
      notes.push(rootMidi + oct * 12 + interval);
    }
  }
  return notes;
}

export function getArpNote(notePool, stepIndex, mode) {
  if (!notePool.length) return null;
  const len = notePool.length;
  switch (mode) {
    case "up":
      return notePool[stepIndex % len];
    case "down":
      return notePool[(len - 1) - (stepIndex % len)];
    case "updown": {
      const cycle = len <= 1 ? 1 : len * 2 - 2;
      const pos = stepIndex % cycle;
      return pos < len ? notePool[pos] : notePool[cycle - pos];
    }
    case "converge": {
      const p = stepIndex % len;
      return notePool[p % 2 === 0 ? p / 2 : len - 1 - Math.floor(p / 2)];
    }
    case "diverge": {
      const p = stepIndex % len;
      const rev = len - 1 - p;
      return notePool[rev % 2 === 0 ? rev / 2 : len - 1 - Math.floor(rev / 2)];
    }
    case "random":
      return notePool[Math.floor(Math.random() * len)];
    case "pedal":
      return notePool[0];
    default:
      return notePool[stepIndex % len];
  }
}

export function getArpSubdivisions(rate) {
  return { "1/4": 1, "1/8": 2, "1/16": 4 }[rate] ?? 2;
}
