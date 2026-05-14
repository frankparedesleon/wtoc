import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus,
  HttpException, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { MockHcmState, FailureMode } from '../state/mock-hcm.state';

@Controller('hcm')
export class MockHcmController {
  constructor(private readonly state: MockHcmState) {}

  // ── HCM REALTIME API ───────────────────────────────────────────────────────

  @Get('balances/batch')
  getBatch() {
    this.applyMode();
    return this.state.getAllBalances();
  }

  @Get('balances/:employeeId/:locationId')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Res() res: Response,
  ) {
    await this.applyModeAsync(res);
    if (res.headersSent) return;

    const balance = this.state.getBalance(employeeId, locationId);
    if (!balance) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `No balance for ${employeeId} at ${locationId}`,
      });
    }

    if (this.state.getMode() === 'negative-balance') {
      return res.status(200).json({ ...balance, available: -5 });
    }

    if (this.state.getMode() === 'invalid-shape') {
      return res.status(200).json({ employeeId, locationId }); // missing available/used
    }

    return res.status(200).json(balance);
  }

  @Post('balances/:employeeId/:locationId')
  async postBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Body() body: { deductDays?: number; addDays?: number },
    @Res() res: Response,
  ) {
    this.state.setLastRequest({ employeeId, locationId, ...body });
    await this.applyModeAsync(res);
    if (res.headersSent) return;

    const balance = this.state.getBalance(employeeId, locationId);
    if (!balance) {
      return res.status(422).json({
        error: 'INVALID_DIMENSIONS',
        message: `Employee ${employeeId} or location ${locationId} not found`,
      });
    }

    if (body.deductDays) {
      const ok = this.state.deductBalance(employeeId, locationId, body.deductDays);
      if (!ok) {
        return res.status(422).json({
          error: 'INSUFFICIENT_BALANCE',
          message: `Insufficient balance for ${body.deductDays} days`,
        });
      }
    }

    if (body.addDays) {
      balance.available += body.addDays;
    }

    return res.status(200).json({ message: 'Balance updated' });
  }

  // ── TEST CONTROL ENDPOINTS ─────────────────────────────────────────────────

  @Post('test/set-balance')
  @HttpCode(HttpStatus.OK)
  setBalance(@Body() body: { employeeId: string; locationId: string; available: number; used?: number }) {
    this.state.setBalance(body.employeeId, body.locationId, body.available, body.used ?? 0);
    return { message: 'Balance set', ...body };
  }

  @Post('test/set-mode')
  @HttpCode(HttpStatus.OK)
  setMode(@Body() body: { mode: FailureMode }) {
    this.state.setMode(body.mode);
    return { message: 'Mode set', mode: body.mode };
  }

  @Post('test/trigger-anniversary')
  @HttpCode(HttpStatus.OK)
  triggerAnniversary(@Body() body: { employeeId: string; bonusDays?: number }) {
    this.state.triggerAnniversary(body.employeeId, body.bonusDays ?? 5);
    return { message: 'Anniversary triggered', employeeId: body.employeeId };
  }

  @Get('test/last-request')
  getLastRequest() {
    return this.state.getLastRequest() ?? {};
  }

  @Post('test/reset')
  @HttpCode(HttpStatus.OK)
  reset() {
    this.state.reset();
    return { message: 'Mock HCM reset to defaults' };
  }

  // ── HELPER ────────────────────────────────────────────────────────────────
  private applyMode() {
    const mode = this.state.getMode();
    if (mode === 'error-500') {
      throw new HttpException('HCM Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async applyModeAsync(res: Response): Promise<void> {
    const mode = this.state.getMode();
    if (mode === 'timeout') {
      await new Promise((r) => setTimeout(r, 10_000));
    }
    if (mode === 'error-500') {
      res.status(500).json({ error: 'HCM_ERROR', message: 'HCM Internal Server Error' });
    }
  }
}
