import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MockHcmModule } from './app.module';
import { MockHcmState } from './state/mock-hcm.state';

async function bootstrap() {
  const app = await NestFactory.create(MockHcmModule);
  // Seed default balances on startup
  const state = app.get(MockHcmState);
  state.reset();
  const port = process.env.MOCK_HCM_PORT || 3001;
  await app.listen(port);
  console.log(`Mock HCM server running on port ${port}`);
}

bootstrap();
