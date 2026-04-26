import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: process.env.BASE_URL || "http://uploaded-app:8888"
  },
  reporter: [["html", { open: "never" }], ["list"]]
});
