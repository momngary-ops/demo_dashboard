/** 날씨 조건별 배경 그라데이션 + 애니메이션 요소 */
const WEATHER_CONFIG = {
  CLEAR:         { gradient: 'linear-gradient(150deg, #38bdf8 0%, #7dd3fc 50%, #bae6fd 100%)', anim: 'sun' },
  PARTLY_CLOUDY: { gradient: 'linear-gradient(150deg, #60a5fa 0%, #93c5fd 50%, #cbd5e1 100%)', anim: 'cloud-light' },
  CLOUDY:        { gradient: 'linear-gradient(150deg, #64748b 0%, #94a3b8 50%, #cbd5e1 100%)', anim: 'cloud-heavy' },
  RAIN:          { gradient: 'linear-gradient(150deg, #1e3a5f 0%, #334155 50%, #475569 100%)', anim: 'rain' },
  HEAVY_RAIN:    { gradient: 'linear-gradient(150deg, #0f172a 0%, #1e293b 50%, #334155 100%)', anim: 'heavy-rain' },
  SNOW:          { gradient: 'linear-gradient(150deg, #e0f2fe 0%, #f0f9ff 80%, #ffffff 100%)', anim: 'snow' },
  NIGHT_CLEAR:   { gradient: 'linear-gradient(150deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)', anim: 'stars' },
  NIGHT_RAIN:    { gradient: 'linear-gradient(150deg, #0c0a1e 0%, #1e1b4b 50%, #0f172a 100%)', anim: 'rain' },
}

function SunAnim() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <div className="wb-anim wb-sun" aria-hidden="true">
      <svg viewBox="0 0 60 60" width="60" height="60">
        <circle cx="30" cy="30" r="11" fill="rgba(253,224,71,0.92)" />
        {rays.map(deg => (
          <line
            key={deg}
            x1={30 + 14 * Math.cos(deg * Math.PI / 180)}
            y1={30 + 14 * Math.sin(deg * Math.PI / 180)}
            x2={30 + 24 * Math.cos(deg * Math.PI / 180)}
            y2={30 + 24 * Math.sin(deg * Math.PI / 180)}
            stroke="rgba(253,224,71,0.75)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  )
}

function CloudAnim({ count }) {
  const clouds = Array.from({ length: count }, (_, i) => ({
    top:   15 + i * 22,
    left:  10 + i * 20,
    delay: i * 1.4,
    scale: 0.8 + i * 0.1,
    opacity: 0.65 - i * 0.08,
  }))
  return (
    <div className="wb-anim" aria-hidden="true">
      {clouds.map((c, i) => (
        <div
          key={i}
          className="wb-cloud"
          style={{ top: `${c.top}%`, left: `${c.left}%`, animationDelay: `${c.delay}s`, transform: `scale(${c.scale})`, opacity: c.opacity }}
        >
          <svg viewBox="0 0 80 40" width="80" height="40">
            <ellipse cx="40" cy="28" rx="34" ry="13" fill="white" />
            <ellipse cx="28" cy="22" rx="20" ry="14" fill="white" />
            <ellipse cx="53" cy="24" rx="18" ry="12" fill="white" />
          </svg>
        </div>
      ))}
    </div>
  )
}

function RainAnim({ heavy }) {
  const count = heavy ? 18 : 10
  const drops = Array.from({ length: count }, (_, i) => ({
    left:    (i / count) * 96 + (i % 4) * 1.2,
    dur:     heavy ? 0.5 + (i % 4) * 0.08 : 0.7 + (i % 5) * 0.1,
    delay:   (i * 0.13) % 1.1,
    height:  heavy ? 22 : 14,
    opacity: heavy ? 0.7 : 0.5,
  }))
  return (
    <div className="wb-anim" aria-hidden="true">
      {drops.map((d, i) => (
        <div
          key={i}
          className="wb-raindrop"
          style={{
            left: `${d.left}%`,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            height: `${d.height}px`,
            opacity: d.opacity,
          }}
        />
      ))}
    </div>
  )
}

function SnowAnim() {
  const flakes = Array.from({ length: 14 }, (_, i) => ({
    left:  (i * 7.3) % 96,
    dur:   2.5 + (i % 4) * 0.6,
    delay: (i * 0.28) % 2.5,
    size:  10 + (i % 3) * 5,
  }))
  return (
    <div className="wb-anim" aria-hidden="true">
      {flakes.map((f, i) => (
        <div
          key={i}
          className="wb-snowflake"
          style={{
            left: `${f.left}%`,
            animationDuration: `${f.dur}s`,
            animationDelay: `${f.delay}s`,
            fontSize: `${f.size}px`,
          }}
        >
          ❄
        </div>
      ))}
    </div>
  )
}

function StarsAnim() {
  const stars = Array.from({ length: 22 }, (_, i) => ({
    left:  (i * 4.6) % 98,
    top:   (i * 3.7) % 75,
    delay: (i * 0.31) % 3,
    dur:   1.5 + (i % 3) * 0.5,
    size:  2 + (i % 2),
  }))
  return (
    <div className="wb-anim" aria-hidden="true">
      {stars.map((s, i) => (
        <div
          key={i}
          className="wb-star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
            width: `${s.size}px`,
            height: `${s.size}px`,
          }}
        />
      ))}
    </div>
  )
}

export default function WeatherBackground({ condition = 'CLEAR' }) {
  const cfg = WEATHER_CONFIG[condition] ?? WEATHER_CONFIG.CLEAR
  return (
    <>
      <div className="topbanner__bg" style={{ background: cfg.gradient }} />
      <div className="topbanner__overlay" />
      {cfg.anim === 'cloud-light' && <CloudAnim count={2} />}
      {cfg.anim === 'cloud-heavy' && <CloudAnim count={4} />}
      {cfg.anim === 'rain'        && <RainAnim heavy={false} />}
      {cfg.anim === 'heavy-rain'  && <RainAnim heavy={true} />}
      {cfg.anim === 'snow'        && <SnowAnim />}
      {cfg.anim === 'stars'       && <StarsAnim />}
    </>
  )
}
