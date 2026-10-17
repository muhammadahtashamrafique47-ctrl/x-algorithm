"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Report = {
  processed: number;
  averageBefore: number;
  averageAfter: number;
  improved: number;
  results: { slug: string; before: number; after: number; grade: string }[];
};

type Toast = { text: string; tone: "ok" | "error" } | null;

/**
 * Catalogue-wide engine controls. Every action re-runs the same pipeline a new
 * upload goes through, so the numbers shown afterwards are real re-scores
 * rather than cached values.
 */
export function AdminActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const flash = (text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 6000);
  };

  async function run(action: "optimize-all" | "reseed" | "drafts") {
    setBusy(action);
    setReport(null);
    try {
      const url =
        action === "reseed"
          ? "/api/admin/reseed"
          : `/api/products/optimize-all?onlyDrafts=${action === "drafts" ? "true" : "false"}`;
      const response = await fetch(url, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);

      if (action === "reseed") {
        flash(`Demo catalogue rebuilt — ${data.products} listings re-optimized through the full pipeline.`);
      } else {
        setReport(data as Report);
        flash(
          `${data.processed} listings processed · average score ${data.averageBefore} → ${data.averageAfter} · ${data.improved} improved.`,
        );
      }
      router.refresh();
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => run("optimize-all")} disabled={!!busy}>
          {busy === "optimize-all" ? "Re-scoring every listing…" : "Re-optimize entire catalogue"}
        </button>
        <button className="btn btn-outline" onClick={() => run("drafts")} disabled={!!busy}>
          {busy === "drafts" ? "Working…" : "Optimize drafts & unoptimized"}
        </button>
        <button className="btn btn-ghost" onClick={() => run("reseed")} disabled={!!busy}>
          {busy === "reseed" ? "Rebuilding…" : "Reset demo data"}
        </button>
      </div>

      {busy ? (
        <div className="progress" aria-hidden="true">
          <span style={{ width: "70%", animation: "pulse 1.2s ease-in-out infinite" }} />
        </div>
      ) : null}

      {report ? (
        <div className="panel">
          <div className="card-header">
            <h3>Optimization run</h3>
            <span className="small muted">
              {report.processed} listings · avg {report.averageBefore} → {report.averageAfter} (+
              {Math.round((report.averageAfter - report.averageBefore) * 10) / 10})
            </span>
          </div>
          <div className="card-pad">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th className="center">Before</th>
                    <th className="center">After</th>
                    <th className="center">Lift</th>
                    <th className="center">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((row) => {
                    const lift = Math.round((row.after - row.before) * 10) / 10;
                    return (
                      <tr key={row.slug}>
                        <td className="mono small">{row.slug}</td>
                        <td className="center">{row.before}</td>
                        <td className="center">
                          <strong>{row.after}</strong>
                        </td>
                        <td className="center" style={{ color: lift > 0 ? "var(--good)" : lift < 0 ? "var(--bad)" : "var(--ink-3)" }}>
                          {lift > 0 ? "+" : ""}
                          {lift}
                        </td>
                        <td className="center">
                          <span className={`badge ${row.grade.startsWith("A") ? "badge-good" : row.grade === "B" ? "badge-info" : "badge-warn"}`}>
                            {row.grade}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
