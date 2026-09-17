import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    "/*": index,
  },
  development: { hmr: true, console: true },
});

console.log(`Frontend running at ${server.url}`);
