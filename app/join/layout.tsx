export default function JoinLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="join-app flex flex-1 flex-col">{children}</div>;
}
