import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { describe, beforeAll, test, expect } from "vitest";
import { loadSchema, loadInputQuery, loadFixture, validateTestAssets, runFunction } from "@shopify/shopify-function-test-helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureShopifyCliOnPath() {
  const pathEntries = (process.env.PATH || "").split(path.delimiter);
  const extraEntries = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      extraEntries.push(path.join(appData, "npm"));
    }
  }

  const missingEntries = extraEntries.filter((entry) => entry && !pathEntries.includes(entry));
  if (missingEntries.length > 0) {
    process.env.PATH = [...missingEntries, ...pathEntries].join(path.delimiter);
  }
}

function runShopifyCli(args, cwd) {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "exec", "--", "shopify", ...args]
    : ["exec", "--", "shopify", ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SHOPIFY_INVOKED_BY: "rupee-one-deal-tests",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Shopify CLI command failed with exit code ${code}: ${stderr}`));
        return;
      }

      resolve(stdout.trim());
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start Shopify CLI command: ${error.message}`));
    });
  });
}

async function buildFunctionWithCli(functionDir) {
  const appRootDir = path.dirname(functionDir);
  const functionName = path.basename(functionDir);
  await runShopifyCli(["app", "function", "build", "--path", functionName], appRootDir);
}

async function getFunctionInfoWithCli(functionDir) {
  const appRootDir = path.dirname(functionDir);
  const functionName = path.basename(functionDir);
  const stdout = await runShopifyCli(["app", "function", "info", "--json", "--path", functionName], appRootDir);
  return JSON.parse(stdout);
}

describe("Default Integration Test", () => {
  let schema;
  let functionDir;
  let functionInfo;
  let schemaPath;
  let targeting;
  let functionRunnerPath;
  let wasmPath;

  beforeAll(async () => {
    ensureShopifyCliOnPath();
    functionDir = path.dirname(__dirname);
    await buildFunctionWithCli(functionDir);
    functionInfo = await getFunctionInfoWithCli(functionDir);
    ({ schemaPath, functionRunnerPath, wasmPath, targeting } = functionInfo);
    schema = await loadSchema(schemaPath);
  }, 45000);

  const fixturesDir = path.join(__dirname, "fixtures");
  const fixtureFiles = fs.readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(fixturesDir, file));

  fixtureFiles.forEach((fixtureFile) => {
    test(`runs ${path.relative(fixturesDir, fixtureFile)}`, async () => {
      const fixture = await loadFixture(fixtureFile);
      const targetInputQueryPath = targeting[fixture.target].inputQueryPath;
      const inputQueryAST = await loadInputQuery(targetInputQueryPath);

      const validationResult = await validateTestAssets({ schema, fixture, inputQueryAST });
      expect(validationResult.inputQuery.errors).toEqual([]);
      expect(validationResult.inputFixture.errors).toEqual([]);
      expect(validationResult.outputFixture.errors).toEqual([]);

      const runResult = await runFunction(fixture, functionRunnerPath, wasmPath, targetInputQueryPath, schemaPath);
      expect(runResult.error).toBeNull();
      expect(runResult.result.output).toEqual(fixture.expectedOutput);
    }, 10000);
  });
});
