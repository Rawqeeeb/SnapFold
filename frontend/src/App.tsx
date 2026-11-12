import { useState, useEffect } from 'react'
import { DocsPage } from './components/DocsPage'
import { useProteinStore } from './store/proteinStore'
import { useGameStore } from './store/gameStore'
import { ALGORITHM_LABELS } from './components/Sonification/AlgorithmEngine'
import type { SonifyAlgorithm } from './components/Sonification/AlgorithmEngine'
import { GameView } from './game/GameView'
import { CAMPAIGN_LEVELS, createCustomProteinLevel } from './game/levels'

const EXAMPLE_INSULIN = `>INS_HUMAN Insulin preprotein
MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN`

const EXAMPLE_GFP = `>GFP Green Fluorescent Protein
MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK`

const EXAMPLE_LYSOZYME = `>LYSC_HUMAN Lysozyme C
KVFERCELARTLKRLGMDGYRGISLANWMCLAKWESGYNTRATNYNAGDRSTDYGIFQINSRYWCNDGKTPGAVNACHLSCSALLQDNIADAVACAKRVVRDPQGIRAWVAWRNRCQNRDVRQYVQGCGV`

const EXAMPLE_MYOGLOBIN = `>MYG_HUMAN Myoglobin (P02144)
MGLSDGEWQLVLNVWGKVEADIPGHGQEVLIRLFKGHPETLEKFDKFKHLKSEDEMKASEDLKKHGATVLTALGGILKKKGHHEAEIKPLAQSHATKHKIPVKYLEFISECIIQVLQSKHPGDFGADAQGAMNKALELFRKDMASNYKELGFQG`

