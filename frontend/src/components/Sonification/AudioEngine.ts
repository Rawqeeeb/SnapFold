import * as Tone from 'tone'
import type { NoteEvent } from '../../types/protein'
import type { StylePreset } from './StyleEngine'
import { STYLE_PRESETS } from './StyleEngine'
import type { GameLevel } from '../../game/levels'

export interface TraversalNoteStep {
  subunitIdx: number
  residueIndex: number
  localIndex: number
  totalSubunitResidues: number
  globalStep: number
  totalSteps: number
  aminoAcid: string
  pitch: number
  noteName: string
  chainName: string
}

// ── Synth / reverb / filter pipeline ─────────────────────────────────────────
let _synthRH: Tone.Synth | null = null
let _synthLH: Tone.Synth | null = null
let _polySynths: Tone.PolySynth[] = []
let _reverb: Tone.Freeverb | null = null
let _dockingFilter: Tone.Filter | null = null
let _mediaStreamDest: MediaStreamAudioDestinationNode | null = null
let _styleKey = ''

function styleKey(p: StylePreset) {
  return `${p.oscillatorType}|${p.envelope.attack}|${p.envelope.release}|${p.reverbWet}`
}

export function disposeSynths() {
  try { _synthRH?.dispose() } catch (_) { /* ignore */ }
  try { _synthLH?.dispose() } catch (_) { /* ignore */ }
  try { _reverb?.dispose() } catch (_) { /* ignore */ }
  try { _dockingFilter?.dispose() } catch (_) { /* ignore */ }
  for (const s of _polySynths) {
    try { s.dispose() } catch (_) { /* ignore */ }
  }
  _synthRH = null
  _synthLH = null
  _polySynths = []
  _reverb = null
  _dockingFilter = null
  _styleKey = ''
}

/**
 * Returns a WebAudio MediaStreamDestination connected to Tone's output
 * so MediaRecorder can record audio + 3D WebGL video together.
 */
export function getAudioRecordingStream(): MediaStream | null {
  try {
    const rawCtx = Tone.getContext().rawContext as AudioContext
    if (!_mediaStreamDest && typeof rawCtx.createMediaStreamDestination === 'function') {
      _mediaStreamDest = rawCtx.createMediaStreamDestination()
      Tone.getDestination().connect(_mediaStreamDest)
    }
    return _mediaStreamDest?.stream ?? null
  } catch {
    return null
  }
}

function ensurePipeline(preset: StylePreset) {
  const key = styleKey(preset)
  if (key === _styleKey && _synthRH && _synthLH && _dockingFilter) return
  disposeSynths()
  _styleKey = key

  // Dynamic low-pass filter controlled by alignment score
  _dockingFilter = new Tone.Filter({
    frequency: 8000,
    type: 'lowpass',
    rolloff: -24,
    Q: 1.2,
  })

  const output: Tone.InputNode = (() => {
    if (preset.reverbWet > 0) {
      _reverb = new Tone.Freeverb({ roomSize: 0.8, dampening: 3000 }).toDestination()
      _reverb.wet.value = preset.reverbWet
      return _reverb
    }
    return Tone.getDestination()
  })()

  _dockingFilter.connect(output)

  // Ensure recording destination stays connected if active
  if (_mediaStreamDest) {
    try {
      Tone.getDestination().connect(_mediaStreamDest)
    } catch {
      // ignore if already connected
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osc = (type: OscillatorType): any => ({ type })

  _synthRH = new Tone.Synth({
    oscillator: osc(preset.oscillatorType),
    envelope: preset.envelope,
  }).connect(_dockingFilter)

  const lhType: OscillatorType =
    preset.oscillatorType === 'sawtooth'
      ? 'triangle'
      : preset.oscillatorType === 'square'
      ? 'triangle'
      : preset.oscillatorType

  _synthLH = new Tone.Synth({
    oscillator: osc(lhType),
    envelope: preset.envelope,
  }).connect(_dockingFilter)
}

// ── Psychoacoustic Alignment Controller ──────────────────────────────────────
/**
 * Dynamically adjusts cutoff frequency and detune based on real-time alignment score.
 * Alignment = 0.0 -> Filter cutoff ~320Hz (muffled), detune off by ~80 cents
 * Alignment = 1.0 -> Filter cutoff 16000Hz (crystal clear), detune 0 cents
 */
export function setAlignmentAudioFeedback(alignment: number): void {
  if (!_dockingFilter) return
  const clamped = Math.max(0, Math.min(1, alignment))

  const cutoff = 320 + Math.pow(clamped, 2.8) * 15680
  const now = Tone.now()

  _dockingFilter.frequency.cancelScheduledValues(now)
  _dockingFilter.frequency.rampTo(cutoff, 0.1, now)

  const detuneCents = (1.0 - clamped) * 80.0
  if (_synthRH) {
    _synthRH.detune.cancelScheduledValues(now)
    _synthRH.detune.rampTo(detuneCents, 0.1, now)
  }
  if (_synthLH) {
    _synthLH.detune.cancelScheduledValues(now)
    _synthLH.detune.rampTo(-detuneCents * 0.8, 0.1, now)
  }
}

// ── Play harmonic alignment lock chord ───────────────────────────────────────
export async function playLockCelebration(): Promise<void> {
  await Tone.start()
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.04, decay: 0.25, sustain: 0.35, release: 1.2 },
  }).toDestination()

  if (_mediaStreamDest) {
    try { synth.connect(_mediaStreamDest) } catch { /* ignore */ }
  }

  const chord = ['C5', 'E5', 'G5', 'B5', 'C6']
  const now = Tone.now()
  synth.triggerAttackRelease(chord, 0.9, now, 0.45)
  setTimeout(() => {
    try { synth.dispose() } catch (_) { /* ignore */ }
  }, 2200)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startAudioContext(): Promise<void> {
  await Tone.start()
}

