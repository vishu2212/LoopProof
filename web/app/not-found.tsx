import Link from "next/link";
import { DEMO_BATCHES } from "@/lib/demo-data";

export default function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>
        There is no demo batch or page at this address. Known demo batches (synthetic data):
      </p>
      <ul>
        {DEMO_BATCHES.map((b) => (
          <li key={b.id}>
            <Link href={`/batches/${b.id}`}>{b.id}</Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/">Back to dashboard</Link>
      </p>
    </div>
  );
}
