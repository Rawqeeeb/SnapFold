import { useEffect, useState, useCallback, useRef } from 'react'
import { CAMPAIGN_LEVELS, createSubunitNotes } from './levels'
import { GameCanvas, type GameCanvasHandle } from './GameCanvas'
import {
  createDockingEngine,
  type IDockingEngine,
  type SubunitTransformData,
} from '../wasm/wasmBridge'
import { useGameStore } from '../store/gameStore'
import {
  scheduleSonification,
  scheduleProteinTraversal,
  stopPlayback,
  setAlignmentAudioFeedback,
  playLockCelebration,
  getAudioRecordingStream,
  type TraversalNoteStep,
} from '../components/Sonification/AudioEngine'
import { STYLE_PRESETS, type MusicalStyle } from '../components/Sonification/StyleEngine'
import { ALGORITHM_LABELS, type SonifyAlgorithm } from '../components/Sonification/AlgorithmEngine'

const GENRE_LABELS: Record<MusicalStyle, string> = {
  Classical: 'Classical Piano',
  Jazz: 'Jazz (Swing)',
  Punk: 'Rock / Punk',
  Ambient: 'Ambient (Warm)',
  'Lo-Fi': 'Lo-Fi Chill',
  Synthwave: 'Synthwave 80s',
  Techno: 'Techno Beat',
  Afrobeat: 'Afrobeat Percussive',
  Folk: 'Folk Acoustic',
  Default: 'Standard Synth',
}

