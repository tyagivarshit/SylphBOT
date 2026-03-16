"use client"

import StatCard from "./StatCard"

export default function AnalyticsOverview(){

const stats = [
{title:"Total Leads",value:540,change:"+12%"},
{title:"Messages",value:1200,change:"+8%"},
{title:"AI Replies",value:870,change:"+5%"},
{title:"Bookings",value:64,change:"+22%"}
]

return(

<div className="grid md:grid-cols-4 gap-4">

{stats.map((s,i)=>( <StatCard key={i} stat={s}/>
))}

</div>

)

}
