export default async function ManagerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main>
      <h1>Manager {id}</h1>
      <p>Wird in M5 an Supabase angeschlossen.</p>
    </main>
  );
}
