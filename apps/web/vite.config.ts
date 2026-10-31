import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@hotel-booking\/ui$/,
        replacement: fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      },
      {
        find: /^@hotel-booking\/api-client$/,
        replacement: fileURLToPath(new URL("../../packages/api-client/src", import.meta.url)),
      },
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
      },
    ],
  },
});
