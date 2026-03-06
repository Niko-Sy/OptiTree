// Shared gate configuration & SVG symbol component
// Used by both NodePalette (list icons) and Canvas (rendered nodes)

export const GATE_CONFIG = {
  OR:  { bg: '#fef3c7', color: '#d97706', text: '#92400e' },
  AND: { bg: '#dbeafe', color: '#2563eb', text: '#1e3a8a' },
  NOT: { bg: '#ede9fe', color: '#7c3aed', text: '#4c1d95' },
}

/**
 * GateSymbol — renders the standard logic-gate SVG shape.
 * @param {string} gateLabel  'OR' | 'AND' | 'NOT'
 * @param {number} size       width in px (height auto-scaled to 0.75× ratio)
 */
export function GateSymbol({ gateLabel, size = 40 }) {
  const cfg = GATE_CONFIG[gateLabel] ?? GATE_CONFIG.OR
  const { bg, color } = cfg

  if (gateLabel === 'AND') return (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" fill="none">
      {/* D-shape body: flat left, semicircle right */}
      <path
        d="M5 4 L18 4 Q34 4 34 15 Q34 26 18 26 L5 26 Z"
        stroke={color} strokeWidth="2.2" fill={bg} strokeLinejoin="round"
      />
      {/* Two input lines */}
      <line x1="1" y1="10" x2="5" y2="10" stroke={color} strokeWidth="2"/>
      <line x1="1" y1="20" x2="5" y2="20" stroke={color} strokeWidth="2"/>
      {/* One output line */}
      <line x1="34" y1="15" x2="39" y2="15" stroke={color} strokeWidth="2"/>
    </svg>
  )

  if (gateLabel === 'NOT') return (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" fill="none">
      {/* Triangle body */}
      <polygon
        points="4,4 4,26 26,15"
        stroke={color} strokeWidth="2.2" fill={bg} strokeLinejoin="round"
      />
      {/* Bubble (inversion circle) */}
      <circle cx="29.5" cy="15" r="3.5" stroke={color} strokeWidth="2" fill={bg}/>
      {/* Input line */}
      <line x1="1" y1="15" x2="4" y2="15" stroke={color} strokeWidth="2"/>
      {/* Output line */}
      <line x1="33" y1="15" x2="39" y2="15" stroke={color} strokeWidth="2"/>
    </svg>
  )

  // OR gate — curved shield body
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" fill="none">
      {/* Curved body: pointed right, back-curved left */}
      <path
        d="M5 4 C9 4 26 9 34 15 C26 21 9 26 5 26 C9 18 9 12 5 4 Z"
        stroke={color} strokeWidth="2.2" fill={bg} strokeLinejoin="round"
      />
      {/* Two input lines meeting the back curve */}
      <line x1="1" y1="10" x2="8" y2="10" stroke={color} strokeWidth="2"/>
      <line x1="1" y1="20" x2="8" y2="20" stroke={color} strokeWidth="2"/>
      {/* Output line */}
      <line x1="34" y1="15" x2="39" y2="15" stroke={color} strokeWidth="2"/>
    </svg>
  )
}
