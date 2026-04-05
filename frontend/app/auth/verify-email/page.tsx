import { Suspense } from "react"
import VerifyEmailClient from "./verifyEmailClient"

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailClient />
    </Suspense>
  )
}