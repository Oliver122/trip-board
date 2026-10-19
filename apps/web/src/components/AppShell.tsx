import type { Trip } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useMatch } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useTripUnread } from '../comments/useTripUnread'
import { NewsButton, NewsPanel } from '../comments/News'
import { onMembersRefresh } from '../live/bus'
import { MembersDialog } from '../members/MembersDialog'
import { cn } from '../lib/utils'
import { activeLocale } from '../i18n'
import { getTrip } from '../trips/client'
import {
  MAX_VISIBLE_MEMBERS,
  MemberAvatars,
  memberGroupLabel,
} from '../trips/TripCard'
import { Header } from './Header'
import { MoreSheet } from './phone/MoreSheet'
import { TabBar, type PhoneTab } from './phone/TabBar'
import { usePhoneView } from './phone/use-phone'
import { hoverClass } from './ui/hover'

export function AppShell() {
  const { t, i18n } = useTranslation()
  const schedule = useMatch('/trips/:id/schedule')
  const settings = useMatch('/trips/:id/settings')
  const board = useMatch('/trips/:id')
  const tripId = schedule?.params.id ?? settings?.params.id ?? board?.params.id
  const [membersOpen, setMembersOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [newsOpen, setNewsOpen] = useState(false)
  const [tripName, setTripName] = useState<string | null>(null)
  const { phone, view, setView } = usePhoneView()
  const [members, setMembers] = useState<Trip['members']>([])
  const unread = useTripUnread(tripId)

  useEffect(() => {
    setMembersOpen(false)
    setMoreOpen(false)
    setNewsOpen(false)
  }, [tripId])

  // Leaving the phone layout closes what only the phone has.
  useEffect(() => {
    if (!phone) setMoreOpen(false)
  }, [phone])

  useEffect(() => {
    if (!tripId) {
      setMembers([])
      setTripName(null)
      return
    }
    let cancelled = false
    const load = () => {
      void getTrip(tripId)
        .then((trip) => {
          if (cancelled) return
          setMembers(trip.members)
          setTripName(trip.name)
        })
        .catch(() => undefined)
    }
    load()
    const stop = onMembersRefresh((next) => {
      if (next) setMembers(next)
      else load()
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [tripId])

  useEffect(() => {
    document.documentElement.lang = activeLocale(
      i18n.resolvedLanguage ?? i18n.language,
    )
  }, [i18n.language, i18n.resolvedLanguage])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Header
        phone={phone && tripId ? { tripName } : null}
        news={
          schedule?.params.id || board?.params.id ? (
            <NewsButton
              tripId={(schedule ?? board)!.params.id!}
              total={unread}
            />
          ) : null
        }
        tabs={
          tripId ? (
            <nav aria-label={t('nav.label')} className="flex gap-1">
              <NavLink
                to={`/trips/${tripId}`}
                end
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-11 cursor-pointer items-center rounded-[8px] px-3',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : hoverClass.tab,
                  )
                }
              >
                {t('nav.board')}
              </NavLink>
              <NavLink
                to={`/trips/${tripId}/schedule`}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-11 cursor-pointer items-center rounded-[8px] px-3',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : hoverClass.tab,
                  )
                }
              >
                {t('nav.schedule')}
              </NavLink>
              <NavLink
                to={`/trips/${tripId}/settings`}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-11 cursor-pointer items-center rounded-[8px] px-3',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : hoverClass.tab,
                  )
                }
              >
                {t('trips.settings')}
              </NavLink>
            </nav>
          ) : null
        }
        members={
          tripId && members.length > 0 ? (
            <button
              type="button"
              className={cn(hoverClass.ghost, 'rounded-[8px] px-1')}
              aria-label={memberGroupLabel(t, members)}
              onClick={() => setMembersOpen(true)}
            >
              <MemberAvatars
                members={members}
                max={MAX_VISIBLE_MEMBERS}
                ring="background"
                labelled={false}
              />
            </button>
          ) : null
        }
      />
      {tripId && membersOpen ? (
        <MembersDialog tripId={tripId} onClose={() => setMembersOpen(false)} />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
      {phone && tripId ? (
        <>
          <TabBar
            tripId={tripId}
            active={activeTab(Boolean(schedule), Boolean(settings), view)}
            onView={(next) => setView(next)}
            onMore={() => setMoreOpen(true)}
          />
          {moreOpen ? (
            <MoreSheet
              tripId={tripId}
              unread={unread}
              canSeeMembers={members.length > 0}
              onClose={() => setMoreOpen(false)}
              onMembers={() => {
                setMoreOpen(false)
                setMembersOpen(true)
              }}
              onNews={() => {
                setMoreOpen(false)
                setNewsOpen(true)
              }}
            />
          ) : null}
          {newsOpen ? (
            <NewsPanel tripId={tripId} onClose={() => setNewsOpen(false)} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function activeTab(
  schedule: boolean,
  settings: boolean,
  view: 'map' | 'list',
): PhoneTab {
  if (schedule) return 'schedule'
  if (settings) return 'more'
  return view
}
