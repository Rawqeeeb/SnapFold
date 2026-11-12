import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DockingHintData } from '../wasm/wasmBridge'
import { CAMPAIGN_LEVELS, type GameLevel } from '../game/levels'

export interface LevelScoreRecord {
  hints: number
  snaps: number
  moves: number
  emojis: string
}

interface GameState {
  theme: 'dark' | 'light'
  currentLevelId: number
  customLevel: GameLevel | null
  completedLevelIds: number[]
  devBypassUnlocked: boolean
  activeSubunitIdx: number
  alignmentScore: number
  subunitScores: number[]
  isLevelSolved: boolean
  isPlayingSolo: boolean
  isPlayingSymphony: boolean
  activePlayingSubunit: number | null
  activePlayingResidue: number | null
  hint: DockingHintData | null
  showHint: boolean
  showControlsGuide: boolean
  showLevelClearModal: boolean

  // Current level telemetry for Wordle/Strands style scorecard
  hintsUsed: number
  snapsUsed: number
  movesCount: number
  emojiTrail: string[]
  levelScores: Record<number, LevelScoreRecord>

  // Navigation tab: 'game' | 'custom' | 'docs' | 'about'
  activeTab: 'game' | 'custom' | 'docs' | 'about'

  // Actions
  toggleTheme: () => void
  selectLevel: (id: number) => void
  startCustomLevel: (lvl: GameLevel) => void
  nextLevel: () => void
  completeCurrentLevel: (finalEmojis?: string) => void
  recordMove: () => void
  recordHint: () => void
  recordSnap: () => void
  resetCurrentLevelStats: () => void
  toggleDevBypass: () => void
  setActiveSubunitIdx: (idx: number) => void
  setAlignmentScore: (score: number, subunitScores?: number[]) => void
  setSolved: (solved: boolean) => void
  setHint: (hint: DockingHintData | null) => void
  setShowHint: (show: boolean) => void
  setPlayingSolo: (playing: boolean, subunitIdx?: number | null) => void
  setPlayingSymphony: (playing: boolean) => void
  setActivePlayingResidue: (subIdx: number | null, resIdx: number | null) => void
  setShowControlsGuide: (show: boolean) => void
  setShowLevelClearModal: (show: boolean) => void
  setActiveTab: (tab: 'game' | 'custom' | 'docs' | 'about') => void
  resetLevelProgress: () => void
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      theme: 'light', // Light mode is now the default
      currentLevelId: 1,
      customLevel: null,
      completedLevelIds: [],
      devBypassUnlocked: false,
      activeSubunitIdx: 1,
      alignmentScore: 0.5,
      subunitScores: [1.0, 0.5],
      isLevelSolved: false,
      isPlayingSolo: false,
      isPlayingSymphony: false,
      activePlayingSubunit: null,
      activePlayingResidue: null,
      hint: null,
      showHint: false,
      showControlsGuide: false,
      showLevelClearModal: false,

      hintsUsed: 0,
      snapsUsed: 0,
      movesCount: 0,
      emojiTrail: [],
      levelScores: {},

      activeTab: 'game',

      toggleTheme: () => {
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
      },

      selectLevel: (id: number) => {
        set({
          currentLevelId: id,
          activeSubunitIdx: 1, // Default to first movable subunit (B)
          alignmentScore: 0.5,
          isLevelSolved: false,
          isPlayingSolo: false,
          isPlayingSymphony: false,
          activePlayingSubunit: null,
          activePlayingResidue: null,
          hint: null,
          showHint: false,
          showLevelClearModal: false,
          hintsUsed: 0,
          snapsUsed: 0,
          movesCount: 0,
          emojiTrail: [],
          activeTab: 'game',
        })
      },

      startCustomLevel: (lvl: GameLevel) => {
        set({
          customLevel: lvl,
          currentLevelId: 99,
          activeSubunitIdx: 1,
          alignmentScore: 0.4,
          isLevelSolved: false,
          isPlayingSolo: false,
          isPlayingSymphony: false,
          activePlayingSubunit: null,
          activePlayingResidue: null,
          hint: null,
          showHint: false,
          showLevelClearModal: false,
          hintsUsed: 0,
          snapsUsed: 0,
          movesCount: 0,
          emojiTrail: [],
          activeTab: 'game',
        })
      },

