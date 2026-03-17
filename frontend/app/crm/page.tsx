import FeatureGate from "@/components/FeatureGate"

export default function CRMPage(){
  return (
    <FeatureGate feature="CRM">
      <div>
        CRM UI yaha aayega
      </div>
    </FeatureGate>
  )
}