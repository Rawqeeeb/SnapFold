import type { SonifyAlgorithm } from '../components/Sonification/AlgorithmEngine'
import type { NoteEvent, FeatureVectors } from '../types/protein'
import { applyAlgorithm } from '../components/Sonification/AlgorithmEngine'

export interface BlockPoint {
  position: [number, number, number] // relative to subunit centroid
  size: [number, number, number]
  residue_index: number
  amino_acid: string
  secondary_structure: 'H' | 'E' | 'C'
  b_factor: number
}

export interface SubunitDefinition {
  id: number
  chainId: string
  name: string
  color: string
  sequence: string
  initialOffset: [number, number, number] // Must be multiples of 3.0
  initialEulerDeg: [number, number, number] // Must be multiples of 45
  targetCentroid: [number, number, number]
  blocks: BlockPoint[]
  notes: NoteEvent[]
}

export interface GameLevel {
  id: number
  levelNumber: number
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Master' | 'Custom'
  title: string
  moleculeName: string
  uniprotId: string
  pdbCode: string
  wikipediaUrl: string
  algorithm: SonifyAlgorithm
  musicalKey: string
  description: string
  clue: string
  subunits: SubunitDefinition[]
}

function inferSS(aa: string, idx: number, mode: 'helix' | 'sheet' | 'mixed'): 'H' | 'E' | 'C' {
  if (mode === 'helix') {
    return idx < 2 || idx > 18 ? 'C' : 'H'
  }
  if (mode === 'sheet') {
    return idx % 9 < 6 ? 'E' : 'C'
  }
  const u = aa.toUpperCase()
  if ('EALMKQRH'.includes(u)) return 'H'
  if ('VIYFWTC'.includes(u)) return 'E'
  return 'C'
}

// ── Synthetic Coordinate Generators for Smooth 3D Protein Ribbons ────────────
function generateHelixRibbonChain(
  sequence: string,
  startIdx: number,
  radius: number,
  pitch: number,
  curvePhase: number = 0,
  ssMode: 'helix' | 'mixed' = 'helix',
): { blocks: BlockPoint[]; centroid: [number, number, number] } {
  const blocks: BlockPoint[] = []
  let sumX = 0, sumY = 0, sumZ = 0
  const rawCoords: [number, number, number][] = []

  for (let i = 0; i < sequence.length; i++) {
    const t = i * 0.55 + curvePhase
    // Add natural tertiary folding wave along the helix axis
    const foldWave = Math.sin(i * 0.18 + curvePhase) * 2.2
    const x = radius * Math.cos(t) + foldWave
    const y = radius * Math.sin(t) + Math.cos(i * 0.14) * 1.5
    const z = (i - sequence.length / 2) * (pitch / 3.6)

    rawCoords.push([x, y, z])
    sumX += x
    sumY += y
    sumZ += z
  }

  const cx = sumX / sequence.length
  const cy = sumY / sequence.length
  const cz = sumZ / sequence.length

  for (let i = 0; i < sequence.length; i++) {
    const [x, y, z] = rawCoords[i]
    blocks.push({
      position: [
        Number((x - cx).toFixed(2)),
        Number((y - cy).toFixed(2)),
        Number((z - cz).toFixed(2)),
      ],
      size: [1.6, 1.6, 1.6],
      residue_index: startIdx + i,
      amino_acid: sequence[i],
      secondary_structure: inferSS(sequence[i], i, ssMode),
      b_factor: 45 + Math.sin(i * 0.4) * 18,
    })
  }

  return { blocks, centroid: [Number(cx.toFixed(2)), Number(cy.toFixed(2)), Number(cz.toFixed(2))] }
}

