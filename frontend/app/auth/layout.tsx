export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="brand-app">{children}</div>;
}
