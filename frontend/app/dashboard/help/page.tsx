// app/dashboard/help/page.tsx
export default function HelpPage() {
  return (
    <div className="h-[calc(100vh-8rem)] -m-4 sm:-m-6">
      <iframe
        src="/user-guide/user-guide.html"
        className="w-full h-full border-0 rounded-2xl"
        title="ZARODA SMS User Guide"
      />
    </div>
  );
}
