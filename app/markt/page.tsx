export const dynamic = "force-dynamic";

export default function MarktPage() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Marktradar</h1>
        <p className="sub">Jetzt am Markt · erwartete Rückkehr · Favoriten</p>
      </div>
      <div className="notice">
        <strong>Kommt in M6.</strong> Der Marktradar zeigt dann die aktuell gelisteten
        Spieler (exakt), eine Rückkehr-Prognose aus <code>market_log</code> mit
        Kadenz-Regler und einen Favoritenfilter. Dafür wird zunächst der
        <code> market</code>-Endpunkt in den Collector aufgenommen.
      </div>
    </main>
  );
}