      nextLevel: () => {
        const { currentLevelId } = get()
        if (currentLevelId < CAMPAIGN_LEVELS.length) {
          get().selectLevel(currentLevelId + 1)
        }
      },

      completeCurrentLevel: (finalEmojis?: string) => {
        const {
          currentLevelId,
          completedLevelIds,
          hintsUsed,
          snapsUsed,
          movesCount,
          emojiTrail,
          levelScores,
        } = get()
        const updated = Array.from(new Set([...completedLevelIds, currentLevelId]))
        const emojis = finalEmojis || [...emojiTrail, '🧬', '🎵'].join('')
        // Do NOT open showLevelClearModal immediately; let the 3D protein symphony play first!
        set({
          completedLevelIds: updated,
          isLevelSolved: true,
          showLevelClearModal: false,
          levelScores: {
            ...levelScores,
            [currentLevelId]: {
              hints: hintsUsed,
              snaps: snapsUsed,
              moves: movesCount,
              emojis,
            },
          },
        })
      },

      recordMove: () => {
        set((s) => ({
          movesCount: s.movesCount + 1,
        }))
      },

      recordHint: () => {
        set((s) => ({
          hintsUsed: s.hintsUsed + 1,
          emojiTrail: [...s.emojiTrail, '💡'],
        }))
      },

      recordSnap: () => {
        set((s) => ({
          snapsUsed: s.snapsUsed + 1,
          emojiTrail: [...s.emojiTrail, '🧲'],
        }))
      },

      resetCurrentLevelStats: () => {
        set({
          hintsUsed: 0,
          snapsUsed: 0,
          movesCount: 0,
          emojiTrail: [],
        })
      },

      toggleDevBypass: () => {
        set((state) => ({ devBypassUnlocked: !state.devBypassUnlocked }))
      },

      setActiveSubunitIdx: (idx: number) => {
        set({ activeSubunitIdx: idx, hint: null, showHint: false })
      },

      setAlignmentScore: (score: number, subunitScores?: number[]) => {
        set({
          alignmentScore: score,
          ...(subunitScores ? { subunitScores } : {}),
        })
      },

      setSolved: (isLevelSolved: boolean) => {
        set({ isLevelSolved })
      },

      setHint: (hint: DockingHintData | null) => {
        set({ hint })
      },

      setShowHint: (showHint: boolean) => {
        set({ showHint })
      },

      setPlayingSolo: (isPlayingSolo: boolean, subunitIdx = null) => {
        set({
          isPlayingSolo,
          activePlayingSubunit: isPlayingSolo ? subunitIdx : null,
          isPlayingSymphony: false,
          activePlayingResidue: null,
        })
      },

      setPlayingSymphony: (isPlayingSymphony: boolean) => {
        set({
          isPlayingSymphony,
          isPlayingSolo: false,
          activePlayingSubunit: null,
          activePlayingResidue: null,
        })
      },

      setActivePlayingResidue: (subIdx: number | null, resIdx: number | null) => {
        set({ activePlayingSubunit: subIdx, activePlayingResidue: resIdx })
      },

      setShowControlsGuide: (showControlsGuide: boolean) => {
        set({ showControlsGuide })
      },

      setShowLevelClearModal: (showLevelClearModal: boolean) => {
        set({ showLevelClearModal })
      },

      setActiveTab: (activeTab) => {
        set({ activeTab })
      },

      resetLevelProgress: () => {
        set({
          completedLevelIds: [],
          currentLevelId: 1,
          devBypassUnlocked: false,
          levelScores: {},
          hintsUsed: 0,
          snapsUsed: 0,
          movesCount: 0,
          emojiTrail: [],
        })
      },
    }),
    {
      name: 'snapfold-game-storage-v3',
      partialize: (state) => ({
        theme: state.theme,
        completedLevelIds: state.completedLevelIds,
        devBypassUnlocked: state.devBypassUnlocked,
        currentLevelId: state.currentLevelId,
        levelScores: state.levelScores,
        customLevel: state.customLevel,
      }),
    },
  ),
)
