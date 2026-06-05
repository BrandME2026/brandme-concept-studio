import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para una imagen Docker mínima (Railway).
  output: "standalone",
  // Playwright se resuelve en runtime de Node, no debe pasar por el bundler del servidor.
  serverExternalPackages: ["playwright"],
  // Fijar la raíz del workspace: hay un lockfile en $HOME que Next podría tomar por error.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
