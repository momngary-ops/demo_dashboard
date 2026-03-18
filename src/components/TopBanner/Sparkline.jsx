/**
 * 순수 SVG 미니멀 스파크라인
 * 외부 차트 라이브러리 미사용
 */
export default function Sparkline({ data, yMin, yMax, stale = false }) {
  if (!data || data.length < 2) return null

  const W = 100, H = 36

  // 현재값(마지막 포인트)이 항상 중앙 근처에 위치하도록 스케일 계산
  const current = data[data.length - 1]
  const dataMin = Math.min(...data)
  const dataMax = Math.max(...data)
  // 현재값 기준으로 대칭 범위 → 모든 데이터 포인트 포함 + 15% 여백
  const amplitude = Math.max(
    Math.abs(current - dataMin),
    Math.abs(dataMax - current),
    Math.abs(current) * 0.04,  // 최소 진폭 (값 크기의 4%)
    0.1
  ) * 1.15
  const min = current - amplitude
  const max = current + amplitude
  const range = max - min

  // 상하 10% 패딩 확보
  const scaleY = v => H - ((v - min) / range) * H * 0.8 + H * 0.1
  const scaleX = i => (i / (data.length - 1)) * W

  // Catmull-Rom → cubic bezier 변환으로 부드러운 곡선 생성
  const pts = data.map((v, i) => [scaleX(i), scaleY(v)])

  const smoothPath = (ps) => {
    if (ps.length < 2) return ''
    let d = `M ${ps[0][0].toFixed(1)},${ps[0][1].toFixed(1)}`
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[Math.max(i - 1, 0)]
      const p1 = ps[i]
      const p2 = ps[i + 1]
      const p3 = ps[Math.min(i + 2, ps.length - 1)]
      const cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)
      const cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)
      const cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)
      const cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
    }
    return d
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', opacity: stale ? 0.4 : 0.9 }}
    >
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
