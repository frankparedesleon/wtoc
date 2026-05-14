import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ILeaveBalanceRepository } from '../../../domain/repositories';
import { LeaveBalance } from '../../../domain/entities/leave-balance.entity';
import { LeaveBalanceOrmEntity } from '../typeorm/entities/leave-balance.orm-entity';
import { LeaveBalanceMapper } from '../mappers/leave-balance.mapper';

@Injectable()
export class LeaveBalanceRepository implements ILeaveBalanceRepository {
  constructor(
    @InjectRepository(LeaveBalanceOrmEntity)
    private readonly repo: Repository<LeaveBalanceOrmEntity>,
  ) {}

  async save(balance: LeaveBalance): Promise<void> {
    const orm = LeaveBalanceMapper.toOrm(balance);
    await this.repo.save(orm);
  }

  async findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): Promise<LeaveBalance | null> {
    const orm = await this.repo.findOne({ where: { employeeId, locationId } });
    return orm ? LeaveBalanceMapper.toDomain(orm) : null;
  }

  async findAll(): Promise<LeaveBalance[]> {
    const orms = await this.repo.find();
    return orms.map(LeaveBalanceMapper.toDomain);
  }

  async upsert(balance: LeaveBalance): Promise<void> {
    const orm = LeaveBalanceMapper.toOrm(balance);
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(LeaveBalanceOrmEntity)
      .values(orm)
      .orUpdate(
        ['available', 'used', 'lastSyncedAt'],
        ['employeeId', 'locationId'],
      )
      .execute();
  }
}
