"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { packager } = require("@electron/packager");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

async function packageDesktopApp() {
  const root = path.resolve(__dirname, "..");
  const platform = process.env.ELECTRON_PLATFORM || process.platform;
  const arch = process.env.ELECTRON_ARCH || process.arch;
  const outputPaths = await packager({
    dir: root,
    name: "Formation Studio",
    executableName: "Formation Studio",
    platform,
    arch,
    out: path.join(root, "out"),
    overwrite: true,
    asar: true,
    prune: true,
    appCopyright: "Copyright © 2026 Formation Studio",
    ignore: [
      /^\/\.git(?:\/|$)/,
      /^\/\.github(?:\/|$)/,
      /^\/\.gitignore$/,
      /^\/\.nojekyll$/,
      /^\/out(?:\/|$)/,
      /^\/node_modules(?:\/|$)/,
      /^\/package-lock\.json$/,
      /^\/README\.md$/,
      /^\/desktop\/(?:installer\.iss|package-app\.js)$/,
      /(?:^|\/)\w+\.test\.js$/,
      /^\/(?:ROADMAP|GAUNTLET_PROGRESS)\.md$/,
    ],
  });
  if (outputPaths.length !== 1) throw new Error("Unexpected desktop package output");
  const executableName = platform === "win32"
    ? "Formation Studio.exe"
    : platform === "darwin"
      ? path.join("Formation Studio.app", "Contents", "MacOS", "Formation Studio")
      : "Formation Studio";
  const executablePath = path.join(outputPaths[0], executableName);
  if (!fs.existsSync(executablePath)) throw new Error(`Packaged executable not found: ${executablePath}`);
  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  process.stdout.write(`${outputPaths[0]}\n`);
}

packageDesktopApp().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
