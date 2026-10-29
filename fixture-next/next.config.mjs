import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export default { turbopack: { root }, outputFileTracingRoot: root, agentRules: false };
