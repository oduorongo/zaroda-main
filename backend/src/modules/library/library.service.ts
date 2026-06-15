// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// MODULE 06: Library — Backend + Frontend
// COMPLETELY FREE — No fines, no charges of any kind
// ============================================================

// ─────────────────────────────────────────────────────────────
// src/modules/library/dto/library.dto.ts
// ─────────────────────────────────────────────────────────────
import {
  IsNotEmpty, IsOptional, IsString, IsNumber,
  IsEnum, IsUUID, IsBoolean, Min
} from 'class-validator';

export class AddBookDto {
  @IsNotEmpty() @IsString() title: string;
  @IsNotEmpty() @IsString() author: string;
  @IsOptional() @IsString() isbn?: string;
  @IsOptional() @IsString() publisher?: string;
  @IsOptional() @IsString() edition?: string;
  @IsOptional() @IsNumber() publicationYear?: number;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() gradeLevel?: string;
  @IsOptional() @IsUUID()   categoryId?: string;
  @IsOptional() @IsNumber() @Min(1) totalCopies?: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsBoolean() isReference?: boolean;
  @IsOptional() @IsString() purchaseDate?: string;
  @IsOptional() @IsNumber() purchasePrice?: number;
  @IsOptional() @IsString() donorName?: string;
  @IsOptional() @IsEnum(['purchased','donated','transferred','government']) acquisitionType?: string;
}

export class IssueLoanDto {
  @IsNotEmpty() @IsUUID()   bookId: string;
  @IsOptional() @IsUUID()   copyId?: string;
  @IsNotEmpty() @IsUUID()   borrowerId: string;
  @IsNotEmpty() @IsEnum(['learner','teacher','staff']) borrowerType: string;
  @IsOptional() @IsString() dueDate?: string;
}

export class ReturnBookDto {
  @IsNotEmpty() @IsUUID()   loanId: string;
  @IsOptional() @IsEnum(['good','fair','poor','damaged','lost']) returnCondition?: string;
  @IsOptional() @IsString() returnNotes?: string;
  @IsOptional() @IsBoolean() markLost?: boolean;
}

export class SearchBooksDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() gradeLevel?: string;
  @IsOptional() @IsString() author?: string;
  @IsOptional() @IsUUID()   categoryId?: string;
  @IsOptional() @IsBoolean() availableOnly?: boolean;
  @IsOptional() @IsNumber()  page?: number;
  @IsOptional() @IsNumber()  limit?: number;
}


