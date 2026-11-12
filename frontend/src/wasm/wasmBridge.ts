import initWasm, { WasmDockingEngine as RustWasmDockingEngine, parse_pdb, sonify } from './pkg/rust_core'
export { parse_pdb, sonify }
import wasmUrl from './pkg/rust_core_bg.wasm?url'
import type { NoteEvent } from '../types/protein'
import { applyAlgorithm, type SonifyAlgorithm } from '../components/Sonification/AlgorithmEngine'

export interface SubunitTransformData {
  position: [number, number, number]
  rotation: [number, number, number, number]
  euler_deg: [number, number, number]
  is_locked: boolean
  score: number
}

export interface DockingStateData {
  total_alignment: number
  is_solved: boolean
  transforms: SubunitTransformData[]
}

export interface DockingHintData {
  action: string
  axis: string
  direction: number
  angle_deg: number
  description: string
  potential_score: number
}

export interface IDockingEngine {
  configureSubunit(
    idx: number,
    ox: number,
    oy: number,
    oz: number,
    rx_deg: number,
    ry_deg: number,
    rz_deg: number,
  ): void
  applyAction(slotIdx: number, action: string): boolean
  getAlignmentScore(): number
  getSlotScore(slotIdx: number): number
  getState(): DockingStateData
  getHint(slotIdx: number): DockingHintData | null
  resetAll(): void
  resetSlot(slotIdx: number): void
}

let wasmInitialized = false
let wasmInitPromise: Promise<boolean> | null = null

export async function ensureWasmInitialized(): Promise<boolean> {
  if (wasmInitialized) return true
  if (wasmInitPromise) return wasmInitPromise

  wasmInitPromise = (async () => {
    try {
      await initWasm(wasmUrl)
      wasmInitialized = true
      return true
    } catch (err) {
      console.warn('WASM initialization skipped or failed, using robust fallback engine:', err)
      return false
    }
  })()

  return wasmInitPromise
}

function normalizeDeg(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  else if (d <= -180) d += 360
  return Math.abs(d) < 0.01 ? 0 : Math.round(d)
}

function shortestAngleDeg(deg: number): number {
  return Math.abs(normalizeDeg(deg))
}

function humanizeHint(h: DockingHintData): DockingHintData {
  let desc = h.description
  if (h.action === 'SlideLeft') desc = 'Move Left (← Left)'
  else if (h.action === 'SlideRight') desc = 'Move Right (Right →)'
  else if (h.action === 'SlideUp') desc = 'Move Up (↑ Up)'
  else if (h.action === 'SlideDown') desc = 'Move Down (↓ Down)'
  else if (h.action === 'SlideForward') desc = 'Pull Closer (⊕ Closer)'
  else if (h.action === 'SlideBack') desc = 'Push Further (⊖ Further)'
  else if (h.action.startsWith('RotateX') || (h.action.startsWith('Rotate') && h.axis === 'X')) {
    desc = h.direction < 0 ? 'Tilt Up (↺ Tilt Up)' : 'Tilt Down (↻ Tilt Down)'
  } else if (h.action.startsWith('RotateY') || (h.action.startsWith('Rotate') && h.axis === 'Y')) {
    desc = h.direction < 0 ? 'Turn Left (↺ Turn Left)' : 'Turn Right (↻ Turn Right)'
  } else if (h.action.startsWith('RotateZ') || (h.action.startsWith('Rotate') && h.axis === 'Z')) {
    desc = h.direction < 0 ? 'Spin Left (↶ Spin Left)' : 'Spin Right (↷ Spin Right)'
  }
  return { ...h, description: desc }
}

// ── Pure TypeScript Fallback Engine ──────────────────────────────────────────
class TsFallbackDockingEngine implements IDockingEngine {
  private count: number
  private offsets: [number, number, number][] = []
  private initialOffsets: [number, number, number][] = []
  private eulers: [number, number, number][] = []
  private initialEulers: [number, number, number][] = []
  private locked: boolean[] = []

  constructor(count: number) {
    this.count = count
    for (let i = 0; i < count; i++) {
      this.offsets.push([0, 0, 0])
      this.initialOffsets.push([0, 0, 0])
      this.eulers.push([0, 0, 0])
      this.initialEulers.push([0, 0, 0])
      this.locked.push(false)
    }
  }

