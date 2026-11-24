import type { MetadataRoute } from "next";

// Lets the app be added to a phone's home screen. There is deliberately no
// service worker, so nothing private is ever stored offline on the phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YO Marketing Co",
    short_name: "YO Marketing",
    start_url: "/",
    display: "standalone",
    background_color: "#07060d",
    theme_color: "#07060d",
    icons: [{ src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