export function GameView() {
  const {
    theme,
    currentLevelId,
    customLevel,
    completedLevelIds,
    devBypassUnlocked,
    activeSubunitIdx,
    alignmentScore,
    isLevelSolved,
    isPlayingSolo,
    isPlayingSymphony,
    hint,
    showHint,
    showLevelClearModal,
    selectedAlgorithm,
    selectedStyle,
    hintsUsed,
    snapsUsed,
    movesCount,
    emojiTrail,
    selectLevel,
    nextLevel,
    completeCurrentLevel,
    recordMove,
    recordHint,
    recordSnap,
    resetCurrentLevelStats,
    setActiveSubunitIdx,
    setAlignmentScore,
    setSolved,
    setHint,
    setShowHint,
    setPlayingSolo,
    setPlayingSymphony,
    setActivePlayingResidue,
    setShowLevelClearModal,
    setSelectedAlgorithm,
    setSelectedStyle,
    setActiveTab,
  } = useGameStore()

  const isLight = theme === 'light'
  const activeLevel =
    currentLevelId === 99 && customLevel
      ? customLevel
      : CAMPAIGN_LEVELS.find((l) => l.id === currentLevelId) || CAMPAIGN_LEVELS[0]

  const effectiveAlgo = selectedAlgorithm || activeLevel.algorithm || 'Fantaisie-Impromptu'
  const effectiveStyle = selectedStyle || 'Classical'

  const engineRef = useRef<IDockingEngine | null>(null)
  const gameCanvasRef = useRef<GameCanvasHandle>(null)
  const [transforms, setTransforms] = useState<SubunitTransformData[]>([])
  const [engineReady, setEngineReady] = useState(false)
  const [copiedScore, setCopiedScore] = useState(false)
  const [traversalStep, setTraversalStep] = useState<TraversalNoteStep | null>(null)
  const [isRecordingVideo, setIsRecordingVideo] = useState(false)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [mobileControlTab, setMobileControlTab] = useState<'move' | 'rotate'>('move')
  const traversalStepRef = useRef<TraversalNoteStep | null>(null)

  // Compute individual subunit alignment score (0.0 -> 1.0)
  const getSubunitScore = useCallback((tf?: SubunitTransformData) => {
    if (!tf) return 0
    if (tf.is_locked) return 1.0
    if (typeof tf.score === 'number') return tf.score
    const dist = Math.sqrt(tf.position[0] ** 2 + tf.position[1] ** 2 + tf.position[2] ** 2)
    const posScore = Math.max(0, 1 - dist / 24)
    const degDist =
      (Math.abs(tf.euler_deg[0]) + Math.abs(tf.euler_deg[1]) + Math.abs(tf.euler_deg[2])) / 180
    const rotScore = Math.max(0, 1 - degDist)
    return posScore * 0.55 + rotScore * 0.45
  }, [])

  // Play the clean, relaxed 3D Protein Traversal Symphony
  const triggerSolvedTraversal = useCallback(
    async (lvl = activeLevel, algo = effectiveAlgo, style = effectiveStyle) => {
      setPlayingSymphony(true)
      await scheduleProteinTraversal(
        lvl,
        (step) => {
          traversalStepRef.current = step
          setTraversalStep(step)
          setActivePlayingResidue(step.subunitIdx, step.residueIndex)
        },
        () => {
          setPlayingSymphony(false)
          setActivePlayingResidue(null, null)
        },
        algo,
        style,
      )
    },
    [activeLevel, effectiveAlgo, effectiveStyle, setPlayingSymphony, setActivePlayingResidue],
  )

  // Initialize Docking Engine when level changes
  useEffect(() => {
    let active = true
    stopPlayback()
    setEngineReady(false)
    setTraversalStep(null)
    traversalStepRef.current = null

    createDockingEngine(activeLevel.subunits.length).then((eng) => {
      if (!active) return
      activeLevel.subunits.forEach((sub, idx) => {
        eng.configureSubunit(
          idx,
          sub.initialOffset[0],
          sub.initialOffset[1],
          sub.initialOffset[2],
          sub.initialEulerDeg[0],
          sub.initialEulerDeg[1],
          sub.initialEulerDeg[2],
        )
      })
      engineRef.current = eng
      const st = eng.getState()
      setTransforms(st.transforms)
      setAlignmentScore(st.total_alignment)
      setSolved(st.is_solved)
      setEngineReady(true)
    })

    return () => {
      active = false
      stopPlayback()
    }
  }, [activeLevel, setAlignmentScore, setSolved])

  // Sync Engine State after any move/rotation/snap
  const syncEngineState = useCallback(
    (actionSymbol?: string) => {
      const eng = engineRef.current
      if (!eng) return

      const st = eng.getState()
      setTransforms([...st.transforms])
      setAlignmentScore(st.total_alignment)
      setAlignmentAudioFeedback(st.total_alignment)

      if (showHint) {
        const nextH = eng.getHint(activeSubunitIdx)
        setHint(nextH)
      }

      if (st.is_solved && !isLevelSolved) {
        const finalTrail = [...useGameStore.getState().emojiTrail, actionSymbol || '🟩'].join('')
        completeCurrentLevel(finalTrail)
        playLockCelebration()
        setTimeout(() => {
          triggerSolvedTraversal(activeLevel)
        }, 350)
      }
    },
    [
      activeSubunitIdx,
      showHint,
      isLevelSolved,
      activeLevel,
      setAlignmentScore,
      setHint,
      completeCurrentLevel,
      triggerSolvedTraversal,
    ],
  )

  // Movement & Bidirectional Rotation Handlers
  const handleTranslate = useCallback(
    (dx: number, dy: number, dz: number) => {
      if (!engineRef.current || isLevelSolved) return
      let act = 'SlideRight'
      if (dx < 0) act = 'SlideLeft'
      else if (dx > 0) act = 'SlideRight'
      else if (dy > 0) act = 'SlideUp'
      else if (dy < 0) act = 'SlideDown'
      else if (dz > 0) act = 'SlideForward'
      else if (dz < 0) act = 'SlideBack'
      engineRef.current.applyAction(activeSubunitIdx, act)
      recordMove()
      useGameStore.setState((s) => ({ emojiTrail: [...s.emojiTrail, '🟦'] }))
      syncEngineState('🟩')
    },
    [activeSubunitIdx, isLevelSolved, recordMove, syncEngineState],
  )

  const handleRotate = useCallback(
    (axis: 'X' | 'Y' | 'Z', steps: number) => {
      if (!engineRef.current || isLevelSolved) return
      let act = 'RotateXPos'
      if (axis === 'X') act = steps > 0 ? 'RotateXPos' : 'RotateXNeg'
      else if (axis === 'Y') act = steps > 0 ? 'RotateYPos' : 'RotateYNeg'
      else if (axis === 'Z') act = steps > 0 ? 'RotateZPos' : 'RotateZNeg'
      engineRef.current.applyAction(activeSubunitIdx, act)
      recordMove()
      useGameStore.setState((s) => ({ emojiTrail: [...s.emojiTrail, '🔄'] }))
      syncEngineState('🟩')
    },
    [activeSubunitIdx, isLevelSolved, recordMove, syncEngineState],
  )

  const handleSnapSubunit = useCallback(() => {
    if (!engineRef.current || isLevelSolved) return
    const activeTf = transforms[activeSubunitIdx]
    const subScore = getSubunitScore(activeTf)
    if (subScore < 0.85) return

    const snapped = engineRef.current.applyAction(activeSubunitIdx, 'SnapLock')
    if (snapped) {
      recordSnap()
      playLockCelebration()
      syncEngineState('🧲')
    }
  }, [activeSubunitIdx, isLevelSolved, transforms, getSubunitScore, recordSnap, syncEngineState])

  const handleRequestHint = useCallback(() => {
    if (!engineRef.current) return
    const nextH = engineRef.current.getHint(activeSubunitIdx)
    setHint(nextH)
    if (!showHint) {
      recordHint()
      setShowHint(true)
    } else {
      setShowHint(false)
    }
  }, [activeSubunitIdx, showHint, recordHint, setHint, setShowHint])

  const handleResetLevel = useCallback(() => {
    if (!engineRef.current) return
    stopPlayback()
    engineRef.current.resetAll()
    resetCurrentLevelStats()
    setSolved(false)
    setShowHint(false)
    setShowLevelClearModal(false)
    setTraversalStep(null)
    traversalStepRef.current = null
    const st = engineRef.current.getState()
    setTransforms([...st.transforms])
    setAlignmentScore(st.total_alignment)
    gameCanvasRef.current?.fitView()
  }, [resetCurrentLevelStats, setSolved, setShowHint, setShowLevelClearModal, setAlignmentScore])

  // Solo Subunit Tune Playback using active algorithm and style
  const handlePlaySoloSubunit = useCallback(
    async (subIdx: number) => {
      setActiveSubunitIdx(subIdx)
      if (isPlayingSolo && activeSubunitIdx === subIdx) {
        stopPlayback()
        setPlayingSolo(false, null)
        return
      }

      const sub = activeLevel.subunits[subIdx]
      if (!sub) return

      setPlayingSolo(true, subIdx)
      const preset = STYLE_PRESETS[effectiveStyle] || STYLE_PRESETS['Classical']
      const notes = createSubunitNotes(sub.sequence, effectiveAlgo, subIdx * 40)
      const subScore = getSubunitScore(transforms[subIdx])
      await scheduleSonification(
        notes,
        preset.defaultBpm || 115,
        preset,
        (resIdx) => {
          setActivePlayingResidue(subIdx, resIdx)
        },
        subScore,
      )
    },
    [
      activeLevel,
      activeSubunitIdx,
      isPlayingSolo,
      transforms,
      effectiveAlgo,
      effectiveStyle,
      getSubunitScore,
      setActiveSubunitIdx,
      setPlayingSolo,
      setActivePlayingResidue,
    ],
  )

  // Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          handleTranslate(-1, 0, 0)
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          handleTranslate(1, 0, 0)
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          handleTranslate(0, 1, 0)
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          handleTranslate(0, -1, 0)
          break
        case 'q':
        case 'Q':
          e.preventDefault()
          handleTranslate(0, 0, 1)
          break
        case 'e':
        case 'E':
          e.preventDefault()
          handleTranslate(0, 0, -1)
          break
        case 'x':
          e.preventDefault()
          handleRotate('X', 1)
          break
        case 'X':
          e.preventDefault()
          handleRotate('X', -1)
          break
        case 'y':
          e.preventDefault()
          handleRotate('Y', 1)
          break
        case 'Y':
          e.preventDefault()
          handleRotate('Y', -1)
          break
        case 'z':
          e.preventDefault()
          handleRotate('Z', 1)
          break
        case 'Z':
          e.preventDefault()
          handleRotate('Z', -1)
          break
        case 'h':
        case 'H':
          e.preventDefault()
          handleRequestHint()
          break
        case '1':
        case '2':
        case '3':
        case '4': {
          const idx = Number(e.key) - 1
          if (idx < activeLevel.subunits.length) {
            setActiveSubunitIdx(idx)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleTranslate,
    handleRotate,
    handleRequestHint,
    activeLevel.subunits.length,
    setActiveSubunitIdx,
  ])

  const pct = Math.round(alignmentScore * 100)
  const activeTransform = transforms[activeSubunitIdx]
  const activeSubunitScore = getSubunitScore(activeTransform)
  const activeSubunitPct = Math.round(activeSubunitScore * 100)
  const canSnapActive = activeSubunitScore >= 0.85 && !activeTransform?.is_locked

  // Wordle / Strands Shareable Scorecard Text
  const emojiSummary = (emojiTrail.length > 0 ? emojiTrail.slice(-14).join('') : '🟦🟦🟩') + '🧬🎵'
  const shareText = `SnapFold #${activeLevel.levelNumber}: ${activeLevel.title} 🧬\nSolved in ${movesCount} moves · 💡 ${hintsUsed} hints · 🧲 ${snapsUsed} snaps\n${emojiSummary}\nPlay at https://github.com/Rawqeeeb/SnapFold`

  const handleCopyScorecard = () => {
    navigator.clipboard?.writeText(shareText)
    setCopiedScore(true)
    setTimeout(() => setCopiedScore(false), 2500)
  }

  // Download Scorecard as a Crisp Shareable PNG Card
  const handleDownloadScorecardPng = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 840
    canvas.height = 460
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = isLight ? '#F8FAFC' : '#0B0F17'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#FF5500'
    ctx.lineWidth = 6
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24)

    ctx.fillStyle = '#FF5500'
    ctx.fillRect(42, 42, 54, 54)
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 26px "JetBrains Mono", monospace'
    ctx.fillText('SF', 53, 78)

    ctx.fillStyle = isLight ? '#0F172A' : '#E2E8F0'
    ctx.font = 'bold 30px "JetBrains Mono", monospace'
    ctx.fillText('SnapFold — 3D Protein Scorecard', 112, 72)

    ctx.fillStyle = '#0369A1'
    ctx.font = '18px "JetBrains Mono", monospace'
    ctx.fillText(
      `Level ${activeLevel.levelNumber}: ${activeLevel.title} (${activeLevel.pdbCode}) · ${activeLevel.difficulty}`,
      112,
      102,
    )

    ctx.fillStyle = isLight ? '#E2E8F0' : '#111827'
    ctx.fillRect(42, 135, canvas.width - 84, 115)

    const stats = [
      { label: 'MOVES', val: String(movesCount), col: isLight ? '#0F172A' : '#E2E8F0' },
      { label: 'HINTS 💡', val: String(hintsUsed), col: '#EA580C' },
      { label: 'SNAPS 🧲', val: String(snapsUsed), col: '#0369A1' },
      { label: 'ALIGNMENT', val: '100% ✓', col: '#047857' },
    ]
    stats.forEach((st, idx) => {
      const x = 85 + idx * 185
      ctx.fillStyle = st.col
      ctx.font = 'bold 36px "JetBrains Mono", monospace'
      ctx.fillText(st.val, x, 192)
      ctx.fillStyle = isLight ? '#334155' : '#94A3B8'
      ctx.font = '14px "JetBrains Mono", monospace'
      ctx.fillText(st.label, x, 224)
    })

    ctx.fillStyle = isLight ? '#0F172A' : '#E2E8F0'
    ctx.font = '16px "JetBrains Mono", monospace'
    ctx.fillText(
      `Summary: Used ${hintsUsed} 💡 hints and ${snapsUsed} 🧲 snaps in ${movesCount} moves`,
      42,
      295,
    )

    ctx.font = '32px sans-serif'
    ctx.fillText(emojiSummary, 42, 348)

    ctx.fillStyle = isLight ? '#334155' : '#94A3B8'
    ctx.font = '14px "JetBrains Mono", monospace'
    ctx.fillText(
      `Sonification: ${ALGORITHM_LABELS[effectiveAlgo]} · Style: ${GENRE_LABELS[effectiveStyle]}`,
      42,
      405,
    )

    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `snapfold-level-${activeLevel.levelNumber}-scorecard.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Record & Download 3D Symphony Video WITHOUT ANY CLUTTER OR CARDS OBSCURING THE PROTEIN
  const handleDownloadSymphonyVideo = async () => {
    const glCanvas = gameCanvasRef.current?.getCanvas()
    if (!glCanvas || isRecordingVideo) return

    setIsRecordingVideo(true)
    setRecordingProgress(5)

    const compCanvas = document.createElement('canvas')
    compCanvas.width = 960
    compCanvas.height = 540
    const ctx = compCanvas.getContext('2d')
    if (!ctx) {
      setIsRecordingVideo(false)
      return
    }

    let animActive = true
    const renderCompositeFrame = () => {
      if (!animActive) return
      // Draw background
      ctx.fillStyle = isLight ? '#F8FAFC' : '#0B0F17'
      ctx.fillRect(0, 0, compCanvas.width, compCanvas.height)

      // Draw 100% unobstructed 3D Canvas
      ctx.drawImage(glCanvas, 0, 0, compCanvas.width, compCanvas.height)

      // Only a sleek, minimal, translucent 32px footer strip at the very bottom edge so the protein is 100% visible
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
      ctx.fillRect(0, compCanvas.height - 34, compCanvas.width, 34)

      const st = traversalStepRef.current
      if (st) {
        ctx.fillStyle = '#FF5500'
        ctx.fillRect(0, compCanvas.height - 34, compCanvas.width * (st.globalStep / Math.max(1, st.totalSteps)), 2.5)

        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 13px "JetBrains Mono", monospace'
        ctx.fillText(
          `SnapFold: ${activeLevel.title} · Note ${st.noteName} (${st.chainName}) · Residue #${st.residueIndex} (${st.aminoAcid})`,
          16,
          compCanvas.height - 12,
        )

        ctx.fillStyle = '#94A3B8'
        ctx.font = '12px "JetBrains Mono", monospace'
        ctx.fillText(
          `${st.globalStep}/${st.totalSteps} · ${GENRE_LABELS[effectiveStyle]}`,
          compCanvas.width - 200,
          compCanvas.height - 12,
        )
      }

      requestAnimationFrame(renderCompositeFrame)
    }
    requestAnimationFrame(renderCompositeFrame)

    const videoStream = compCanvas.captureStream(30)
    const audioStream = getAudioRecordingStream()
    const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()]
    if (audioStream) {
      combinedTracks.push(...audioStream.getAudioTracks())
    }
    const combinedStream = new MediaStream(combinedTracks)

    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ]
    const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(
      combinedStream,
      supportedMime ? { mimeType: supportedMime } : undefined,
    )

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      animActive = false
      const blob = new Blob(chunks, { type: supportedMime || 'video/webm' })
      const ext = supportedMime.includes('mp4') ? 'mp4' : 'webm'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `snapfold-level-${activeLevel.levelNumber}-${activeLevel.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setIsRecordingVideo(false)
      setRecordingProgress(0)
    }

    recorder.start(100)

    setPlayingSymphony(true)
    await scheduleProteinTraversal(
      activeLevel,
      (step) => {
        traversalStepRef.current = step
        setTraversalStep(step)
        setActivePlayingResidue(step.subunitIdx, step.residueIndex)
        setRecordingProgress(Math.round((step.globalStep / Math.max(1, step.totalSteps)) * 100))
      },
      () => {
        setPlayingSymphony(false)
        setActivePlayingResidue(null, null)
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop()
        }, 350)
      },
      effectiveAlgo,
      effectiveStyle,
    )
  }

  // Check if a button matches the current Hint
  const isHintMatch = (actionName: string, dir?: number) => {
    if (!showHint || !hint) return false
    if (hint.action === actionName) return true
    if (actionName === 'RotateX' && hint.axis === 'X' && hint.direction === dir) return true
    if (actionName === 'RotateY' && hint.axis === 'Y' && hint.direction === dir) return true
    if (actionName === 'RotateZ' && hint.axis === 'Z' && hint.direction === dir) return true
    return false
  }

  // Design System Color Tokens (High contrast, readable everywhere)
  const panelClass = isLight
    ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
    : 'bg-[#0B0F17] border-[#1E293B] text-[#E2E8F0]'
  const subCardBase = isLight
    ? 'bg-slate-50 border-slate-200 text-slate-900'
    : 'bg-[#111827] border-[#1E293B] text-[#E2E8F0]'
  const btnClass = isLight
    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900 font-semibold shadow-xs'
    : 'bg-[#111827] hover:bg-[#1E293B] border-[#1E293B] text-[#E2E8F0] font-semibold'
  const mutedText = isLight ? 'text-slate-600' : 'text-[#94A3B8]'
  const orangeText = isLight ? 'text-orange-600' : 'text-[#FF5500]'
  const blueText = isLight ? 'text-sky-700' : 'text-[#00F5D4]'
  const greenText = isLight ? 'text-emerald-700' : 'text-emerald-400'

  return (
    <div className="relative w-full h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
      {/* ── 1. Top Level & Overall Progress Bar (No Wikipedia during game!) ── */}
      <div
        className={`shrink-0 border-b px-2.5 sm:px-4 py-2 flex items-center justify-between gap-2 ${panelClass}`}
      >
        {/* Left: Compact Level Selector */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 sm:pb-0 no-scrollbar">
          {CAMPAIGN_LEVELS.map((lvl) => {
            const isUnlocked =
              lvl.id === 1 ||
              completedLevelIds.includes(lvl.id - 1) ||
              completedLevelIds.includes(lvl.id) ||
              devBypassUnlocked
            const isCurrent = lvl.id === currentLevelId
            const isCleared = completedLevelIds.includes(lvl.id)

            return (
              <button
                key={lvl.id}
                disabled={!isUnlocked}
                onClick={() => selectLevel(lvl.id)}
                className={`w-7 h-7 sm:w-8 sm:h-8 text-xs font-mono rounded-lg border transition-all shrink-0 flex items-center justify-center font-bold ${
                  isCurrent
                    ? 'bg-[#FF5500] text-black border-[#FF5500] shadow-sm'
                    : isCleared
                      ? isLight
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : isUnlocked
                        ? btnClass
                        : isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'opacity-35 cursor-not-allowed border-transparent text-slate-500'
                }`}
                title={`Level ${lvl.id}: ${lvl.title}`}
              >
                {lvl.id}
                {isCleared ? '✓' : ''}
              </button>
            )
          })}
          {customLevel && (
            <button
              onClick={() => selectLevel(99)}
              className={`px-2 h-7 sm:h-8 text-xs font-mono rounded-lg border font-bold shrink-0 ${
                currentLevelId === 99
                  ? 'bg-[#FF5500] text-black border-[#FF5500]'
                  : 'border-sky-600 text-sky-700'
              }`}
            >
              Custom
            </button>
          )}
        </div>

        {/* Center: Protein Level Name (Clean, no Wikipedia button while playing) */}
        <div className="hidden sm:flex items-center gap-2">
          <span
            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
              activeLevel.difficulty === 'Easy'
                ? isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300'
                : activeLevel.difficulty === 'Medium'
                  ? isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300'
                  : isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/20 text-rose-300'
            }`}
          >
            {activeLevel.difficulty}
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold truncate max-w-[200px] lg:max-w-none">
            {activeLevel.title}
          </span>
        </div>

        {/* Right: Alignment Total % */}
        <div className="flex items-center gap-2">
          <div className="w-16 sm:w-24 h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-300/80 dark:border-slate-700">
            <div
              className={`h-full transition-all duration-200 ${
                pct >= 100 ? 'bg-emerald-600' : pct >= 85 ? 'bg-sky-600' : 'bg-[#FF5500]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`text-xs sm:text-sm font-mono font-extrabold tabular-nums ${
              pct >= 100 ? greenText : pct >= 85 ? blueText : orangeText
            }`}
          >
            {pct}%
          </span>
        </div>
      </div>

      {/* ── 2. Mobile Subunit Selector Bar (< lg screens) ────────────────── */}
      <div
        className={`lg:hidden shrink-0 border-b px-2.5 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#111827] border-[#1E293B]'
        }`}
      >
        {activeLevel.subunits.map((sub, idx) => {
          const isSelected = idx === activeSubunitIdx
          const tf = transforms[idx]
          const subPct = Math.round(getSubunitScore(tf) * 100)
          const isSoloThis = isPlayingSolo && activeSubunitIdx === idx

          return (
            <button
              key={sub.id}
              onClick={() => setActiveSubunitIdx(idx)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono shrink-0 transition-all ${
                isSelected
                  ? isLight
                    ? 'bg-white border-2 border-[#FF5500] text-slate-900 shadow-xs font-bold'
                    : 'bg-[#1E293B] border-2 border-[#FF5500] text-[#E2E8F0] font-bold'
                  : `${subCardBase} font-medium`
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: sub.color }}
              />
              <span className="truncate max-w-[90px]">{sub.name}</span>
              <span
                className={`text-[10px] px-1 rounded font-bold ${
                  subPct >= 100
                    ? 'text-emerald-600 font-extrabold'
                    : subPct >= 85
                      ? 'text-sky-700 font-bold'
                      : mutedText
                }`}
              >
                {subPct >= 100 ? '✓' : `${subPct}%`}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  handlePlaySoloSubunit(idx)
                }}
                className="p-0.5 text-[10px] text-orange-600 font-bold"
              >
                {isSoloThis ? '■' : '♪'}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── 3. Main Body: 3D Viewport on Left + Sidebar / Dock on Right ────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Interactive 3D Viewport */}
        <div className="flex-1 min-h-0 relative">
          {engineReady && (
            <GameCanvas
              ref={gameCanvasRef}
              level={activeLevel}
              transforms={transforms}
              activeSubunitIdx={activeSubunitIdx}
              onSelectSubunit={setActiveSubunitIdx}
              showHint={showHint}
            />
          )}

          {/* Unsolved Clue / Hint Floating Pill */}
          {!isLevelSolved && (
            <div className="absolute top-2.5 left-2.5 right-2.5 sm:right-auto sm:max-w-md pointer-events-none flex flex-col gap-1.5 z-10">
              {showHint && hint ? (
                <div
                  className={`px-3 py-1.5 rounded-lg border-2 border-[#FF5500] text-xs font-mono font-bold shadow-md ${
                    isLight ? 'bg-orange-50 text-orange-900' : 'bg-[#111827] text-[#FF5500]'
                  }`}
                >
                  💡 Next Step: {hint.description}
                </div>
              ) : (
                <div
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono shadow-xs ${
                    isLight
                      ? 'bg-white/90 border-slate-300 text-slate-800'
                      : 'bg-[#0B0F17]/90 border-[#1E293B] text-[#E2E8F0]'
                  }`}
                >
                  <span className={`font-bold mr-1 ${orangeText}`}>Goal:</span>
                  <span>{activeLevel.clue}</span>
                </div>
              )}
            </div>
          )}

          {/* Solved HUD: Located at BOTTOM of Viewport so the 3D protein is 100% visible and unblocked! */}
          {isLevelSolved && (
            <div className="absolute bottom-14 left-3 right-3 pointer-events-auto flex justify-center z-10">
              <div
                className={`p-2.5 px-4 rounded-xl border-2 border-emerald-500 shadow-lg backdrop-blur-md max-w-xl w-full flex items-center justify-between gap-3 ${
                  isLight ? 'bg-white/95 text-slate-900' : 'bg-[#0B0F17]/95 text-[#E2E8F0]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-mono font-bold text-xs truncate">
                    {traversalStep
                      ? `♪ ${traversalStep.noteName} · ${traversalStep.chainName} · Res #${traversalStep.residueIndex}`
                      : '✓ 100% Solved — Playing 3D Symphony'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => triggerSolvedTraversal(activeLevel)}
                    className="px-2.5 py-1 rounded-lg bg-[#FF5500] hover:bg-[#FF6A1A] text-black font-mono text-xs font-bold"
                  >
                    {isPlayingSymphony ? 'Restart' : '▶ Play'}
                  </button>
                  <button
                    onClick={() => setShowLevelClearModal(true)}
                    className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${btnClass}`}
                  >
                    Scorecard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 4. Controls: Desktop Right Sidebar OR Simplified Mobile Bottom Dock ── */}
        <aside
          className={`shrink-0 border-t lg:border-t-0 lg:border-l lg:w-[320px] xl:w-[350px] lg:overflow-y-auto px-2.5 sm:px-4 py-2 lg:p-4 flex flex-col gap-3 ${panelClass}`}
        >
          {/* Desktop Subunit List with Progress Bars */}
          <div className="hidden lg:flex flex-col gap-1.5">
            <div className={`flex items-center justify-between text-xs font-mono font-bold uppercase ${mutedText}`}>
              <span>Subunits</span>
              <span>Alignment</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {activeLevel.subunits.map((sub, idx) => {
                const isSelected = idx === activeSubunitIdx
                const tf = transforms[idx]
                const subPct = Math.round(getSubunitScore(tf) * 100)
                const isSoloThis = isPlayingSolo && activeSubunitIdx === idx

                return (
                  <div
                    key={sub.id}
                    onClick={() => setActiveSubunitIdx(idx)}
                    className={`p-2 rounded-xl border text-xs font-mono cursor-pointer transition-all ${
                      isSelected
                        ? isLight
                          ? 'bg-orange-50 border-2 border-[#FF5500] text-slate-900 shadow-xs'
                          : 'bg-[#1E293B] border-2 border-[#FF5500] text-[#E2E8F0]'
                        : `${subCardBase} hover:border-slate-300`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: sub.color }}
                        />
                        <span className="font-bold truncate">{sub.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlaySoloSubunit(idx)
                        }}
                        className={`px-2 py-0.5 text-[11px] rounded border font-bold shrink-0 transition-colors ${
                          isSoloThis
                            ? 'bg-[#FF5500] text-black border-[#FF5500]'
                            : isLight
                              ? 'bg-white border-slate-300 text-slate-800 hover:border-[#FF5500]'
                              : 'bg-[#0B0F17] border-slate-700 text-slate-200 hover:border-[#FF5500]'
                        }`}
                        title="Listen to this subunit's solo melody"
                      >
                        {isSoloThis ? '■ Stop' : '♪ Tune'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-300/80 dark:border-slate-700">
                        <div
                          className={`h-full transition-all duration-200 ${
                            subPct >= 100 ? 'bg-emerald-600' : subPct >= 85 ? 'bg-sky-600' : 'bg-[#FF5500]'
                          }`}
                          style={{ width: `${subPct}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold tabular-nums shrink-0 ${
                          subPct >= 100 ? greenText : subPct >= 85 ? blueText : orangeText
                        }`}
                      >
                        {subPct >= 100 ? '100% ✓' : `${subPct}%`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {!isLevelSolved ? (
            /* Unsolved Controls */
            <div className="flex flex-col gap-2.5">
              {/* Mobile Tabbed Switcher: Move vs Rotate to prevent clutter */}
              <div className="lg:hidden flex rounded-lg p-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                <button
                  onClick={() => setMobileControlTab('move')}
                  className={`flex-1 py-1 text-xs font-mono font-bold rounded-md transition-colors ${
                    mobileControlTab === 'move'
                      ? 'bg-white dark:bg-slate-900 text-black dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  1. Move Subunit
                </button>
                <button
                  onClick={() => setMobileControlTab('rotate')}
                  className={`flex-1 py-1 text-xs font-mono font-bold rounded-md transition-colors ${
                    mobileControlTab === 'rotate'
                      ? 'bg-white dark:bg-slate-900 text-black dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  2. Turn &amp; Spin
                </button>
              </div>

              {/* 1. Move Pad (Visible on Desktop OR when mobile tab is 'move') */}
              <div className={`${mobileControlTab === 'move' ? 'flex' : 'hidden'} lg:flex flex-col gap-1.5`}>
                <div className={`hidden lg:flex items-center justify-between text-xs font-mono font-bold ${mutedText}`}>
                  <span>1. Move Subunit</span>
                </div>
                <div className="grid grid-cols-6 lg:grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleTranslate(-1, 0, 0)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('SlideLeft') ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ← Left
                  </button>
                  <button
                    onClick={() => handleTranslate(1, 0, 0)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('SlideRight') ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    Right →
                  </button>
                  <button
                    onClick={() => handleTranslate(0, 1, 0)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('SlideUp') ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↑ Up
                  </button>
                  <button
                    onClick={() => handleTranslate(0, -1, 0)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('SlideDown') ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↓ Down
                  </button>
                  <button
                    onClick={() => handleTranslate(0, 0, 1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('SlideForward') ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ⊕ Closer
                  </button>
                  <button
                    onClick={() => handleTranslate(0, 0, -1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('SlideBack') ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ⊖ Further
                  </button>
                </div>
              </div>

              {/* 2. Turn Pad (Visible on Desktop OR when mobile tab is 'rotate') */}
              <div className={`${mobileControlTab === 'rotate' ? 'flex' : 'hidden'} lg:flex flex-col gap-1.5`}>
                <div className={`hidden lg:flex items-center justify-between text-xs font-mono font-bold ${mutedText}`}>
                  <span>2. Turn &amp; Spin</span>
                </div>
                <div className="grid grid-cols-6 lg:grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleRotate('X', -1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('RotateX', -1) ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↺ Tilt Up
                  </button>
                  <button
                    onClick={() => handleRotate('X', 1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('RotateX', 1) ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↻ Tilt Down
                  </button>
                  <button
                    onClick={() => handleRotate('Y', -1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('RotateY', -1) ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↺ Turn Left
                  </button>
                  <button
                    onClick={() => handleRotate('Y', 1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('RotateY', 1) ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↻ Turn Right
                  </button>
                  <button
                    onClick={() => handleRotate('Z', -1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('RotateZ', -1) ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↶ Spin Left
                  </button>
                  <button
                    onClick={() => handleRotate('Z', 1)}
                    className={`py-2 text-xs font-mono rounded-lg border active:scale-95 ${btnClass} ${
                      isHintMatch('RotateZ', 1) ? 'ring-2 ring-[#FF5500] bg-orange-500/20' : ''
                    }`}
                  >
                    ↷ Spin Right
                  </button>
                </div>
              </div>

              {/* 3. Assist & Snap Action Bar */}
              <div className="grid grid-cols-3 lg:grid-cols-1 gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={handleRequestHint}
                  className={`py-2 text-xs font-mono font-bold rounded-lg border transition-colors ${
                    showHint
                      ? 'bg-[#FF5500] text-black border-[#FF5500]'
                      : isLight
                        ? 'bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100'
                        : 'border-[#FF5500]/60 text-[#FF5500] hover:bg-[#FF5500]/10'
                  }`}
                >
                  💡 Hint {showHint ? '(On)' : ''}
                </button>
                <button
                  onClick={handleSnapSubunit}
                  disabled={!canSnapActive}
                  className={`py-2 text-xs font-mono font-bold rounded-lg border transition-colors ${
                    canSnapActive
                      ? 'bg-emerald-500 text-black border-emerald-600 hover:bg-emerald-400 shadow-sm animate-pulse'
                      : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'opacity-40 cursor-not-allowed border-slate-700 text-slate-500'
                  }`}
                  title={
                    canSnapActive
                      ? 'Snap subunit into place'
                      : `Snap unlocks at 85% alignment (currently ${activeSubunitPct}%)`
                  }
                >
                  🧲 Snap ({activeSubunitPct}%)
                </button>
                <button
                  onClick={handleResetLevel}
                  className={`py-2 text-xs font-mono rounded-lg border ${btnClass}`}
                  title="Reset positions"
                >
                  ↺ Reset
                </button>
              </div>

              {/* 4. Sonification Algorithm & Style (Genre) Selectors */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                <div className={`text-[11px] font-mono font-bold uppercase ${mutedText}`}>
                  Sound &amp; Style Settings
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-mono uppercase mb-0.5 ${mutedText}`}>
                      Algorithm
                    </label>
                    <select
                      value={effectiveAlgo}
                      onChange={(e) => setSelectedAlgorithm(e.target.value as SonifyAlgorithm)}
                      className={`w-full rounded-md border px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#FF5500] ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0B0F17] border-slate-700 text-[#E2E8F0]'
                      }`}
                    >
                      <option value="Fantaisie-Impromptu">Fantaisie-Impromptu</option>
                      <option value="Algo-I">Sonifyed I (Hydrophobicity)</option>
                      <option value="Algo-II">Sonifyed II (Reduced 4-Note)</option>
                      <option value="Algo-III">Sonifyed III (+ Chords)</option>
                      <option value="Algo-IV">Sonifyed IV (Sequence Entropy)</option>
                      <option value="Algo-V">Sonifyed V (+ Harmonics)</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-[10px] font-mono uppercase mb-0.5 ${mutedText}`}>
                      Music Genre
                    </label>
                    <select
                      value={effectiveStyle}
                      onChange={(e) => setSelectedStyle(e.target.value as MusicalStyle)}
                      className={`w-full rounded-md border px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#FF5500] ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0B0F17] border-slate-700 text-[#E2E8F0]'
                      }`}
                    >
                      <option value="Classical">Classical Piano</option>
                      <option value="Jazz">Jazz (Swing)</option>
                      <option value="Punk">Rock / Punk</option>
                      <option value="Ambient">Ambient</option>
                      <option value="Lo-Fi">Lo-Fi Chill</option>
                      <option value="Synthwave">Synthwave 80s</option>
                      <option value="Techno">Techno</option>
                      <option value="Afrobeat">Afrobeat</option>
                      <option value="Folk">Folk Acoustic</option>
                      <option value="Default">Standard Synth</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Solved Action Panel */
            <div className="flex flex-col gap-2.5">
              <div className={`p-3 rounded-xl border ${subCardBase}`}>
                <div className="text-xs font-mono font-bold">
                  Solved in <span className="font-extrabold">{movesCount} moves</span> ·{' '}
                  <span className={orangeText}>{hintsUsed} 💡</span> ·{' '}
                  <span className={blueText}>{snapsUsed} 🧲</span>
                </div>
                <div className="text-base tracking-widest mt-1 select-all">{emojiSummary}</div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleCopyScorecard}
                  className="w-full py-2.5 rounded-lg bg-[#FF5500] hover:bg-[#FF6A1A] text-black text-xs font-mono font-bold transition-colors shadow-xs"
                >
                  {copiedScore ? '✓ Copied Scorecard!' : '📋 Copy Emoji Score'}
                </button>

                <button
                  onClick={handleDownloadScorecardPng}
                  className={`w-full py-2.5 rounded-lg border text-xs font-mono font-bold ${btnClass}`}
                >
                  📥 Download Scorecard (.png)
                </button>

                <button
                  onClick={handleDownloadSymphonyVideo}
                  disabled={isRecordingVideo}
                  className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-mono font-bold disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isRecordingVideo
                    ? `🎬 Recording Video (${recordingProgress}%)…`
                    : '🎬 Download 3D Symphony Video'}
                </button>

                {/* Wikipedia button only appears after solving! */}
                <a
                  href={activeLevel.wikipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full py-2 rounded-lg border text-center text-xs font-mono font-bold ${btnClass}`}
                >
                  📖 Learn on Wikipedia ↗
                </a>

                {activeLevel.id < CAMPAIGN_LEVELS.length ? (
                  <button
                    onClick={() => {
                      stopPlayback()
                      nextLevel()
                    }}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold shadow-xs"
                  >
                    Next Level ({activeLevel.id + 1}) →
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      stopPlayback()
                      setActiveTab('custom')
                    }}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold shadow-xs"
                  >
                    🧬 Fold Your Own Protein →
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ── Optional Scorecard Modal ───────────────────────────────────────── */}
      {showLevelClearModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowLevelClearModal(false)}
        >
          <div
            className={`max-w-md w-full rounded-2xl border p-6 space-y-5 shadow-2xl ${panelClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                  Level {activeLevel.levelNumber} Solved
                </span>
                <h2 className="text-lg font-mono font-bold mt-1">{activeLevel.title}</h2>
                <p className={`text-xs font-mono ${mutedText}`}>{activeLevel.moleculeName}</p>
              </div>
              <button
                onClick={() => setShowLevelClearModal(false)}
                className={`text-sm font-mono px-2.5 py-1 rounded-lg ${btnClass}`}
              >
                ✕
              </button>
            </div>

            <div className={`p-4 rounded-xl border space-y-3 ${subCardBase}`}>
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2 rounded-lg border border-current/15">
                  <div className="text-lg font-bold">{movesCount}</div>
                  <div className={`text-[10px] font-bold ${mutedText}`}>MOVES</div>
                </div>
                <div className="p-2 rounded-lg border border-current/15">
                  <div className={`text-lg font-bold ${orangeText}`}>{hintsUsed} 💡</div>
                  <div className={`text-[10px] font-bold ${mutedText}`}>HINTS</div>
                </div>
                <div className="p-2 rounded-lg border border-current/15">
                  <div className={`text-lg font-bold ${blueText}`}>{snapsUsed} 🧲</div>
                  <div className={`text-[10px] font-bold ${mutedText}`}>SNAPS</div>
                </div>
              </div>

              <div className="text-center font-mono text-xs font-medium">
                Used <strong>{hintsUsed} 💡 hints</strong> and{' '}
                <strong>{snapsUsed} 🧲 snaps</strong> in <strong>{movesCount} moves</strong>
              </div>
              <div className="text-center text-xl tracking-widest select-all py-1">
                {emojiSummary}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleCopyScorecard}
                  className="py-2 rounded-lg bg-[#FF5500] hover:bg-[#FF6A1A] text-black font-mono text-xs font-bold"
                >
                  {copiedScore ? '✓ Copied!' : '📋 Copy Score'}
                </button>
                <button
                  onClick={handleDownloadScorecardPng}
                  className={`py-2 rounded-lg border font-mono text-xs font-bold ${btnClass}`}
                >
                  📥 Download PNG
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setShowLevelClearModal(false)
                  handleDownloadSymphonyVideo()
                }}
                disabled={isRecordingVideo}
                className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-mono text-xs font-bold"
              >
                🎬 Record &amp; Download 3D Symphony Video
              </button>

              <a
                href={activeLevel.wikipediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full py-2 rounded-lg border text-center font-mono text-xs font-bold ${btnClass}`}
              >
                📖 Learn About {activeLevel.title} on Wikipedia ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
