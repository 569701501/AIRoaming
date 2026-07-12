import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { PersistentTaskWorkerService } from "./projects/persistent-task-worker.service.js";

const port = Number(process.env.PORT ?? 4310);

const app = await NestFactory.create(AppModule, {
  cors: true,
});

app.setGlobalPrefix("api");

await app.listen(port);

if (process.env.AIROAMING_PERSISTENCE_MODE === "db" && process.env.AIROAMING_TASK_WORKER_ENABLED !== "false") {
  app.get(PersistentTaskWorkerService).start();
}

console.log(`AI漫游 server listening on http://localhost:${port}/api`);
