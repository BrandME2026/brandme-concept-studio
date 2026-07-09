import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para una imagen Docker mínima (Railway).
  output: "standalone",
  // /.well-known/* no puede vivir en el app router (los dot-folders se ignoran):
  // se sirve vía rewrite (WO-41, SkillFileServer).
  async rewrites() {
    return [
      {
        source: "/.well-known/skills/:path*",
        destination: "/api/discoverability/skills/:path*",
      },
      { source: "/.well-known/skills", destination: "/api/discoverability/skills" },
    ];
  },
  // Playwright se resuelve en runtime de Node, no debe pasar por el bundler del servidor.
  serverExternalPackages: ["playwright"],
  // Fijar la raíz del workspace: hay un lockfile en $HOME que Next podría tomar por error.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