// ─────────────────────────────────────────────────────────────
// src/modules/library/library.service.ts
// No fine logic anywhere in this file
// ─────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, BadRequestException, ConflictException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(LibraryBook)        private bookRepo:     Repository<LibraryBook>,
    @InjectRepository(LibraryCopy)        private copyRepo:     Repository<LibraryCopy>,
    @InjectRepository(LibraryLoan)        private loanRepo:     Repository<LibraryLoan>,
    @InjectRepository(LibraryReservation) private reservRepo:   Repository<LibraryReservation>,
    @InjectRepository(LibrarySettings)    private settingsRepo: Repository<LibrarySettings>,
    private dataSource: DataSource,
  ) {}

  // ── ADD BOOK ───────────────────────────────────────────────
  async addBook(tenantId: string, schoolId: string, dto: AddBookDto, userId: string) {
    const accessionNumber = await this.generateAccessionNumber(tenantId);
    const barcode         = `ZAR${accessionNumber.replace(/-/g,'')}`;

    return this.dataSource.transaction(async (manager) => {
      const book = await manager.save(LibraryBook, manager.create(LibraryBook, {
        tenantId, schoolId,
        ...dto,
        accessionNumber,
        barcode,
        totalCopies:     dto.totalCopies || 1,
        availableCopies: dto.totalCopies || 1,
        copiesOnLoan:    0,
        status:          'available',
        createdBy:       userId,
      }));

      for (let i = 1; i <= (dto.totalCopies || 1); i++) {
        await manager.save(LibraryCopy, manager.create(LibraryCopy, {
          tenantId,
          bookId:      book.id,
          copyNumber:  i,
          barcode:     `${barcode}-C${String(i).padStart(2,'0')}`,
          condition:   'good',
          isAvailable: true,
        }));
      }

      return { bookId: book.id, accessionNumber, barcode, copies: dto.totalCopies || 1 };
    });
  }

  // ── SEARCH CATALOGUE ──────────────────────────────────────
  async search(tenantId: string, dto: SearchBooksDto) {
    const { q, subject, gradeLevel, author, categoryId, availableOnly, page = 1, limit = 20 } = dto;

    const qb = this.bookRepo.createQueryBuilder('b')
      .where('b.tenant_id = :tenantId AND b.is_active = true AND b.deleted_at IS NULL', { tenantId })
      .orderBy('b.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (q) {
      qb.andWhere(
        `(to_tsvector('english', b.title) @@ plainto_tsquery('english', :q)
         OR to_tsvector('english', b.author) @@ plainto_tsquery('english', :q)
         OR b.isbn ILIKE :qLike)`,
        { q, qLike: `%${q}%` }
      );
    }
    if (subject)      qb.andWhere('b.subject ILIKE :subject',     { subject: `%${subject}%` });
    if (gradeLevel)   qb.andWhere('b.grade_level = :gradeLevel',  { gradeLevel });
    if (author)       qb.andWhere('b.author ILIKE :author',       { author: `%${author}%` });
    if (categoryId)   qb.andWhere('b.category_id = :categoryId',  { categoryId });
    if (availableOnly) qb.andWhere('b.available_copies > 0');

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── FIND BY BARCODE ───────────────────────────────────────
  async findByBarcode(tenantId: string, barcode: string) {
    const book = await this.bookRepo.findOne({
      where: { tenantId, barcode, deletedAt: null },
      relations: ['category'],
    });
    if (!book) throw new NotFoundException(`No book found for barcode: ${barcode}`);
    return book;
  }

  // ── ISSUE LOAN ─────────────────────────────────────────────
  // No fine checks — library is completely free
  async issueLoan(tenantId: string, dto: IssueLoanDto, issuedBy: string) {
    const book = await this.bookRepo.findOne({ where: { id: dto.bookId, tenantId } });
    if (!book) throw new NotFoundException('Book not found');
    if (book.isReference) throw new BadRequestException('Reference books cannot be borrowed — use in library only');
    if (book.availableCopies < 1) throw new BadRequestException('No copies currently available. You may reserve this book.');

    const settings = await this.getSettings(tenantId);

    // Check borrower loan count only — no fine check
    const activeLoanCount = await this.loanRepo.count({
      where: { tenantId, borrowerId: dto.borrowerId, status: 'active' },
    });
    const maxBooks = dto.borrowerType === 'teacher' ? settings.maxBooksTeacher : settings.maxBooksLearner;
    if (activeLoanCount >= maxBooks) {
      throw new BadRequestException(
        `Maximum of ${maxBooks} books allowed at a time. Please return a book before borrowing another.`
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Find best available copy
      const copy = await manager.findOne(LibraryCopy, {
        where: dto.copyId
          ? { id: dto.copyId, bookId: dto.bookId, isAvailable: true }
          : { bookId: dto.bookId, isAvailable: true },
      });
      if (!copy) throw new BadRequestException('No available copy found');

      const dueDate = dto.dueDate
        ? new Date(dto.dueDate)
        : this.addDays(new Date(), settings.loanPeriodDays);

      const loan = await manager.save(LibraryLoan, manager.create(LibraryLoan, {
        tenantId,
        bookId:       dto.bookId,
        copyId:       copy.id,
        borrowerId:   dto.borrowerId,
        borrowerType: dto.borrowerType as any,
        issuedBy,
        issueDate:    new Date(),
        dueDate,
        status:       'active',
      }));

      await manager.update(LibraryCopy, copy.id, {
        isAvailable: false, currentLoanId: loan.id,
      });

      await manager.update(LibraryBook, book.id, {
        availableCopies: () => 'available_copies - 1',
        copiesOnLoan:    () => 'copies_on_loan + 1',
        status:          book.availableCopies - 1 === 0 ? 'all_on_loan' : 'available',
      });

      // Fulfil reservation if one exists
      await manager.update(LibraryReservation,
        { bookId: dto.bookId, borrowerId: dto.borrowerId, status: 'pending' },
        { status: 'fulfilled' }
      );

      return {
        loanId:    loan.id,
        bookTitle: book.title,
        dueDate:   dueDate.toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' }),
        message:   `"${book.title}" issued. Due: ${dueDate.toLocaleDateString('en-KE')}`,
      };
    });
  }

  // ── RETURN BOOK ────────────────────────────────────────────
  // No fines — just record the return and update availability
  async returnBook(tenantId: string, dto: ReturnBookDto, returnedBy: string) {
    const loan = await this.loanRepo.findOne({
      where: { id: dto.loanId, tenantId },
      relations: ['book','copy'],
    });
    if (!loan) throw new NotFoundException('Loan record not found');
    if (loan.status === 'returned') throw new BadRequestException('This book has already been returned');

    const isLost     = dto.markLost || dto.returnCondition === 'lost';
    const returnDate = new Date();

    return this.dataSource.transaction(async (manager) => {
      await manager.update(LibraryLoan, loan.id, {
        status:          isLost ? 'lost' : 'returned',
        returnDate,
        returnCondition: dto.returnCondition as any,
        returnNotes:     dto.returnNotes,
      });

      // Update copy availability
      if (loan.copyId) {
        await manager.update(LibraryCopy, loan.copyId, {
          isAvailable:   !isLost,
          currentLoanId: null,
          condition:     (dto.returnCondition as any) || 'good',
        });
      }

      // Update book counts
      const book = loan.book;
      await manager.update(LibraryBook, book.id, {
        copiesOnLoan:    () => 'GREATEST(copies_on_loan - 1, 0)',
        availableCopies: isLost ? undefined : () => 'available_copies + 1',
        copiesLost:      isLost ? () => 'copies_lost + 1' : undefined,
        status:          isLost || book.availableCopies === 0 ? 'available' : 'available',
      });

      // Notify next reservation holder
      const next = await manager.findOne(LibraryReservation, {
        where: { bookId: book.id, status: 'pending' },
        order: { reservedAt: 'ASC' },
      });
      if (next && !isLost) {
        // Push notification via Communication module
        // notificationQueue.add({ type: 'library_available', userId: next.borrowerId, bookId: book.id });
      }

      return {
        message: isLost
          ? `Book marked as lost. Record updated.`
          : `"${book.title}" returned successfully. Thank you!`,
        status:  isLost ? 'lost' : 'returned',
      };
    });
  }

  // ── RENEW LOAN ─────────────────────────────────────────────
  async renewLoan(tenantId: string, loanId: string) {
    const loan = await this.loanRepo.findOne({ where: { id: loanId, tenantId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'active' && loan.status !== 'overdue') {
      throw new BadRequestException('Only active loans can be renewed');
    }

    const settings = await this.getSettings(tenantId);
    if (!settings.allowRenewals) throw new BadRequestException('Renewals are not enabled');
    if (loan.renewalsCount >= settings.maxRenewals) {
      throw new BadRequestException(`Maximum renewals (${settings.maxRenewals}) reached. Please return the book.`);
    }

    // Check no reservation pending
    const hasReservation = await this.reservRepo.findOne({
      where: { bookId: loan.bookId, status: 'pending' },
    });
    if (hasReservation) throw new BadRequestException('Another borrower has reserved this book. Please return it.');

    const newDueDate = this.addDays(new Date(), settings.loanPeriodDays);
    await this.loanRepo.update(loanId, {
      dueDate:       newDueDate,
      renewalsCount: loan.renewalsCount + 1,
      status:        'active',
    });

    return {
      newDueDate:    newDueDate.toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' }),
      renewalsLeft:  settings.maxRenewals - loan.renewalsCount - 1,
      message:       `Loan renewed. New due date: ${newDueDate.toLocaleDateString('en-KE')}`,
    };
  }

  // ── LATE RETURNS (informational only — no fines) ──────────
  // Returns a list of overdue books so librarian can send reminders
  // No charges, no penalties — just a notification tool
  async getLateReturns(tenantId: string) {
    const today = new Date();
    const loans = await this.loanRepo
      .createQueryBuilder('l')
      .innerJoin('l.book',     'b')
      .innerJoin('l.borrower', 'u')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.status = \'active\'')
      .andWhere('l.due_date < :today', { today })
      .select([
        'l.id','l.due_date','l.issue_date',
        'b.title','b.accession_number',
        'u.first_name','u.last_name','u.phone',
        'l.borrower_type',
      ])
      .orderBy('l.due_date', 'ASC')
      .getMany();

    // Update status to 'overdue' for tracking (informational, no charge)
    if (loans.length > 0) {
      await this.loanRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'overdue' })
        .whereInIds(loans.map(l => l.id))
        .execute();
    }

    return {
      lateReturns: loans.map(l => ({
        ...l,
        daysLate: Math.ceil((today.getTime() - new Date(l.dueDate).getTime()) / 86400000),
        // No fine amount — removed
      })),
      count: loans.length,
      note:  'No fines are charged. This list is for sending gentle reminders only.',
    };
  }

  // ── INVENTORY ─────────────────────────────────────────────
  async getInventory(tenantId: string, schoolId: string) {
    const result = await this.dataSource.query(`
      SELECT
        COALESCE(lc.name, 'Uncategorised') AS category,
        COUNT(*)                            AS total_titles,
        SUM(b.total_copies)                 AS total_copies,
        SUM(b.available_copies)             AS available_copies,
        SUM(b.copies_on_loan)               AS copies_on_loan,
        SUM(b.copies_damaged)               AS copies_damaged,
        SUM(b.copies_lost)                  AS copies_lost,
        SUM(b.purchase_price * b.total_copies) AS total_value_kes
      FROM library_books b
      LEFT JOIN library_categories lc ON lc.id = b.category_id
      WHERE b.tenant_id = $1 AND b.school_id = $2
        AND b.is_active = true AND b.deleted_at IS NULL
      GROUP BY lc.name
      ORDER BY total_titles DESC
    `, [tenantId, schoolId]);

    const totals = await this.dataSource.query(`
      SELECT
        COUNT(*)              AS total_titles,
        SUM(total_copies)     AS total_copies,
        SUM(available_copies) AS available_copies,
        SUM(copies_on_loan)   AS copies_on_loan,
        SUM(copies_lost)      AS copies_lost
      FROM library_books
      WHERE tenant_id = $1 AND school_id = $2 AND is_active = true AND deleted_at IS NULL
    `, [tenantId, schoolId]);

    return { byCategory: result, totals: totals[0] };
  }

  async getBorrowerHistory(tenantId: string, borrowerId: string) {
    return this.loanRepo.find({
      where: { tenantId, borrowerId },
      relations: ['book'],
      order: { issueDate: 'DESC' },
    });
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────
  private async getSettings(tenantId: string): Promise<any> {
    return await this.settingsRepo.findOne({ where: { tenantId } }) || {
      loanPeriodDays: 14, maxBooksLearner: 3, maxBooksTeacher: 5,
      allowRenewals: true, maxRenewals: 2,
      // No fine defaults — library is free
    };
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private async generateAccessionNumber(tenantId: string): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.bookRepo.count({ where: { tenantId } });
    return `LIB-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/library/library.controller.ts
// No pay-fine endpoint — removed entirely
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Param, Query, UseGuards
} from '@nestjs/common';

@Controller('api/v1/library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryController {
  constructor(private libraryService: LibraryService) {}

  @Post('books')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  addBook(@CurrentUser() u: User, @Body() dto: AddBookDto) {
    return this.libraryService.addBook(u.tenantId, u.schoolId, dto, u.id);
  }

  @Get('books')
  searchBooks(@CurrentUser() u: User, @Query() dto: SearchBooksDto) {
    return this.libraryService.search(u.tenantId, dto);
  }

  @Get('books/barcode/:barcode')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  findByBarcode(@CurrentUser() u: User, @Param('barcode') barcode: string) {
    return this.libraryService.findByBarcode(u.tenantId, barcode);
  }

  @Post('loans/issue')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  issueLoan(@CurrentUser() u: User, @Body() dto: IssueLoanDto) {
    return this.libraryService.issueLoan(u.tenantId, dto, u.id);
  }

  @Post('loans/return')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  returnBook(@CurrentUser() u: User, @Body() dto: ReturnBookDto) {
    return this.libraryService.returnBook(u.tenantId, dto, u.id);
  }

  @Post('loans/:id/renew')
  @Roles('tenant_owner','school_admin','hoi','class_teacher','learner','parent')
  renewLoan(@CurrentUser() u: User, @Param('id') id: string) {
    return this.libraryService.renewLoan(u.tenantId, id);
  }

  // Late returns — for reminder purposes only, no fines
  @Get('loans/late')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  getLateReturns(@CurrentUser() u: User) {
    return this.libraryService.getLateReturns(u.tenantId);
  }

  @Get('loans/borrower/:borrowerId')
  getBorrowerHistory(@CurrentUser() u: User, @Param('borrowerId') id: string) {
    return this.libraryService.getBorrowerHistory(u.tenantId, id);
  }

  @Get('inventory')
  @Roles('tenant_owner','school_admin','hoi','class_teacher')
  getInventory(@CurrentUser() u: User) {
    return this.libraryService.getInventory(u.tenantId, u.schoolId);
  }
}


// ─────────────────────────────────────────────────────────────
// NEXT.JS FRONTEND — Library (no fines UI anywhere)
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

export const LibraryAPI = {
  addBook:          (d: any)    => apiClient.post('/api/v1/library/books', d),
  searchBooks:      (p: any)    => apiClient.get('/api/v1/library/books', { params: p }),
  findByBarcode:    (b: string) => apiClient.get(`/api/v1/library/books/barcode/${b}`),
  issueLoan:        (d: any)    => apiClient.post('/api/v1/library/loans/issue', d),
  returnBook:       (d: any)    => apiClient.post('/api/v1/library/loans/return', d),
  renewLoan:        (id: string)=> apiClient.post(`/api/v1/library/loans/${id}/renew`),
  getLateReturns:   ()          => apiClient.get('/api/v1/library/loans/late'),
  getBorrowerHistory:(id: string)=>apiClient.get(`/api/v1/library/loans/borrower/${id}`),
  getInventory:     ()          => apiClient.get('/api/v1/library/inventory'),
};

export default function LibraryDashboard() {
  const [tab,       setTab]       = useState<'catalogue'|'issue'|'return'|'late'|'inventory'>('catalogue');
  const [books,     setBooks]     = useState<any[]>([]);
  const [lateData,  setLateData]  = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await LibraryAPI.searchBooks({ q: search || undefined, limit: 30 });
      setBooks(data.data);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { if (tab === 'catalogue') loadBooks(); }, [tab, loadBooks]);
  useEffect(() => {
    if (tab === 'late')      LibraryAPI.getLateReturns().then(r => setLateData(r.data));
    if (tab === 'inventory') LibraryAPI.getInventory().then(r => setInventory(r.data));
  }, [tab]);

  const TABS = [
    { k:'catalogue', label:'📚 Catalogue' },
    { k:'issue',     label:'↗ Issue' },
    { k:'return',    label:'↙ Return' },
    { k:'late',      label:'⏰ Late Returns' },
    { k:'inventory', label:'📊 Inventory' },
  ];

  const fmt = (n: any) => Number(n || 0).toLocaleString('en-KE');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">Book catalogue · Borrowing · Returns · Inventory</p>
        </div>
        <a href="/dashboard/library/add-book"
          className="px-4 py-2 bg-[#1a2e5a] text-white text-sm font-medium rounded-lg hover:bg-[#142347]">
          + Add Book
        </a>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all
              ${tab === t.k ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CATALOGUE */}
      {tab === 'catalogue' && (
        <div>
          <div className="flex gap-3 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadBooks()}
              placeholder="Search title, author, ISBN, subject…"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
            <button onClick={loadBooks}
              className="px-4 py-2.5 bg-[#1a2e5a] text-white rounded-lg text-sm font-medium">
              Search
            </button>
          </div>
          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading catalogue…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f4f6fb] border-b border-gray-100">
                  <tr>
                    {['Accession No.','Title','Author','Subject','Grade','Copies','Available','Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {books.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.accessionNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 max-w-xs truncate">{b.title}</div>
                        {b.isbn && <div className="text-xs text-gray-400">ISBN: {b.isbn}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{b.author}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{b.subject || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{b.gradeLevel?.replace('_',' ') || '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{b.totalCopies}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${b.availableCopies > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {b.availableCopies}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded capitalize
                          ${b.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {b.status?.replace('_',' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {books.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400 text-sm">No books found</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ISSUE */}
      {tab === 'issue' && <IssueLoanPanel />}

      {/* RETURN */}
      {tab === 'return' && <ReturnBookPanel />}

      {/* LATE RETURNS — reminder list, no fines */}
      {tab === 'late' && lateData && (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <span className="text-xl">ℹ️</span>
            <div>
              <div className="font-medium text-blue-800 text-sm">Reminder List Only</div>
              <div className="text-xs text-blue-600 mt-0.5">{lateData.note}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl font-bold text-[#1a2e5a]">{lateData.count}</div>
              <div className="text-xs text-gray-500 mt-1">Books past due date</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-2xl font-bold text-green-600">KES 0</div>
              <div className="text-xs text-gray-500 mt-1">Fines charged (none — free library)</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f4f6fb] border-b border-gray-100">
                <tr>
                  {['Borrower','Book','Due Date','Days Late','Action'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lateData.lateReturns?.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{l.borrower?.firstName} {l.borrower?.lastName}</div>
                      <div className="text-xs text-gray-400 capitalize">{l.borrowerType}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{l.book?.title}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(l.dueDate).toLocaleDateString('en-KE')}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-orange-600">{l.daysLate} days</span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-[#1a2e5a] hover:underline font-medium">
                        Send Reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lateData.lateReturns?.length === 0 && (
              <div className="text-center py-12 text-green-600 text-sm font-medium">
                ✓ All books returned on time
              </div>
            )}
          </div>
        </div>
      )}

      {/* INVENTORY */}
      {tab === 'inventory' && inventory && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label:'Total Titles',  value: fmt(inventory.totals?.total_titles) },
              { label:'Total Copies',  value: fmt(inventory.totals?.total_copies) },
              { label:'Available',     value: fmt(inventory.totals?.available_copies) },
              { label:'On Loan',       value: fmt(inventory.totals?.copies_on_loan) },
              { label:'Lost',          value: fmt(inventory.totals?.copies_lost) },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <div className="text-xl font-bold text-[#1a2e5a]">{k.value}</div>
                <div className="text-xs text-gray-500 mt-1">{k.label}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f4f6fb] border-b border-gray-100">
                <tr>
                  {['Category','Titles','Copies','Available','On Loan'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inventory.byCategory?.map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.category}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(c.total_titles)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(c.total_copies)}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{fmt(c.available_copies)}</td>
                    <td className="px-4 py-3 text-blue-600">{fmt(c.copies_on_loan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function IssueLoanPanel() {
  const [barcode,  setBarcode]  = useState('');
  const [book,     setBook]     = useState<any>(null);
  const [form,     setForm]     = useState({ borrowerId:'', borrowerType:'learner', dueDate:'' });
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState('');

  const lookupBarcode = async () => {
    if (!barcode.trim()) return;
    try {
      const { data } = await LibraryAPI.findByBarcode(barcode.trim());
      setBook(data); setError('');
    } catch { setError('Book not found for this barcode.'); setBook(null); }
  };

  const issue = async () => {
    if (!book || !form.borrowerId) { setError('Book and borrower are required.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await LibraryAPI.issueLoan({ bookId: book.id, ...form });
      setResult(data);
      setBook(null); setBarcode('');
      setForm({ borrowerId:'', borrowerType:'learner', dueDate:'' });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to issue loan.');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg">
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <div className="font-semibold text-green-800 text-sm">✓ {result.message}</div>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Issue Book</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scan / Enter Barcode</label>
          <div className="flex gap-2">
            <input value={barcode} onChange={e => setBarcode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupBarcode()}
              placeholder="Scan barcode or enter accession number"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] font-mono"/>
            <button onClick={lookupBarcode}
              className="px-4 py-2.5 border border-[#1a2e5a] text-[#1a2e5a] rounded-lg text-sm font-medium hover:bg-[#f4f6fb]">
              Look Up
            </button>
          </div>
        </div>

        {book && (
          <div className="bg-[#f4f6fb] rounded-lg p-3 flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <div className="font-semibold text-gray-900 text-sm">{book.title}</div>
              <div className="text-xs text-gray-500">{book.author} · {book.availableCopies} copies available</div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Borrower ID</label>
          <input value={form.borrowerId} onChange={e => setForm(p => ({...p, borrowerId: e.target.value}))}
            placeholder="Learner or staff UUID"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Borrower Type</label>
            <select value={form.borrowerType} onChange={e => setForm(p => ({...p, borrowerType: e.target.value}))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]">
              <option value="learner">Learner</option>
              <option value="teacher">Teacher</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date <span className="text-xs text-gray-400">(optional)</span></label>
            <input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p, dueDate: e.target.value}))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
          </div>
        </div>

        <button onClick={issue} disabled={loading || !book || !form.borrowerId}
          className="w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-50">
          {loading ? 'Issuing…' : '↗ Issue Book'}
        </button>
      </div>
    </div>
  );
}

function ReturnBookPanel() {
  const [loanId,    setLoanId]    = useState('');
  const [condition, setCondition] = useState('good');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<any>(null);
  const [error,     setError]     = useState('');

  const returnBook = async () => {
    if (!loanId) { setError('Loan ID is required.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await LibraryAPI.returnBook({ loanId, returnCondition: condition, returnNotes: notes });
      setResult(data);
      setLoanId(''); setNotes(''); setCondition('good');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Return failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg">
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <div className="font-semibold text-green-800 text-sm">✓ {result.message}</div>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Return Book</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Loan ID</label>
          <input value={loanId} onChange={e => setLoanId(e.target.value)}
            placeholder="Loan UUID"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a] font-mono"/>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Book Condition on Return</label>
          <div className="grid grid-cols-5 gap-2">
            {['good','fair','poor','damaged','lost'].map(c => (
              <button key={c} type="button" onClick={() => setCondition(c)}
                className={`py-2 rounded-lg text-xs font-medium border capitalize transition-all
                  ${condition === c ? 'bg-[#1a2e5a] text-white border-[#1a2e5a]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-xs text-gray-400">optional</span></label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any damage notes…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e5a]"/>
        </div>

        <button onClick={returnBook} disabled={loading || !loanId}
          className="w-full py-3 bg-[#1a2e5a] text-white rounded-xl text-sm font-medium hover:bg-[#142347] disabled:opacity-50">
          {loading ? 'Processing…' : '↙ Return Book'}
        </button>
      </div>
    </div>
  );
}