export default function App() {
  const { fasta, setFasta } = useProteinStore()

  const {
    activeTab,
    setActiveTab,
    completedLevelIds,
    devBypassUnlocked,
    theme,
    toggleTheme,
    startCustomLevel,
  } = useGameStore()

  const isLight = theme === 'light'

  // Custom Protein Folding Builder state
  const [customTitle, setCustomTitle] = useState('Human Lysozyme C')
  const [customSubunitCount, setCustomSubunitCount] = useState<2 | 3 | 4>(3)
  const [customAlgo, setCustomAlgo] = useState<SonifyAlgorithm>('Fantaisie-Impromptu')
  const [resolvedProteinName, setResolvedProteinName] = useState<string | null>(null)

  // Support optional URL query ?dev=1 for internal testing while keeping dev controls hidden in production
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('dev') === '1' && !devBypassUnlocked) {
      useGameStore.setState({ devBypassUnlocked: true })
    }
  }, [devBypassUnlocked])

  // Resolve UniProt metadata when user enters an accession code
  useEffect(() => {
    const trimmed = fasta.trim()
    const isAccession = /^[A-Z0-9]{6,10}$/i.test(trimmed)
    if (!isAccession) {
      setResolvedProteinName(null)
      return
    }

    let cancelled = false
    fetch(`https://rest.uniprot.org/uniprotkb/${trimmed.toUpperCase()}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const name =
          data?.proteinDescription?.recommendedName?.fullName?.value ||
          data?.proteinDescription?.submissionNames?.[0]?.fullName?.value ||
          null
        const gene = data?.genes?.[0]?.geneName?.value ?? null
        if (name) {
          const fullTitle = gene ? `${name} (${gene})` : name
          setResolvedProteinName(fullTitle)
          setCustomTitle(fullTitle)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [fasta])

  const handleLaunchCustomFoldGame = () => {
    const rawInput = fasta.trim() || EXAMPLE_LYSOZYME
    const lvl = createCustomProteinLevel(
      resolvedProteinName || customTitle || 'Custom Protein Complex',
      rawInput,
      customSubunitCount,
      customAlgo,
    )
    startCustomLevel(lvl)
  }

  // Unlocked once the first 5 easy levels are solved
  const easyLevelsCleared = [1, 2, 3, 4, 5].filter((id) => completedLevelIds.includes(id)).length
  const isCustomFoldUnlocked =
    easyLevelsCleared >= 5 || completedLevelIds.length >= 5 || devBypassUnlocked

  const bgMain = isLight ? 'bg-[#F8FAFC] text-slate-900' : 'bg-[#0B0F17] text-[#E2E8F0]'
  const headerClass = isLight
    ? 'border-slate-300 bg-white'
    : 'border-[#1E293B] bg-[#0B0F17]'
  const cardClass = isLight
    ? 'bg-white rounded-xl border border-slate-300 p-5 sm:p-6 text-slate-900 shadow-sm'
    : 'bg-[#111827] rounded-xl border border-[#1E293B] p-5 sm:p-6 text-[#E2E8F0]'
  const textMuted = isLight ? 'text-slate-700' : 'text-[#94A3B8]'
  const inactiveTabClass = isLight
    ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold'
    : 'text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#111827] font-semibold'

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${bgMain}`}>
      {/* ── Top Navigation Bar (Mobile & Desktop Optimized) ────────────────── */}
      <header
        className={`h-14 border-b px-2.5 sm:px-6 flex items-center justify-between shrink-0 select-none ${headerClass}`}
      >
        {/* Brand: SnapFold (Clicking returns to Home / Play) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('game')}
          onKeyDown={(e) => e.key === 'Enter' && setActiveTab('game')}
          title="SnapFold — Home / Play"
          className="flex items-center space-x-2 sm:space-x-2.5 cursor-pointer group hover:opacity-95 transition-opacity"
        >
          <div className="w-7 h-7 bg-[#FF5500] group-hover:scale-105 transition-transform rounded flex items-center justify-center font-mono font-bold text-black text-xs sm:text-sm shrink-0 shadow-xs">
            SF
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-mono font-bold text-sm sm:text-base tracking-tight group-hover:text-[#FF5500] transition-colors">
                SnapFold
              </span>
              <span
                className={`hidden md:inline text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                  isLight ? 'bg-sky-100 text-sky-800' : 'bg-[#1E293B] text-[#00F5D4]'
                }`}
              >
                3D Protein Game
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (Merged Docs & About) */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center space-x-1.5 ${
              activeTab === 'custom'
                ? isLight
                  ? 'bg-sky-100 text-sky-900 font-bold border border-sky-400'
                  : 'bg-[#1E293B] text-[#00F5D4] font-bold border border-[#00F5D4]/40'
                : inactiveTabClass
            }`}
          >
            <span>{isCustomFoldUnlocked ? '🧬' : '🔒'}</span>
            <span className="hidden sm:inline">Fold Custom</span>
            <span className="sm:hidden">Custom</span>
            {!isCustomFoldUnlocked && (
              <span
                className={`text-[10px] px-1.5 rounded font-bold ${
                  isLight ? 'bg-orange-100 text-orange-800' : 'bg-[#FF5500]/20 text-[#FF5500]'
                }`}
              >
                {easyLevelsCleared}/5
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-mono rounded-lg transition-colors ${
              activeTab === 'docs' || activeTab === 'about'
                ? isLight
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-400'
                  : 'bg-[#1E293B] text-[#E2E8F0] font-bold border border-slate-600'
                : inactiveTabClass
            }`}
          >
            <span className="hidden sm:inline">📖 Docs &amp; About</span>
            <span className="sm:hidden">📖 Docs</span>
          </button>
        </nav>

        {/* Right Theme Toggle */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={toggleTheme}
            className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors flex items-center space-x-1 ${
              isLight
                ? 'bg-slate-100 border-slate-300 text-slate-900 hover:border-[#FF5500]'
                : 'bg-[#111827] border-[#1E293B] text-[#E2E8F0] hover:border-[#00F5D4]'
            }`}
            title="Switch between Light Mode and Dark Mode"
          >
            <span>{isLight ? '🌙' : '☀️'}</span>
            <span className="hidden md:inline">{isLight ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Views ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col">
        {/* TAB 1: 10-Level 3D Ribbon Docking Game */}
        {activeTab === 'game' && <GameView />}

        {/* TAB 2: Bring Your Own Protein (Unlocked after Level 5) */}
        {activeTab === 'custom' && (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
            {!isCustomFoldUnlocked ? (
              /* Locked Screen until first 5 Easy Levels are cleared */
              <div className={`max-w-lg w-full ${cardClass} text-center space-y-6`}>
                <div className="w-12 h-12 bg-[#FF5500]/15 border border-[#FF5500]/40 text-[#FF5500] rounded-full flex items-center justify-center text-2xl mx-auto">
                  🔒
                </div>

                <div>
                  <h2 className="text-xl font-mono font-bold tracking-tight mb-2">
                    Bring Your Own Protein Locked
                  </h2>
                  <p className={`text-xs sm:text-sm leading-relaxed ${textMuted}`}>
                    Complete the first 5 Easy levels in the <strong>SnapFold</strong> campaign to
                    unlock Custom Protein Folding. Once unlocked, you can bring any FASTA sequence
                    or UniProt ID, fold its 3D ribbon subunits, and download a video of its 3D
                    musical score!
                  </p>
                </div>

                {/* Easy Levels 1-5 Progress Badges */}
                <div
                  className={`p-4 rounded-lg border space-y-2 text-left ${
                    isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#0B0F17] border-[#1E293B]'
                  }`}
                >
                  <div className={`text-xs font-mono font-bold uppercase tracking-wider mb-2 ${textMuted}`}>
                    Easy Campaign Progress ({easyLevelsCleared} / 5 Solved)
                  </div>
                  {CAMPAIGN_LEVELS.slice(0, 5).map((lvl) => {
                    const isDone = completedLevelIds.includes(lvl.id)
                    return (
                      <div
                        key={lvl.id}
                        className="flex items-center justify-between text-xs font-mono"
                      >
                        <span
                          className={
                            isDone
                              ? isLight
                                ? 'text-emerald-700 font-bold'
                                : 'text-emerald-400 font-bold'
                              : textMuted
                          }
                        >
                          Level {lvl.id}: {lvl.title}
                        </span>
                        <span
                          className={
                            isDone
                              ? isLight
                                ? 'text-emerald-700 font-bold'
                                : 'text-emerald-400 font-bold'
                              : textMuted
                          }
                        >
                          {isDone ? '✓ Solved' : 'Pending'}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => setActiveTab('game')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#FF5500] hover:bg-[#FF6A1A] text-black text-xs font-mono font-bold rounded-lg"
                >
                  Continue Campaign (Levels 1–5) →
                </button>
              </div>
            ) : (
              /* Unlocked: Clean, High-Contrast Custom Protein 3D Puzzle Builder */
              <div className={`max-w-2xl w-full ${cardClass} space-y-5`}>
                <div>
                  <span
                    className={`text-[11px] font-mono uppercase px-2.5 py-0.5 rounded font-bold ${
                      isLight
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-[#FF5500]/15 text-[#FF5500]'
                    }`}
                  >
                    Level 5 Reward Unlocked
                  </span>
                  <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight mt-2">
                    🧬 Fold Your Own Protein in 3D
                  </h1>
                  <p className={`text-xs sm:text-sm mt-1 ${textMuted}`}>
                    Paste any amino acid sequence (FASTA) or UniProt ID below, choose how many 3D
                    ribbon subunits to split it into, and fold it in the SnapFold arena.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Protein Name */}
                  <div>
                    <label className={`block text-xs font-mono font-bold uppercase mb-1 ${textMuted}`}>
                      1. Protein Name
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="e.g. Human Lysozyme C"
                      className={`w-full rounded-lg border px-3 py-2 text-xs sm:text-sm font-mono focus:outline-none focus:border-[#FF5500] ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-[#0B0F17] border-[#1E293B] text-[#E2E8F0]'
                      }`}
                    />
                  </div>

                  {/* FASTA or UniProt Sequence Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={`text-xs font-mono font-bold uppercase ${textMuted}`}>
                        2. FASTA Sequence or UniProt Accession
                      </label>
                      {resolvedProteinName && (
                        <span
                          className={`text-xs font-mono font-bold ${
                            isLight ? 'text-sky-700' : 'text-[#00F5D4]'
                          }`}
                        >
                          ✓ {resolvedProteinName}
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={4}
                      value={fasta}
                      onChange={(e) => setFasta(e.target.value)}
                      placeholder="Paste FASTA sequence or UniProt ID (e.g. P01308)..."
                      className={`w-full rounded-lg border p-3 text-xs font-mono focus:outline-none focus:border-[#FF5500] ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-[#0B0F17] border-[#1E293B] text-[#E2E8F0]'
                      }`}
                    />

                    {/* Quick Presets */}
                    <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs font-mono ${textMuted}`}>
                      <span className="font-bold">Quick Presets:</span>
                      <button
                        onClick={() => {
                          setFasta(EXAMPLE_LYSOZYME)
                          setCustomTitle('Human Lysozyme C')
                        }}
                        className={`hover:underline font-bold ${
                          isLight ? 'text-orange-700' : 'text-[#FF5500]'
                        }`}
                      >
                        Lysozyme
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => {
                          setFasta(EXAMPLE_MYOGLOBIN)
                          setCustomTitle('Human Myoglobin')
                        }}
                        className={`hover:underline font-bold ${
                          isLight ? 'text-orange-700' : 'text-[#FF5500]'
                        }`}
                      >
                        Myoglobin
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => {
                          setFasta(EXAMPLE_GFP)
                          setCustomTitle('Green Fluorescent Protein')
                        }}
                        className={`hover:underline font-bold ${
                          isLight ? 'text-orange-700' : 'text-[#FF5500]'
                        }`}
                      >
                        GFP
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => {
                          setFasta(EXAMPLE_INSULIN)
                          setCustomTitle('Human Insulin')
                        }}
                        className={`hover:underline font-bold ${
                          isLight ? 'text-orange-700' : 'text-[#FF5500]'
                        }`}
                      >
                        Insulin
                      </button>
                    </div>
                  </div>

                  {/* Subunit Count & Sonification Algorithm */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-xs font-mono font-bold uppercase mb-1 ${textMuted}`}>
                        3. Ribbon Subunits to Dock
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([2, 3, 4] as const).map((cnt) => (
                          <button
                            key={cnt}
                            onClick={() => setCustomSubunitCount(cnt)}
                            className={`py-2 text-xs font-mono rounded-lg border transition-colors ${
                              customSubunitCount === cnt
                                ? 'bg-[#FF5500] text-black border-[#FF5500] font-bold'
                                : isLight
                                  ? 'bg-slate-50 border-slate-300 text-slate-900 font-semibold'
                                  : 'bg-[#0B0F17] border-[#1E293B] text-[#94A3B8]'
                            }`}
                          >
                            {cnt} Chains
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-mono font-bold uppercase mb-1 ${textMuted}`}>
                        4. Sonification Algorithm
                      </label>
                      <select
                        value={customAlgo}
                        onChange={(e) => setCustomAlgo(e.target.value as SonifyAlgorithm)}
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-mono font-semibold focus:outline-none focus:border-[#FF5500] ${
                          isLight
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-[#0B0F17] border-[#1E293B] text-[#E2E8F0]'
                        }`}
                      >
                        {(Object.entries(ALGORITHM_LABELS) as [SonifyAlgorithm, string][]).map(
                          ([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleLaunchCustomFoldGame}
                  className="w-full py-3 rounded-lg bg-[#FF5500] hover:bg-[#FF6A1A] text-black font-mono text-sm font-bold tracking-wide shadow-md transition-transform active:scale-98"
                >
                  🎮 Launch Custom 3D Ribbon Puzzle →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Merged Docs & About */}
        {(activeTab === 'docs' || activeTab === 'about') && (
          <DocsPage onNavigate={() => setActiveTab('game')} />
        )}
      </main>
    </div>
  )
}
