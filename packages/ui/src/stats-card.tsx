/** A single metric with its label; a pulsing bar while it loads. */
export function StatsCard(props: {
  title: string;
  value: number | string;
  loading?: boolean | undefined;
}) {
  return (
    <div className="bg-card rounded-lg border p-6" data-testid="stats-card">
      <p className="text-muted-foreground text-sm font-medium">{props.title}</p>
      {props.loading ? (
        <div className="bg-muted mt-2 h-8 w-16 animate-pulse rounded" />
      ) : (
        <p className="mt-2 text-3xl font-bold">{props.value}</p>
      )}
    </div>
  );
}
