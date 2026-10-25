import type { ReactNode } from 'react'
import { Modal } from '../components/ui/modal'
import { cn } from '../lib/utils'

export function Dialog({
  title,
  closeLabel,
  onClose,
  layer = 'panel',
  badge,
  overList = false,
  children,
}: {
  title: string
  closeLabel: string
  onClose: () => void
  /** `top` stacks above another open panel, such as the spot panel. */
  layer?: 'panel' | 'top'
  /** Shown in the title row, left of the close button. */
  badge?: ReactNode
  /**
   * From 640 to 1023 px the panel covers the list column, not the map, so the
   * map keeps its width (R-42-20).
   */
  overList?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'contents',
        overList &&
          'sm:max-lg:[&_[role=dialog]]:mr-0 sm:max-lg:[&_[role=dialog]]:max-w-[280px]',
      )}
    >
      <Modal
        variant="side"
        title={title}
        closeLabel={closeLabel}
        onClose={onClose}
        layer={layer}
      >
        {badge ? (
          <div className="absolute top-0 right-16 z-10 flex h-[68px] items-center">
            {badge}
          </div>
        ) : null}
        {children}
      </Modal>
    </div>
  )
}
