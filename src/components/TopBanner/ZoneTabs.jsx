export default function ZoneTabs({ zones, activeZone, onZoneChange, onZoneHover }) {
  return (
    <div className="zone-tabs">
      {zones.map((zone, i) => (
        <button
          key={zone.id}
          className={`zone-tabs__tab ${activeZone === i ? 'zone-tabs__tab--active' : ''}`}
          onClick={() => onZoneChange(i)}
          onMouseEnter={() => onZoneHover?.(zone.id)}
        >
          {zone.label}
        </button>
      ))}
    </div>
  )
}
