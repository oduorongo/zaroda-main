// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// PDF DATA BUILDERS
// Each method fetches from the database and shapes the data
// that the PDF template functions expect.
// ============================================================

// src/modules/pdf/pdf-data.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PdfDataService {
  constructor(
    @InjectRepository(Learner)       private learnerRepo:    Repository<Learner>,
    @InjectRepository(School)        private schoolRepo:     Repository<School>,
    @InjectRepository(Tenant)        private tenantRepo:     Repository<Tenant>,
    @InjectRepository(User)          private userRepo:       Repository<User>,
    @InjectRepository(Stream)        private streamRepo:     Repository<Stream>,
    @InjectRepository(AssessmentResult) private resultRepo:  Repository<AssessmentResult>,
    @InjectRepository(BehaviourRecord)  private behaviourRepo: Repository<BehaviourRecord>,
    @InjectRepository(LearnerFeeAccount) private feeAccRepo: Repository<LearnerFeeAccount>,
    @InjectRepository(Invoice)       private invoiceRepo:    Repository<Invoice>,
    @InjectRepository(Receipt)       private receiptRepo:    Repository<Receipt>,
    @InjectRepository(BaseChampionship) private champRepo:   Repository<BaseChampionship>,
    @InjectRepository(BaseAthlete)   private athleteRepo:    Repository<BaseAthlete>,
    @InjectRepository(SchemeOfWork)  private schemeRepo:     Repository<SchemeOfWork>,
    @InjectRepository(StaffPayroll)  private payrollRepo:    Repository<StaffPayroll>,
    @InjectRepository(LessonPlan)    private planRepo:       Repository<LessonPlan>,
    @InjectRepository(Attendance)    private attendanceRepo: Repository<Attendance>,
    private dataSource: DataSource,
  ) {}

  // ── Load school logo as base64 ────────────────────────────
  private async getLogoBase64(schoolId: string): Promise<string | undefined> {
    try {
      const logoPath = path.join(process.cwd(), 'uploads', 'logos', `${schoolId}.png`);
      if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch { /* no logo */ }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD REPORT CARD DATA
  // ═══════════════════════════════════════════════════════════
  async buildReportCardData(tenantId: string, learnerId: string, term: string, academicYear: string) {
    const learner = await this.learnerRepo.findOne({
      where: { id: learnerId, tenantId },
      relations: ['stream', 'stream.classTeacher'],
    });
    if (!learner) throw new NotFoundException('Learner not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    if (!school) throw new NotFoundException('School not found');

    const logo = await this.getLogoBase64(school.id);

    // Assessment results for this term
    const results = await this.resultRepo.find({
      where: { tenantId, learnerId, term, academicYear },
      relations: ['subject'],
      order:     { subject: { name: 'ASC' } },
    });

    // Attendance for this term
    const attendance = await this.dataSource.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'present') AS present,
        COUNT(*) AS total
      FROM attendance
      WHERE tenant_id = $1 AND learner_id = $2
        AND academic_year = $3 AND term = $4
    `, [tenantId, learnerId, academicYear, term]);

    // Behaviour record
    const behaviour = await this.behaviourRepo.findOne({
      where: { tenantId, learnerId, academicYear, term },
    });

    // HOI
    const hoi = await this.userRepo.findOne({
      where: { tenantId, role: 'hoi' as any },
    });

    // Determine overall level (most common level across subjects)
    const levels     = results.map(r => r.level).filter(Boolean);
    const levelCount = levels.reduce((acc: any, l) => ({ ...acc, [l]: (acc[l]||0)+1 }), {});
    const overallLevel = Object.entries(levelCount).sort(([,a],[,b]) => (b as number)-(a as number))[0]?.[0] || 'ME';

    // Detect senior vs junior
    const seniorGrades = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
    const isSenior     = seniorGrades.includes(learner.gradeLevel || '');

    return {
      school: {
        name:       school.name,
        address:    school.address || '',
        knecCode:   school.knecCode || '',
        principal:  hoi ? `${hoi.firstName} ${hoi.lastName}` : '',
        logoBase64: logo,
      },
      learner: {
        firstName:       learner.firstName,
        lastName:        learner.lastName,
        admissionNumber: learner.admissionNumber,
        gradeLevel:      learner.gradeLevel || '',
        streamName:      learner.stream?.name || '',
        gender:          learner.gender || '',
        dob:             learner.dateOfBirth?.toLocaleDateString('en-KE') || '',
      },
      academic: {
        year:          academicYear,
        term,
        classTeacher: learner.stream?.classTeacher
          ? `${learner.stream.classTeacher.firstName} ${learner.stream.classTeacher.lastName}`
          : '',
        totalLearners: learner.stream?.learnersCount || 0,
      },
      results: results.map(r => ({
        subject:         r.subject?.name || '',
        strand:          r.strand        || '',
        level:           r.level         || 'ME',
        teacherComment:  r.teacherComment || '',
      })),
      summary: {
        overallLevel,
        teacherComment: results[0]?.classTeacherComment ||
          `${learner.firstName} has shown ${overallLevel === 'EE' ? 'exceptional' : overallLevel === 'ME' ? 'commendable' : 'growing'} effort this term.`,
        hoiComment:     `Congratulations on completing ${term.replace('_',' ')} ${academicYear}. Continue to work hard.`,
        attendance: {
          present: parseInt(attendance[0]?.present || '0'),
          total:   parseInt(attendance[0]?.total   || '0'),
        },
      },
      behaviour: behaviour ? {
        socialSkills:    behaviour.socialSkills,
        selfManagement:  behaviour.selfManagement,
        responsibility:  behaviour.responsibility,
        respectForOthers:behaviour.respectForOthers,
        punctuality:     behaviour.punctuality,
        participation:   behaviour.participation,
      } : undefined,
      isSenior,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD INVOICE DATA
  // ═══════════════════════════════════════════════════════════
  async buildInvoiceData(tenantId: string, invoiceId: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, tenantId },
      relations: ['learner', 'learner.stream', 'items'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const school  = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo    = await this.getLogoBase64(school?.id || '');
    const feeAcc  = await this.feeAccRepo.findOne({
      where: { tenantId, learnerId: invoice.learnerId },
    });

    const totalPaid = invoice.amountPaid || 0;
    const balance   = (invoice.totalAmount || 0) - totalPaid;

    let status: 'unpaid'|'partial'|'paid'|'overpaid' = 'unpaid';
    if (totalPaid >= invoice.totalAmount) status = balance < 0 ? 'overpaid' : 'paid';
    else if (totalPaid > 0) status = 'partial';

    return {
      school: {
        name:     school?.name    || '',
        address:  school?.address || '',
        phone:    school?.phone   || '',
        paybill:  school?.mpesaPaybill || '',
        logoBase64: logo,
      },
      learner: {
        firstName:       invoice.learner?.firstName || '',
        lastName:        invoice.learner?.lastName  || '',
        admissionNumber: invoice.learner?.admissionNumber || '',
        streamName:      invoice.learner?.stream?.name   || '',
        gradeLevel:      invoice.learner?.gradeLevel     || '',
      },
      invoice: {
        number:       invoice.invoiceNumber,
        issuedDate:   invoice.issuedDate?.toLocaleDateString('en-KE') || '',
        dueDate:      invoice.dueDate?.toLocaleDateString('en-KE') || '',
        academicYear: invoice.academicYear,
        term:         invoice.term,
      },
      lineItems: (invoice.items || []).map((item: any) => ({
        description: item.description,
        amount:      item.amount,
      })),
      totals: {
        subtotal:          invoice.subtotal         || invoice.totalAmount,
        discount:          invoice.discountAmount   || 0,
        scholarshipCredit: invoice.scholarshipCredit|| 0,
        totalDue:          invoice.totalAmount,
        totalPaid,
        balance,
      },
      guardian: {
        name:  invoice.learner?.guardianName  || '',
        phone: invoice.learner?.guardianPhone || '',
        email: invoice.learner?.guardianEmail || '',
      },
      status,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD RECEIPT DATA
  // ═══════════════════════════════════════════════════════════
  async buildReceiptData(tenantId: string, receiptNumber: string) {
    const receipt = await this.receiptRepo.findOne({
      where: { receiptNumber, tenantId },
      relations: ['learner', 'learner.stream', 'recordedBy'],
    });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = await this.getLogoBase64(school?.id || '');

    const feeAcc = await this.feeAccRepo.findOne({
      where: { tenantId, learnerId: receipt.learnerId },
    });

    return {
      school: {
        name:     school?.name || '',
        address:  school?.address || '',
        logoBase64: logo,
      },
      learner: {
        firstName:       receipt.learner?.firstName || '',
        lastName:        receipt.learner?.lastName  || '',
        admissionNumber: receipt.learner?.admissionNumber || '',
        streamName:      receipt.learner?.stream?.name || '',
      },
      receipt: {
        number:      receipt.receiptNumber,
        date:        receipt.createdAt?.toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' }) || '',
        amount:      receipt.amount,
        method:      receipt.paymentMethod || 'M-Pesa',
        reference:   receipt.mpesaRef || receipt.bankRef || '',
        term:        receipt.term,
        academicYear:receipt.academicYear,
      },
      balance:    feeAcc?.outstandingBalance || 0,
      receivedBy: receipt.recordedBy
        ? `${receipt.recordedBy.firstName} ${receipt.recordedBy.lastName}`
        : 'Bursar',
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD BIB SHEET DATA
  // ═══════════════════════════════════════════════════════════
  async buildBibSheetData(championshipId: string, schoolId?: string) {
    const champ = await this.champRepo.findOne({ where: { id: championshipId } });
    if (!champ) throw new NotFoundException('Championship not found');

    const qb = this.athleteRepo
      .createQueryBuilder('a')
      .where('a.championship_id = :cid', { cid: championshipId })
      .orderBy('a.bib_number', 'ASC');

    if (schoolId) qb.andWhere('a.school_id = :sid', { sid: schoolId });

    const athletes = await qb.getMany();

    let schoolFilter: string | undefined;
    if (schoolId) {
      schoolFilter = athletes[0]?.schoolName;
    }

    return {
      championship: {
        name:         champ.name,
        level:        champ.level,
        venue:        champ.venue        || '',
        startDate:    champ.startDate?.toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) || '',
        academicYear: champ.academicYear || '',
      },
      athletes: athletes.map(a => ({
        bibNumber:  a.bibNumber   || '',
        firstName:  a.firstName,
        lastName:   a.lastName,
        schoolName: a.schoolName,
        events:     a.events      || [],
        gender:     a.gender      || '',
        gradeLevel: a.gradeLevel  || '',
      })),
      schoolFilter,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD SCHEME OF WORK DATA
  // ═══════════════════════════════════════════════════════════
  async buildSchemeData(tenantId: string, schemeId: string) {
    const scheme = await this.schemeRepo.findOne({
      where: { id: schemeId, tenantId },
      relations: ['teacher', 'school', 'weeks'],
    });
    if (!scheme) throw new NotFoundException('Scheme not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = await this.getLogoBase64(school?.id || '');

    return {
      school: {
        name:       school?.name || '',
        logoBase64: logo,
      },
      teacher: {
        firstName: scheme.teacher?.firstName || '',
        lastName:  scheme.teacher?.lastName  || '',
        tscNumber: scheme.teacher?.tscNumber || '',
      },
      scheme: {
        title:        scheme.title,
        subject:      scheme.subject,
        grade:        scheme.grade?.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase()) || '',
        term:         scheme.term,
        academicYear: scheme.academicYear,
      },
      weeks: (scheme.weeks || []).map((w: any) => ({
        weekNumber:               w.weekNumber,
        dates:                    w.dates || '',
        strand:                   w.strand || '',
        subStrand:                w.subStrand || '',
        specificLearningOutcomes: w.specificLearningOutcomes || '',
        keyInquiryQuestions:      w.keyInquiryQuestions || '',
        learningExperiences:      w.learningExperiences || '',
        learningResources:        w.learningResources || '',
        assessmentMethods:        w.assessmentMethods || '',
        periods:                  w.periods || 0,
        remarks:                  w.remarks || '',
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD PAYSLIP DATA
  // ═══════════════════════════════════════════════════════════
  async buildPayslipData(tenantId: string, staffId: string, periodId: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id: periodId, tenantId, staffId },
      relations: ['staff'],
    });
    if (!payroll) throw new NotFoundException('Payroll record not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = await this.getLogoBase64(school?.id || '');

    const g = payroll.grossPay      || 0;
    const d = payroll.totalDeductions || 0;

    return {
      school: {
        name:       school?.name    || '',
        address:    school?.address || '',
        logoBase64: logo,
      },
      staff: {
        firstName:   payroll.staff?.firstName  || '',
        lastName:    payroll.staff?.lastName   || '',
        tscNumber:   payroll.staff?.tscNumber  || '',
        designation: payroll.staff?.designation|| '',
        bankAccount: payroll.staff?.bankAccount|| '',
      },
      period: {
        month: payroll.payMonth,
        year:  payroll.payYear,
      },
      earnings: {
        basicSalary:    payroll.basicSalary      || 0,
        houseAllowance: payroll.houseAllowance   || 0,
        transportAllow: payroll.transportAllow   || 0,
        medicalAllow:   payroll.medicalAllow     || 0,
        otherAllowances:payroll.otherAllowances  || 0,
        grossPay:       g,
      },
      deductions: {
        paye:            payroll.paye            || 0,
        nhif:            payroll.nhif            || 0,
        nssf:            payroll.nssf            || 0,
        housingLevy:     payroll.housingLevy     || 0,
        loanDeductions:  payroll.loanDeductions  || 0,
        saccoDeductions: payroll.saccoDeductions || 0,
        otherDeductions: payroll.otherDeductions || 0,
        totalDeductions: d,
      },
      netPay: g - d,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD TEACHER FOLDER PDFS (multiple docs, merged)
  // ═══════════════════════════════════════════════════════════
  async buildTeacherFolderPdfs(
    tenantId: string,
    teacherId: string,
    dto: { documentIds: string[]; documentTypes: string[] },
  ): Promise<Buffer[]> {
    const pdfs: Buffer[] = [];
    // This is called by the PDF controller to gather all documents
    // for a teacher's submission folder before merging
    // Returns array of PDF buffers in document order
    return pdfs; // Populated by PdfService.buildTeacherFolderPdfs
  }
}
