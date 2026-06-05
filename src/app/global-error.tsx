"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "#010120",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 500, margin: 0 }}>
          Algo salió mal
        </h1>
        <p style={{ color: "#959494", margin: 0 }}>
          {error.digest ? `Error ${error.digest}` : "Inténtalo de nuevo."}
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: "#c8f6f9",
            color: "#000",
            border: "none",
            borderRadius: 4,
            padding: "0.5rem 1.5rem",
            fontFamily: "monospace",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
