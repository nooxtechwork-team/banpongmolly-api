import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  LegalPolicy,
  LegalPolicyType,
} from '../entities/legal-policy.entity';
import {
  PolicyAcceptance,
  type PolicyAcceptanceSource,
} from '../entities/policy-acceptance.entity';

const SEED_TERMS_HTML = `
<p>การใช้งานเว็บไซต์และระบบ Banpong Molly ถือว่าท่านได้อ่านและยอมรับข้อกำหนดฉบับนี้</p>
<p><strong>1. บริการ</strong> — ระบบจัดทำเพื่ออำนวยความสะดวกในการลงทะเบียนกิจกรรมประกวดปลาสวยงาม การจัดการข้อมูลผู้สมัคร และการสื่อสารระหว่างผู้จัดงานกับผู้เข้าร่วม</p>
<p><strong>2. ข้อมูลส่วนบุคคล</strong> — ท่านต้องกรอกข้อมูลที่ถูกต้อง ข้อมูลจะถูกประมวลผลตามนโยบายความเป็นส่วนตัว</p>
<p><strong>3. กิจกรรม</strong> — การเข้าร่วมแต่ละครั้งอยู่ภายใต้กติกาที่ผู้จัดงานกำหนด</p>
<p>ผู้ดูแลระบบสามารถแก้ไขเนื้อหาฉบับเต็มได้จากแผงผู้ดูแล (นโยบายและข้อกำหนด)</p>
`.trim();

const SEED_PRIVACY_HTML = `
<p>Banpong Molly ให้ความสำคัญกับการปกป้องข้อมูลส่วนบุคคล</p>
<p><strong>1. ข้อมูลที่รวบรวม</strong> — เช่น ชื่อ อีเมล เบอร์โทร ที่อยู่ ข้อมูลการสมัครกิจกรรม และข้อมูลทางเทคนิคที่จำเป็น</p>
<p><strong>2. การใช้งาน</strong> — เพื่อดำเนินการลงทะเบียน ติดต่อ จัดส่งรางวัล ปรับปรุงบริการ และปฏิบัติตามกฎหมาย</p>
<p><strong>3. สิทธิของท่าน</strong> — ท่านมีสิทธิตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล เช่น ขอเข้าถึง แก้ไข หรือลบข้อมูล</p>
<p>ผู้ดูแลระบบสามารถแก้ไขเนื้อหาฉบับเต็มได้จากแผงผู้ดูแล (นโยบายและข้อกำหนด)</p>
`.trim();

@Injectable()
export class LegalPolicyService implements OnModuleInit {
  constructor(
    @InjectRepository(LegalPolicy)
    private readonly policyRepo: Repository<LegalPolicy>,
    @InjectRepository(PolicyAcceptance)
    private readonly acceptanceRepo: Repository<PolicyAcceptance>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultsIfEmpty();
  }

  /** สร้างเวอร์ชันเริ่มต้นเมื่อยังไม่มีแถวใดในระบบ (dev / ติดตั้งใหม่) */
  async seedDefaultsIfEmpty(): Promise<void> {
    const n = await this.policyRepo.count();
    if (n > 0) return;
    const now = new Date();
    await this.policyRepo.save([
      this.policyRepo.create({
        policy_type: LegalPolicyType.TERMS_OF_SERVICE,
        version: '1.0',
        title: 'ข้อกำหนดและเงื่อนไขการใช้งาน',
        body_html: SEED_TERMS_HTML,
        effective_at: now,
        is_active: true,
      }),
      this.policyRepo.create({
        policy_type: LegalPolicyType.PRIVACY_POLICY,
        version: '1.0',
        title: 'นโยบายความเป็นส่วนตัว',
        body_html: SEED_PRIVACY_HTML,
        effective_at: now,
        is_active: true,
      }),
    ]);
  }

  async findActiveByType(
    policyType: LegalPolicyType,
  ): Promise<LegalPolicy | null> {
    return this.policyRepo.findOne({
      where: { policy_type: policyType, is_active: true },
    });
  }

  getPublicSummary() {
    return this.buildSummary();
  }

  private async buildSummary() {
    const [terms, privacy, cookie] = await Promise.all([
      this.findActiveByType(LegalPolicyType.TERMS_OF_SERVICE),
      this.findActiveByType(LegalPolicyType.PRIVACY_POLICY),
      this.findActiveByType(LegalPolicyType.COOKIE_POLICY),
    ]);
    return {
      terms_of_service: terms
        ? { version: terms.version, title: terms.title, effective_at: terms.effective_at }
        : null,
      privacy_policy: privacy
        ? {
            version: privacy.version,
            title: privacy.title,
            effective_at: privacy.effective_at,
          }
        : null,
      cookie_policy: cookie
        ? {
            version: cookie.version,
            title: cookie.title,
            effective_at: cookie.effective_at,
          }
        : null,
    };
  }

