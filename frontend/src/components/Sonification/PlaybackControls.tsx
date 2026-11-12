import { useSonification } from '../../hooks/useSonification'
import { useProteinStore } from '../../store/proteinStore'
import { STYLE_PRESETS, ALGO_STYLES } from './StyleEngine'
import { ALGORITHM_NAMES, ALGORITHM_LABELS, ALGORITHM_DESCRIPTIONS } from './AlgorithmEngine'
import clsx from 'clsx'

export function PlaybackControls() {
  const { status, isPlaying, events, currentResidue } = useProteinStore()
  const { play, stop, bpm, setBpm, style, setStyle, algorithm, setAlgorithm, durationScale, setDurationScale } = useSonification()
  const isReady = status === 'ready' && events.length > 0
  const progress = isReady && currentResidue >= 0 ? (currentResidue / events.length) * 100 : 0

  const availableStyles = ALGO_STYLES[algorithm]

  const handleAlgorithmChange = (a: typeof algorithm) => {
    setAlgorithm(a)
    const styles = ALGO_STYLES[a]
    if (!styles.includes(style)) {
      setStyle('Default')
      setBpm(STYLE_PRESETS['Default'].defaultBpm)
    }
  }

  const handleStyleChange = (s: typeof style) => {
    setStyle(s)
    setBpm(STYLE_PRESETS[s].defaultBpm)
  }

  const btnBase = 'flex items-center justify-center w-8 h-8 rounded border border-[#1E293B] bg-[#111827] hover:bg-[#1E293B] transition-colors shrink-0 text-[#E2E8F0]'

  return (
    <div className="flex flex-col gap-4 font-sans text-[#E2E8F0]">
      {/* BPM slider + inline play/pause */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[#94A3B8]">BPM: {bpm}</span>
          <div className="flex gap-1.5">
            <button
              onClick={isPlaying ? undefined : play}
              disabled={!isReady || isPlaying}
              className={clsx(
                btnBase,
                (!isReady || isPlaying) && 'opacity-30 cursor-not-allowed',
                !isPlaying && isReady && 'hover:border-[#FF5500] hover:text-[#FF5500]'
              )}
              title="Play"
            >
              <PlayIcon />
            </button>
            <button
              onClick={stop}
              disabled={!isPlaying}
              className={clsx(
                btnBase,
                !isPlaying && 'opacity-30 cursor-not-allowed',
                isPlaying && 'bg-[#FF5500] text-black border-[#FF5500]'
              )}
              title="Pause"
            >
              <PauseIcon />
            </button>
          </div>
        </div>
        <input
          type="range"
          min={60}
          max={240}
          step={10}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          disabled={isPlaying}
          className="w-full accent-[#FF5500] bg-[#1E293B]"
        />
      </div>

      {/* Duration scale slider */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-mono text-[#94A3B8]">
          Duration Multiplier: <span className="text-[#FF5500]">{durationScale.toFixed(2)}×</span>
        </span>
        <input
          type="range"
          min={0.25}
          max={3.0}
          step={0.05}
          value={durationScale}
          onChange={(e) => setDurationScale(Number(e.target.value))}
          disabled={isPlaying}
          className="w-full accent-[#FF5500] bg-[#1E293B]"
        />
        <span className="text-[10px] font-mono text-[#64748B]">
          {isReady ? `${events.filter(e => e.hand === 'right').length} RH · ${events.filter(e => e.hand === 'left').length} LH notes` : ''}
        </span>
      </div>

      {/* Sonification Algorithm */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono uppercase tracking-wider text-[#94A3B8]">Algorithm</label>
        <select
          value={algorithm}
          onChange={(e) => handleAlgorithmChange(e.target.value as typeof algorithm)}
          disabled={isPlaying}
          className="w-full rounded border border-[#1E293B] bg-[#111827] px-3 py-2
                     text-xs font-mono text-[#E2E8F0] focus:outline-none focus:border-[#FF5500]
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ALGORITHM_NAMES.map((a) => (
            <option key={a} value={a} className="bg-[#0B0F17] text-[#E2E8F0]">
              {ALGORITHM_LABELS[a]}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-[#64748B] leading-tight font-sans">
          {ALGORITHM_DESCRIPTIONS[algorithm]}
        </p>
      </div>

      {/* Musical Style */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono uppercase tracking-wider text-[#94A3B8]">Musical Style</label>
        <select
          value={style}
          onChange={(e) => handleStyleChange(e.target.value as typeof style)}
          disabled={isPlaying}
          className="w-full rounded border border-[#1E293B] bg-[#111827] px-3 py-2
                     text-xs font-mono text-[#E2E8F0] focus:outline-none focus:border-[#FF5500]
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {availableStyles.map((s) => (
            <option key={s} value={s} className="bg-[#0B0F17] text-[#E2E8F0]">
              {s}
            </option>
          ))}
        </select>
        {style !== 'Default' && (
          <p className="text-[10px] text-[#64748B] leading-tight font-sans">
            {algorithm} blended with {style} ({STYLE_PRESETS[style].defaultBpm} BPM default)
          </p>
        )}
      </div>

      {/* Progress bar */}
      {isReady && (
        <div className="h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FF5500] rounded-full transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <rect x="4" y="3" width="4" height="14" rx="1" />
      <rect x="12" y="3" width="4" height="14" rx="1" />
    </svg>
  )
}
