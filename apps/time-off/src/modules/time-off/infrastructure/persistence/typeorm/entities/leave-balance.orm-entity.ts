import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('leave_balances')
@Index(['employeeId', 'locationId'], { unique: true })
export class LeaveBalanceOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @Column()
  locationId: string;

  @Column('float')
  available: number;

  @Column('float')
  used: number;

  @Column({ type: 'datetime' })
  lastSyncedAt: Date;

  @VersionColumn()
  version: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
