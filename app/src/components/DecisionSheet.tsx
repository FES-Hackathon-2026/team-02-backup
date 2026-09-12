import { t } from './../lib/i18n'
import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Native modal provides focus containment, Escape and focus restoration. */
export default function DecisionSheet({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className="pickup-dialog" aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); if (!busy) onClose() }}>
    <div className="grab" />
    <div className="between"><h2 className="h2" id={titleId}>{t(title)}</h2>
      <button className="btn sm" onClick={onClose} disabled={busy} aria-label={t("Dialog schließen")}>{t("Schließen")}</button>
    </div>
    <div className="col" style={{ gap: 14, marginTop: 16 }}>{t(children)}</div>
  </dialog>
}
