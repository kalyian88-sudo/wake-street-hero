/**
 * Pure pattern generator of the beat engine: turns a TrackDef + arrangement position into the notes
 * of every bar (drums with ghosts / rolls / fills, bass following the chord roots, comped chord
 * voicings, a generative lead with motif repetition) and into swung, humanised event times.
 * Deterministic per (track, section, form position). No WebAudio — unit-tested in node.
 */
import { hashString, seededRng } from '../data/geometry';
import { DRUM_IDS, type DrumId } from './dsp';
import { SCALES, bassMidi, clamp, nearestChordTone, scaleNote, stepSeconds, swingTime, voiceChord, type ChordSym } from './theory';
import type { SectionKind, TrackDef } from './tracks';

type Rng = () => number;

export const SECTION_BARS: Record<SectionKind, number> = { intro: 4, A: 8, A2: 8, B: 8, breakdown: 4 };

export interface DrumHit {
  /** 16th step inside the bar; fractional for rolls. */
  step: number;
  inst: DrumId;
  vel: number;
}
export interface NoteEvent {
  step: number;
  /** Length in 16th steps. */
  len: number;
  midi: number;
  vel: number;
  /** 808 slide: start the note at this pitch and glide. */
  glideFrom?: number;
}
export interface ChordEvent {
  step: number;
  len: number;
  midis: number[];
  vel: number;
}
export interface BarEvents {
  section: SectionKind;
  /** Bar index inside the section. */
  bar: number;
  drums: DrumHit[];
  bass: NoteEvent[];
  chords: ChordEvent[];
  lead: NoteEvent[];
}

export interface ChordSegment {
  /** Start step and length in steps inside the bar. */
  start: number;
  len: number;
  chord: ChordSym;
}

const VEL: Record<string, number> = { X: 1, x: 0.82, o: 0.58, '-': 0.3 };

function progBeats(prog: readonly ChordSym[]): number {
  let n = 0;
  for (const c of prog) n += c.beats ?? 4;
  return n;
}

/** Chords sounding during bar `bar` of a (looping) progression. */
export function chordSegments(prog: readonly ChordSym[], bar: number): ChordSegment[] {
  const total = progBeats(prog);
  const barStart = (((bar * 4) % total) + total) % total;
  const out: ChordSegment[] = [];
  const barEnd = barStart + 4;
  let beat = 0;
  // second pass only matters if a bar straddles the loop point of the progression
  for (let pass = 0; pass < 2; pass++) {
    for (const c of prog) {
      const len = c.beats ?? 4;
      const a = Math.max(beat, barStart);
      const b = Math.min(beat + len, barEnd);
      if (b > a) out.push({ start: (a - barStart) * 4, len: (b - a) * 4, chord: c });
      beat += len;
    }
    if (beat >= barEnd) break;
  }
  return out;
}

function segmentAt(segs: ChordSegment[], step: number): ChordSegment {
  for (let i = segs.length - 1; i >= 0; i--) if (step >= segs[i].start) return segs[i];
  return segs[0];
}

function sectionVariant(kind: SectionKind): 'A' | 'B' {
  return kind === 'B' ? 'B' : 'A';
}

/** Which drum voices play in a section (intro and breakdown are stripped down and build up). */
export function drumActive(kind: SectionKind, inst: DrumId, bar: number): boolean {
  if (kind === 'intro') {
    if (inst === 'shaker' || inst === 'rim') return true;
    return bar >= 2 && (inst === 'hat' || inst === 'openHat' || inst === 'perc');
  }
  if (kind === 'breakdown') {
    if (inst === 'rim' || inst === 'shaker' || inst === 'perc') return true;
    return bar >= 2 && inst === 'hat';
  }
  if (kind === 'A') return inst !== 'perc';
  return true;
}

