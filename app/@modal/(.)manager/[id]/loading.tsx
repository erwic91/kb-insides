import OffcanvasShell from "../../../../components/OffcanvasShell";

/** Sofort sichtbares Off-canvas-Skelett, während die Managerdaten laden. */
export default function ManagerOffcanvasLoading() {
  return (
    <OffcanvasShell>
      <div className="oc-head">
        <span className="eyebrow">Manager</span>
        <div className="sk sk-line" style={{ width: "55%", height: 26, marginTop: 6 }} />
        <div className="sk sk-line" style={{ width: "35%", height: 12, marginTop: 8 }} />
      </div>
      <div className="oc-body">
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((i) => (
            <div className="card card-pad tile" key={i}>
              <div className="sk sk-line" style={{ width: "60%", height: 10 }} />
              <div className="sk sk-line" style={{ width: "80%", height: 20, marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="sk sk-line" style={{ width: "100%", height: 220, marginTop: 16, borderRadius: 10 }} />
      </div>
    </OffcanvasShell>
  );
}