function generateBetaBarrelSection(
  sequence: string,
  startIdx: number,
  barrelRadius: number,
  angularStart: number,
  angularSpan: number,
): { blocks: BlockPoint[]; centroid: [number, number, number] } {
  const blocks: BlockPoint[] = []
  let sumX = 0, sumY = 0, sumZ = 0
  const rawCoords: [number, number, number][] = []

  for (let i = 0; i < sequence.length; i++) {
    const strandIdx = Math.floor(i / 9)
    const posInStrand = i % 9
    const frac = strandIdx / Math.max(1, Math.ceil(sequence.length / 9))
    const angle = angularStart + frac * angularSpan + Math.sin(posInStrand * 0.4) * 0.12
    const r = barrelRadius + Math.sin(posInStrand * 0.7) * 0.9
    const x = r * Math.cos(angle)
    const y = r * Math.sin(angle)
    const dir = strandIdx % 2 === 0 ? 1 : -1
    const z = (posInStrand - 4) * 1.9 * dir

    rawCoords.push([x, y, z])
    sumX += x
    sumY += y
    sumZ += z
  }

  const cx = sumX / sequence.length
  const cy = sumY / sequence.length
  const cz = sumZ / sequence.length

  for (let i = 0; i < sequence.length; i++) {
    const [x, y, z] = rawCoords[i]
    blocks.push({
      position: [
        Number((x - cx).toFixed(2)),
        Number((y - cy).toFixed(2)),
        Number((z - cz).toFixed(2)),
      ],
      size: [1.6, 1.6, 1.6],
      residue_index: startIdx + i,
      amino_acid: sequence[i],
      secondary_structure: inferSS(sequence[i], i, 'sheet'),
      b_factor: 50,
    })
  }

  return { blocks, centroid: [Number(cx.toFixed(2)), Number(cy.toFixed(2)), Number(cz.toFixed(2))] }
}

export function createSubunitNotes(seq: string, algo: SonifyAlgorithm, startIdx = 0): NoteEvent[] {
  const events: NoteEvent[] = []
  for (let i = 0; i < seq.length; i++) {
    const aa = seq[i].toUpperCase()
    events.push({
      amino_acid: aa,
      pitch: 60 + ((i * 3) % 18),
      time: i * 0.22,
      duration: 0.2,
      velocity: 85,
      instrument: 'acoustic_grand_piano',
      secondary_structure: inferSS(aa, i, 'mixed'),
      chord_pitches: [],
      hand: i % 2 === 0 ? 'right' : 'left',
      residue_index: startIdx + i,
    })
  }
  return applyAlgorithm(events, algo)
}

/**
 * Generates a full PDB string and FeatureVectors from any GameLevel so all
 * SonoFold features (3Dmol viewer, Heatmap, PDB/MIDI/WAV export) work seamlessly.
 */
export function buildLevelSonoFoldData(level: GameLevel): {
  pdb: string
  sequence: string
  events: NoteEvent[]
  featureVectors: FeatureVectors
} {
  const AA3: Record<string, string> = {
    A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS',
    E: 'GLU', Q: 'GLN', G: 'GLY', H: 'HIS', I: 'ILE',
    L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO',
    S: 'SER', T: 'THR', W: 'TRP', Y: 'TYR', V: 'VAL',
  }

  const lines: string[] = [`HEADER    ${level.pdbCode} ${level.title.toUpperCase()}`]
  let atomSerial = 1
  let resSeq = 1
  const allSS: string[] = []
  const allSasa: number[] = []
  const allFlex: number[] = []
  const allSeq: string[] = []
  const combinedEvents: NoteEvent[] = []
  let timeOffset = 0

  level.subunits.forEach((sub, sIdx) => {
    const chainChar = sub.chainId[0] || String.fromCharCode(65 + sIdx)
    sub.blocks.forEach((b, bIdx) => {
      const aa1 = (b.amino_acid || 'A').toUpperCase()
      const aa3 = AA3[aa1] || 'ALA'
      const wx = (sub.targetCentroid[0] + b.position[0]).toFixed(3)
      const wy = (sub.targetCentroid[1] + b.position[1]).toFixed(3)
      const wz = (sub.targetCentroid[2] + b.position[2]).toFixed(3)

      const serialStr = String(atomSerial).padStart(5, ' ')
      const resSeqStr = String(resSeq).padStart(4, ' ')
      const xStr = String(wx).padStart(8, ' ')
      const yStr = String(wy).padStart(8, ' ')
      const zStr = String(wz).padStart(8, ' ')

      lines.push(
        `ATOM  ${serialStr}  CA  ${aa3} ${chainChar}${resSeqStr}    ${xStr}${yStr}${zStr}  1.00 ${b.b_factor.toFixed(2).padStart(5, ' ')}           C`,
      )
      atomSerial++
      resSeq++
      allSeq.push(aa1)
      allSS.push(b.secondary_structure)
      allSasa.push(42 + Math.sin(bIdx * 0.3) * 20)
      allFlex.push(0.5 + Math.cos(bIdx * 0.25) * 0.3)
    })

    sub.notes.forEach((n) => {
      combinedEvents.push({
        ...n,
        time: Number((n.time + timeOffset * 0.15).toFixed(3)),
      })
    })
    timeOffset += 2
  })

  lines.push('END')
  combinedEvents.sort((a, b) => a.time - b.time)

  return {
    pdb: lines.join('\n'),
    sequence: allSeq.join(''),
    events: combinedEvents,
    featureVectors: {
      secondary_structure: allSS,
      sasa: allSasa,
      flexibility: allFlex,
    },
  }
}

