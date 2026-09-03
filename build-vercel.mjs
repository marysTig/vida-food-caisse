#!/usr/bin/env node
/**
 * build-vercel.mjs
 *
 * Script post-build : transforme le output Nitro "node-server" (.output/)
 * en structure Vercel Build Output API v3 (.vercel/output/).
 *
 * Nitro génère :
 *   .output/
 *     public/          ← fichiers statiques
 *     server/          ← serveur Node (index.mjs + chunks)
 *
 * Vercel attend :
 *   .vercel/output/
 *     config.json      ← décrit les routes
 *     static/          ← fichiers statiques servis directement
 *     functions/
 *       index.func/    ← fonction serverless Node.js
 *         .vc-config.json
 *         index.mjs    ← entry point
 *         (+ chunks copiés)
 */

import { cp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUTPUT = join(ROOT, ".output");
const VERCEL_OUT = join(ROOT, ".vercel", "output");

async function main() {
  // 1. Nettoyer l'output Vercel précédent
  if (existsSync(VERCEL_OUT)) {
    await rm(VERCEL_OUT, { recursive: true, force: true });
    console.log("✓ Ancien .vercel/output supprimé");
  }

  // 2. Créer l'arborescence
  const staticDir = join(VERCEL_OUT, "static");
  const funcDir = join(VERCEL_OUT, "functions", "index.func");
  await mkdir(staticDir, { recursive: true });
  await mkdir(funcDir, { recursive: true });
  console.log("✓ Arborescence .vercel/output créée");

  // 3. Copier les fichiers statiques
  const publicDir = join(OUTPUT, "public");
  if (existsSync(publicDir)) {
    await cp(publicDir, staticDir, { recursive: true });
    console.log("✓ Fichiers statiques copiés → .vercel/output/static/");
  } else {
    console.warn("⚠ .output/public introuvable — aucun fichier statique copié");
  }

  // 4. Copier le serveur Nitro dans la fonction serverless
  const serverDir = join(OUTPUT, "server");
  if (existsSync(serverDir)) {
    await cp(serverDir, funcDir, { recursive: true });
    console.log("✓ Serveur Nitro copié → .vercel/output/functions/index.func/");
  } else {
    throw new Error(".output/server introuvable — le build Nitro a échoué");
  }

  // 5. Écrire la config de la fonction serverless
  const vcConfig = {
    runtime: "nodejs20.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
  };
  await writeFile(
    join(funcDir, ".vc-config.json"),
    JSON.stringify(vcConfig, null, 2),
  );
  console.log("✓ .vc-config.json écrit");

  // 6. Écrire la config de routage Vercel
  // Tout le trafic qui ne correspond pas à un fichier statique → fonction SSR
  const config = {
    version: 3,
    routes: [
      // Fichiers statiques avec assets hash → cache long terme
      {
        src: "^/assets/(.+)$",
        headers: { "cache-control": "public, max-age=31536000, immutable" },
        continue: true,
      },
      // Pour tout le reste → fonction SSR
      { src: "/(.*)", dest: "/index" },
    ],
  };
  await writeFile(
    join(VERCEL_OUT, "config.json"),
    JSON.stringify(config, null, 2),
  );
  console.log("✓ config.json de routage Vercel écrit");

  console.log("\n🚀 Build Vercel prêt dans .vercel/output/");
}

main().catch((err) => {
  console.error("❌ build-vercel.mjs a échoué:", err);
  process.exit(1);
});
