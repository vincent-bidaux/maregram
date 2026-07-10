import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin/index.html",
        nouveautes: "nouveautes/index.html",
      },
    },
  },
});
