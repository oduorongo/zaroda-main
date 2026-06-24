// ============================================================
// app/auth/layout.tsx
// ============================================================
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0f1c38] flex items-center justify-center p-4 overflow-hidden">
      {/* Brand classroom/dashboard background with a dark overlay for contrast */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/hero-classroom.png')" }}
      />
      <div className="absolute inset-0 bg-[#0f1c38]/88"/>
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
