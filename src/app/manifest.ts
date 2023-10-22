import { MetadataRoute } from "next";
// import icons from "@/app/icons.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cellar Assistant",
    short_name: "Cellar Assistant",
    description: "Next.js App",
    start_url: "/",
    display: "standalone",
    background_color: "#302c3a",
    theme_color: "#302c3a",
    // icons: icons.icons,
    orientation: "portrait",
    icons: [
      {
        src: "icons/android/android-launchericon-512-512.png",
        sizes: "512x512",
      },
      {
        src: "icons/android/android-launchericon-192-192.png",
        sizes: "192x192",
      },
      {
        src: "icons/android/android-launchericon-144-144.png",
        sizes: "144x144",
      },
      {
        src: "icons/android/android-launchericon-96-96.png",
        sizes: "96x96",
      },
      {
        src: "icons/android/android-launchericon-72-72.png",
        sizes: "72x72",
      },
      {
        src: "icons/android/android-launchericon-48-48.png",
        sizes: "48x48",
      },
    ],
    // screenshots: [
    //   {
    //     src: "/icons/pwa-screenshot-1.png",
    //     sizes: "3840x2160",
    //     form_factor: "wide",
    //   },
    //   {
    //     src: "/icons/pwa-screenshot-2.png",
    //     sizes: "3840x2160",
    //   },
    // ],
  };
}
