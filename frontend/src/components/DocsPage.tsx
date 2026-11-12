import { useGameStore } from '../store/gameStore'
import { CAMPAIGN_LEVELS } from '../game/levels'

interface Props {
  onNavigate: () => void
}

const ALGORITHMS = [
  {
    id: 'Fantaisie-Impromptu',
    label: 'Fantaisie-Impromptu (Default)',
    badge: 'Tay et al. (2021)',
    desc: 'Maps amino acid occurrence frequency, residue steric volume, EIIP electron-ion interaction potential, and RNA-binding propensity into pitch, octave, duration, and two-voice harmony.',
    details: [
      'Right-hand melody ← relative frequency of occurrence',
      'Left-hand bass ← amino acid composition & EIIP index',
      'Note duration ← steric volume of the preceding residue',
    ],
  },
  {
    id: 'Algo-I',
    label: 'Sonifyed I — Hydrophobicity Scale',
    badge: 'Martin et al. (2021)',
    desc: 'Maps each residue to one of 20 distinct MIDI pitches ordered by the Engelmann (1986) hydrophobicity scale (hydrophobic = deeper pitch, hydrophilic = brighter pitch).',
    details: [
      '20 unique pitches across the standard amino acid alphabet',
      'Phenylalanine (most hydrophobic) → MIDI 50 (D3)',
      'Arginine (most hydrophilic) → MIDI 77 (F5)',
    ],
  },
  {
    id: 'Algo-II',
    label: 'Sonifyed II — Reduced Alphabet',
    badge: 'Martin et al. (2021)',
    desc: 'Groups the 20 amino acids into 4 physicochemical families using the Lenckowski reduced alphabet (C4, D4, E4, G4) to highlight macro-level structural motifs.',
    details: [
      'Group 1 (D, E, H, N, R) → C4 (MIDI 60)',
      'Group 2 (K, Q, S, T) → D4 (MIDI 62)',
      'Group 3 (A, C, G, M, P) → E4 (MIDI 64)',
      'Group 4 (F, I, L, V, W, Y) → G4 (MIDI 67)',
    ],
  },
  {
    id: 'Algo-III',
    label: 'Sonifyed III — Hydrophobicity + Groups',
    badge: 'Martin et al. (2021)',
    desc: 'Combines Algorithms I and II: the Engelmann hydrophobicity pitch carries the melody while the Lenckowski chemical family forms a simultaneous chord.',
    details: [
      'Melody: Engelmann hydrophobicity (Algo-I)',
      'Harmony: Lenckowski chemical group chord (Algo-II)',
    ],
  },
  {
    id: 'Algo-IV',
    label: 'Sonifyed IV — Sequence Entropy',
    badge: 'Martin et al. (2021)',
    desc: 'Computes Shannon entropy in a ±4 residue sliding window around each amino acid. High local sequence complexity produces higher pitches.',
    details: [
      'Sliding window: 9 residues (±4 around active residue)',
      'High local diversity → brighter, higher pitches',
    ],
  },
  {
    id: 'Algo-V',
    label: 'Sonifyed V — Hydrophobicity + Harmonics',
    badge: 'Martin et al. (2021)',
    desc: 'Layers octave harmonic overtones (+12 and +24 semitones) on top of the Engelmann hydrophobicity melody to create a rich multi-subunit resonance.',
    details: [
      'Melody: Engelmann hydrophobicity scale',
      'Overtones: +12 and +24 semitone harmonic chords',
    ],
  },
]

