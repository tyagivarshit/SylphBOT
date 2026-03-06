export default function PaymentHistory() {
  return (
    <div className="bg-white border rounded-xl p-6">

      <h3 className="font-semibold mb-4">
        Payment History
      </h3>

      <table className="w-full text-sm">

        <thead className="text-gray-500 border-b">
          <tr>
            <th className="text-left pb-2">Date</th>
            <th className="text-left">Plan</th>
            <th className="text-left">Amount</th>
            <th className="text-left">Status</th>
          </tr>
        </thead>

        <tbody>

          <tr className="border-t">
            <td className="py-3">10 May 2026</td>
            <td>Pro Plan</td>
            <td>₹1999</td>
            <td className="text-green-600">Paid</td>
          </tr>

          <tr className="border-t">
            <td className="py-3">10 Apr 2026</td>
            <td>Pro Plan</td>
            <td>₹1999</td>
            <td className="text-green-600">Paid</td>
          </tr>

        </tbody>

      </table>

    </div>
  )
}