  configureSubunit(
    idx: number,
    ox: number,
    oy: number,
    oz: number,
    rx_deg: number,
    ry_deg: number,
    rz_deg: number,
  ): void {
    if (idx >= this.count) return
    const off: [number, number, number] = [Math.round(ox), Math.round(oy), Math.round(oz)]
    const eul: [number, number, number] = [
      normalizeDeg(rx_deg),
      normalizeDeg(ry_deg),
      normalizeDeg(rz_deg),
    ]
    const dist = Math.sqrt(off[0] * off[0] + off[1] * off[1] + off[2] * off[2])
    const alreadySolved =
      dist < 0.05 &&
      shortestAngleDeg(eul[0]) < 0.5 &&
      shortestAngleDeg(eul[1]) < 0.5 &&
      shortestAngleDeg(eul[2]) < 0.5

    this.offsets[idx] = [...off]
    this.initialOffsets[idx] = [...off]
    this.eulers[idx] = [...eul]
    this.initialEulers[idx] = [...eul]
    this.locked[idx] = alreadySolved
  }

  applyAction(slotIdx: number, action: string): boolean {
    if (slotIdx >= this.count) return false

    if (action === 'Reset') {
      this.resetSlot(slotIdx)
      return true
    }

    if (action === 'SnapLock') {
      const score = this.getSlotScore(slotIdx)
      if (score < 0.85) return false
      this.offsets[slotIdx] = [0, 0, 0]
      this.eulers[slotIdx] = [0, 0, 0]
      this.locked[slotIdx] = true
      return true
    }

    if (this.locked[slotIdx]) return false
    const step = 3.0
    const rotStep = 45.0

    switch (action) {
      case 'SlideLeft': this.offsets[slotIdx][0] = Math.round(this.offsets[slotIdx][0] - step); break
      case 'SlideRight': this.offsets[slotIdx][0] = Math.round(this.offsets[slotIdx][0] + step); break
      case 'SlideDown': this.offsets[slotIdx][1] = Math.round(this.offsets[slotIdx][1] - step); break
      case 'SlideUp': this.offsets[slotIdx][1] = Math.round(this.offsets[slotIdx][1] + step); break
      case 'SlideBack': this.offsets[slotIdx][2] = Math.round(this.offsets[slotIdx][2] - step); break
      case 'SlideForward': this.offsets[slotIdx][2] = Math.round(this.offsets[slotIdx][2] + step); break

      case 'RotateXPos': this.eulers[slotIdx][0] = normalizeDeg(this.eulers[slotIdx][0] + rotStep); break
      case 'RotateXNeg': this.eulers[slotIdx][0] = normalizeDeg(this.eulers[slotIdx][0] - rotStep); break
      case 'RotateYPos': this.eulers[slotIdx][1] = normalizeDeg(this.eulers[slotIdx][1] + rotStep); break
      case 'RotateYNeg': this.eulers[slotIdx][1] = normalizeDeg(this.eulers[slotIdx][1] - rotStep); break
      case 'RotateZPos': this.eulers[slotIdx][2] = normalizeDeg(this.eulers[slotIdx][2] + rotStep); break
      case 'RotateZNeg': this.eulers[slotIdx][2] = normalizeDeg(this.eulers[slotIdx][2] - rotStep); break
      default:
        return false
    }

    if (this.getSlotScore(slotIdx) >= 0.999) {
      this.offsets[slotIdx] = [0, 0, 0]
      this.eulers[slotIdx] = [0, 0, 0]
    }
    return true
  }

  getSlotScore(slotIdx: number): number {
    if (slotIdx >= this.count) return 0
    if (this.locked[slotIdx]) return 1.0

    const [ox, oy, oz] = this.offsets[slotIdx]
    const dist = Math.sqrt(ox * ox + oy * oy + oz * oz)
    const [rx, ry, rz] = this.eulers[slotIdx]
    const totalAngleErr = shortestAngleDeg(rx) + shortestAngleDeg(ry) + shortestAngleDeg(rz)

    if (dist < 0.05 && totalAngleErr < 0.5) return 1.0

    const posScore = Math.exp(-dist / 12.0)
    const rotScore = Math.exp(-totalAngleErr / 150.0)
    const combined = 0.5 * posScore + 0.5 * rotScore
    return Math.max(0, Math.min(0.995, combined))
  }