export function stopPlayback(): void {
  Tone.Transport.stop()
  Tone.Transport.cancel()
}

export async function scheduleSonification(
  events: NoteEvent[],
  baseBpm: number,
  preset: StylePreset,
  onResidue: (idx: number, hand: string) => void,
  alignmentScore: number = 1.0,
): Promise<void> {
  await Tone.start()
  stopPlayback()
  ensurePipeline(preset)
  setAlignmentAudioFeedback(alignmentScore)

  const scale = 120 / baseBpm
  const { velocityScale, durationScale, swingAmount, pitchShift } = preset
  const handCount: Record<string, number> = {}

  for (const evt of events) {
    const noteIdx = (handCount[evt.hand] = (handCount[evt.hand] ?? 0) + 1)
    const isOff = noteIdx % 2 === 0
    const swing = isOff ? swingAmount : 0

    const synth = evt.hand === 'right' ? _synthRH! : _synthLH!
    const rawPitch = Math.max(21, Math.min(108, evt.pitch + pitchShift))
    const freq = Tone.Frequency(rawPitch, 'midi').toFrequency()

    const chordFreqs = (evt.chord_pitches ?? []).map((p: number) =>
      Tone.Frequency(Math.max(21, Math.min(108, p + pitchShift)), 'midi').toFrequency(),
    )

    const t = evt.time * scale + swing
    const dur = evt.duration * scale * durationScale
    const vel = Math.min(1, (evt.velocity / 127) * velocityScale)

    Tone.Transport.schedule((time: number) => {
      synth.triggerAttackRelease(freq, dur, time, vel)

      chordFreqs.forEach((f: number, i: number) => {
        synth.triggerAttackRelease(f, dur, time + 0.01 * (i + 1), vel * 0.7)
      })

      Tone.Draw.schedule(() => {
        onResidue(evt.residue_index, evt.hand ?? 'right')
      }, time)
    }, t)
  }

  Tone.Transport.start()
}

/**
 * Sequential 3D Protein Traversal Symphony:
 * Plays each residue note across the entire 3D protein structure from Subunit A -> B -> C...,
 * lighting up the corresponding 3D residue node in real time so players can see and hear
 * how the music moves across the 3D structure.
 */
