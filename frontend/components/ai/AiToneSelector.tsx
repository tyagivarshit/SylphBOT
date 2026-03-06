"use client"

interface Props{
  value:string
  onChange:(value:string)=>void
}

export default function AIToneSelector({value,onChange}:Props){

  return(

    <div className="bg-white border rounded-xl p-5 space-y-3">

      <h3 className="font-semibold">
        AI Tone
      </h3>

      <select
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        className="border rounded-lg px-3 py-2 w-full"
      >

        <option value="friendly">Friendly</option>

        <option value="professional">Professional</option>

        <option value="sales">Sales</option>

      </select>

    </div>

  )

}