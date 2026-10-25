export default function BusinessHub() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-black text-[#1c1c1e] tracking-tight">Loan Readiness</h2>
        <p className="text-sm text-[#718096]">CRB assessment integration pending</p>
      </div>

      <section
        role="status"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-xl">ℹ️</span>
          <div>
            <h3 className="font-display font-bold text-amber-900">No CRB score available yet</h3>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              TENGABIZ has not connected to a licensed Credit Reference Bureau. We will not estimate a bureau
              score, loan amount, or approval decision from transaction data.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-800">
              A CRB assessment will only be available after an authorized provider integration is in place and
              the required customer notice and authorization have been completed.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