  getAlignmentScore(): number {
    if (this.count === 0) return 1.0
    let sum = 0
    for (let i = 0; i < this.count; i++) {
      sum += this.getSlotScore(i)
    }
    return sum / this.count
  }

  getState(): DockingStateData {
    const transforms: SubunitTransformData[] = []
    let allSolved = true

    for (let i = 0; i < this.count; i++) {
      const score = this.getSlotScore(i)
      const isLocked = this.locked[i] || score >= 0.999
      if (!isLocked) allSolved = false
      transforms.push({
        position: [...this.offsets[i]],
        rotation: [0, 0, 0, 1],
        euler_deg: [...this.eulers[i]],
        is_locked: isLocked,
        score,
      })
    }

    return {
      total_alignment: allSolved ? 1.0 : this.getAlignmentScore(),
      is_solved: allSolved,
      transforms,
    }
  }

  getHint(slotIdx: number): DockingHintData | null {
    if (slotIdx >= this.count) return null
    const currentScore = this.getSlotScore(slotIdx)
    if (currentScore >= 0.999) {
      return {
        action: 'Lock',
        axis: 'None',
        direction: 0,
        angle_deg: 0,
        description: 'Subunit is 100% aligned!',
        potential_score: 1.0,
      }
    }

    const testActions = [
      { action: 'SlideLeft', axis: 'X', direction: -1, angle: 0, desc: 'Slide Left (-X)' },
      { action: 'SlideRight', axis: 'X', direction: 1, angle: 0, desc: 'Slide Right (+X)' },
      { action: 'SlideDown', axis: 'Y', direction: -1, angle: 0, desc: 'Slide Down (-Y)' },
      { action: 'SlideUp', axis: 'Y', direction: 1, angle: 0, desc: 'Slide Up (+Y)' },
      { action: 'SlideBack', axis: 'Z', direction: -1, angle: 0, desc: 'Slide Back (-Z)' },
      { action: 'SlideForward', axis: 'Z', direction: 1, angle: 0, desc: 'Slide Forward (+Z)' },
      { action: 'RotateXPos', axis: 'X', direction: 1, angle: 45, desc: 'Rotate +45° on X axis' },
      { action: 'RotateXNeg', axis: 'X', direction: -1, angle: -45, desc: 'Rotate -45° on X axis' },
      { action: 'RotateYPos', axis: 'Y', direction: 1, angle: 45, desc: 'Rotate +45° on Y axis' },
      { action: 'RotateYNeg', axis: 'Y', direction: -1, angle: -45, desc: 'Rotate -45° on Y axis' },
      { action: 'RotateZPos', axis: 'Z', direction: 1, angle: 45, desc: 'Rotate +45° on Z axis' },
      { action: 'RotateZNeg', axis: 'Z', direction: -1, angle: -45, desc: 'Rotate -45° on Z axis' },
    ]

    let bestAction = testActions[0]
    let bestScore = currentScore

    for (const item of testActions) {
      const clone = new TsFallbackDockingEngine(this.count)
      for (let i = 0; i < this.count; i++) {
        clone.configureSubunit(
          i,
          this.offsets[i][0],
          this.offsets[i][1],
          this.offsets[i][2],
          this.eulers[i][0],
          this.eulers[i][1],
          this.eulers[i][2],
        )
      }
      clone.applyAction(slotIdx, item.action)
      const sc = clone.getSlotScore(slotIdx)
      if (sc > bestScore) {
        bestScore = sc
        bestAction = item
      }
    }

    return humanizeHint({
      action: bestAction.action,
      axis: bestAction.axis,
      direction: bestAction.direction,
      angle_deg: bestAction.angle,
      description: bestAction.desc,
      potential_score: bestScore,
    })
  }

  resetAll(): void {
    for (let i = 0; i < this.count; i++) {
      this.resetSlot(i)
    }
  }

