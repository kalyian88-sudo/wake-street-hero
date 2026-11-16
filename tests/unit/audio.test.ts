import { describe, expect, it } from 'vitest';
import { createAudio } from '../../src/audio/Audio';
import { computeLayerTargets, createLayerTargets, engineHz, surfaceScrape, winchAttenuation } from '../../src/audio/layerParams';
import {
  SECTION_BARS,
  barSeconds,
  buildSection,
  chordSegments,
  drumActive,
  formBars,
  makeMotif,
  scheduleBar,
  sectionAt,
} from '../../src/audio/patterns';
import {
  CHORD_INTERVALS,
  SCALES,
  bankBlipCount,
  bassMidi,
  cheerIntensity,
  chordPitchClasses,
  dbToGain,
  gainToDb,
  impactNorm,
  letterMidi,
  midiToFreq,
  musicSlowCutoff,
  nearestChordTone,
  pc,
  scaleNote,
  slowMoCutoff,
  slowMoPitch,
  stepSeconds,
  swingTime,
  voiceChord,
  volumeCurve,
  type ChordQuality,
  type ChordSym,
} from '../../src/audio/theory';
import { TRACKS, findTrack, type SectionKind } from '../../src/audio/tracks';
import { EventBus } from '../../src/core/events';
import { createRiderSimState } from '../../src/core/riderState';
import { seededRng } from '../../src/data/geometry';