// ── Pre-Computed Geometries for Levels 1–10 ──────────────────────────────────

// Level 1 (Easy): Human Insulin (2 subunits, 2 simple translation steps)
const insA = generateHelixRibbonChain('GIVEQCCTSICSLYQLENYCN', 0, 3.8, 3.2, 0, 'helix')
const insB = generateHelixRibbonChain('FVNQHLCGSHLVEALYLVCGERGFFYTPKT', 21, 4.4, 3.4, Math.PI, 'helix')

// Level 2 (Easy): Trp-Cage Miniprotein (2 subunits, 2 slides + 1 rotation)
const trpA = generateHelixRibbonChain('NLYIQWLKDGGPSSGRPPPS', 0, 3.5, 3.0, 0.2, 'helix')
const trpB = generateHelixRibbonChain('DAYAQWLKDGGPSSGRPPPS', 20, 3.5, 3.0, 2.8, 'mixed')

// Level 3 (Easy): HIV-1 Protease Homodimer (2 subunits, simple C2 rotation)
const hivSeq = 'PQITLWQRPLVTIKIGGQLKEALLDTGADDTVLEEMNLPGRWKPKMIG'
const hivA = generateBetaBarrelSection(hivSeq, 0, 6.2, 0, Math.PI)
const hivB = generateBetaBarrelSection(hivSeq, 48, 6.2, Math.PI, Math.PI)

// Level 4 (Easy): Villin Headpiece (2 subunits, 3-helix bundle)
const vilA = generateHelixRibbonChain('LSDEDFKAVFGMTRSAFANLPLWKQQNLKKEKGLF', 0, 4.2, 3.3, 0, 'helix')
const vilB = generateHelixRibbonChain('MTRSAFANLPLWKQQNLKKEKGLFLSDEDFKAVFG', 35, 4.2, 3.3, Math.PI * 0.8, 'helix')

// Level 5 (Easy): Ubiquitin Dimer (2 subunits, beta-grasp fold)
const ubqA = generateHelixRibbonChain('MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG', 0, 5.2, 2.8, 0, 'mixed')
const ubqB = generateHelixRibbonChain('MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG', 76, 5.2, 2.8, Math.PI, 'mixed')

// Level 6 (Medium): GFP Barrel Assembly (3 subunits)
const gfp1 = generateBetaBarrelSection('MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGD', 0, 8.2, 0, (2 * Math.PI) / 3)
const gfp2 = generateBetaBarrelSection('TYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSR', 36, 8.2, (2 * Math.PI) / 3, (2 * Math.PI) / 3)
const gfp3 = generateBetaBarrelSection('YPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTR', 72, 8.2, (4 * Math.PI) / 3, (2 * Math.PI) / 3)

// Level 7 (Medium): Collagen Triple Helix (3 intertwined chains)
const colSeq = 'GPPGPPGPPGPPGPPGPPGPPGPPGPPGPP'
const colA = generateHelixRibbonChain(colSeq, 0, 3.2, 4.5, 0, 'helix')
const colB = generateHelixRibbonChain(colSeq, 30, 3.2, 4.5, (2 * Math.PI) / 3, 'helix')
const colC = generateHelixRibbonChain(colSeq, 60, 3.2, 4.5, (4 * Math.PI) / 3, 'helix')

// Level 8 (Hard): p53 Tumor Suppressor Tetramer (4 subunits)
const p53Seq = 'KPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEP'
const p53A = generateHelixRibbonChain(p53Seq, 0, 4.8, 3.1, 0, 'helix')
const p53B = generateHelixRibbonChain(p53Seq, 39, 4.8, 3.1, Math.PI / 2, 'helix')
const p53C = generateHelixRibbonChain(p53Seq, 78, 4.8, 3.1, Math.PI, 'helix')
const p53D = generateHelixRibbonChain(p53Seq, 117, 4.8, 3.1, (3 * Math.PI) / 2, 'helix')

