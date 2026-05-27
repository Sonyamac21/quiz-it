export default function HostLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="host-app flex min-h-0 flex-1 flex-col">{children}</div>;
}