function drumBar(track: TrackDef, kind: SectionKind, bar: number, bars: number, formIndex: number, rng: Rng): DrumHit[] {
  const lane = track.drums[sectionVariant(kind)];
  let hits: DrumHit[] = [];
  const soft = kind === 'intro' || kind === 'breakdown' ? 0.85 : 1;
  for (const inst of DRUM_IDS) {
    const pats = lane[inst];
    if (!pats || pats.length === 0 || !drumActive(kind, inst, bar)) continue;
    const pat = pats[bar % pats.length];
    for (let s = 0; s < 16; s++) {
      const v = VEL[pat[s]];
      if (v) hits.push({ step: s, inst, vel: v * soft * (0.92 + rng() * 0.16) });
    }
  }
  const full = kind === 'A' || kind === 'A2' || kind === 'B';
  const has = (inst: DrumId, step: number): boolean => hits.some((h) => h.inst === inst && h.step === step);

  if (full && track.ghost > 0 && lane.snare) {
    for (const s of [7, 9, 15]) {
      if (rng() < track.ghost * 0.5 && !has('snare', s)) hits.push({ step: s, inst: 'snare', vel: 0.2 + rng() * 0.1 });
    }
  }
  if (full && track.hatRolls > 0 && rng() < track.hatRolls) {
    const start = [6, 14, 10][Math.floor(rng() * 3)];
    const n = [3, 4, 6][Math.floor(rng() * 3)];
    const up = rng() < 0.5;
    hits = hits.filter((h) => !(h.inst === 'hat' && h.step >= start && h.step < start + 2));
    for (let k = 0; k < n; k++) {
      const a = k / (n - 1);
      hits.push({ step: start + (k * 2) / n, inst: 'hat', vel: 0.4 + 0.45 * (up ? a : 1 - a) });
    }
  }
  if (bar === bars - 1) {
    if (track.fill === 'snare') {
      hits = hits.filter((h) => !(h.inst === 'hat' && h.step >= 12));
      hits.push({ step: 13, inst: 'snare', vel: 0.4 }, { step: 14, inst: 'snare', vel: 0.56 }, { step: 15, inst: 'snare', vel: 0.76 });
    } else if (track.fill === 'hats') {
      hits = hits.filter((h) => !(h.inst === 'hat' && h.step >= 12));
      for (let k = 0; k < 8; k++) hits.push({ step: 12 + k * 0.5, inst: 'hat', vel: 0.34 + k * 0.075 });
      hits.push({ step: 15, inst: 'openHat', vel: 0.6 });
    } else {
      hits = hits.filter((h) => h.step < 10 || ((h.inst === 'snare' || h.inst === 'clap') && h.step === 12));
      if (!has('snare', 12)) hits.push({ step: 12, inst: 'snare', vel: 0.85 });
      hits.push({ step: 14, inst: 'openHat', vel: 0.7 });
    }
  }
  // crash-like open hat on the downbeat of every full section after the first one
  if (full && bar === 0 && formIndex > 1 && !has('openHat', 0)) hits.push({ step: 0, inst: 'openHat', vel: 0.62 });
  hits.sort((a, b) => a.step - b.step);
  return hits;
}

function thirdOf(ch: ChordSym): number {
  if (ch.q === '9sus') return 5;
  return ch.q.startsWith('m') || ch.q === 'dim7' ? 3 : 4;
}

