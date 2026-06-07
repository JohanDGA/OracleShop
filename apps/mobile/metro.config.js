// Metro configurado para monorepo pnpm: observa la raíz del workspace y
// resuelve módulos tanto desde la app como desde la raíz.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// @supabase/supabase-js hace un import dinámico opcional de "@opentelemetry/api"
// (telemetría) que Metro intenta resolver estáticamente y no encuentra. No usamos
// OpenTelemetry y supabase-js ya hace .catch(() => null), así que lo resolvemos a
// un módulo vacío. Sin esto, el bundle falla con "Unable to resolve @opentelemetry/api".
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@opentelemetry/api") {
    return { type: "empty" };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