describe('audio / theory', () => {
  it('converts notes and levels', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
    expect(gainToDb(dbToGain(-17.3))).toBeCloseTo(-17.3, 6);
    expect(gainToDb(0)).toBeLessThan(-100);
  });

  it('volume slider curve is monotonic, 0 at 0 and 1 at 1', () => {
    expect(volumeCurve(0)).toBe(0);
    expect(volumeCurve(1)).toBe(1);
    expect(volumeCurve(-3)).toBe(0);
    expect(volumeCurve(7)).toBe(1);
    expect(volumeCurve(Number.NaN)).toBe(0);
    let prev = 0;
    for (let v = 0.05; v <= 1.0001; v += 0.05) {
      const g = volumeCurve(v);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    // half way on the slider is clearly quieter than half gain
    expect(gainToDb(volumeCurve(0.5))).toBeLessThan(-8);
  });

  it('slow motion pitches down and closes the low-pass smoothly', () => {
    expect(slowMoPitch(1)).toBe(1);
    expect(slowMoPitch(0.35)).toBeGreaterThan(0.55);
    expect(slowMoPitch(0.35)).toBeLessThan(0.7);
    expect(slowMoPitch(0.22)).toBeLessThan(slowMoPitch(0.35));
    expect(slowMoCutoff(1)).toBeGreaterThan(15000);
    expect(slowMoCutoff(0.35)).toBeGreaterThan(1000);
    expect(slowMoCutoff(0.35)).toBeLessThan(2200);
    let prev = Infinity;
    for (let ts = 1; ts >= 0.2; ts -= 0.05) {
      const c = slowMoCutoff(ts);
      expect(c).toBeLessThanOrEqual(prev);
      prev = c;
    }
  });

  it('music only gets a gentle low-pass below 0.6x', () => {
    expect(musicSlowCutoff(1)).toBe(18000);
    expect(musicSlowCutoff(0.6)).toBe(18000);
    expect(musicSlowCutoff(0.59)).toBeLessThan(18000);
    expect(musicSlowCutoff(0.35)).toBeGreaterThan(2500);
    // gentler than the world low-pass at the same time scale
    expect(musicSlowCutoff(0.35)).toBeGreaterThan(slowMoCutoff(0.35));
    expect(musicSlowCutoff(0.22)).toBeGreaterThan(1500);
  });

  it('voices every chord quality with its third and seventh, without semitone clusters', () => {
    for (const q of Object.keys(CHORD_INTERVALS) as ChordQuality[]) {
      for (let root = 0; root < 12; root++) {
        const ch: ChordSym = { root, q };
        const notes = voiceChord(ch, 62);
        const want = CHORD_INTERVALS[q].map((iv) => pc(root + iv));
        expect(notes.length).toBe(new Set(want).size);
        for (const w of want) expect(notes.map(pc)).toContain(w);
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i]).toBeGreaterThan(notes[i - 1]);
          expect(notes[i] - notes[i - 1]).not.toBe(1);
        }
        expect(notes[0]).toBeGreaterThanOrEqual(56);
        expect(notes[notes.length - 1]).toBeLessThanOrEqual(92);
      }
    }
  });

  it('keeps common tones between neighbouring chords (voice leading)', () => {
    // Dm9 → G13 share F (3rd → b7) and E (9 → 13)
    const a = voiceChord({ root: 2, q: 'm9' }, 62).map(pc);
    const b = voiceChord({ root: 7, q: '13' }, 62).map(pc);
    expect(a.filter((p) => b.includes(p)).length).toBeGreaterThanOrEqual(2);
  });

  it('places bass notes in the requested octave', () => {
    for (let root = 0; root < 12; root++) {
      const m = bassMidi(root, 31);
      expect(pc(m)).toBe(root);
      expect(m).toBeGreaterThanOrEqual(31);
      expect(m).toBeLessThan(43);
    }
  });

  it('walks scales across octaves and finds chord tones', () => {
    expect(scaleNote(60, SCALES.major, 0)).toBe(60);
    expect(scaleNote(60, SCALES.major, 7)).toBe(72);
    expect(scaleNote(60, SCALES.major, -1)).toBe(59);
    expect(scaleNote(60, SCALES.minPent, 5)).toBe(72);
    expect(scaleNote(60, SCALES.minPent, -5)).toBe(48);
    const cmaj: ChordSym = { root: 0, q: 'maj7' };
    expect(chordPitchClasses(cmaj).sort((x, y) => x - y)).toEqual([0, 4, 7, 11]);
    expect(pc(nearestChordTone(62, cmaj))).toBe(0); // D → C (tie resolves down)
    expect(nearestChordTone(64, cmaj)).toBe(64);
    expect([0, 4, 7, 11]).toContain(pc(nearestChordTone(66, cmaj)));
  });

  it('swing delays only the off 16ths and stays monotonic', () => {
    const sd = stepSeconds(90);
    expect(sd).toBeCloseTo(60 / 90 / 4, 9);
    for (let s = 0; s <= 16; s++) expect(swingTime(s, sd, 0.5)).toBeCloseTo(s * sd, 9);
    for (let s = 0; s <= 16; s += 2) expect(swingTime(s, sd, 0.62)).toBeCloseTo(s * sd, 9);
    expect(swingTime(1, sd, 0.62)).toBeCloseTo(1.24 * sd, 9);
    let prev = -1;
    for (let s = 0; s <= 16; s += 0.25) {
      const t = swingTime(s, sd, 0.645);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('maps gameplay values to sound parameters', () => {
    const notes = [1, 2, 3, 4, 5, 6].map(letterMidi);
    for (let i = 1; i < 6; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
    expect(letterMidi(0)).toBe(notes[0]);
    expect(letterMidi(99)).toBe(notes[5]);

    expect(bankBlipCount(0)).toBe(0);
    expect(bankBlipCount(-5)).toBe(0);
    expect(bankBlipCount(100)).toBeGreaterThanOrEqual(2);
    expect(bankBlipCount(1e9)).toBe(8);
    let prev = 0;
    for (const amount of [10, 100, 1000, 10000, 100000]) {
      const n = bankBlipCount(amount);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }

    expect(cheerIntensity(1, 'perfect')).toBe(0);
    expect(cheerIntensity(2, 'clean')).toBe(0);
    expect(cheerIntensity(3, 'clean')).toBeGreaterThan(0);
    expect(cheerIntensity(5, 'clean')).toBe(1);
    expect(cheerIntensity(5, 'bail')).toBe(0);
    expect(cheerIntensity(4, 'sketchy')).toBeLessThan(cheerIntensity(4, 'clean'));
    expect(cheerIntensity(3, 'clean')).toBeLessThan(cheerIntensity(4, 'clean'));

    expect(impactNorm(0)).toBe(0);
    expect(impactNorm(5)).toBeCloseTo(0.5, 6);
    expect(impactNorm(40)).toBe(1);
  });
});

describe('audio / tracks + patterns', () => {
  const ALL: SectionKind[] = ['intro', 'A', 'A2', 'B', 'breakdown'];

  it('has at least four clearly different tracks', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((t) => t.bpm)).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((t) => t.key)).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((t) => t.keys)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(TRACKS.map((t) => t.lead)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(TRACKS.map((t) => JSON.stringify(t.drums.A.kick))).size).toBe(TRACKS.length);
    for (const t of TRACKS) {
      expect(t.bpm).toBeGreaterThanOrEqual(78);
      expect(t.bpm).toBeLessThanOrEqual(96);
      expect(t.swing).toBeGreaterThanOrEqual(0.5);
      expect(t.swing).toBeLessThanOrEqual(0.67);
      expect(t.form[0]).toBe('intro');
      expect(new Set(t.form).size).toBeGreaterThanOrEqual(4);
      expect(t.loopFrom).toBeGreaterThan(0);
      expect(findTrack(t.id)).toBe(t);
    }
    expect(findTrack('nope')).toBeUndefined();
    expect(findTrack(undefined)).toBeUndefined();
  });

  it('pattern strings are exactly one bar long', () => {
    for (const t of TRACKS) {
      for (const lane of [t.drums.A, t.drums.B]) {
        for (const pats of Object.values(lane)) for (const p of pats ?? []) expect(p, `${t.id} drums`).toMatch(/^[Xxo.\-]{16}$/);
      }
      for (const pats of [t.bassPat.A, t.bassPat.B]) for (const p of pats) expect(p, `${t.id} bass`).toMatch(/^[Rr358aA_.]{16}$/);
      for (const prog of [t.prog.A, t.prog.B]) {
        const beats = prog.reduce((n, c) => n + (c.beats ?? 4), 0);
        expect(beats % 4).toBe(0);
        // a section is 8 bars: the progression must tile it
        expect(32 % beats).toBe(0);
      }
    }
  });

  it('splits bars into chord segments that cover all 16 steps', () => {
    for (const t of TRACKS) {
      for (const prog of [t.prog.A, t.prog.B]) {
        for (let bar = 0; bar < 8; bar++) {
          const segs = chordSegments(prog, bar);
          expect(segs.length).toBeGreaterThanOrEqual(1);
          expect(segs[0].start).toBe(0);
          let at = 0;
          for (const s of segs) {
            expect(s.start).toBe(at);
            at += s.len;
          }
          expect(at).toBe(16);
        }
      }
    }
    const b = findTrack('canal_ride')!.prog.B;
    expect(chordSegments(b, 2).map((s) => s.chord.root)).toEqual([4, 9]);
    expect(chordSegments(b, 3).map((s) => s.chord.root)).toEqual([2, 7]);
    expect(chordSegments(b, 4).map((s) => s.chord.root)).toEqual([5]); // loops
  });

  it('builds every section of every track with sane events', () => {
    for (const t of TRACKS) {
      const scale = SCALES[t.scale];
      const scalePcs = scale.map((s) => pc(t.key + s));
      for (const kind of ALL) {
        const bars = buildSection(t, kind, 3);
        expect(bars.length).toBe(SECTION_BARS[kind]);
        const prog = t.prog[kind === 'B' ? 'B' : 'A'];
        bars.forEach((bar, b) => {
          const segs = chordSegments(prog, b);
          for (const h of bar.drums) {
            expect(h.step).toBeGreaterThanOrEqual(0);
            expect(h.step).toBeLessThan(16);
            expect(h.vel).toBeGreaterThan(0);
            expect(h.vel).toBeLessThanOrEqual(1.1);
            if (b < bars.length - 1) expect(drumActive(kind, h.inst, b), `${t.id} ${kind} ${h.inst}`).toBe(true);
          }
          for (const n of bar.bass) {
            expect(n.step + n.len).toBeLessThanOrEqual(16);
            expect(n.midi).toBeGreaterThanOrEqual(t.bassLow - 1);
            expect(n.midi).toBeLessThanOrEqual(t.bassLow + 24);
          }
          for (const c of bar.chords) {
            expect(c.step + c.len).toBeLessThanOrEqual(16);
            expect(c.midis.length).toBeGreaterThanOrEqual(3);
            const seg = [...segs].reverse().find((s) => c.step >= s.start)!;
            const pcs = chordPitchClasses(seg.chord);
            for (const m of c.midis) expect(pcs).toContain(pc(m));
          }
          for (const n of bar.lead) {
            expect(n.step + n.len).toBeLessThanOrEqual(16);
            expect(n.midi).toBeGreaterThanOrEqual(t.leadBase - 5);
            expect(n.midi).toBeLessThanOrEqual(t.leadBase + 29);
            const seg = [...segs].reverse().find((s) => n.step >= s.start)!;
            const ok = scalePcs.includes(pc(n.midi)) || chordPitchClasses(seg.chord).includes(pc(n.midi));
            expect(ok, `${t.id} ${kind} lead note ${n.midi}`).toBe(true);
          }
        });
      }
    }
  });

  it('arranges: stripped intro, full A, lead enters later, fills at section ends', () => {
    for (const t of TRACKS) {
      const intro = buildSection(t, 'intro', 0);
      const a = buildSection(t, 'A', 1);
      const a2 = buildSection(t, 'A2', 2);
      const b = buildSection(t, 'B', 3);
      const brk = buildSection(t, 'breakdown', 4);
      const count = (bars: typeof a, f: (x: (typeof a)[number]) => number): number => bars.reduce((n, x) => n + f(x), 0);
      const kicks = (bars: typeof a): number => count(bars, (x) => x.drums.filter((h) => h.inst === 'kick').length);

      expect(kicks(intro), `${t.id} intro kick`).toBe(0);
      expect(kicks(brk), `${t.id} breakdown kick`).toBe(0);
      expect(kicks(a)).toBeGreaterThanOrEqual(12);
      // downbeat kick in every bar of the A section
      for (const bar of a) expect(bar.drums.some((h) => h.inst === 'kick' && h.step === 0)).toBe(true);
      expect(intro[0].bass.length).toBe(0);
      expect(count(a, (x) => x.bass.length)).toBeGreaterThan(8);
      expect(count(intro, (x) => x.chords.length)).toBeGreaterThanOrEqual(4);
      expect(count(intro, (x) => x.lead.length)).toBe(0);
      expect(count(a, (x) => x.lead.length)).toBe(0);
      expect(count(a2, (x) => x.lead.length)).toBeGreaterThan(4);
      expect(count(b, (x) => x.lead.length)).toBeGreaterThan(4);
      // the last bar differs from the same pattern bar earlier in the section (fill)
      const sig = (x: (typeof a)[number]): string => x.drums.map((h) => `${h.inst}@${h.step}`).join(',');
      expect(sig(a[7])).not.toBe(sig(a[5]));
      // A and B really are different music
      expect(JSON.stringify(a[0].chords[0].midis)).not.toBe(JSON.stringify(b[0].chords[0].midis));
    }
  });

  it('is deterministic per position and varies between passes', () => {
    const t = TRACKS[0];
    expect(JSON.stringify(buildSection(t, 'A2', 2))).toBe(JSON.stringify(buildSection(t, 'A2', 2)));
    // the hook (first phrase of the lead) comes back identical on the next pass…
    const first = buildSection(t, 'A2', 2);
    const again = buildSection(t, 'A2', 5);
    expect(JSON.stringify(first[0].lead)).toBe(JSON.stringify(again[0].lead));
    // …while the section as a whole is not a carbon copy
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(again));
  });

  it('trap track rolls its hats, boom-bap ghosts its snare', () => {
    const granite = findTrack('granite')!;
    let rolls = 0;
    for (let f = 1; f < 8; f++) for (const bar of buildSection(granite, 'A', f)) rolls += bar.drums.filter((h) => h.inst === 'hat' && h.step % 1 !== 0).length;
    expect(rolls).toBeGreaterThan(10);
    const oldTown = findTrack('old_town')!;
    let ghosts = 0;
    for (let f = 1; f < 8; f++) for (const bar of buildSection(oldTown, 'A', f)) ghosts += bar.drums.filter((h) => h.inst === 'snare' && h.vel < 0.35).length;
    expect(ghosts).toBeGreaterThan(5);
  });

  it('808 bass slides between legato notes of different pitch', () => {
    const granite = findTrack('granite')!;
    const notes = buildSection(granite, 'B', 2).flatMap((b) => b.bass);
    expect(notes.some((n) => n.glideFrom !== undefined && n.glideFrom !== n.midi)).toBe(true);
  });

  it('bass plays the chord root on the downbeat', () => {
    for (const t of TRACKS) {
      const bars = buildSection(t, 'A', 1);
      bars.forEach((bar, b) => {
        const root = chordSegments(t.prog.A, b)[0].chord.root;
        const first = bar.bass.find((n) => n.step === 0);
        expect(first, `${t.id} bar ${b}`).toBeDefined();
        expect(pc(first!.midi)).toBe(pc(root));
      });
    }
  });

  it('motifs have a singable size', () => {
    for (let seed = 1; seed < 40; seed++) {
      const m = makeMotif(seededRng(seed), 5);
      expect(m.length).toBeGreaterThanOrEqual(1);
      expect(m.length).toBeLessThanOrEqual(16);
      for (const n of m) {
        expect(n.step).toBeGreaterThanOrEqual(0);
        expect(n.step).toBeLessThan(32);
        expect(n.deg).toBeGreaterThanOrEqual(-2);
        expect(n.deg).toBeLessThanOrEqual(7);
      }
    }
  });

  it('schedules bars as sorted, in-bar, swung event times', () => {
    for (const t of TRACKS) {
      const dur = barSeconds(t);
      expect(dur).toBeCloseTo((60 / t.bpm) * 4, 9);
      for (const kind of ALL) {
        for (const bar of buildSection(t, kind, 2)) {
          const evs = scheduleBar(bar, t, seededRng(7));
          expect(evs.length).toBe(bar.drums.length + bar.bass.length + bar.chords.length + bar.lead.length);
          let prev = -1;
          for (const e of evs) {
            expect(e.t).toBeGreaterThanOrEqual(0);
            expect(e.t).toBeLessThan(dur + 0.03);
            expect(e.t).toBeGreaterThanOrEqual(prev);
            prev = e.t;
            if (e.kind !== 'drum') expect(e.dur).toBeGreaterThan(0.02);
          }
          // kicks are never humanised: they sit exactly on the (swung) grid
          for (const e of evs) {
            if (e.kind === 'drum' && e.inst === 'kick') {
              const hit = bar.drums.find((h) => h.inst === 'kick' && Math.abs(swingTime(h.step, stepSeconds(t.bpm), t.swing) - e.t) < 1e-9);
              expect(hit).toBeDefined();
            }
          }
        }
      }
    }
  });

  it('loops the form after the intro', () => {
    for (const t of TRACKS) {
      const n = t.form.length;
      for (let i = 0; i < n; i++) expect(sectionAt(t, i)).toBe(t.form[i]);
      expect(sectionAt(t, n)).toBe(t.form[t.loopFrom]);
      expect(sectionAt(t, n + 1)).toBe(t.form[t.loopFrom + 1]);
      expect(sectionAt(t, n + (n - t.loopFrom))).toBe(t.form[t.loopFrom]);
      for (let i = n; i < n * 4; i++) expect(sectionAt(t, i)).not.toBe('intro');
      // one pass lasts between 1.5 and 3.5 minutes → "auto" does not hop tracks too fast
      const seconds = formBars(t) * barSeconds(t);
      expect(seconds).toBeGreaterThan(90);
      expect(seconds).toBeLessThan(210);
    }
  });
});

