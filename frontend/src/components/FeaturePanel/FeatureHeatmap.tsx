import { useProteinStore } from '../../store/proteinStore'

// Minimalist Secondary Structure representations
const SS_ROWS: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'H', label: 'Helix', color: '#FF5500', bg: '#1E293B' },
  { key: 'E', label: 'Sheet', color: '#00F5D4', bg: '#1E293B' },
  { key: 'C', label: 'Coil',  color: '#64748B', bg: '#111827' },
]

function SegmentBar({
  ssArray,
  typeKey,
  color,
  bg,
  activeIdx,
}: {
  ssArray: string[]
  typeKey: string
  color: string
  bg: string
  activeIdx: number
}) {
  return (
    <div className="flex flex-1 h-3 rounded overflow-hidden bg-[#0B0F17] border border-[#1E293B]">
      {ssArray.map((v, i) => {
        const isMatch = v === typeKey
        const isActive = i === activeIdx
        return (
          <div
            key={i}
            title={`Residue ${i + 1}: ${v}`}
            className="flex-1 transition-all"
            style={{
              backgroundColor: isActive ? '#FFFFFF' : isMatch ? color : bg,
              minWidth: 2,
              opacity: isActive ? 1 : isMatch ? 0.9 : 0.3,
            }}
          />
        )
      })}
    </div>
  )
}

export function FeatureHeatmap() {
  const { featureVectors, sequence, currentResidue } = useProteinStore()

  if (!featureVectors || !sequence) {
    return (
      <div className="p-4 border border-dashed border-[#1E293B] rounded text-center text-xs font-mono text-[#64748B]">
        Predict or load a protein sequence to visualize secondary structural features
      </div>
    )
  }

  const { secondary_structure: ss } = featureVectors

  return (
    <div className="flex flex-col gap-2.5 font-mono text-xs">
      {SS_ROWS.map(({ key, label, color, bg }) => (
        <div key={key} className="flex items-center gap-3">
          <div
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="w-10 text-[11px] text-[#94A3B8] shrink-0">{label}</span>
          <SegmentBar
            ssArray={ss}
            typeKey={key}
            color={color}
            bg={bg}
            activeIdx={currentResidue}
          />
          <span className="text-[10px] text-[#64748B] shrink-0 w-20 text-right">
            {ss.filter((v) => v === key).length} res
          </span>
        </div>
      ))}
    </div>
  )
}