  resetSlot(slotIdx: number): void {
    if (slotIdx < this.count) {
      this.offsets[slotIdx] = [...this.initialOffsets[slotIdx]]
      this.eulers[slotIdx] = [...this.initialEulers[slotIdx]]
      const [ox, oy, oz] = this.offsets[slotIdx]
      const [rx, ry, rz] = this.eulers[slotIdx]
      const dist = Math.sqrt(ox * ox + oy * oy + oz * oz)
      this.locked[slotIdx] =
        dist < 0.05 &&
        shortestAngleDeg(rx) < 0.5 &&
        shortestAngleDeg(ry) < 0.5 &&
        shortestAngleDeg(rz) < 0.5
    }
  }
}

// ── Wasm Engine Wrapper ──────────────────────────────────────────────────────
class WasmDockingEngineWrapper implements IDockingEngine {
  private inner: RustWasmDockingEngine

  constructor(count: number) {
    this.inner = new RustWasmDockingEngine(count)
  }

  configureSubunit(
    idx: number,
    ox: number,
    oy: number,
    oz: number,
    rx_deg: number,
    ry_deg: number,
    rz_deg: number,
  ): void {
    this.inner.configure_subunit(idx, ox, oy, oz, rx_deg, ry_deg, rz_deg)
  }

  applyAction(slotIdx: number, action: string): boolean {
    return this.inner.apply_action(slotIdx, action)
  }

  getAlignmentScore(): number {
    return this.inner.get_alignment_score()
  }

  getSlotScore(slotIdx: number): number {
    return this.inner.get_slot_score(slotIdx)
  }

  getState(): DockingStateData {
    const raw = this.inner.get_state_json()
    try {
      return JSON.parse(raw) as DockingStateData
    } catch {
      return { total_alignment: 0, is_solved: false, transforms: [] }
    }
  }

  getHint(slotIdx: number): DockingHintData | null {
    const raw = this.inner.get_hint_json(slotIdx)
    try {
      const parsed = JSON.parse(raw) as DockingHintData
      return humanizeHint(parsed)
    } catch {
      return null
    }
  }

  resetAll(): void {
    this.inner.reset_all()
  }

  resetSlot(slotIdx: number): void {
    this.inner.reset_slot(slotIdx)
  }
}

// ── Public Factory ───────────────────────────────────────────────────────────
export async function createDockingEngine(count: number): Promise<IDockingEngine> {
  const isLoaded = await ensureWasmInitialized()
  if (isLoaded) {
    try {
      return new WasmDockingEngineWrapper(count)
    } catch (e) {
      console.warn('Failed to instantiate Rust WasmDockingEngine, using TsFallback:', e)
    }
  }
  return new TsFallbackDockingEngine(count)
}

export async function sonifyWithRustOrTs(seq: string, algorithm: SonifyAlgorithm): Promise<NoteEvent[]> {
  const isLoaded = await ensureWasmInitialized()
  if (isLoaded) {
    try {
      const json = sonify(seq, algorithm)
      const parsed = JSON.parse(json) as NoteEvent[]
      if (parsed && parsed.length > 0) {
        return parsed.map((evt) => ({
          ...evt,
          instrument: evt.instrument || 'acoustic_grand_piano',
          secondary_structure: evt.secondary_structure || ('EALMKQR'.includes(evt.amino_acid) ? 'H' : 'VIYFWTC'.includes(evt.amino_acid) ? 'E' : 'C'),
          chord_pitches: evt.chord_pitches || [],
        }))
      }
    } catch (e) {
      console.warn('Wasm sonify error, using TS algorithm engine fallback:', e)
    }
  }

  // TS fallback:
  const baseNotes: NoteEvent[] = seq.split('').map((aa, idx) => ({
    amino_acid: aa,
    pitch: 60,
    time: idx * 0.25,
    duration: 0.22,
    velocity: 85,
    instrument: 'acoustic_grand_piano',
    secondary_structure: 'EALMKQR'.includes(aa) ? 'H' : 'VIYFWTC'.includes(aa) ? 'E' : 'C',
    chord_pitches: [],
    hand: idx % 2 === 0 ? 'right' : 'left',
    residue_index: idx,
  }))
  return applyAlgorithm(baseNotes, algorithm)
}
