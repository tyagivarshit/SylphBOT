"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { apiFetch } from "@/lib/apiClient"

declare global {
  interface Window {
    FB:any
    fbAsyncInit:any
  }
}

export default function AddClientModal({ onClose }: any) {

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID
const CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID

/* -------------------------------
LOAD FACEBOOK SDK
-------------------------------- */

useEffect(()=>{

  window.fbAsyncInit = function () {

    window.FB.init({
      appId: APP_ID,
      cookie: true,
      xfbml: true,
      version: "v19.0",
    })

  }

},[])

/* -------------------------------
WHATSAPP CONNECT
-------------------------------- */

const connectWhatsApp = () => {

  window.FB.login(

    async function(response:any){

      if(!response.authResponse){
        return
      }

      try{

        const accessToken = response.authResponse.accessToken

        /* SEND TOKEN TO BACKEND */

        await apiFetch("/api/clients",{
          method:"POST",
          body:JSON.stringify({
            platform:"WHATSAPP",
            accessToken
          })
        })

        alert("WhatsApp connected successfully")

        onClose()

      }catch(err){

        console.error("WhatsApp connect error",err)

      }

    },

    {
      config_id: CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras:{
        setup:{
          channel:"WHATSAPP"
        }
      }
    }

  )

}

/* -------------------------------
INSTAGRAM CONNECT
-------------------------------- */

const connectInstagram = () => {

  const url = `https://www.facebook.com/v19.0/dialog/oauth?
client_id=${APP_ID}
&redirect_uri=${window.location.origin}/integrations/meta/callback
&scope=pages_show_list,pages_messaging,instagram_basic,instagram_manage_messages`

  window.location.href = url

}

/* -------------------------------
UI
-------------------------------- */

return(

<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">

<div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">

{/* HEADER */}

<div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">

<h2 className="text-base sm:text-lg font-semibold text-gray-900">
Connect Platform
</h2>

<button
onClick={onClose}
className="p-1.5 rounded-md hover:bg-gray-100 transition"
>
<X size={18} className="text-gray-500"/>
</button>

</div>

{/* BODY */}

<div className="p-4 sm:p-6 space-y-5">

<p className="text-sm text-gray-600">
Connect your messaging platforms to enable AI automation.
</p>

<div className="space-y-3">

{/* WHATSAPP */}

<button
onClick={connectWhatsApp}
className="w-full border border-gray-200 hover:border-green-400 hover:bg-green-50 transition p-3 sm:p-4 rounded-lg flex items-center justify-between group"
>

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center text-green-600 font-semibold">
W
</div>

<div className="flex flex-col items-start">

<span className="font-medium text-gray-900 text-sm sm:text-base">
WhatsApp
</span>

<span className="text-xs text-gray-500">
Connect WhatsApp Business
</span>

</div>

</div>

<span className="text-sm font-medium text-green-600 opacity-70 group-hover:opacity-100">
Connect
</span>

</button>

{/* INSTAGRAM */}

<button
onClick={connectInstagram}
className="w-full border border-gray-200 hover:border-pink-400 hover:bg-pink-50 transition p-3 sm:p-4 rounded-lg flex items-center justify-between group"
>

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center text-pink-600 font-semibold">
I
</div>

<div className="flex flex-col items-start">

<span className="font-medium text-gray-900 text-sm sm:text-base">
Instagram
</span>

<span className="text-xs text-gray-500">
Connect Instagram DMs
</span>

</div>

</div>

<span className="text-sm font-medium text-pink-600 opacity-70 group-hover:opacity-100">
Connect
</span>

</button>

</div>

</div>

{/* FOOTER */}

<div className="flex justify-end px-4 sm:px-6 py-4 border-t border-gray-200">

<button
onClick={onClose}
className="text-sm text-gray-500 hover:text-gray-800 transition"
>
Cancel
</button>

</div>

</div>

</div>

)

}