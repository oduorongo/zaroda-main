// Who may collect fees / view finance reports at this school — decided by the
// backend (GET /finance/access). Public schools: every finance staff role may do
// both. Private schools: only the HOI, bursar and owner collect fees, and reports
// are for the owner and bursar (the HOI only once the owner grants it); payroll and
// expenses are for the owner and bursar only.
'use client';
import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/lib/api/client';

export interface FinanceAccess {
  isPrivate: boolean;
  canCollect: boolean;
  canViewReports: boolean;
  canManagePayrollExpenses: boolean;
  hoiReportsGranted: boolean;
  hasOwner: boolean;
  canGrantHoiReports: boolean;
}

export function useFinanceAccess() {
  const [access, setAccess] = useState<FinanceAccess | null>(null);
  const reload = useCallback(() => {
    apiClient.get('/finance/access')
      .then(r => setAccess(r.data))
      // Fail closed: if we can't tell, don't show report/collection controls.
      .catch(() => setAccess({ isPrivate: false, canCollect: false, canViewReports: false, canManagePayrollExpenses: false, hoiReportsGranted: false, hasOwner: false, canGrantHoiReports: false }));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { access, loading: access === null, reload };
}
