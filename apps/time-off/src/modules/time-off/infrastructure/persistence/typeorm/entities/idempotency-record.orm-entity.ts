import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('idempotency_records')
export class IdempotencyRecordOrmEntity {
  @PrimaryColumn()
  @Index({ unique: true })
  key: string;

  @Column()
  requestHash: string;

  @Column('text')
  responseBody: string;

  @Column('int')
  responseStatus: number;

  @Column({ type: 'datetime' })
  processedAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;
}
