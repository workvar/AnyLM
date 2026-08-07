import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { resolvePort, writeRuntime } from "./runtime";

async function bootstrap() {
  // Resolve the port BEFORE Nest builds the module, so OAuth strategies read
  // the final value from process.env.PORT. Falls back to a free ephemeral port
  // if the configured one is taken (loopback OAuth accepts any port).
  const desired = process.env.PORT ? Number(process.env.PORT) : 3227;
  const port = await resolvePort(desired);
  process.env.PORT = String(port);

  const app = await NestFactory.create(AppModule);

  // Allow the Electron renderer / local web origins to call the API.
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(port, "127.0.0.1");
  const apiUrl = writeRuntime(port);
  // eslint-disable-next-line no-console
  console.log(`LLMeter auth backend listening on ${apiUrl}`);
  if (port !== desired) {
    // eslint-disable-next-line no-console
    console.log(`(port ${desired} was busy; using ${port} instead)`);
  }
}
bootstrap();
