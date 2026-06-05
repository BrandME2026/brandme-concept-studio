import { UrlInputForm } from "@/components/url-input-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero band dark — #010120, identidad together.ai */}
      <section className="flex flex-1 flex-col justify-center bg-canvas-dark px-6 py-section text-on-dark md:px-8">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Columna izquierda: titular + form */}
            <div className="flex flex-col gap-6">
              <span className="eyebrow text-body">Diseño desde cualquier URL</span>
              <h1 className="max-w-xl text-5xl font-medium leading-tight tracking-[-1.5px] md:text-6xl">
                Pega una URL y obtén una propuesta de diseño inspirada.
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-body">
                Extraemos colores, tipografía y layout reales de la web, charlas
                con la IA y generamos un{" "}
                <span className="font-mono uppercase tracking-tight text-on-dark">
                  DESIGN.md
                </span>{" "}
                + un preview en vivo.
              </p>
              <UrlInputForm />
            </div>

            {/* Columna derecha: degradado de marca (única chrome decorativa) */}
            <div className="hidden md:block">
              <div className="bg-brand-gradient aspect-square w-full rounded-sm" />
            </div>
          </div>
        </div>
      </section>

      {/* Wordmark banner — firma al pie, tintado casi invisible */}
      <section className="bg-canvas py-12">
        <p className="select-none text-center text-6xl font-medium tracking-tighter text-hairline md:text-8xl">
          clone-web
        </p>
      </section>
    </main>
  );
}
