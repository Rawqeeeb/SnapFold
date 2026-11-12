import { useState } from 'react'
import { useProteinStore } from '../../store/proteinStore'
import { useProteinQuery } from '../../hooks/useProteinQuery'
import { parseFASTA } from './SequenceValidator'
import clsx from 'clsx'

export function FASTAInput() {
  const { fasta, setFasta, status } = useProteinStore()
  const { submit } = useProteinQuery()
  const [validationError, setValidationError] = useState('')

  const handleChange = (value: string) => {
    setFasta(value)
    if (value.trim()) {
      const parsed = parseFASTA(value)
      setValidationError(parsed ? '' : 'Invalid FASTA format (A–Z only, 10–2500 residues)')
    } else {
      setValidationError('')
    }
  }

  const handleSubmit = () => {
    const parsed = parseFASTA(fasta)
    if (!parsed) return
    submit()
  }

  const isLoading = status === 'loading'
  const canSubmit = fasta.trim().length > 0 && !validationError && !isLoading

  return (
    <div className="flex flex-col gap-3 font-sans">
      <textarea
        value={fasta}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter UniProt ID (e.g. P01308) or FASTA sequence"
        rows={5}
        spellCheck={false}
        className={clsx(
          'w-full rounded border px-3 py-2 text-xs font-mono text-[#E2E8F0]',
          'placeholder-[#64748B] resize-none focus:outline-none transition-colors bg-[#111827]',
          validationError
            ? 'border-red-500'
            : 'border-[#1E293B] focus:border-[#FF5500]',
        )}
      />

      {validationError && (
        <p className="text-xs text-red-400 font-mono">{validationError}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={clsx(
          'w-full rounded py-2 text-xs font-mono font-medium transition-all border',
          canSubmit
            ? 'bg-[#FF5500] hover:bg-[#FF6A1A] border-[#FF5500] text-black font-semibold'
            : 'bg-[#111827] border-[#1E293B] text-[#64748B] cursor-not-allowed',
        )}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5 text-black" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Sonifying Sequence…
          </span>
        ) : (
          'Analyze & Predict Score'
        )}
      </button>
    </div>
  )
}
