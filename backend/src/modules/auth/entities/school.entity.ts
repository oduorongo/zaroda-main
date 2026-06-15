import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'principal_name', nullable: true })
  principalName: string;

  @Column({ name: 'knec_code', nullable: true })
  knecCode: string;

  @Column({ name: 'mpesa_paybill', nullable: true })
  mpesaPaybill: string;

  @Column({ nullable: true })
  county: string;

  @Column({ name: 'sub_county', nullable: true })
  subCounty: string;

  @Column({ nullable: true })
  zone: string;

  @Column({ name: 'ke_county_id', nullable: true })
  keCountyId: number;

  @Column({ name: 'ke_sub_county_id', nullable: true })
  keSubCountyId: number;

  @Column({ name: 'ke_zone_id', nullable: true })
  keZoneId: number;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
