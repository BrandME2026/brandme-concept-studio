import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para una imagen Docker mínima (Railway).
  output: "standalone",
  // Playwright se resuelve en runtime de Node, no debe pasar por el bundler del servidor.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
