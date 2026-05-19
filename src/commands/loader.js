import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function registerCommands(bot) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".js") && file !== "loader.js" && !file.startsWith("_"));
  files.sort((a, b) => {
    const order = ["start.js", "help.js"];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    const register = mod.default || mod.register;
    if (typeof register === "function") await register(bot);
  }
}
