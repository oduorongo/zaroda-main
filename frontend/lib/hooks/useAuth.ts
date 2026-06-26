// lib/hooks/useAuth.ts
'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/lib/api/client';

export interface AppUser {
  id:          string;
  tenantId:    string;
  schoolId:    string;
  firstName:   string;
  lastName:    string;
  email:       string;
  role:        string;
  streamId?:   string;
  streamName?: string;
  subjects?:   string[];
}

interface AuthState {
  user:    AppUser | null;
  loading: boolean;
  hydrated: boolean;
  login:   (email: string, password: string) => Promise<void>;
  logout:  () => void;
  isRole:  (...roles: string[]) => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user:    null,
      loading: false,
      hydrated: false,

      login: async (email, password) => {
        set({ loading: true });
        try {
          const { data } = await apiClient.post('/auth/login', { email, password });
          localStorage.setItem('zaroda_token',   data.accessToken);
          localStorage.setItem('zaroda_refresh', data.refreshToken);
          set({ user: data.user, loading: false });
        } catch (err: any) {
          set({ loading: false });
          throw new Error(err?.response?.data?.message || 'Invalid email or password');
        }
      },

      logout: () => {
        localStorage.removeItem('zaroda_token');
        localStorage.removeItem('zaroda_refresh');
        set({ user: null });
        window.location.href = '/auth/login';
      },

      isRole: (...roles) => {
        const user = get().user;
        return user ? roles.includes(user.role) : false;
      },
    }),
    {
      name: 'zaroda_user',
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => { useAuth.setState({ hydrated: true }); },
    },
  ),
);

// Role helper shortcuts
export const isTeacher  = (role: string) => ['class_teacher','subject_teacher','overall_class_teacher'].includes(role);
export const isHoi      = (role: string) => ['hoi','dhois','school_admin','tenant_owner'].includes(role);
export const isBursar   = (role: string) => ['bursar','hoi','tenant_owner'].includes(role);
export const isAdmin    = (role: string) => ['school_admin','tenant_owner','super_admin'].includes(role);
export const isParent   = (role: string) => role === 'parent';
export const isLearner  = (role: string) => role === 'learner';