describe('audio / layer targets', () => {
  const riding = (speed: number): ReturnType<typeof createRiderSimState> => {
    const s = createRiderSimState();
    s.mode = 'water';
    s.surface = 'water';
    s.speed = speed;
    s.distToWinch = 60;
    s.rope.reelSpeed = 9.5;
    s.rope.taut = true;
    s.rope.tension = 0.5;
    return s;
  };

  it('is silent in menus and muted when paused', () => {
    const out = createLayerTargets();
    expect(computeLayerTargets(riding(10), false, out)).toBe(out);
    expect(out.water).toBeGreaterThan(0);
    computeLayerTargets(null, false, out);
    for (const k of ['water', 'fizz', 'carve', 'chatter', 'wind', 'engine', 'rope', 'slide', 'grind', 'hero'] as const) expect(out[k]).toBe(0);
    expect(out.slideKind).toBeNull();
    expect(computeLayerTargets(riding(10), true, out).master).toBe(0);
    expect(computeLayerTargets(riding(10), false, out).master).toBe(1);
  });

  it('water gets louder and brighter with speed', () => {
    const slow = { ...computeLayerTargets(riding(3), false, createLayerTargets()) };
    const fast = { ...computeLayerTargets(riding(12), false, createLayerTargets()) };
    expect(fast.water).toBeGreaterThan(slow.water);
    expect(fast.waterCutoff).toBeGreaterThan(slow.waterCutoff);
    expect(fast.fizz).toBeGreaterThan(slow.fizz);
    expect(fast.chatterRate).toBeGreaterThan(slow.chatterRate);
    const air = riding(12);
    air.mode = 'air';
    air.surface = 'air';
    expect(computeLayerTargets(air, false, createLayerTargets()).water).toBe(0);
  });

  it('carve follows |lean| x speed and is thrown to the outside of the turn', () => {
    const s = riding(11);
    s.lean = 0.9;
    const right = { ...computeLayerTargets(s, false, createLayerTargets()) };
    s.lean = -0.9;
    const left = { ...computeLayerTargets(s, false, createLayerTargets()) };
    s.lean = 0.2;
    const soft = { ...computeLayerTargets(s, false, createLayerTargets()) };
    expect(right.carve).toBeGreaterThan(soft.carve);
    expect(right.carve).toBeCloseTo(left.carve, 9);
    expect(right.carvePan).toBeLessThan(0);
    expect(left.carvePan).toBeGreaterThan(0);
    s.lean = 0.9;
    s.speed = 0;
    expect(computeLayerTargets(s, false, createLayerTargets()).carve).toBe(0);
  });

  it('wind grows with height and speed in the air', () => {
    const s = riding(10);
    s.mode = 'air';
    s.surface = 'air';
    s.air.height = 0.5;
    const low = computeLayerTargets(s, false, createLayerTargets()).wind;
    s.air.height = 3;
    const high = computeLayerTargets(s, false, createLayerTargets()).wind;
    s.speed = 14;
    const fast = computeLayerTargets(s, false, createLayerTargets()).wind;
    expect(high).toBeGreaterThan(low);
    expect(fast).toBeGreaterThan(high);
  });

  it('winch engine: pitch follows reel speed, sags under load, louder when close', () => {
    expect(engineHz(0, 0)).toBeCloseTo(26, 6);
    expect(engineHz(11.5, 0)).toBeGreaterThan(80);
    expect(engineHz(11.5, 1)).toBeLessThan(engineHz(11.5, 0));
    let prev = 0;
    for (let v = 0; v <= 12; v += 1) {
      const hz = engineHz(v, 0.3);
      expect(hz).toBeGreaterThan(prev);
      prev = hz;
    }
    expect(winchAttenuation(0)).toBeCloseTo(1, 6);
    expect(winchAttenuation(200)).toBeCloseTo(0.2, 6);
    expect(winchAttenuation(30)).toBeGreaterThan(winchAttenuation(90));

    const s = riding(10);
    s.distToWinch = 100;
    const far = computeLayerTargets(s, false, createLayerTargets()).engine;
    s.distToWinch = 12;
    const near = computeLayerTargets(s, false, createLayerTargets()).engine;
    expect(near).toBeGreaterThan(far * 2);

    // idle while waiting at the start
    const w = createRiderSimState();
    w.distToWinch = 80;
    const idle = computeLayerTargets(w, false, createLayerTargets());
    expect(idle.engine).toBeGreaterThan(0);
    expect(idle.engineHz).toBeCloseTo(26, 6);
  });

  it('pans the winch to the side it is on', () => {
    const s = riding(10);
    s.distToWinch = 80;
    s.heading = 0; // travelling +Z, left is +X
    s.rope.dir.set(1, 0, 0);
    expect(computeLayerTargets(s, false, createLayerTargets()).enginePan).toBeLessThan(-0.3);
    s.rope.dir.set(-1, 0, 0);
    expect(computeLayerTargets(s, false, createLayerTargets()).enginePan).toBeGreaterThan(0.3);
    s.rope.dir.set(0, 0, 1);
    expect(Math.abs(computeLayerTargets(s, false, createLayerTargets()).enginePan)).toBeLessThan(1e-9);
  });

  it('rope hum needs a taut rope in the hands', () => {
    const s = riding(10);
    s.rope.tension = 0.9;
    const taut = { ...computeLayerTargets(s, false, createLayerTargets()) };
    expect(taut.rope).toBeGreaterThan(0.5);
    s.rope.holding = false;
    expect(computeLayerTargets(s, false, createLayerTargets()).rope).toBe(0);
    s.rope.holding = true;
    s.rope.taut = false;
    expect(computeLayerTargets(s, false, createLayerTargets()).rope).toBe(0);
    s.rope.taut = true;
    s.rope.tension = 0.2;
    const loose = computeLayerTargets(s, false, createLayerTargets());
    expect(loose.rope).toBeLessThan(taut.rope);
    expect(loose.ropeHz).toBeLessThan(taut.ropeHz);
  });

  it('picks slide / grind loops from mode and surface', () => {
    expect(surfaceScrape('wetConcrete')).toBe('wet');
    expect(surfaceScrape('concrete')).toBe('concrete');
    expect(surfaceScrape('stone')).toBe('stone');
    expect(surfaceScrape('wood')).toBe('wood');
    expect(surfaceScrape('water')).toBeNull();
    expect(surfaceScrape('air')).toBeNull();

    const s = riding(8);
    s.mode = 'slide';
    s.surface = 'wetConcrete';
    let out = computeLayerTargets(s, false, createLayerTargets());
    expect(out.slideKind).toBe('wet');
    expect(out.slide).toBeGreaterThan(0.3);
    expect(out.water).toBe(0);
    expect(out.grind).toBe(0);

    s.mode = 'rail';
    s.surface = 'rail';
    out = computeLayerTargets(s, false, createLayerTargets());
    expect(out.grind).toBeGreaterThan(0.3);
    expect(out.slide).toBe(0);
    expect(out.slideKind).toBeNull();

    s.mode = 'wall';
    s.surface = 'wall';
    out = computeLayerTargets(s, false, createLayerTargets());
    expect(out.slideKind).toBe('concrete');
  });

  it('flags hero mode', () => {
    const s = riding(8);
    expect(computeLayerTargets(s, false, createLayerTargets()).hero).toBe(0);
    s.hero = true;
    expect(computeLayerTargets(s, false, createLayerTargets()).hero).toBe(1);
  });
});

