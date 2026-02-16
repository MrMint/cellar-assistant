import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cellar Assistant",
    short_name: "Cellar Assistant",
    description:
      "Manage your wine, beer, spirit, and coffee collections. Scan menus, track your cellar, and discover new favorites.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111015",
    theme_color: "#111015",
    orientation: "any",
    categories: ["food", "lifestyle", "utilities"],
    shortcuts: [
      {
        name: "My Cellars",
        short_name: "Cellars",
        url: "/cellars",
        description: "View your cellars",
      },
      {
        name: "Search",
        short_name: "Search",
        url: "/search",
        description: "Search your collection",
      },
      {
        name: "Map",
        short_name: "Map",
        url: "/map",
        description: "Explore places on the map",
      },
      {
        name: "Tier Lists",
        short_name: "Tier Lists",
        url: "/tier-lists",
        description: "View your tier lists",
      },
    ],
    icons: [
      {
        src: "icons/android/android-launchericon-512-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/android/android-launchericon-512-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "icons/android/android-launchericon-192-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/android/android-launchericon-144-144.png",
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/android/android-launchericon-96-96.png",
        sizes: "96x96",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/android/android-launchericon-72-72.png",
        sizes: "72x72",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/android/android-launchericon-48-48.png",
        sizes: "48x48",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