// Level 9 (Hard): Human Hemoglobin (4 subunits: α1, β1, α2, β2)
const hbAlpha = 'VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTK'
const hbBeta = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQR'
const hbA1 = generateHelixRibbonChain(hbAlpha, 0, 5.5, 3.0, 0, 'helix')
const hbB1 = generateHelixRibbonChain(hbBeta, 40, 5.8, 3.1, Math.PI / 2, 'helix')
const hbA2 = generateHelixRibbonChain(hbAlpha, 80, 5.5, 3.0, Math.PI, 'helix')
const hbB2 = generateHelixRibbonChain(hbBeta, 120, 5.8, 3.1, (3 * Math.PI) / 2, 'helix')

// Level 10 (Master): Potassium Ion Channel KcsA (4 radial subunits around Z-axis)
const kcsaSeq = 'MPPMLSGLLARLVKLLLGRHGSALHWRAAGAATVLL'
const kcsaA = generateHelixRibbonChain(kcsaSeq, 0, 5.4, 2.7, 0, 'helix')
const kcsaB = generateHelixRibbonChain(kcsaSeq, 36, 5.4, 2.7, Math.PI / 2, 'helix')
const kcsaC = generateHelixRibbonChain(kcsaSeq, 72, 5.4, 2.7, Math.PI, 'helix')
const kcsaD = generateHelixRibbonChain(kcsaSeq, 108, 5.4, 2.7, (3 * Math.PI) / 2, 'helix')

