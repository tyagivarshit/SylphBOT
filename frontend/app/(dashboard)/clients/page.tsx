"use client"

import { useEffect,useState } from "react"
import { getClients } from "@/lib/clients"

import ClientCard from "@/components/clients/ClientCard"
import AddClientModal from "@/components/clients/AddClientModal"

import { Plus, Search } from "lucide-react"

export default function ClientsPage(){

const [clients,setClients] = useState<any[]>([])
const [open,setOpen] = useState(false)
const [loading,setLoading] = useState(true)

useEffect(()=>{

const loadClients = async()=>{

try{

const data = await getClients()
setClients(data)

}catch(err){

console.error("Clients load error",err)

}finally{

setLoading(false)

}

}

loadClients()

},[])

return(

<div className="space-y-8">

{/* HEADER */}

<div className="flex items-center justify-between flex-wrap gap-4">

<div>

<h1 className="text-2xl font-semibold text-gray-900">
Connected Platforms
</h1>

<p className="text-sm text-gray-600 mt-1">
Manage your connected messaging platforms
</p>

</div>

<button
onClick={()=>setOpen(true)}
className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
>

<Plus size={16}/>

Add Platform

</button>

</div>


{/* SEARCH */}

<div className="relative max-w-sm">

<Search
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

<input
placeholder="Search platforms..."
className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>


{/* GRID */}

{loading ? (

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">

<div className="h-32 bg-gray-200 rounded-xl"/>
<div className="h-32 bg-gray-200 rounded-xl"/>
<div className="h-32 bg-gray-200 rounded-xl"/>

</div>

) : clients.length===0 ? (

<div className="text-center py-16 text-gray-500 text-sm">

No platforms connected yet

<br/>

Click "Add Platform" to connect WhatsApp or Instagram

</div>

) : (

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

{clients.map((client)=>(

<ClientCard
key={client.id}
client={client}
/>

))}

</div>

)}


{/* MODAL */}

{open && (
<AddClientModal onClose={()=>setOpen(false)}/>
)}

</div>

)

}