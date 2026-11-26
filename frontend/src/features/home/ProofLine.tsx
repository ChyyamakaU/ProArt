type Stat = { value: number; label: string };

export function ProofLine({ stats }: { stats: Stat[] }) {
  const visible = stats.filter((s) => Number.isFinite(s.value) && s.value > 0);
  if (!visible.length) return null;

  return (
    <section className="proof-line" aria-label="Platform proof">
      <div className="proof-line-inner">
        {visible.map((stat) => (
          <p className="proof-stat" key={stat.label}>
            <span className="proof-value">{stat.value.toLocaleString()}</span>
            <span className="proof-label">{stat.label}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