function bassBar(track: TrackDef, kind: SectionKind, bar: number, bars: number, segs: ChordSegment[], nextRoot: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  const low = track.bassLow;
  if (kind === 'intro' && bar < 2) return out;
  if (kind === 'intro' || kind === 'breakdown') {
    for (const seg of segs) out.push({ step: seg.start, len: Math.max(2, seg.len - 2), midi: bassMidi(seg.chord.root, low), vel: 0.72 });
    return out;
  }
  const pats = track.bassPat[sectionVariant(kind)];
  const pat = pats[bar % pats.length];
  const dropFrom = bar === bars - 1 && track.fill === 'kickDrop' ? 10 : 16;
  for (let s = 0; s < 16 && s < dropFrom; s++) {
    const c = pat[s];
    if (c === '.' || c === '_') continue;
    let len = 1;
    while (s + len < 16 && pat[s + len] === '_') len++;
    const segIdx = segs.indexOf(segmentAt(segs, s));
    const ch = segs[segIdx].chord;
    const next = segIdx + 1 < segs.length ? segs[segIdx + 1].chord.root : nextRoot;
    const root = bassMidi(ch.root, low);
    let midi = root;
    let vel = 0.92;
    if (c === 'r') {
      vel = 0.7;
    } else if (c === '3') {
      midi = root + thirdOf(ch);
      vel = 0.74;
    } else if (c === '5') {
      midi = root + 7;
      vel = 0.76;
    } else if (c === '8') {
      midi = root + 12;
      vel = 0.8;
    } else if (c === 'a' || c === 'A') {
      midi = bassMidi(next, low) + (c === 'a' ? -1 : 1);
      vel = 0.74;
    }
    const ev: NoteEvent = { step: s, len, midi, vel };
    const prev = out[out.length - 1];
    if (track.bass === '808' && prev && prev.step + prev.len >= s && prev.midi !== midi) ev.glideFrom = prev.midi;
    out.push(ev);
  }
  return out;
}

