"use client"

import DateFilter from "./DateFilter"
import AnalyticsOverview from "./AnalyticsOverview"
import AnalyticsCharts from "./AnalyticsCharts"
import ConversionFunnel from "./ConversionFunnel"
import TopSources from "./TopSources"

export default function AnalyticsLayout(){

return(

<div className="space-y-6">

<DateFilter/>

<AnalyticsOverview/>

<AnalyticsCharts/>

<div className="grid md:grid-cols-2 gap-6">

<ConversionFunnel/>

<TopSources/>

</div>

</div>

)

}
