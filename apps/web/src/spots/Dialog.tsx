import type { ReactNode } from 'react'
import { Modal } from '../components/ui/modal'

export function Dialog({
  title,
  closeLabel,
  onClose,
  layer = 'panel',
  children,
}: {
  title: string
  closeLabel: string
  onClose: () => void
  /** `top` stacks above another open panel, such as the spot panel. */
  layer?: 'panel' | 'top'
  children: ReactNode
}) {
  return (
    <Modal
      variant="side"
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
      layer={layer}
    >
      {children}
    </Modal>
  )
}
