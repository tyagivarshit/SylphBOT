export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 sm:px-6">

      <div className="w-full max-w-sm sm:max-w-md">
        {children}
      </div>

    </div>
  )
}