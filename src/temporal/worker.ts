import { loadEnvConfig } from "@next/env";
import { DEFAULT_TEMPORAL_TASK_QUEUE } from "./constants";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ NativeConnection, Worker }, activities] = await Promise.all([
    import("@temporalio/worker"),
    import("./activities"),
  ]);
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  console.log(`Loom Temporal worker polling ${address}`);
  await worker.run();
}

main().catch((error) => {
  console.error("Temporal worker failed", error);
  process.exitCode = 1;
});
