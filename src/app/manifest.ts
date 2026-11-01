import type { MetadataRoute } from "next";

// Lets the app be added to a phone's home screen. There is deliberately no
// service worker, so nothing private is ever stored offline on the phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agency Atlas (Demo)",
    short_name: "Atlas",
    start_url: "/",
    display: "standalone",
    background_color: "#07060d",
    theme_color: "#07060d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
