import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { ApiOperation, ApiTags, ApiHeader } from "@nestjs/swagger";
import { CreateTimeOffRequestCommand } from "../../application/commands/create-request/create-time-off-request.handler";
import { ApproveTimeOffRequestCommand } from "../../application/commands/approve-request/approve-time-off-request.handler";
import {
  RejectTimeOffRequestCommand,
  CancelTimeOffRequestCommand,
} from "../../application/commands/reject-request/reject-cancel.handler";
import { SyncBalanceCommand } from "../../application/commands/sync-balance/sync-balance.handler";
import { BatchSyncCommand } from "../../application/commands/batch-sync/batch-sync.handler";
import {
  GetBalanceQuery,
  GetRequestsQuery,
  GetRequestByIdQuery,
} from "../../application/queries/handlers";
import {
  CreateTimeOffRequestDto,
  ApproveTimeOffRequestDto,
  RejectTimeOffRequestDto,
  BatchSyncDto,
  GetRequestsFilterDto,
} from "../dto";
import { RequestStatus } from "../../domain/entities/time-off-request.entity";

@ApiTags("Time-Off Requests")
@Controller("time-off/requests")
export class TimeOffRequestsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit a new time-off request" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  async create(
    @Body() dto: CreateTimeOffRequestDto,
    @Headers("idempotency-key") _key: string,
  ) {
    const idempotencyKey = _key ?? "inline";
    return this.commandBus.execute(
      new CreateTimeOffRequestCommand(
        dto.employeeId,
        dto.locationId,
        dto.startDate,
        dto.endDate,
        idempotencyKey,
        dto.reason,
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: "List time-off requests with optional filters" })
  async findAll(@Query() filters: GetRequestsFilterDto) {
    return this.queryBus.execute(
      new GetRequestsQuery({
        employeeId: filters.employeeId,
        locationId: filters.locationId,
        status: filters.status as RequestStatus,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single time-off request by ID" })
  async findOne(@Param("id") id: string) {
    return this.queryBus.execute(new GetRequestByIdQuery(id));
  }

  @Patch(":id/approve")
  @ApiOperation({ summary: "Manager approves a time-off request" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  async approve(
    @Param("id") id: string,
    @Body() dto: ApproveTimeOffRequestDto,
  ) {
    return this.commandBus.execute(
      new ApproveTimeOffRequestCommand(id, dto.managerId),
    );
  }

  @Patch(":id/reject")
  @ApiOperation({ summary: "Manager rejects a time-off request" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  async reject(@Param("id") id: string, @Body() dto: RejectTimeOffRequestDto) {
    return this.commandBus.execute(
      new RejectTimeOffRequestCommand(id, dto.reason),
    );
  }

  @Delete(":id")
  @ApiOperation({ summary: "Employee cancels a pending time-off request" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  async cancel(@Param("id") id: string) {
    return this.commandBus.execute(new CancelTimeOffRequestCommand(id));
  }
}

@ApiTags("Leave Balances")
@Controller("time-off/balances")
export class BalancesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(":employeeId/:locationId")
  @ApiOperation({
    summary: "Get current leave balance for an employee at a location",
  })
  async getBalance(
    @Param("employeeId") employeeId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.queryBus.execute(new GetBalanceQuery(employeeId, locationId));
  }

  @Post("sync")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Trigger real-time sync with HCM for a specific employee/location",
  })
  async sync(@Body() body: { employeeId: string; locationId: string }) {
    return this.commandBus.execute(
      new SyncBalanceCommand(body.employeeId, body.locationId),
    );
  }

  @Post("batch-sync")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Receive full balance corpus from HCM (webhook or manual trigger)",
  })
  async batchSync(@Body() dto: BatchSyncDto) {
    await this.commandBus.execute(new BatchSyncCommand(dto.items ?? []));
    return { message: "Batch sync processed", count: dto.items?.length ?? 0 };
  }
}
