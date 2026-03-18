const ZONES = ['1구역', '2구역', '3구역', '4구역']

export default function ZoneTabs({ activeZone, onZoneChange }) {
  return (
    <div className="zone-tabs">
      {ZONES.map((zone, i) => (
        <button
          key={zone}
          className={`zone-tabs__tab ${activeZone === i ? 'zone-tabs__tab--active' : ''}`}
          onClick={() => onZoneChange(i)}
        >
          {zone}
        </button>
      ))}
    </div>
  )
}
