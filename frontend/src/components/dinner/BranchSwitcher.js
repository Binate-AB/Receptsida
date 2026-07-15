// ============================================
// BranchSwitcher — lane pills for branched meals
// "Gemensamt / Barnens / Vuxnas" during a split
// cooking session. Rendered as overlay by the
// cooking page — CookingMode stays untouched.
// ============================================

'use client';

export function BranchSwitcher({ lanes, activeLane, onSwitch }) {
  if (!lanes || lanes.length <= 1) return null;

  return (
    <div
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] flex p-1 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {lanes.map((lane) => (
        <button
          key={lane.id}
          onClick={() => onSwitch(lane.id)}
          className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
          style={{
            background: activeLane === lane.id ? '#FF6B35' : 'transparent',
            color: activeLane === lane.id ? '#FFF' : 'rgba(255,255,255,0.65)',
          }}
        >
          {lane.label}
        </button>
      ))}
    </div>
  );
}
