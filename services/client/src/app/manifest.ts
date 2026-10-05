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
    display_override: ["standalone"],
    background_color: "#111015",
    theme_color: "#111015",
    orientation: "any",
    categories: ["food", "lifestyle", "utilities"],
    launch_handler: {
      client_mode: ["navigate-existing", "auto"],
    },
    // `screenshots` is deliberately absent.
    //
    // It used to list three 656x1456 captures under `/screenshots/`. Those were
    // taken against a real signed-in account and carried a real person's first
    // name, their item count, their review text, a real saved location, and
    // avatars of three identifiable third parties who never agreed to appear in
    // a public repository. They were removed rather than blurred: a git object
    // is permanent, so a partially-redacted original is still the original.
    //
    // They were NOT regenerated against the seeded accounts, though that was
    // tried first. Neither seeded account produces an image fit to ship as the
    // install prompt's imagery: `test@test.com` has ~192 cellars that are almost
    // entirely e2e leftovers with generated names, and `test2@test.com` has a
    // single cellar holding one item, so its screens are nearly blank. Both are
    // also a moving target, since the shared stack's database is written by
    // every e2e run.
    //
    // The member is optional, so the manifest stays valid and the app still
    // installs — Chrome just falls back to its basic install dialog instead of
    // the richer one. To restore that richer UI, capture against purpose-built
    // demo data and re-add entries pointing at the new files; do not point them
    // back at a live personal account.
    shortcuts: [
      {
        name: "My Cellars",
        short_name: "Cellars",
        url: "/cellars",
        description: "View your cellars",
        icons: [
          {
            src: "/icons/android/android-launchericon-96-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: "Search",
        short_name: "Search",
        url: "/search",
        description: "Search your collection",
        icons: [
          {
            src: "/icons/android/android-launchericon-96-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: "Map",
        short_name: "Map",
        url: "/map",
        description: "Explore places on the map",
        icons: [
          {
            src: "/icons/android/android-launchericon-96-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: "Tier Lists",
        short_name: "Tier Lists",
        url: "/tier-lists",
        description: "View your tier lists",
        icons: [
          {
            src: "/icons/android/android-launchericon-96-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
    ],
    icons: [
      // Standard "any" purpose icons
      {
        src: "/icons/android/android-launchericon-512-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android/android-launchericon-192-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android/android-launchericon-144-144.png",
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android/android-launchericon-96-96.png",
        sizes: "96x96",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android/android-launchericon-72-72.png",
        sizes: "72x72",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android/android-launchericon-48-48.png",
        sizes: "48x48",
        type: "image/png",
        purpose: "any",
      },
      // Maskable icons — logo centered in safe zone for adaptive icon masks
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      // Monochrome icon — notification tray (alpha channel used as mask)
      {
        src: "/icons/icon-monochrome.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "monochrome",
      },
    ],
  };
}