export async function scheduleProteinTraversal(
  level: GameLevel,
  onNoteStep: (step: TraversalNoteStep) => void,
  onComplete?: () => void,
  stepDurationSec: number = 0.16,
): Promise<number> {
  await Tone.start()
  stopPlayback()
  const preset = STYLE_PRESETS['Ambient'] || STYLE_PRESETS['Default']
  ensurePipeline(preset)
  setAlignmentAudioFeedback(1.0)

  const steps: {
    subunitIdx: number
    residueIndex: number
    localIndex: number
    totalSubunitResidues: number
    aminoAcid: string
    pitch: number
    chordPitches: number[]
    velocity: number
    chainName: string
  }[] = []

  level.subunits.forEach((sub, subIdx) => {
    const blocks = sub.blocks
    const notes = sub.notes
    const count = blocks.length
    for (let i = 0; i < count; i++) {
      const b = blocks[i]
      const noteEvt = notes[i % Math.max(1, notes.length)]
      steps.push({
        subunitIdx: subIdx,
        residueIndex: b.residue_index,
        localIndex: i,
        totalSubunitResidues: count,
        aminoAcid: b.amino_acid,
        pitch: noteEvt?.pitch ?? 64,
        chordPitches: noteEvt?.chord_pitches ?? [],
        velocity: noteEvt?.velocity ?? 85,
        chainName: sub.name,
      })
    }
  })

  const totalSteps = steps.length
  const startOffset = 0.15

  steps.forEach((st, globalIdx) => {
    const t = startOffset + globalIdx * stepDurationSec
    const rawPitch = Math.max(36, Math.min(96, st.pitch))
    const freq = Tone.Frequency(rawPitch, 'midi').toFrequency()
    const noteName = Tone.Frequency(rawPitch, 'midi').toNote()
    const vel = Math.min(0.85, Math.max(0.35, st.velocity / 127))

    // Harmonic bass accompaniment every 4th residue
    const playBass = globalIdx % 4 === 0
    const bassPitch = Math.max(36, rawPitch - 12)
    const bassFreq = Tone.Frequency(bassPitch, 'midi').toFrequency()

    Tone.Transport.schedule((time: number) => {
      _synthRH?.triggerAttackRelease(freq, stepDurationSec * 0.9, time, vel)
      if (playBass) {
        _synthLH?.triggerAttackRelease(bassFreq, stepDurationSec * 3.2, time, vel * 0.55)
      }

      Tone.Draw.schedule(() => {
        onNoteStep({
          subunitIdx: st.subunitIdx,
          residueIndex: st.residueIndex,
          localIndex: st.localIndex,
          totalSubunitResidues: st.totalSubunitResidues,
          globalStep: globalIdx + 1,
          totalSteps,
          aminoAcid: st.aminoAcid,
          pitch: rawPitch,
          noteName,
          chainName: st.chainName,
        })
      }, time)
    }, t)
  })

  const totalDurationSec = startOffset + totalSteps * stepDurationSec + 0.6

  Tone.Transport.schedule((time: number) => {
    Tone.Draw.schedule(() => {
      onComplete?.()
    }, time)
  }, totalDurationSec)

  Tone.Transport.start()
  return totalDurationSec
}

export async function scheduleSymphony(
  subunitsData: { events: NoteEvent[]; color: string }[],
  baseBpm: number,
  onSubunitResidue: (subunitIdx: number, resIdx: number) => void,
  alignmentScore: number = 1.0,
): Promise<void> {
  await Tone.start()
  stopPlayback()
  const defaultPreset = STYLE_PRESETS['Default']
  ensurePipeline(defaultPreset)
  setAlignmentAudioFeedback(alignmentScore)

  const scale = 120 / baseBpm

  subunitsData.forEach((sub, subIdx) => {
    for (const evt of sub.events) {
      const synth = evt.hand === 'right' ? _synthRH! : _synthLH!
      const freq = Tone.Frequency(evt.pitch, 'midi').toFrequency()
      const t = evt.time * scale
      const dur = evt.duration * scale
      const vel = Math.min(1, (evt.velocity / 127) * 0.7)

      Tone.Transport.schedule((time: number) => {
        synth.triggerAttackRelease(freq, dur, time, vel)

        Tone.Draw.schedule(() => {
          onSubunitResidue(subIdx, evt.residue_index)
        }, time)
      }, t)
    }
  })

  Tone.Transport.start()
}
