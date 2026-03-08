export default function PlanCard() {

  return (

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* PLAN 1 */}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">

        <div>

          <h3 className="text-lg font-semibold text-gray-900">
            RESPONDER
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            ₹999 / month
          </p>

        </div>

        <ul className="text-sm text-gray-600 space-y-2">

          <li>✔ AI replies to WhatsApp messages</li>
          <li>✔ AI replies to Instagram DMs</li>
          <li>✔ AI replies to Instagram comments</li>
          <li>✔ Basic automation</li>

        </ul>

        <button className="w-full bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-4 py-2 rounded-lg">
          Choose Plan
        </button>

      </div>


      {/* PLAN 2 */}

      <div className="bg-white border-2 border-blue-600 rounded-xl p-6 shadow-md space-y-5">

        <div className="flex items-center justify-between">

          <div>

            <h3 className="text-lg font-semibold text-gray-900">
              LEADS
            </h3>

            <p className="text-sm text-gray-500 mt-1">
              ₹1999 / month
            </p>

          </div>

          <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
            POPULAR
          </span>

        </div>

        <ul className="text-sm text-gray-600 space-y-2">

          <li>✔ Everything in Responder</li>
          <li>✔ Lead capture system</li>
          <li>✔ Leads dashboard</li>
          <li>✔ Lead stage tracking</li>
          <li>✔ Conversation history</li>

        </ul>

        <button className="w-full bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-4 py-2 rounded-lg">
          Choose Plan
        </button>

      </div>


      {/* PLAN 3 */}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">

        <div>

          <h3 className="text-lg font-semibold text-gray-900">
            AUTOMATION
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            ₹3999 / month
          </p>

        </div>

        <ul className="text-sm text-gray-600 space-y-2">

          <li>✔ Everything in Leads</li>
          <li>✔ Meeting booking automation</li>
          <li>✔ Calendar scheduling</li>
          <li>✔ Follow-up automation</li>
          <li>✔ Advanced AI workflows</li>

        </ul>

        <button className="w-full bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-4 py-2 rounded-lg">
          Choose Plan
        </button>

      </div>

    </div>

  )

}