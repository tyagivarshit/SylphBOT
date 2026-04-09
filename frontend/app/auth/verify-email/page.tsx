import { Suspense } from "react"
import VerifyEmailClient from "./verifyEmailClient"

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="brand-app brand-auth-shell">
          <div className="brand-auth-grid">
            <div className="flex items-center justify-center lg:col-start-2">
              <div className="brand-auth-card w-full max-w-xl rounded-[32px] p-8 text-center">
                <div className="mx-auto h-10 w-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  )
}
