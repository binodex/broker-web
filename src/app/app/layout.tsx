import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session-provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}