export const CAMPAIGN_LEVELS: GameLevel[] = [
  // ── EASY TIER (LEVELS 1–5) ────────────────────────────────────────────────
  {
    id: 1,
    levelNumber: 1,
    difficulty: 'Easy',
    title: 'Human Insulin',
    moleculeName: 'Insulin Heterodimer (A & B Chains)',
    uniprotId: 'P01308',
    pdbCode: '4INS',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Insulin',
    algorithm: 'Algo-II',
    musicalKey: 'C Major',
    description:
      'Human insulin regulates glucose metabolism through two peptide ribbons (Chain A & Chain B) linked by disulfide bridges.',
    clue: 'Warmup Puzzle: Move Chain B two steps Left (← Left) to dock against Chain A!',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'Chain A (Anchor)',
        color: '#00F5D4',
        sequence: 'GIVEQCCTSICSLYQLENYCN',
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-4.5, 0, 0],
        blocks: insA.blocks,
        notes: createSubunitNotes('GIVEQCCTSICSLYQLENYCN', 'Algo-II', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'Chain B (Movable)',
        color: '#FF5500',
        sequence: 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT',
        initialOffset: [6, 0, 0], // Exact 2 steps of 3.0!
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [4.5, 0, 0],
        blocks: insB.blocks,
        notes: createSubunitNotes('FVNQHLCGSHLVEALYLVCGERGFFYTPKT', 'Algo-II', 21),
      },
    ],
  },
  {
    id: 2,
    levelNumber: 2,
    difficulty: 'Easy',
    title: 'Trp-Cage Miniprotein',
    moleculeName: 'Fast-Folding Tryptophan Cage Motif',
    uniprotId: 'P0C2T9',
    pdbCode: '1L2Y',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Trp-cage',
    algorithm: 'Algo-I',
    musicalKey: 'G Major',
    description:
      'Trp-Cage is a 20-residue miniprotein construct famous for folding in 4 microseconds around a central hydrophobic tryptophan core.',
    clue: 'Spin Left (↶) once and Move Left (←) twice to enclose the tryptophan core.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'N-Terminal α-Helix',
        color: '#00F5D4',
        sequence: 'NLYIQWLKDGGPSSGRPPPS',
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-4, 0, 0],
        blocks: trpA.blocks,
        notes: createSubunitNotes('NLYIQWLKDGGPSSGRPPPS', 'Algo-I', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'Polyproline Tail',
        color: '#FF5500',
        sequence: 'DAYAQWLKDGGPSSGRPPPS',
        initialOffset: [6, 0, 0], // 2 steps X
        initialEulerDeg: [0, 0, 45], // 1 step Z rotation
        targetCentroid: [4, 0, 0],
        blocks: trpB.blocks,
        notes: createSubunitNotes('DAYAQWLKDGGPSSGRPPPS', 'Algo-I', 20),
      },
    ],
  },
  {
    id: 3,
    levelNumber: 3,
    difficulty: 'Easy',
    title: 'HIV-1 Protease',
    moleculeName: 'C2 Homodimeric Aspartyl Protease',
    uniprotId: 'P03366',
    pdbCode: '1HHP',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/HIV-1_protease',
    algorithm: 'Algo-III',
    musicalKey: 'D Minor',
    description:
      'HIV-1 Protease is a symmetric homodimer whose two identical β-ribbon subunits form a central catalytic tunnel.',
    clue: 'Turn Left (↺) once, then Move Left (←) and Move Down (↓) into the catalytic pocket.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'Monomer A',
        color: '#00F5D4',
        sequence: hivSeq,
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-5.5, 0, 0],
        blocks: hivA.blocks,
        notes: createSubunitNotes(hivSeq, 'Algo-III', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'Monomer B',
        color: '#FF5500',
        sequence: hivSeq,
        initialOffset: [3, 3, 0], // 1 step X, 1 step Y
        initialEulerDeg: [0, 45, 0], // 1 step Y rotation
        targetCentroid: [5.5, 0, 0],
        blocks: hivB.blocks,
        notes: createSubunitNotes(hivSeq, 'Algo-III', 48),
      },
    ],
  },
  {
    id: 4,
    levelNumber: 4,
    difficulty: 'Easy',
    title: 'Villin Headpiece',
    moleculeName: 'Actin-Binding Three-Helix Bundle',
    uniprotId: 'P02640',
    pdbCode: '1YRF',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Villin',
    algorithm: 'Algo-IV',
    musicalKey: 'E Minor',
    description:
      'The Villin Headpiece subdomain is an ultra-fast folding three-helix bundle that stabilizes actin cytoskeleton filaments.',
    clue: 'Tilt Up (↺) once, then Move Left (←) twice and Move Up (↑) to pack the helical bundle.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'Helix Bundle Core',
        color: '#00F5D4',
        sequence: 'LSDEDFKAVFGMTRSAFANLPLWKQQNLKKEKGLF',
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-5, 0, 0],
        blocks: vilA.blocks,
        notes: createSubunitNotes('LSDEDFKAVFGMTRSAFANLPLWKQQNLKKEKGLF', 'Algo-IV', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'C-Terminal Cap Helix',
        color: '#FF5500',
        sequence: 'MTRSAFANLPLWKQQNLKKEKGLFLSDEDFKAVFG',
        initialOffset: [6, -3, 0], // 2 steps X, 1 step Y
        initialEulerDeg: [45, 0, 0], // 1 step X rotation
        targetCentroid: [5, 0, 0],
        blocks: vilB.blocks,
        notes: createSubunitNotes('MTRSAFANLPLWKQQNLKKEKGLFLSDEDFKAVFG', 'Algo-IV', 35),
      },
    ],
  },
  {
    id: 5,
    levelNumber: 5,
    difficulty: 'Easy',
    title: 'Ubiquitin Dimer',
    moleculeName: 'Regulatory β-Grasp Fold Complex',
    uniprotId: 'P0CG48',
    pdbCode: '1UBQ',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Ubiquitin',
    algorithm: 'Fantaisie-Impromptu',
    musicalKey: 'F Major',
    description:
      'Ubiquitin dimers tag cellular proteins for proteasomal degradation or DNA repair. Clearing Level 5 unlocks Custom Protein Folding!',
    clue: 'Turn Right (↻) once, then Move Right (→) twice and Move Down (↓) to complete the dimer.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'Proximal Ubiquitin',
        color: '#00F5D4',
        sequence: 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPD',
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-5.5, 0, 0],
        blocks: ubqA.blocks.slice(0, 39),
        notes: createSubunitNotes('MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPD', 'Fantaisie-Impromptu', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'Distal Ubiquitin',
        color: '#FF5500',
        sequence: 'QQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG',
        initialOffset: [-6, 3, 0], // 2 steps X, 1 step Y
        initialEulerDeg: [0, -45, 0], // 1 step Y rotation
        targetCentroid: [5.5, 0, 0],
        blocks: ubqB.blocks.slice(0, 37),
        notes: createSubunitNotes('QQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG', 'Fantaisie-Impromptu', 39),
      },
    ],
  },

  // ── MASTER TIER (LEVELS 6–10) ─────────────────────────────────────────────
  {
    id: 6,
    levelNumber: 6,
    difficulty: 'Medium',
    title: 'GFP β-Barrel',
    moleculeName: 'Green Fluorescent Protein 11-Stranded Cage',
    uniprotId: 'P42212',
    pdbCode: '1GFL',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Green_fluorescent_protein',
    algorithm: 'Algo-I',
    musicalKey: 'E Major',
    description:
      'The 11-stranded β-barrel of GFP forms a protective cylindrical ribbon cage around the central bioluminescent chromophore.',
    clue: 'Dock Sector 2 and Sector 3 radially around Sector 1 to seal the β-barrel cylinder.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'β-Sector 1 (Anchor)',
        color: '#00F5D4',
        sequence: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGD',
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-5.5, 4, 0],
        blocks: gfp1.blocks,
        notes: createSubunitNotes('MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGD', 'Algo-I', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'β-Sector 2 (Core)',
        color: '#FF5500',
        sequence: 'TYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSR',
        initialOffset: [6, -3, 0],
        initialEulerDeg: [0, 0, 45],
        targetCentroid: [5.5, 4, 0],
        blocks: gfp2.blocks,
        notes: createSubunitNotes('TYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSR', 'Algo-I', 36),
      },
      {
        id: 2,
        chainId: 'C',
        name: 'β-Sector 3 (Base)',
        color: '#A855F7',
        sequence: 'YPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTR',
        initialOffset: [-6, -6, 0],
        initialEulerDeg: [45, 0, 0],
        targetCentroid: [0, -6, 0],
        blocks: gfp3.blocks,
        notes: createSubunitNotes('YPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTR', 'Algo-I', 72),
      },
    ],
  },
  {
    id: 7,
    levelNumber: 7,
    difficulty: 'Medium',
    title: 'Collagen Triple Helix',
    moleculeName: 'Tropocollagen Right-Handed Superhelix',
    uniprotId: 'P02452',
    pdbCode: '1CAG',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Collagen',
    algorithm: 'Algo-II',
    musicalKey: 'A Minor',
    description:
      'Collagen owes its tensile strength to three left-handed polyproline-II helical ribbons braided into a right-handed superhelix.',
    clue: 'Braid Strand B and Strand C tightly alongside Strand A with Z-axis and Y-axis alignment.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'α1(I) Strand A',
        color: '#00F5D4',
        sequence: colSeq,
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-3.5, 2, 0],
        blocks: colA.blocks,
        notes: createSubunitNotes(colSeq, 'Algo-II', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'α1(I) Strand B',
        color: '#FF5500',
        sequence: colSeq,
        initialOffset: [6, 3, -3],
        initialEulerDeg: [0, 45, 45],
        targetCentroid: [3.5, 2, 0],
        blocks: colB.blocks,
        notes: createSubunitNotes(colSeq, 'Algo-II', 30),
      },
      {
        id: 2,
        chainId: 'C',
        name: 'α2(I) Strand C',
        color: '#A855F7',
        sequence: colSeq,
        initialOffset: [-3, -6, 3],
        initialEulerDeg: [45, 0, -45],
        targetCentroid: [0, -3.5, 0],
        blocks: colC.blocks,
        notes: createSubunitNotes(colSeq, 'Algo-II', 60),
      },
    ],
  },
  {
    id: 8,
    levelNumber: 8,
    difficulty: 'Hard',
    title: 'p53 Tetramer Complex',
    moleculeName: 'Guardian of the Genome Tetramerization Domain',
    uniprotId: 'P04637',
    pdbCode: '1C26',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/P53',
    algorithm: 'Algo-V',
    musicalKey: 'C Minor',
    description:
      'Tumor suppressor p53 binds DNA as a dimer-of-dimers tetramer. Mutations in this quaternary interface abolish anti-cancer activity.',
    clue: 'Assemble all four p53 monomers into a symmetric X-shaped bundle.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'p53 Monomer A',
        color: '#00F5D4',
        sequence: p53Seq,
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-5, 5, 0],
        blocks: p53A.blocks,
        notes: createSubunitNotes(p53Seq, 'Algo-V', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'p53 Monomer B',
        color: '#FF5500',
        sequence: p53Seq,
        initialOffset: [6, 3, 0],
        initialEulerDeg: [0, 45, 0],
        targetCentroid: [5, 5, 0],
        blocks: p53B.blocks,
        notes: createSubunitNotes(p53Seq, 'Algo-V', 39),
      },
      {
        id: 2,
        chainId: 'C',
        name: 'p53 Monomer C',
        color: '#3B82F6',
        sequence: p53Seq,
        initialOffset: [-6, -3, 3],
        initialEulerDeg: [45, 0, 0],
        targetCentroid: [-5, -5, 0],
        blocks: p53C.blocks,
        notes: createSubunitNotes(p53Seq, 'Algo-V', 78),
      },
      {
        id: 3,
        chainId: 'D',
        name: 'p53 Monomer D',
        color: '#F59E0B',
        sequence: p53Seq,
        initialOffset: [6, -6, -3],
        initialEulerDeg: [0, 0, -45],
        targetCentroid: [5, -5, 0],
        blocks: p53D.blocks,
        notes: createSubunitNotes(p53Seq, 'Algo-V', 117),
      },
    ],
  },
  {
    id: 9,
    levelNumber: 9,
    difficulty: 'Hard',
    title: 'Human Hemoglobin',
    moleculeName: 'Oxygen-Transport Heterotetramer (α1, β1, α2, β2)',
    uniprotId: 'P69905',
    pdbCode: '1A3N',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Hemoglobin',
    algorithm: 'Fantaisie-Impromptu',
    musicalKey: 'F Major',
    description:
      'Hemoglobin transports oxygen cooperatively across four globin ribbon subunits (two α chains and two β chains).',
    clue: 'Dock β1, α2, and β2 with α1 to complete the tetrahedral respiratory complex.',
    subunits: [
      {
        id: 0,
        chainId: 'α1',
        name: 'Subunit α1 (Anchor)',
        color: '#00F5D4',
        sequence: hbAlpha,
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-6, 6, 0],
        blocks: hbA1.blocks,
        notes: createSubunitNotes(hbAlpha, 'Fantaisie-Impromptu', 0),
      },
      {
        id: 1,
        chainId: 'β1',
        name: 'Subunit β1',
        color: '#FF5500',
        sequence: hbBeta,
        initialOffset: [9, 3, -3],
        initialEulerDeg: [45, 45, 0],
        targetCentroid: [6, 6, 0],
        blocks: hbB1.blocks,
        notes: createSubunitNotes(hbBeta, 'Fantaisie-Impromptu', 40),
      },
      {
        id: 2,
        chainId: 'α2',
        name: 'Subunit α2',
        color: '#3B82F6',
        sequence: hbAlpha,
        initialOffset: [-6, -6, 3],
        initialEulerDeg: [-45, 0, 45],
        targetCentroid: [-6, -6, 0],
        blocks: hbA2.blocks,
        notes: createSubunitNotes(hbAlpha, 'Fantaisie-Impromptu', 80),
      },
      {
        id: 3,
        chainId: 'β2',
        name: 'Subunit β2',
        color: '#F59E0B',
        sequence: hbBeta,
        initialOffset: [6, -9, 3],
        initialEulerDeg: [0, -45, 45],
        targetCentroid: [6, -6, 0],
        blocks: hbB2.blocks,
        notes: createSubunitNotes(hbBeta, 'Fantaisie-Impromptu', 120),
      },
    ],
  },
  {
    id: 10,
    levelNumber: 10,
    difficulty: 'Master',
    title: 'K+ Ion Channel (KcsA)',
    moleculeName: 'Tetrameric Selective Pore Complex',
    uniprotId: 'P0A334',
    pdbCode: '1K4C',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/KcsA_potassium_channel',
    algorithm: 'Algo-V',
    musicalKey: 'A Minor',
    description:
      'The KcsA potassium channel coordinates four radial ribbon subunits around a central selectivity pore that conducts K+ ions at near-diffusion rates.',
    clue: 'Final Master Puzzle: Align all radial pore subunits around the Z-axis selectivity filter.',
    subunits: [
      {
        id: 0,
        chainId: 'A',
        name: 'Pore Subunit A',
        color: '#00F5D4',
        sequence: kcsaSeq,
        initialOffset: [0, 0, 0],
        initialEulerDeg: [0, 0, 0],
        targetCentroid: [-7, 0, 0],
        blocks: kcsaA.blocks,
        notes: createSubunitNotes(kcsaSeq, 'Algo-V', 0),
      },
      {
        id: 1,
        chainId: 'B',
        name: 'Pore Subunit B',
        color: '#FF5500',
        sequence: kcsaSeq,
        initialOffset: [3, 9, 3],
        initialEulerDeg: [0, 45, 90],
        targetCentroid: [0, 7, 0],
        blocks: kcsaB.blocks,
        notes: createSubunitNotes(kcsaSeq, 'Algo-V', 36),
      },
      {
        id: 2,
        chainId: 'C',
        name: 'Pore Subunit C',
        color: '#A855F7',
        sequence: kcsaSeq,
        initialOffset: [9, -3, -3],
        initialEulerDeg: [45, 0, 90],
        targetCentroid: [7, 0, 0],
        blocks: kcsaC.blocks,
        notes: createSubunitNotes(kcsaSeq, 'Algo-V', 72),
      },
      {
        id: 3,
        chainId: 'D',
        name: 'Pore Subunit D',
        color: '#F59E0B',
        sequence: kcsaSeq,
        initialOffset: [-3, -9, 6],
        initialEulerDeg: [-45, 45, -90],
        targetCentroid: [0, -7, 0],
        blocks: kcsaD.blocks,
        notes: createSubunitNotes(kcsaSeq, 'Algo-V', 108),
      },
    ],
  },
]

