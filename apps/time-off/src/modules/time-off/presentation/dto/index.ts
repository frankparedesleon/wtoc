import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class CreateTimeOffRequestDto {
  @ApiProperty({ example: "emp-001" })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ example: "loc-nyc" })
  @IsNotEmpty()
  @IsString()
  locationId: string;

  @ApiProperty({ example: "2026-06-02" })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: "2026-06-04" })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: "Personal leave" })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApproveTimeOffRequestDto {
  @ApiProperty({ example: "mgr-001" })
  @IsNotEmpty()
  @IsString()
  managerId: string;
}

export class RejectTimeOffRequestDto {
  @ApiProperty({ example: "INSUFFICIENT_BALANCE" })
  @IsNotEmpty()
  @IsString()
  reason: string;
}

// export class BatchSyncDto {
//   @ApiProperty({
//     type: 'array',
//     items: {
//       type: 'object',
//       properties: {
//         employeeId: { type: 'string' },
//         locationId: { type: 'string' },
//         available: { type: 'number' },
//         used: { type: 'number' },
//       },
//     },
//   })
//   items: {
//     employeeId: string;
//     locationId: string;
//     available: number;
//     used: number;
//   }[];
// }

export class BatchSyncItemDto {
  @IsString()
  employeeId: string;

  @IsString()
  locationId: string;

  @IsNumber()
  available: number;

  @IsNumber()
  used: number;
}

export class BatchSyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchSyncItemDto)
  items: BatchSyncItemDto[];
}

export class GetRequestsFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}
