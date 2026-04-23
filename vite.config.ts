import { defineConfig } from "vite";

export default defineConfig({
    base: "/widget/show-emote/",
    build: {
        outDir: "dist",
        emptyOutDir: true,
    }
});
