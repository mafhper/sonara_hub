export function AnalyticalWaveform({ samples }: { samples: number[] }) {
  const points = (
    samples.length ? samples : Array.from({ length: 64 }, () => 0)
  )
    .map((sample, index, values) => {
      const x = (index / Math.max(1, values.length - 1)) * 1000;
      const y = 100 - sample * 62;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="analytic-waveform"
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
    >
      <line x1="0" x2="1000" y1="100" y2="100" />
      <polyline points={points} />
    </svg>
  );
}

export function StaticWaveform({ peaks }: { peaks: number[] }) {
  const count = peaks.length || 1;
  const slot = 1000 / count;
  const barWidth = Math.max(0.8, slot * 0.62);
  return (
    <svg
      className="analytic-waveform static"
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
    >
      {peaks.map((peak, index) => {
        const height = Math.max(2, Math.pow(peak, 0.7) * 94);
        return (
          <rect
            height={(height * 2).toFixed(2)}
            key={index}
            rx={(barWidth / 2).toFixed(2)}
            width={barWidth.toFixed(2)}
            x={(index * slot + (slot - barWidth) / 2).toFixed(2)}
            y={(100 - height).toFixed(2)}
          />
        );
      })}
    </svg>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
