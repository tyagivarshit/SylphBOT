"use client"

interface Props{
  value:string
  onChange:(value:string)=>void
}

export default function BusinessInfo({value,onChange}:Props){

  return(

    <div className="bg-white border rounded-xl p-5 space-y-3">

      <h3 className="font-semibold">
        Business Info
      </h3>

      <textarea
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        className="border rounded-lg px-3 py-2 w-full"
        rows={4}
        placeholder="Describe your business..."
      />

    </div>

  )

}