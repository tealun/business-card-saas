import { promises as fs } from "node:fs";
import path from "node:path";

// Regression guard for 99_56 A-P1-1: @nestjs/throttler only honours @Throttle
// overrides whose key matches a throttler registered in ThrottlerModule. This
// project registers exactly one throttler named "default"; any other key is
// silently dead metadata and the route falls back to the global limit.
describe("throttle configuration", () => {
  const srcDir = path.resolve(process.cwd(), "src");

  async function collectControllerFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectControllerFiles(fullPath)));
      } else if (entry.name.endsWith(".controller.ts")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("every @Throttle override uses the registered 'default' throttler", async () => {
    const files = await collectControllerFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      for (const match of content.matchAll(/@Throttle\(\{\s*([A-Za-z0-9_]+)\s*:/g)) {
        if (match[1] !== "default") {
          offenders.push(`${path.relative(srcDir, file)}: @Throttle key '${match[1]}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