export function DocsPage({ onNavigate }: Props) {
  const { theme } = useGameStore()
  const isLight = theme === 'light'

  const bgMain = isLight ? 'bg-[#F8FAFC] text-slate-900' : 'bg-[#0B0F17] text-[#E2E8F0]'
  const cardClass = isLight
    ? 'rounded-xl border border-slate-300 bg-white p-5 sm:p-6 shadow-sm'
    : 'rounded-xl border border-[#1E293B] bg-[#111827] p-5 sm:p-6'
  const subCardClass = isLight
    ? 'rounded-lg border border-slate-300 bg-slate-50 p-4'
    : 'rounded-lg border border-[#1E293B] bg-[#0B0F17] p-4'
  const mutedText = isLight ? 'text-slate-700' : 'text-[#94A3B8]'
  const orangeText = isLight ? 'text-orange-700' : 'text-[#FF5500]'
  const blueText = isLight ? 'text-sky-700' : 'text-[#00F5D4]'
  const btnClass = isLight
    ? 'border-slate-300 bg-white hover:border-[#FF5500] text-slate-900 font-semibold shadow-sm'
    : 'border-[#1E293B] bg-[#111827] hover:border-[#FF5500] text-[#E2E8F0] font-semibold'

  return (
    <div className={`min-h-screen font-sans pb-16 ${bgMain}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-6 sm:pt-10 space-y-10">
        {/* Top Back Button */}
        <div>
          <button
            onClick={onNavigate}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors ${btnClass}`}
          >
            <span>← Back to SnapFold Game</span>
          </button>
        </div>

        {/* ── 1. About SnapFold & Creator ───────────────────────────────────── */}
        <section className="space-y-5">
          <div>
            <p className={`text-xs font-mono uppercase tracking-widest font-bold mb-1 ${orangeText}`}>
              About &amp; Game Guide
            </p>
            <h1 className="text-2xl sm:text-4xl font-mono font-bold tracking-tight mb-3">
              SnapFold — 3D Protein Folding &amp; Sonification Game
            </h1>
            <p className={`text-sm sm:text-base leading-relaxed ${mutedText}`}>
              <strong>SnapFold</strong> is an interactive 3D protein puzzle game where you move,
              turn, and spin 3D protein ribbon subunits to assemble real quaternary protein
              structures. Designed as an interactive game extension of{' '}
              <a
                href="https://sono-fold.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className={`underline font-bold ${blueText}`}
              >
                SonoFold
              </a>
              , SnapFold helps players discover and understand <strong>protein sonification</strong>{' '}
              — experiencing how amino acid sequences and 3D molecular structures translate into
              music as each note lights up across the 3D protein ribbon.
            </p>
          </div>

          {/* Creator & Links Card */}
          <div className={cardClass}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span
                  className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded font-bold ${
                    isLight
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-[#FF5500]/15 text-[#FF5500]'
                  }`}
                >
                  Created By
                </span>
                <h2 className="text-xl font-mono font-bold tracking-tight mt-2">
                  Roqeeb Adedeji (Roqeeb A.)
                </h2>
                <p className={`text-xs sm:text-sm font-mono mt-1 ${mutedText}`}>
                  Creator of SnapFold — Interactive 3D Protein Docking Game &amp; Musical Visualizer
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 shrink-0">
                <a
                  href="https://www.linkedin.com/in/roqeeb-adedeji/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF5500] hover:bg-[#FF6A1A] text-black text-xs font-mono font-bold transition-colors shadow-sm"
                >
                  <span>LinkedIn (Roqeeb A.) ↗</span>
                </a>
                <a
                  href="https://github.com/Rawqeeeb/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-mono transition-colors ${btnClass}`}
                >
                  <span>GitHub (@Rawqeeeb) ↗</span>
                </a>
                <a
                  href="https://github.com/Rawqeeeb/SnapFold"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-mono transition-colors ${btnClass}`}
                >
                  <span>SnapFold Repo ↗</span>
                </a>
              </div>
            </div>

            {/* Extension of SonoFold Note */}
            <div className={`mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <p className={`text-xs sm:text-sm leading-relaxed ${mutedText}`}>
                <strong>SonoFold Extension:</strong> SnapFold extends{' '}
                <strong>Daramola Oluwasegun Isaac’s SonoFold</strong> into an interactive 3D puzzle
                experience to make protein sonification accessible to everyone.
              </p>
              <div className="flex flex-wrap gap-2 shrink-0">
                <a
                  href="https://sono-fold.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-mono font-bold transition-colors"
                >
                  <span>SonoFold Website ↗</span>
                </a>
                <a
                  href="https://github.com/OluwasegunIsaac/SonoFold"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${btnClass}`}
                >
                  <span>SonoFold GitHub ↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. How to Play SnapFold ───────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono font-bold tracking-tight">How to Play SnapFold</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                step: '1. Select a Protein Subunit',
                body: 'Tap any colored 3D protein ribbon in the viewport or pick its card in the Subunits list. Each card shows a live Alignment % bar so you can see how close that subunit is to its target position.',
              },
              {
                step: '2. Move, Turn & Spin into Place',
                body: 'Use the Move buttons (Left, Right, Up, Down, Closer, Further) and Turn/Spin buttons (Tilt Up/Down, Turn Left/Right, Spin Left/Right) to align the colored ribbon onto the central wireframe ghost.',
              },
              {
                step: '3. Listen, Use Hints (💡) & Snap at 85% (🧲)',
                body: 'Tap ♪ Listen on any subunit to hear its melody—as alignment improves, the sound opens from muffled to crystal-clear. Once a subunit reaches 85% alignment, the green 🧲 Snap button unlocks to lock it into place!',
              },
              {
                step: '4. Watch the 3D Symphony & Share Your Score',
                body: 'When all subunits reach 100%, SnapFold plays the protein’s full musical score while a glowing beacon travels residue-by-residue across the 3D ribbon. You can then copy/save your emoji scorecard or download a video of the 3D symphony!',
              },
            ].map((item) => (
              <div key={item.step} className={cardClass}>
                <h3 className={`text-sm font-mono font-bold mb-1.5 ${orangeText}`}>{item.step}</h3>
                <p className={`text-xs sm:text-sm leading-relaxed ${mutedText}`}>{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. The 10 Campaign Proteins ───────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono font-bold tracking-tight">
            The 10 Campaign Proteins (Unlock Custom Folding at Level 5)
          </h2>
          <p className={`text-xs sm:text-sm ${mutedText}`}>
            Levels 1–5 are approachable 2-subunit puzzles that unlock the{' '}
            <strong>🧬 Fold Custom</strong> mode once cleared. Levels 6–10 challenge you with 3- and
            4-subunit quaternary complexes with real biological coordinates from the Protein Data Bank.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAMPAIGN_LEVELS.map((lvl) => (
              <div key={lvl.id} className={`${subCardClass} flex items-start justify-between gap-3`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${orangeText}`}>
                      Level {lvl.levelNumber}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        isLight ? 'bg-slate-200 text-slate-800' : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {lvl.difficulty}
                    </span>
                  </div>
                  <h3 className="text-sm font-mono font-bold mt-1">{lvl.title}</h3>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>{lvl.moleculeName}</p>
                  <p className={`text-[11px] font-mono font-semibold mt-1 ${blueText}`}>
                    {lvl.subunits.length} Subunits · {lvl.algorithm} · PDB {lvl.pdbCode}
                  </p>
                </div>
                <a
                  href={`https://www.rcsb.org/structure/${lvl.pdbCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 text-xs font-mono px-2.5 py-1 rounded border font-semibold transition-colors ${
                    isLight
                      ? 'border-sky-600 bg-sky-50 text-sky-800 hover:bg-sky-600 hover:text-white'
                      : 'border-[#00F5D4]/50 text-[#00F5D4] hover:bg-[#00F5D4] hover:text-black'
                  }`}
                  title="View structure on RCSB Protein Data Bank"
                >
                  PDB ↗
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. The 6 Sonification Algorithms ──────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono font-bold tracking-tight">
            The 6 Protein Sonification Algorithms
          </h2>
          <p className={`text-xs sm:text-sm ${mutedText}`}>
            To help players learn how scientists convert molecular data into sound, SnapFold
            features six peer-reviewed sonification algorithms (Tay et al., <em>Heliyon</em> 2021;
            Martin et al., <em>BMC Bioinformatics</em> 2021):
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ALGORITHMS.map((algo) => (
              <div key={algo.id} className={cardClass}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className={`text-sm font-mono font-bold ${orangeText}`}>{algo.label}</h3>
                  <span
                    className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      isLight ? 'bg-sky-100 text-sky-800' : 'bg-[#0284C7]/20 text-[#00F5D4]'
                    }`}
                  >
                    {algo.badge}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed mb-3 ${mutedText}`}>{algo.desc}</p>
                <ul className="space-y-1">
                  {algo.details.map((d, i) => (
                    <li key={i} className={`text-xs font-mono flex gap-1.5 ${mutedText}`}>
                      <span className={`font-bold ${orangeText}`}>·</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
