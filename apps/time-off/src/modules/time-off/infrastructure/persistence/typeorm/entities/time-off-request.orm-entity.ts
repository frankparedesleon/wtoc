import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('time_off_requests')
export class TimeOffRequestOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  @Index()
  employeeId: string;

  @Column()
  @Index()
  locationId: string;

  @Column()
  startDate: string;

  @Column()
  endDate: string;

  @Column('int')
  daysRequested: number;

  @Column()
  status: string;

  @Column({ unique: true })
  idempotencyKey: string;

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column({ nullable: true })
  cancellationReason?: string;

  @Column({ nullable: true })
  managerId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
