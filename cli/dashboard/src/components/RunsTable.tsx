import type { LoopRun } from "../types";
import { fmtTime } from "../lib/format";

interface Props {
  runs?: LoopRun[];
}

export function RunsTable({ runs = [] }: Props) {
  return (
    <div className="runs-table-wrap">
      <table className="runs-table">
        <thead>
          <tr>
            <th>#</th>
            <th>迭代</th>
            <th>工具</th>
            <th>状态</th>
            <th>开始</th>
            <th>结束</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                暂无记录
              </td>
            </tr>
          ) : (
            runs.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.iteration}</td>
                <td>{r.tool ?? "—"}</td>
                <td>
                  <span className={`status-pill ${r.status}`}>{r.status}</span>
                </td>
                <td>{fmtTime(r.startedAt)}</td>
                <td>{fmtTime(r.endedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
