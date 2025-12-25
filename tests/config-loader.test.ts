import { promises as fs } from "fs";
import path from "path";
import assert from "node:assert/strict";

import { ConfigLoader } from "../src/core/ConfigLoader";

export const tests = [
  {
    name: "ConfigLoader loads a valid project config",
    run: async () => {
      const filePath = path.join(process.cwd(), "config", "projects", "currency_mvp.json");
      const config = await ConfigLoader.loadFromFile(filePath);
      assert.equal(config.meta.projectName, "currency_mvp");
      assert.ok(config.segments.length > 0);
    },
  },
  {
    name: "ConfigLoader rejects invalid configs",
    run: async () => {
      const filePath = path.join(process.cwd(), "output", "invalid-config.json");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ foo: "bar" }), "utf-8");

      try {
        await assert.rejects(ConfigLoader.loadFromFile(filePath), /Config validation failed/);
      } finally {
        try {
          await fs.unlink(filePath);
        } catch {
          // Ignore cleanup errors to keep tests resilient in restricted environments.
        }
      }
    },
  },
];