  async getPublicDocument(policyType: LegalPolicyType) {
    const doc = await this.findActiveByType(policyType);
    if (!doc) {
      return null;
    }
    return {
      policy_type: doc.policy_type,
      version: doc.version,
      title: doc.title,
      body_html: doc.body_html,
      effective_at: doc.effective_at,
    };
  }

  /**
   * ตรวจว่าเวอร์ชันที่ผู้ใช้ส่งมาตรงกับนโยบายที่กำลังใช้งาน (ทั้งข้อกำหนดและความเป็นส่วนตัว)
   */
  async assertVersionsMatchActive(
    termsVersion: string,
    privacyVersion: string,
  ): Promise<void> {
    const terms = await this.findActiveByType(LegalPolicyType.TERMS_OF_SERVICE);
    const privacy = await this.findActiveByType(LegalPolicyType.PRIVACY_POLICY);
    if (!terms || !privacy) {
      throw new BadRequestException(
        'ยังไม่มีนโยบายที่เผยแพร่ในระบบ กรุณาติดต่อผู้ดูแล',
      );
    }
    if (terms.version !== termsVersion) {
      throw new BadRequestException(
        'เวอร์ชันข้อกำหนดและเงื่อนไขไม่ตรงกับฉบับปัจจุบัน กรุณารีเฟรชหน้าแล้วลองใหม่',
      );
    }
    if (privacy.version !== privacyVersion) {
      throw new BadRequestException(
        'เวอร์ชันนโยบายความเป็นส่วนตัวไม่ตรงกับฉบับปัจจุบัน กรุณารีเฟรชหน้าแล้วลองใหม่',
      );
    }
  }

  async recordAcceptances(params: {
    userId: number;
    termsVersion: string;
    privacyVersion: string;
    source: PolicyAcceptanceSource;
    ip?: string | null;
    userAgent?: string | null;
    relatedRegistrationId?: number | null;
  }): Promise<void> {
    const rows = [
      this.acceptanceRepo.create({
        user_id: params.userId,
        policy_type: LegalPolicyType.TERMS_OF_SERVICE,
        version: params.termsVersion,
        source: params.source,
        related_registration_id: params.relatedRegistrationId ?? null,
        ip_address: params.ip ? params.ip.slice(0, 64) : null,
        user_agent: params.userAgent ?? null,
      }),
      this.acceptanceRepo.create({
        user_id: params.userId,
        policy_type: LegalPolicyType.PRIVACY_POLICY,
        version: params.privacyVersion,
        source: params.source,
        related_registration_id: params.relatedRegistrationId ?? null,
        ip_address: params.ip ? params.ip.slice(0, 64) : null,
        user_agent: params.userAgent ?? null,
      }),
    ];
    await this.acceptanceRepo.save(rows);
  }

  async listAllForAdmin(): Promise<LegalPolicy[]> {
    return this.policyRepo.find({
      order: { policy_type: 'ASC', effective_at: 'DESC', id: 'DESC' },
    });
  }

  async createDraft(input: {
    policy_type: LegalPolicyType;
    version: string;
    title: string;
    body_html: string;
    effective_at?: Date;
  }): Promise<LegalPolicy> {
    const exists = await this.policyRepo.findOne({
      where: {
        policy_type: input.policy_type,
        version: input.version,
      },
    });
    if (exists) {
      throw new BadRequestException('มีเวอร์ชันนี้ของประเภทนี้อยู่แล้ว');
    }
    const row = this.policyRepo.create({
      policy_type: input.policy_type,
      version: input.version,
      title: input.title,
      body_html: input.body_html,
      effective_at: input.effective_at ?? new Date(),
      is_active: false,
    });
    return this.policyRepo.save(row);
  }

  async activateVersion(id: number): Promise<LegalPolicy> {
    const row = await this.policyRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('ไม่พบนโยบาย');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        LegalPolicy,
        { policy_type: row.policy_type },
        { is_active: false },
      );
      await manager.update(LegalPolicy, { id: row.id }, { is_active: true });
    });
    const reloaded = await this.policyRepo.findOne({ where: { id } });
    return reloaded!;
  }
}
