import ProfileForm from "@/components/settings/ProfileForm"
import ChangePassword from "@/components/settings/ChangePassword"
import DeleteAccount from "@/components/settings/DeleteAccount"

export default function SettingsPage() {

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-semibold">
        Settings
      </h1>

      <div className="grid grid-cols-2 gap-6">

        <ProfileForm />

        <ChangePassword />

      </div>

      <DeleteAccount />

    </div>
  )
}