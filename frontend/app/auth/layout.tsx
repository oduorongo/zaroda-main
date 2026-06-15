// ============================================================
// app/auth/layout.tsx
// ============================================================
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1c38] flex items-center justify-center p-4">
      {children}
    </div>
  );
}
