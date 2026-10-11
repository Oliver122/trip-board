import type { TripRole } from '@tripboard/shared'
import { EllipsisVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Menu, MenuItem } from '../components/ui/menu'
import { KindsDialog } from './KindsDialog'

const dialogParam = 'dialog'
const kindsDialog = 'kinds'

/** Board menu with the spot kinds dialog, for board admins and the owner. */
export function BoardMenu({
  tripId,
  role,
}: {
  tripId: string
  role: TripRole
}) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  if (role !== 'admin' && role !== 'owner') return null

  const setDialog = (value: string | null) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(dialogParam, value)
        else next.delete(dialogParam)
        return next
      },
      { replace: value === null },
    )

  return (
    <>
      <Menu
        label={t('kinds.boardMenu')}
        testId="board-menu"
        trigger={<EllipsisVertical aria-hidden="true" className="size-4" />}
        triggerClassName="border border-border bg-card"
      >
        <MenuItem
          testId="board-menu-kinds"
          onSelect={() => setDialog(kindsDialog)}
        >
          {t('kinds.title')}
        </MenuItem>
      </Menu>
      {params.get(dialogParam) === kindsDialog ? (
        <KindsDialog tripId={tripId} onClose={() => setDialog(null)} />
      ) : null}
    </>
  )
}
