import ProfileForm from "@/components/settings/ProfileForm"
import ChangePassword from "@/components/settings/ChangePassword"
import DeleteAccount from "@/components/settings/DeleteAccount"

export default function SettingsPage() {

return(

<div className="space-y-10">

{/* Header */}

<div>

<h1 className="text-2xl font-semibold text-gray-900">
Settings
</h1>

<p className="text-sm text-gray-500 mt-1">
Manage your account preferences and security settings
</p>

</div>


{/* Account Section */}

<div className="space-y-6">

<h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
Account
</h2>

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

<ProfileForm />

<ChangePassword />

</div>

</div>


{/* Danger Zone */}

<div className="space-y-6">

<h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide">
Danger Zone
</h2>

<DeleteAccount />

</div>

</div>

)

}