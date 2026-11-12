import * as Tone from 'tone'
import type { NoteEvent } from '../../types/protein'
import type { StylePreset, MusicalStyle } from './StyleEngine'
import { STYLE_PRESETS } from './StyleEngine'
import type { GameLevel } from '../../game/levels'
import type { SonifyAlgorithm } from './AlgorithmEngine'
import { createSubunitNotes } from '../../game/levels'

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

export function ensurePipeline(preset: StylePreset) {
  const key = styleKey(preset)
  if (key === _styleKey && _synthRH && _synthLH && _dockingFilter) return
  disposeSynths()
  _styleKey = key

  // Dynamic low-pass filter controlled by alignment score
  _dockingFilter = new Tone.Filter({
    frequency: 10000,
    type: 'lowpass',
    rolloff: -24,
    Q: 1.0,
  })

  const output: Tone.InputNode = (() => {
    if (preset.reverbWet > 0) {
      _reverb = new Tone.Freeverb({ roomSize: 0.75, dampening: 3500 }).toDestination()
      _reverb.wet.value = Math.min(0.4, preset.reverbWet)
      return _reverb
    }
    return Tone.getDestination()
  })()

  _dockingFilter.connect(output)

  if (_mediaStreamDest) {
    try { Tone.getDestination().connect(_mediaStreamDest) } catch { /* ignore */ }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osc = (type: OscillatorType): any => ({ type })

  // Clean, crisp envelope so notes don't bleed into a muddy blur
  const cleanEnv = {
    attack: Math.max(0.01, preset.envelope.attack),
    decay: Math.min(0.18, preset.envelope.decay),
    sustain: Math.min(0.35, preset.envelope.sustain),
    release: Math.min(0.32, preset.envelope.release),
  }

  _synthRH = new Tone.Synth({
    oscillator: osc(preset.oscillatorType),
    envelope: cleanEnv,
  }).connect(_dockingFilter)

  const lhType: OscillatorType =
    preset.oscillatorType === 'sawtooth'
      ? 'triangle'
      : preset.oscillatorType === 'square'
      ? 'triangle'
      : preset.oscillatorType

  _synthLH = new Tone.Synth({
    oscillator: osc(lhType),
    envelope: cleanEnv,
  }).connect(_dockingFilter)
}

export function setAlignmentAudioFeedback(alignment: number): void {
  if (!_dockingFilter) return
  const clamped = Math.max(0, Math.min(1, alignment))

  const cutoff = 360 + Math.pow(clamped, 2.5) * 15640
  const now = Tone.now()

  _dockingFilter.frequency.cancelScheduledValues(now)
  _dockingFilter.frequency.rampTo(cutoff, 0.1, now)

  const detuneCents = (1.0 - clamped) * 60.0
  if (_synthRH) {
    _synthRH.detune.cancelScheduledValues(now)
    _synthRH.detune.rampTo(detuneCents, 0.1, now)
  }
  if (_synthLH) {
    _synthLH.detune.cancelScheduledValues(now)
    _synthLH.detune.rampTo(-detuneCents * 0.8, 0.1, now)
  }
}

export async function playLockCelebration(): Promise<void> {
  await Tone.start()
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.04, decay: 0.22, sustain: 0.3, release: 0.8 },
  }).toDestination()

  if (_mediaStreamDest) {
    try { synth.connect(_mediaStreamDest) } catch { /* ignore */ }
  }

  const chord = ['C5', 'E5', 'G5', 'C6']
  const now = Tone.now()
  synth.triggerAttackRelease(chord, 0.75, now, 0.4)
  setTimeout(() => {
    try { synth.dispose() } catch (_) { /* ignore */ }
  }, 1800)
}

export async function startAudioContext(): Promise<void> {
  await Tone.start()
}

export function stopPlayback(): void {
  try {
    _synthRH?.triggerRelease()
    _synthLH?.triggerRelease()
  } catch (_) {
    /* ignore */
  }
  Tone.Transport.stop()
  Tone.Transport.cancel()
}

export function setMasterMuted(muted: boolean): boolean {
  try {
    const prev = Tone.getDestination().mute
    Tone.getDestination().mute = muted
    return prev
  } catch {
    return false
  }
}

