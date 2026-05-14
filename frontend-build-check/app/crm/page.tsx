import FeatureGate from "@/components/FeatureGate"
export const dynamic = "force-dynamic"

export default function CRMPage(){
  return (
    <FeatureGate feature="CRM">
      <div>
        CRM UI yaha aayega
      </div>
    </FeatureGate>
  )
}