import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

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

  @Column({ name: 'knec_code', nullable: true })
  knecCode: string;

  @Column({ default: 'trial' })
  status: string;

  @Column({ name: 'subscription_tier', default: 'trial' })
  subscriptionTier: string;

  @Column({ name: 'trial_ends_at', nullable: true })
  trialEndsAt: Date;

  @Column({ nullable: true })
  subdomain: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ name: 'location_verified', default: false })
  locationVerified: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
