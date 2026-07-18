import { BackOfficeShell } from "@/components/back-office/BackOfficeShell";

export default function HostLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="host-app qi-app-shell flex min-h-0 flex-1 flex-col"><BackOfficeShell>{children}</BackOfficeShell></div>;
}
