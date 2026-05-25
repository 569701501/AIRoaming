import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env.PORT ?? 4310);

const app = await NestFactory.create(AppModule, {
  cors: true,
});

app.setGlobalPrefix("api");

await app.listen(port);

console.log(`AI漫游 server listening on http://localhost:${port}/api`);
