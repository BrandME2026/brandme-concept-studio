import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Francast.ai — AI marketing for franchise consultants";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen OG generada: wordmark Francast.ai sobre el gradiente de marca. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #fc4c02 0%, #ef2cc1 55%, #bdbbff 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-1px" }}>
          Francast.ai
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-3px",
            maxWidth: 900,
          }}
        >
          Your brands. Your markets. Working for you.
        </div>
        <div style={{ marginTop: 32, fontSize: 30, opacity: 0.9, maxWidth: 850 }}>
          AI marketing for franchise consultants — a full page for every brand.
        </div>
      </div>
    ),
    size,
  );
}
