import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulesPath = path.join(__dirname, "..", "modules");

let logging = process.argv.slice(2) || "default";

const modules = await listModules()
const modules_loaded = [];

async function listModules() {
  const files = await fs.readdir(modulesPath);
  const jsFiles = files
    .filter(file => file.endsWith(".js"))
    .map(file => file.slice(0, -3));
  console.log("[LOG] Found", jsFiles.length, "Modules");
  if (logging == "debug") console.log("[DEBUG] Found Modules: ", jsFiles);
  return jsFiles;
}

async function loadModule(ModuleName) {
  if (!modules.includes(ModuleName)) {
    if (logging === "debug") console.log("[DEBUG] Cant find Module: ", ModuleName);
    return null; // Modul nicht gefunden
  }

  const imported = await import(path.join(modulesPath, ModuleName + ".js"));
  const moduleObj = imported.default || imported; // CommonJS kompatibel
  if (logging === "debug") console.log("[DEBUG] Loaded new Module: ", ModuleName);
  modules_loaded.push(ModuleName);
  return moduleObj;
}

async function runModule(moduleName, command) {
  const thisModule = await loadModule(moduleName);

  if (!thisModule) {
    throw new Error(`Module "${moduleName}" not found`);
  }
  if (!thisModule.commands[command]) {
    throw new Error(`Command "${command}" not found in module "${moduleName}"`);
  }

async function loadAllModules() {
  const moduleNames = await listModules();
  const loadedModules = {};

  for (const name of moduleNames) {
    try {
      loadedModules[name] = await loadModule(name);
    } catch (err) {
      console.error(`[ERROR] Failed to load module "${name}":`, err);
    }
  }

  console.log("[LOG] All modules loaded:", Object.keys(loadedModules));
  return loadedModules;
}

// Beispiel: alles laden
(async () => {
  const allModules = await loadAllModules();
})();


runModule("time", "getDate")
