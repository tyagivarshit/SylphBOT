"use client"

import {
LineChart,
Line,
XAxis,
YAxis,
Tooltip,
ResponsiveContainer,
CartesianGrid
} from "recharts"

export default function LeadsChart({data}:{data:any[]}){

return(

<div className="w-full h-56">

<ResponsiveContainer>

<LineChart data={data}>

<CartesianGrid
stroke="#9ca3af"
strokeDasharray="3 3"
/>

<XAxis
dataKey="date"
stroke="#111827"
tick={{ fill:"#111827", fontSize:12 }}
/>

<YAxis
stroke="#111827"
tick={{ fill:"#111827", fontSize:12 }}
/>

<Tooltip
contentStyle={{
background:"#ffffff",
border:"1px solid #d1d5db",
borderRadius:"8px",
color:"#111827"
}}
/>

<Line
type="monotone"
dataKey="leads"
stroke="#1d4ed8"
strokeWidth={4}
dot={{ r:5, stroke:"#1d4ed8", strokeWidth:2 }}
activeDot={{ r:7 }}
/>

</LineChart>

</ResponsiveContainer>

</div>

)

}