function chordBar(track: TrackDef, kind: SectionKind, segs: ChordSegment[], rng: Rng): ChordEvent[] {
  const out: ChordEvent[] = [];
  const soft = kind === 'intro' ? 0.82 : kind === 'breakdown' ? 0.9 : 1;
  if (segs.length === 1) {
    const sustained = kind === 'intro' || kind === 'breakdown';
    const comp: readonly (readonly [number, number])[] = sustained ? [[0, 15]] : track.comp[sectionVariant(kind)];
    const midis = voiceChord(segs[0].chord, track.keysCenter);
    for (const [step, len] of comp) {
      out.push({ step, len: Math.min(len, 16 - step), midis, vel: (step === 0 ? 0.8 : 0.68) * soft * (0.95 + rng() * 0.1) });
    }
  } else {
    for (const seg of segs) {
      out.push({ step: seg.start, len: Math.max(1, seg.len - 1), midis: voiceChord(seg.chord, track.keysCenter), vel: 0.76 * soft * (0.95 + rng() * 0.1) });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────── lead ──

interface MotifNote {
  /** 0..31 over a two-bar phrase. */
  step: number;
  len: number;
  /** Scale degree relative to the tonic in the lead register. */
  deg: number;
}

/** Rhythm cells for one beat: [offset, length] pairs + weight. */
const CELLS: readonly { w: number; notes: readonly (readonly [number, number])[] }[] = [
  { w: 3, notes: [] },
  { w: 3, notes: [[0, 2]] },
  { w: 3, notes: [[0, 2], [2, 2]] },
  { w: 2, notes: [[2, 2]] },
  { w: 1.5, notes: [[0, 3], [3, 1]] },
  { w: 1, notes: [[0, 1], [1, 1], [2, 2]] },
  { w: 1, notes: [[3, 1]] },
  { w: 2, notes: [[0, 4]] },
];
const END_CELLS: readonly { w: number; notes: readonly (readonly [number, number])[] }[] = [
  { w: 2, notes: [] },
  { w: 3, notes: [[0, 4]] },
  { w: 1, notes: [[0, 2]] },
];
const STEPS = [-2, -1, -1, 0, 1, 1, 2] as const;

function pickCell(cells: typeof CELLS, rng: Rng): (typeof CELLS)[number] {
  let total = 0;
  for (const c of cells) total += c.w;
  let r = rng() * total;
  for (const c of cells) {
    r -= c.w;
    if (r <= 0) return c;
  }
  return cells[cells.length - 1];
}

/** Two-bar melodic cell: a random walk on the scale over weighted rhythm cells, 5–11 notes. */
export function makeMotif(rng: Rng, scaleLen: number): MotifNote[] {
  let notes: MotifNote[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    notes = [];
    let deg = [0, 2, Math.min(4, scaleLen - 1)][Math.floor(rng() * 3)];
    for (let beat = 0; beat < 8; beat++) {
      const cell = pickCell(beat === 7 || beat === 3 ? END_CELLS : CELLS, rng);
      for (const [off, len] of cell.notes) {
        const leap = rng() < 0.12 ? (rng() < 0.5 ? -3 : 3) : STEPS[Math.floor(rng() * STEPS.length)];
        deg = clamp(deg + leap, -2, scaleLen + 2);
        notes.push({ step: beat * 4 + off, len, deg });
      }
    }
    if (notes.length >= 5 && notes.length <= 11) break;
  }
  return notes;
}

function makeSparse(rng: Rng, scaleLen: number): MotifNote[] {
  const slots = [0, 6, 14, 16, 22, 28];
  const degs = [0, 2, 4, scaleLen, scaleLen + 2, -1, 1];
  const notes: MotifNote[] = [];
  const n = 2 + Math.floor(rng() * 3);
  const used = new Set<number>();
  for (let k = 0; k < n; k++) {
    const slot = slots[Math.floor(rng() * slots.length)];
    if (used.has(slot)) continue;
    used.add(slot);
    notes.push({ step: slot, len: 4 + Math.floor(rng() * 3), deg: degs[Math.floor(rng() * degs.length)] });
  }
  if (notes.length === 0) notes.push({ step: 0, len: 6, deg: 0 });
  notes.sort((a, b) => a.step - b.step);
  return notes;
}

const ARP_RHYTHMS = ['x.xx.xx.x.xx.xx.', 'xx.xx.x.xx.xx.x.', 'x.x.xx.xx.x.xx.x'] as const;
const ARP_ORDERS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 2, 1],
  [0, 2, 1, 3],
  [3, 2, 1, 0, 1, 2],
];

function buildLead(track: TrackDef, kind: SectionKind, prog: readonly ChordSym[], bars: number, formIndex: number): NoteEvent[][] {
  const out: NoteEvent[][] = Array.from({ length: bars }, () => []);
  if (kind === 'intro' || kind === 'A') return out;
  const scale = SCALES[track.scale];
  const hookRng = seededRng(hashString(`${track.id}:${sectionVariant(kind)}:hook`));
  const answerRng = seededRng(hashString(`${track.id}:${kind}:answer:${formIndex}`));
  const lo = track.leadBase - 5;
  const hi = track.leadBase + 17;

  if (track.leadStyle === 'arp') {
    const rhythm = ARP_RHYTHMS[Math.floor(hookRng() * ARP_RHYTHMS.length)];
    const order = ARP_ORDERS[Math.floor(hookRng() * ARP_ORDERS.length)];
    const active = kind === 'breakdown' ? 2 : bars;
    let k = 0;
    for (let b = 0; b < active; b++) {
      const segs = chordSegments(prog, b);
      for (let s = 0; s < 16; s++) {
        if (rhythm[s] !== 'x') continue;
        const notes = voiceChord(segmentAt(segs, s).chord, track.leadBase);
        const idx = order[k++ % order.length] % notes.length;
        out[b].push({ step: s, len: 1, midi: notes[idx], vel: s % 4 === 0 ? 0.85 : 0.62 });
      }
    }
    return out;
  }

  const make = track.leadStyle === 'sparse' ? makeSparse : makeMotif;
  const hook = make(hookRng, scale.length);
  const answer = make(answerRng, scale.length);
  const phrases = bars / 2;
  for (let p = 0; p < phrases; p++) {
    if (kind === 'breakdown' && p > 0) break;
    let motif = p === phrases - 1 && phrases > 1 ? answer : hook;
    if (p === 1 && motif.length > 1) {
      // variation: nudge the last two notes
      motif = motif.map((n, i) => (i >= motif.length - 2 ? { ...n, deg: n.deg + (answerRng() < 0.5 ? 1 : -1) } : n));
    }
    motif.forEach((n, i) => {
      const bar = p * 2 + Math.floor(n.step / 16);
      const step = n.step % 16;
      let midi = scaleNote(track.leadBase, scale, n.deg);
      const strong = step % 8 === 0 || i === motif.length - 1 || track.leadStyle === 'sparse';
      if (strong) midi = nearestChordTone(midi, segmentAt(chordSegments(prog, bar), step).chord);
      while (midi < lo) midi += 12;
      while (midi > hi) midi -= 12;
      out[bar].push({ step, len: Math.min(n.len, 16 - step), midi, vel: (strong ? 0.86 : 0.7) * (kind === 'breakdown' ? 0.8 : 1) });
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────── assembly ──

/** All bars of one arrangement section. `formIndex` = position in the unrolled form (0 = intro). */
export function buildSection(track: TrackDef, kind: SectionKind, formIndex: number): BarEvents[] {
  const bars = SECTION_BARS[kind];
  const prog = track.prog[sectionVariant(kind)];
  const rng = seededRng(hashString(`${track.id}:${kind}:${formIndex}`));
  const lead = buildLead(track, kind, prog, bars, formIndex);
  const out: BarEvents[] = [];
  for (let b = 0; b < bars; b++) {
    const segs = chordSegments(prog, b);
    const nextRoot = chordSegments(prog, b + 1)[0].chord.root;
    out.push({
      section: kind,
      bar: b,
      drums: drumBar(track, kind, b, bars, formIndex, rng),
      bass: bassBar(track, kind, b, bars, segs, nextRoot),
      chords: chordBar(track, kind, segs, rng),
      lead: lead[b],
    });
  }
  return out;
}

/** Section kind at an unrolled form position (loops back to `loopFrom` after the last section). */
export function sectionAt(track: TrackDef, formIndex: number): SectionKind {
  const n = track.form.length;
  if (formIndex < n) return track.form[formIndex];
  const span = n - track.loopFrom;
  return track.form[track.loopFrom + ((formIndex - n) % span)];
}

export function barSeconds(track: TrackDef): number {
  return 16 * stepSeconds(track.bpm);
}

/** Bars in one pass of the whole form (intro included). */
export function formBars(track: TrackDef): number {
  let n = 0;
  for (const s of track.form) n += SECTION_BARS[s];
  return n;
}

export type SchedEvent =
  | { t: number; kind: 'drum'; inst: DrumId; vel: number }
  | { t: number; kind: 'bass'; midi: number; dur: number; vel: number; glideFrom?: number }
  | { t: number; kind: 'chord'; midis: number[]; dur: number; vel: number }
  | { t: number; kind: 'lead'; midi: number; dur: number; vel: number };

/** Bar → time-sorted events (seconds from the bar start) with swing, humanised hats and a dragging backbeat. */
export function scheduleBar(bar: BarEvents, track: TrackDef, rng: Rng): SchedEvent[] {
  const sd = stepSeconds(track.bpm);
  const at = (step: number): number => swingTime(step, sd, track.swing);
  const span = (step: number, len: number): number => Math.max(0.03, at(step + len) - at(step));
  const out: SchedEvent[] = [];
  for (const h of bar.drums) {
    let t = at(h.step);
    if (h.inst !== 'kick') t += (rng() * 2 - 1) * track.humanize;
    if (h.inst === 'snare' || h.inst === 'clap' || h.inst === 'rim') t += track.lateSnare;
    out.push({ t: Math.max(0, t), kind: 'drum', inst: h.inst, vel: clamp(h.vel, 0.05, 1) });
  }
  for (const n of bar.bass) out.push({ t: at(n.step), kind: 'bass', midi: n.midi, dur: span(n.step, n.len) * 0.96, vel: n.vel, glideFrom: n.glideFrom });
  for (const c of bar.chords) out.push({ t: at(c.step) + rng() * track.humanize, kind: 'chord', midis: c.midis, dur: span(c.step, c.len), vel: c.vel });
  for (const n of bar.lead) out.push({ t: Math.max(0, at(n.step) + (rng() * 2 - 1) * track.humanize * 0.5), kind: 'lead', midi: n.midi, dur: span(n.step, n.len) * 0.9, vel: n.vel });
  out.sort((a, b) => a.t - b.t);
  return out;
}
