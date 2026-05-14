import { Module } from '@nestjs/common';
import { MockHcmController } from './controllers/mock-hcm.controller';
import { MockHcmState } from './state/mock-hcm.state';

@Module({
  controllers: [MockHcmController],
  providers: [MockHcmState],
})
export class MockHcmModule {}
