import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Automexia AI",
    short_name: "Automexia",
    description: "Install Automexia AI for a faster workspace experience.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f7ff",
    theme_color: "#0b2a5b",
    icons: [
      {
        src: "/logo.png",
        sizes: "960x960",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "960x960",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