// ── Custom Protein Level Builder (Bring Your Own Protein after Level 5) ─────
export function createCustomProteinLevel(
  title: string,
  rawInput: string,
  numSubunits: 2 | 3 | 4 = 3,
  algorithm: SonifyAlgorithm = 'Fantaisie-Impromptu',
): GameLevel {
  const cleanSeq = rawInput
    .split('\n')
    .filter((line) => !line.trim().startsWith('>') && !line.trim().startsWith('HEADER'))
    .join('')
    .toUpperCase()
    .replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '')

  const validSeq =
    cleanSeq.length >= 16
      ? cleanSeq.slice(0, 240)
      : 'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN'

  const colors = ['#00F5D4', '#FF5500', '#A855F7', '#F59E0B']
  const chainNames = ['A', 'B', 'C', 'D']
  const centroids: [number, number, number][] = [
    [-5.5, 4, 0],
    [5.5, 4, 0],
    [-5.5, -4, 0],
    [5.5, -4, 0],
  ]
  const scrambles: { offset: [number, number, number]; euler: [number, number, number] }[] = [
    { offset: [0, 0, 0], euler: [0, 0, 0] },
    { offset: [6, -3, 0], euler: [0, 45, 45] },
    { offset: [-6, -6, 3], euler: [45, 0, -45] },
    { offset: [9, 3, -3], euler: [-45, 45, 0] },
  ]

  const chunkLen = Math.max(8, Math.floor(validSeq.length / numSubunits))
  const subunits: SubunitDefinition[] = []

  for (let i = 0; i < numSubunits; i++) {
    const start = i * chunkLen
    const subSeq =
      i === numSubunits - 1
        ? validSeq.slice(start)
        : validSeq.slice(start, start + chunkLen)

    const geom = generateHelixRibbonChain(subSeq, start, 4.5, 3.1, (i * Math.PI) / 2, 'mixed')
    subunits.push({
      id: i,
      chainId: chainNames[i],
      name: i === 0 ? `Domain ${chainNames[i]} (Anchor)` : `Domain ${chainNames[i]}`,
      color: colors[i],
      sequence: subSeq,
      initialOffset: scrambles[i].offset,
      initialEulerDeg: scrambles[i].euler,
      targetCentroid: centroids[i],
      blocks: geom.blocks,
      notes: createSubunitNotes(subSeq, algorithm, start),
    })
  }

  return {
    id: 99,
    levelNumber: 99,
    difficulty: 'Custom',
    title: title.trim() || 'Custom Protein Complex',
    moleculeName: `User-Defined ${numSubunits}-Domain Ribbon Structure (${validSeq.length} AA)`,
    uniprotId: 'CUSTOM',
    pdbCode: 'USER',
    wikipediaUrl: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(
      title.trim() || 'Protein structure',
    )}`,
    algorithm,
    musicalKey: 'C Major',
    description: `Custom protein sequence (${validSeq.length} residues) partitioned into ${numSubunits} interactive 3D ribbon domains for quaternary docking and sonification.`,
    clue: 'Align your custom protein domains onto the central wireframe ribbon template to unlock its full symphony!',
    subunits,
  }
}
