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
const [search,setSearch] = useState("")

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


const filtered = clients.filter((c)=>
c.platform?.toLowerCase().includes(search.toLowerCase())
)

return(

<div className="space-y-8 p-4 sm:p-6">

{/* HEADER */}

<div className="flex items-center justify-between flex-wrap gap-4">

<div>

<h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
Connected Platforms
</h1>

<p className="text-sm text-gray-500 mt-1">
Manage your connected messaging platforms
</p>

</div>

<button
onClick={()=>setOpen(true)}
className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition"
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
value={search}
onChange={(e)=>setSearch(e.target.value)}
placeholder="Search platforms..."
className="w-full px-4 py-2.5 pl-10 border border-blue-100 rounded-xl text-sm bg-white/70 backdrop-blur-xl focus:ring-2 focus:ring-blue-400 outline-none"
/>

</div>


{/* GRID */}

{loading ? (

<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 animate-pulse">

<div className="h-32 bg-white/70 border border-blue-100 rounded-2xl"/>
<div className="h-32 bg-white/70 border border-blue-100 rounded-2xl"/>
<div className="h-32 bg-white/70 border border-blue-100 rounded-2xl"/>

</div>

) : filtered.length===0 ? (

<div className="text-center py-16 text-gray-500 text-sm">

No platforms connected yet

<br/>

Click "Add Platform" to connect WhatsApp or Instagram

</div>

) : (

<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">

{filtered.map((client)=>(

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