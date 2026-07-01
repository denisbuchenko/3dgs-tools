import { spawn } from "node:child_process";
import { updateColmapDatabaseMetrics } from "./metrics.js";
import type { ColmapJob } from "./jobState.js";

type DatabaseStatsPoller = {
  stop: () => void;
};

export function startDatabaseStatsPoller(
  job: ColmapJob,
  databasePath: string | null,
  intervalMs = 2500
): DatabaseStatsPoller {
  if (!databasePath) {
    return { stop: () => undefined };
  }

  let stopped = false;
  let isPolling = false;
  const timer = setInterval(() => {
    if (isPolling || stopped) {
      return;
    }

    isPolling = true;
    readDatabaseStats(databasePath)
      .then((stats) => {
        if (stats) {
          updateColmapDatabaseMetrics(job, stats.matches, stats.geometries);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        isPolling = false;
      });
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function readDatabaseStats(databasePath: string) {
  const query =
    "select " +
    "(select count(*) from matches), " +
    "(select count(*) from two_view_geometries where rows > 0);";

  const output = await runSqlite(databasePath, query);
  const [matches, geometries] = output
    .trim()
    .split("|")
    .map((value) => Number(value));

  if (Number.isFinite(matches) && Number.isFinite(geometries)) {
    return { matches, geometries };
  }

  return null;
}

function runSqlite(databasePath: string, query: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("sqlite3", ["-readonly", databasePath, query]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `sqlite3 exited with code ${code}`));
    });
  });
}