/**
 * Solo melody for a single subunit
 */
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

  const scale = 120 / Math.max(80, Math.min(130, baseBpm))
  const { velocityScale, durationScale, swingAmount, pitchShift } = preset
  const handCount: Record<string, number> = {}

  for (const evt of events) {
    const noteIdx = (handCount[evt.hand] = (handCount[evt.hand] ?? 0) + 1)
    const isOff = noteIdx % 2 === 0
    const swing = isOff ? swingAmount : 0

    const synth = evt.hand === 'right' ? _synthRH! : _synthLH!
    const rawPitch = Math.max(28, Math.min(100, evt.pitch + pitchShift))
    const freq = Tone.Frequency(rawPitch, 'midi').toFrequency()

    const t = evt.time * scale + swing
    const dur = Math.min(0.24, evt.duration * scale * durationScale)
    const vel = Math.min(1, (evt.velocity / 127) * velocityScale)

    Tone.Transport.schedule((time: number) => {
      synth.triggerAttackRelease(freq, dur, time, vel)

      Tone.Draw.schedule(() => {
        onResidue(evt.residue_index, evt.hand ?? 'right')
      }, time)
    }, t)
  }

  Tone.Transport.start()
}

/**
 * Sequential 3D Protein Traversal Symphony:
 * Plays at the same clean, relaxed tempo as the easy levels (~110-120 BPM, ~0.26s per note).
 * Never uses excessive BPM. For larger proteins, samples landmark residues evenly
 * so the symphony is always clean, articulate, and ~10-14 seconds long.
 */
export async function scheduleProteinTraversal(
  level: GameLevel,
  onNoteStep: (step: TraversalNoteStep) => void,
  onComplete?: () => void,
  algo?: SonifyAlgorithm,
  styleName: MusicalStyle = 'Classical',
): Promise<number> {
  await Tone.start()
  stopPlayback()

  const activeAlgo = algo || level.algorithm || 'Fantaisie-Impromptu'
  const preset = STYLE_PRESETS[styleName] || STYLE_PRESETS['Classical'] || STYLE_PRESETS['Default']
  ensurePipeline(preset)
  setAlignmentAudioFeedback(1.0)

  // Clean note interval: exactly 0.28 seconds (~107 BPM) so each note is distinct and beautiful
  const stepDurationSec = 0.28

  // Sample landmark residues so even 200-residue complexes play a clean, uncluttered 36-40 note song
  const allSubunitsData = level.subunits.map((sub, sIdx) => {
    // Generate notes using the active algorithm
    const notes = createSubunitNotes(sub.sequence, activeAlgo, sIdx * 50)
    const blocks = sub.blocks
    const count = blocks.length

    // Max 10-12 landmark notes per subunit
    const maxNotesThisSub = Math.min(count, Math.max(8, Math.floor(40 / level.subunits.length)))
    const stepSize = Math.max(1, Math.floor(count / maxNotesThisSub))

    const subunitSteps: {
      subunitIdx: number
      residueIndex: number
      localIndex: number
      totalSubunitResidues: number
      aminoAcid: string
      pitch: number
      chainName: string
    }[] = []

    for (let i = 0; i < count; i += stepSize) {
      if (subunitSteps.length >= maxNotesThisSub) break
      const b = blocks[i]
      const noteEvt = notes[i % Math.max(1, notes.length)]
      subunitSteps.push({
        subunitIdx: sIdx,
        residueIndex: b.residue_index,
        localIndex: i,
        totalSubunitResidues: count,
        aminoAcid: b.amino_acid,
        pitch: noteEvt?.pitch ?? 64,
        chainName: sub.name,
      })
    }

    return subunitSteps
  })

  const flatSteps = allSubunitsData.flat()
  const totalSteps = flatSteps.length
  const startOffset = 0.15

  flatSteps.forEach((st, globalIdx) => {
    const t = startOffset + globalIdx * stepDurationSec
    const rawPitch = Math.max(36, Math.min(92, st.pitch + (preset.pitchShift || 0)))
    const freq = Tone.Frequency(rawPitch, 'midi').toFrequency()
    const noteName = Tone.Frequency(rawPitch, 'midi').toNote()
    const vel = Math.min(0.85, 0.7 * preset.velocityScale)

    // Gentle harmonic chord every 4th note
    const playChord = globalIdx % 4 === 0
    const chordPitch = Math.max(36, rawPitch - 12)
    const chordFreq = Tone.Frequency(chordPitch, 'midi').toFrequency()

    Tone.Transport.schedule((time: number) => {
      _synthRH?.triggerAttackRelease(freq, stepDurationSec * 0.7, time, vel)
      if (playChord) {
        _synthLH?.triggerAttackRelease(chordFreq, stepDurationSec * 0.9, time, vel * 0.45)
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

  const totalDurationSec = startOffset + totalSteps * stepDurationSec + 0.5

  Tone.Transport.schedule((time: number) => {
    Tone.Draw.schedule(() => {
      onComplete?.()
    }, time)
  }, totalDurationSec)

  Tone.Transport.start()
  return totalDurationSec
}