describe('audio / facade without WebAudio (node)', () => {
  it('runs silent and never throws', () => {
    const bus = new EventBus();
    let unlockedEvents = 0;
    bus.on('audio:unlocked', () => unlockedEvents++);
    const audio = createAudio(bus);
    expect(audio.unlocked).toBe(false);
    expect(() => {
      audio.unlock();
      audio.unlock();
      audio.setVolumes(0.5, 0.5);
      audio.playMusic();
      audio.playMusic('auto');
      audio.playMusic('old_town');
      audio.playMusic('does_not_exist');
      audio.setDucked(true);
      audio.setDucked(false);
      audio.play('pop');
      audio.play('crowd.cheer', { volume: 1, pitch: 1.2, pan: -1 });
      audio.update(1 / 60, { state: createRiderSimState(), timeScale: 0.35, paused: false });
      audio.update(1 / 60, { state: null, timeScale: 1, paused: true });
      audio.suspend();
      audio.resume();
      audio.stopMusic();
    }).not.toThrow();
    expect(audio.unlocked).toBe(false);
    expect(unlockedEvents).toBe(0);
  });

  it('lists the tracks with display names', () => {
    const audio = createAudio(new EventBus());
    expect(audio.tracks.length).toBe(TRACKS.length);
    for (const tr of audio.tracks) {
      expect(TRACKS.some((d) => d.id === tr.id)).toBe(true);
      expect(tr.name.length).toBeGreaterThan(2);
      expect(tr.name.startsWith('audio.')).toBe(false);
    }
  });

  it('survives every bus event it listens to', () => {
    const bus = new EventBus();
    createAudio(bus);
    const p = { x: 0, y: 0, z: 0 };
    const trick = { id: 'x', ids: ['x'], name: { ru: 'x', en: 'x' }, points: 100, parts: [], tier: 5 };
    expect(() => {
      bus.emit('run:countdown', { n: 3 });
      bus.emit('run:go', { config: { spotId: 's', winchId: 'w', power: 'medium', board: 'wakeboard', mode: 'free' } });
      bus.emit('run:paused', { paused: true });
      bus.emit('game:state', { state: 'run', prev: 'paused' });
      bus.emit('sim:pop', { power: 1, pos: p, surface: 'water' });
      bus.emit('sim:land', { quality: 'clean', impact: 6, pos: p, surface: 'water', onto: 'water', hadTrick: true });
      bus.emit('sim:bail', { reason: 'underRotated', pos: p, surface: 'concrete', intensity: 0.9, boardLost: false });
      bus.emit('sim:railEnter', { obstacleId: 'r', kind: 'rail', pos: p, material: 'metal' });
      bus.emit('sim:railExit', { obstacleId: 'r', pos: p, popped: true });
      bus.emit('sim:ropeJerk', { jerk: 5 });
      bus.emit('trick:flip', { id: 'kickflip' });
      bus.emit('trick:catch', { quality: 0.8, ok: true });
      bus.emit('score:trick', { trick, awarded: 100, landing: 'perfect', stale: 1, comboPoints: 100, comboMult: 2, time: 1 });
      bus.emit('score:bank', { points: 100, mult: 2, banked: 200, total: 200, count: 1 });
      bus.emit('score:lost', { points: 100, mult: 2 });
      bus.emit('hero:start', { duration: 8 });
      bus.emit('hero:end', {});
      bus.emit('letter:collect', { index: 0, pos: p, count: 1 });
      bus.emit('goal:complete', { index: 0, first: true });
      bus.emit('clip:captured', { zone: 'z', trick });
      bus.emit('run:quit', {});
    }).not.toThrow();
  });
});
