import { useGameStore } from '../store/gameStore'

interface Props {
  onNavigate: () => void
}

const SONIFICATION_ALGORITHMS_SUMMARY = [
  {
    name: 'Fantaisie-Impromptu (Default)',
    citation: 'Tay et al., Heliyon (2021)',
    description:
      'Translates amino acid occurrence frequency, residue volume, EIIP electron-ion interaction potential, and RNA-binding propensity into a two-voice polyphonic musical score.',
  },
  {
    name: 'Sonifyed Algorithm I — Hydrophobicity Scale',
    citation: 'Martin et al., BMC Bioinformatics (2021)',
    description:
      'Maps all 20 standard amino acids to 20 distinct MIDI pitches ranked by the Engelmann (1986) hydrophobicity scale (hydrophobic = lower pitch; hydrophilic = higher pitch).',
  },
  {
    name: 'Sonifyed Algorithm II — Reduced Alphabet',
    citation: 'Martin et al., BMC Bioinformatics (2021)',
    description:
      'Groups the 20 amino acids into 4 physicochemical families using the Lenckowski reduced alphabet (C4, D4, E4, G4) to highlight macro-level structural motifs.',
  },
  {
    name: 'Sonifyed Algorithm III — Hydrophobicity + Chemical Chords',
    citation: 'Martin et al., BMC Bioinformatics (2021)',
    description:
      'Combines Algorithm I and Algorithm II in parallel: the Engelmann hydrophobicity pitch carries the lead melody while the chemical family pitch forms a harmonic chord.',
  },
  {
    name: 'Sonifyed Algorithm IV — Sliding-Window Sequence Entropy',
    citation: 'Martin et al., BMC Bioinformatics (2021)',
    description:
      'Calculates local Shannon sequence entropy across a 9-residue sliding window. High sequence diversity produces higher pitches, while repetitive motifs produce deeper tones.',
  },
  {
    name: 'Sonifyed Algorithm V — Hydrophobicity + Octave Harmonics',
    citation: 'Martin et al., BMC Bioinformatics (2021)',
    description:
      'Pairs the Engelmann hydrophobicity melody with multi-octave harmonic overtones (+12 and +24 semitones) to create a rich, symphonic multi-chain resonance.',
  },
]

export function AboutPage({ onNavigate }: Props) {
  const { theme } = useGameStore()
  const isLight = theme === 'light'

  const bgMain = isLight ? 'bg-[#F8FAFC] text-[#0F172A]' : 'bg-[#0B0F17] text-[#E2E8F0]'
  const cardClass = isLight
    ? 'rounded-xl border border-[#CBD5E1] bg-white p-6 sm:p-8 shadow-sm'
    : 'rounded-xl border border-[#1E293B] bg-[#111827] p-6 sm:p-8'
  const subCardClass = isLight
    ? 'rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-4'
    : 'rounded-lg border border-[#1E293B] bg-[#0B0F17] p-4'
  const btnClass = isLight
    ? 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#FF5500] text-[#0F172A]'
    : 'border-[#1E293B] bg-[#0B0F17] hover:border-[#FF5500] text-[#E2E8F0]'
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]'

  return (
    <div className={`min-h-screen font-sans pb-16 ${bgMain}`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-6 sm:pt-10 space-y-8">
        {/* Back button */}
        <div>
          <button
            onClick={onNavigate}
            className={`px-3 py-1.5 rounded border text-xs font-mono flex items-center gap-1.5 transition-colors ${btnClass}`}
          >
            <span>← Back to SnapFold Game</span>
          </button>
        </div>

        {/* Page Header */}
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#FF5500] mb-1">
            Creator, Attribution &amp; Algorithms
          </p>
          <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight">
            About SnapFold
          </h1>
          <p className={`text-sm mt-2 leading-relaxed ${mutedText}`}>
            <strong>SnapFold</strong> is an interactive 3D protein ribbon docking game where players
            assemble multi-subunit quaternary protein structures in 3D space using real-time
            psychoacoustic feedback, and watch how each protein’s musical score travels across its
            3D geometry.
          </p>
        </div>

        {/* Creator Card: Roqeeb Adedeji */}
        <div className={cardClass}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#FF5500]/15 text-[#FF5500] font-bold">
                Creator &amp; Game Architect
              </span>
              <h2 className="text-xl font-mono font-bold tracking-tight mt-2">
                Roqeeb Adedeji (Roqeeb A.)
              </h2>
              <p className={`text-xs sm:text-sm font-mono mt-1 ${mutedText}`}>
                Creator of SnapFold — 3D Quaternary Protein Ribbon Docking Game &amp; Interactive
                Visualizer
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 shrink-0">
              <a
                href="https://www.linkedin.com/in/roqeeb-adedeji/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#FF5500] hover:bg-[#FF6A1A] text-black text-xs font-mono font-bold transition-colors"
              >
                <span>Connect with Roqeeb A. on LinkedIn ↗</span>
              </a>
            </div>
          </div>
        </div>

        {/* SonoFold Attribution Card: Oluwasegun Isaac */}
        <div className={cardClass}>
          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#0284C7]/15 text-[#0284C7] font-bold">
            Sonification Foundation
          </span>
          <h2 className="text-lg font-mono font-bold tracking-tight mt-2">
            Built on Oluwasegun Isaac’s SonoFold
          </h2>
          <p className={`text-xs sm:text-sm leading-relaxed mt-2 mb-5 ${mutedText}`}>
            The musical folding and protein sonification engine inside <strong>SnapFold</strong> is
            inspired by and built upon <strong>SonoFold</strong>, created by{' '}
            <strong>Daramola Oluwasegun Isaac</strong> (Purdue University). SonoFold pioneered the
            web-based translation of predicted 3D protein structures and amino acid sequences into
            musical scores.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <a
              href="https://sono-fold.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-mono font-bold transition-colors"
            >
              <span>Visit Isaac’s SonoFold Website ↗</span>
            </a>
            <a
              href="https://github.com/OluwasegunIsaac/SonoFold"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded border text-xs font-mono font-semibold transition-colors ${btnClass}`}
            >
              <span>SonoFold GitHub ↗</span>
            </a>
            <a
              href="https://www.linkedin.com/in/oluwasegun-isaac-daramola"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded border text-xs font-mono font-semibold transition-colors ${btnClass}`}
            >
              <span>Oluwasegun Isaac LinkedIn ↗</span>
            </a>
          </div>
        </div>

        {/* The 6 Sonification Algorithms */}
        <div className={cardClass}>
          <h2 className="text-lg font-mono font-bold tracking-tight mb-1">
            The 6 Protein Sonification Algorithms
          </h2>
          <p className={`text-xs sm:text-sm mb-5 ${mutedText}`}>
            Every protein level in SnapFold translates its amino acid sequence and 3D ribbon
            geometry into music using one of six peer-reviewed biophysical sonification algorithms:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {SONIFICATION_ALGORITHMS_SUMMARY.map((algo) => (
              <div key={algo.name} className={subCardClass}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-xs font-mono font-bold text-[#FF5500]">{algo.name}</h3>
                </div>
                <p className="text-[10px] font-mono text-[#0284C7] mb-1.5">{algo.citation}</p>
                <p className={`text-xs leading-relaxed ${mutedText}`}>{algo.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
