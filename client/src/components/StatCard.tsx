import { Link } from "react-router-dom";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  to?: string;
}

// A number with a label. When "to" is given the whole card is a link.
export function StatCard({ label, value, hint, to }: Props) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="stat">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
