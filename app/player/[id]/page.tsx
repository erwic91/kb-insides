export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main>
      <h1>Spieler {id}</h1>
      <p>Wird in M6 an Supabase angeschlossen.</p>
    </main>
  );
}
