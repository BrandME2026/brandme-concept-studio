export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <main className="flex flex-1 flex-col bg-canvas px-6 py-section md:px-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <span className="eyebrow text-body">Studio</span>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">
          Analizando {url ?? "—"}
        </h1>
        <p className="mt-2 text-body">
          (Paneles de extracción · chat · preview — en construcción)
        </p>
      </div>
    </main>
  );
}
