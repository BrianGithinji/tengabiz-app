import { useRef, useState } from 'react'
import type { LoanScore } from './loanReadinessEngine'
import { fmt2 } from './utils'

interface Props {
  score: LoanScore
  businessName: string
  ownerName: string
  onClose: () => void
}

export default function LoanReportModal({ score, businessName, ownerName, onClose }: Props) {
  const today = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
  const refNo = useRef(`TBZ-${Date.now().toString(36).toUpperCase().slice(-8)}`).current
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const downloadPdf = async () => {
    const certificate = document.getElementById('loan-certificate')
    if (!certificate) {
      setDownloadError('Could not find the certificate to download. Please try again.')
      return
    }

    setDownloading(true)
    setDownloadError('')
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      await document.fonts.ready
      const colorCanvas = document.createElement('canvas')
      const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true })
      if (!colorContext) throw new Error('Could not initialize CSS color conversion.')

      const canvas = await html2canvas(certificate, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        ignoreElements: element => element.hasAttribute('data-pdf-ignore'),
        onclone: clonedDocument => {
          const clonedCertificate = clonedDocument.getElementById('loan-certificate')
          if (!clonedCertificate) throw new Error('Could not find the cloned certificate.')

          const elements = [clonedCertificate, ...clonedCertificate.querySelectorAll<HTMLElement>('*')]
          for (const element of elements) {
            const styles = clonedDocument.defaultView?.getComputedStyle(element)
            if (!styles) throw new Error('Could not read the cloned certificate styles.')

            for (let index = 0; index < styles.length; index++) {
              const property = styles[index]
              const value = styles.getPropertyValue(property)
              if (!/(?:oklab|oklch)\(/i.test(value)) continue

              const compatibleValue = value.replace(/(?:oklab|oklch)\([^)]*\)/gi, color => {
                colorContext.clearRect(0, 0, 1, 1)
                colorContext.fillStyle = color
                colorContext.fillRect(0, 0, 1, 1)
                const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data
                return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
              })
              element.style.setProperty(property, compatibleValue, 'important')
            }
          }
        },
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const margin = 10
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2
      const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      const imageWidth = canvas.width * scale
      const imageHeight = canvas.height * scale
      const image = canvas.toDataURL('image/png')

      pdf.addImage(image, 'PNG', (pdf.internal.pageSize.getWidth() - imageWidth) / 2, margin, imageWidth, imageHeight)
      const filename = businessName
        .trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'business'
      pdf.save(`${filename}-loan-assessment-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (error) {
      console.error('[loan-certificate] PDF download failed:', error)
      setDownloadError('The PDF could not be generated. Please try again or use Print / Save PDF.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      {/* Scrim — hidden on print */}
      <div className="fixed inset-0 bg-black/50 z-40 print:hidden" onClick={onClose} />

      {/* Modal container */}
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4 print:p-0 print:block print:overflow-visible">
        <div id="loan-certificate"
          className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden print:rounded-none print:shadow-none print:max-w-full">

          {/* ── Close + Print controls — hidden on print ── */}
          <div data-pdf-ignore className="flex items-center justify-between px-5 py-3 border-b border-[#e2e8f0] print:hidden">
            <p className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest">Loan Assessment Certificate</p>
            <div className="flex items-center gap-2">
              <button onClick={downloadPdf} disabled={downloading}
                className="text-xs font-semibold text-[#1a6b3c] border border-[#1a6b3c] hover:bg-[#f0faf4] disabled:opacity-60 px-3 py-1.5 rounded-full transition-colors">
                {downloading ? 'Preparing PDF...' : '⬇️ Download PDF'}
              </button>
              <button onClick={() => window.print()}
                className="text-xs font-semibold text-white bg-[#1a6b3c] hover:bg-[#0f3d22] px-3 py-1.5 rounded-full transition-colors">
                🖨️ Print / Save PDF
              </button>
              <button onClick={onClose}
                className="w-7 h-7 rounded-full bg-[#f7f7f7] flex items-center justify-center text-[#718096] hover:bg-[#e2e8f0] text-base leading-none">
                ×
              </button>
            </div>
          </div>

          {/* ── Certificate body ── */}
          <div className="px-6 py-6 space-y-5">
            {downloadError && (
              <p role="alert" className="text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2">
                {downloadError}
              </p>
            )}

            {/* Header — logo + title */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#f0faf4] border-2 border-[#1a6b3c]/20 flex items-center justify-center text-2xl shrink-0">
                🌱
              </div>
              <div>
                <p className="font-display font-black text-[#1a6b3c] text-lg tracking-tight leading-tight">TENGABIZ</p>
                <p className="text-xs text-[#718096]">Business Credit Assessment Certificate</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-widest">Ref No.</p>
                <p className="text-xs font-bold text-[#1c1c1e] font-mono">{refNo}</p>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[#e2e8f0]" />

            {/* Merchant registry block */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Merchant Details</p>
              {[
                { label: 'Business Name',  value: businessName },
                { label: 'Owner / Director', value: ownerName },
                { label: 'Assessment Date', value: today },
                { label: 'Report Type',    value: 'Automated Credit Assessment' },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-[#f0f0f0] last:border-0">
                  <span className="text-xs text-[#718096]">{r.label}</span>
                  <span className="text-xs font-semibold text-[#1c1c1e]">{r.value}</span>
                </div>
              ))}
            </div>

            {/* Green evaluation summary card */}
            <div className="rounded-2xl p-5 text-white"
              style={{ background: 'linear-gradient(135deg, #1a6b3c 0%, #2d9558 65%, #e8a020 140%)' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-green-100 text-[10px] font-bold uppercase tracking-widest mb-1">Overall Credit Score</p>
                  <p className="font-display font-black text-5xl tracking-tight leading-none">{score.overall}<span className="text-2xl text-green-200">/100</span></p>
                </div>
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white text-[#1a6b3c] uppercase tracking-widest">
                  {score.status}
                </span>
              </div>
              <div className="h-2 bg-white/30 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-white rounded-full" style={{ width: `${score.overall}%` }} />
              </div>
              <div className="bg-black/20 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-[10px] uppercase tracking-widest font-semibold">Estimated Loan Eligibility</p>
                  <p className="font-display font-black text-xl tracking-tight text-white">KES {fmt2(score.eligibility)}</p>
                </div>
                {score.preApproved && (
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white text-[#1a6b3c] uppercase tracking-widest shrink-0">
                    Pre-Approved
                  </span>
                )}
              </div>
            </div>

            {/* Sub-score breakdown */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Score Breakdown</p>
              {score.subScores.map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#4a5568] font-semibold">{s.label}</span>
                    <span className="font-black" style={{ color: s.color }}>{s.score}%</span>
                  </div>
                  <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${s.score}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-[#e2e8f0]" />

            {/* Security seal */}
            <div className="bg-[#f7f9f7] rounded-2xl p-4 flex items-start gap-3">
              <span className="text-2xl shrink-0">🛡️</span>
              <div>
                <p className="text-xs font-bold text-[#1c1c1e]">Algorithmic Security Seal</p>
                <p className="text-[11px] text-[#718096] mt-0.5 leading-snug">
                  This certificate was generated by the TENGABIZ automated credit assessment engine.
                  Score is based on verified M-PESA transaction history, savings discipline, and business lock usage.
                  Valid for 30 days from issue date.
                </p>
                <p className="text-[10px] font-mono text-[#94a3b8] mt-1.5">REF: {refNo} · {today}</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Print stylesheet */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #loan-certificate, #loan-certificate * { visibility: visible; }
          #loan-certificate { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </>
  )
}
