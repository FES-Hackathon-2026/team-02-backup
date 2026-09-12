import { useLanguage } from './lib/i18n'
import { useEffect, useState } from 'react'
import { SplashScreen } from './components/BrandMark'
import Onboarding from './screens/Onboarding'

import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { SessionProvider, useSession } from './lib/session'
import Abholung from './screens/Abholung'
import AbholungDetail from './screens/AbholungDetail'
import Mitteilungen from './screens/Mitteilungen'
import Touren from './screens/Touren'
import Anmelden from './screens/Anmelden'
import Belohnungen from './screens/Belohnungen'
import Einstellungen from './screens/Einstellungen'
import Erkannt from './screens/Erkannt'
import Fairteiler from './screens/Fairteiler'
import Integrationen from './screens/Integrationen'
import Kalender from './screens/Kalender'
import Markt from './screens/Markt'
import MarktDetail from './screens/MarktDetail'
import Nachweis from './screens/Nachweis'
import QuestProof from './screens/QuestProof'
import Quests from './screens/Quests'
import Review from './screens/Review'
import RouteScreen from './screens/Route'
import Scan from './screens/Scan'
import Stadtteile from './screens/Stadtteile'
import Start from './screens/Start'
import LevelUp from './components/LevelUp'
import Wirkung from './screens/Wirkung'
import Wissen from './screens/Wissen'
import Vytal from './screens/Vytal'

/**
 * Real URLs, not tab state: a judge can be handed a link to one screen, the
 * back button behaves, and a reload lands where it left off.
 *
 * BASE_URL covers both hosting shapes — a repository subpath on Pages and
 * the domain root everywhere else — without a second config.
 */
/** Marks that this device has seen the introduction. */
const INTRO_KEY = 'remain.introduced'

export default function App() {
  useLanguage()
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <SessionProvider>
        <Gate />
        <LevelUp />
      </SessionProvider>
    </BrowserRouter>
  )
}

function Gate() {
  const { me, loading } = useSession()
  const { pathname } = useLocation()
  const [splash, setSplash] = useState(true)
  // Preview onboarding on every launch, even with an existing session.
  // Once per device, not once per launch. The intro exists to answer "what
  // is this", and a person who has answered that and come back is being
  // asked to sit through it again — the fastest way to make a good intro
  // feel like an obstacle. Skip counts as seen: skipping IS the answer.
  //
  // localStorage rather than the session, so closing the tab does not reset
  // it; a browser that refuses storage simply shows the intro again, which
  // is the harmless direction to fail.
  const [introduced, setIntroduced] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) !== null
    } catch {
      return false
    }
  })

  const finishIntro = () => {
    try {
      localStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* it will introduce itself again next time */
    }
    setIntroduced(true)
  }
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setSplash(false), reduced ? 0 : 1400)
    return () => window.clearTimeout(timer)
  }, [])

  if (splash || loading) return <SplashScreen />

  if (!introduced) return <Onboarding onComplete={finishIntro} />

  if (!me) return <Anmelden />

  return (
    <Routes key={pathname}>
      <Route path="/" element={<Start />} />
      <Route path="/quests" element={<Quests />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/markt" element={<Markt />} />
      <Route path="/wirkung" element={<Wirkung />} />

      <Route path="/kalender" element={<Kalender />} />
      <Route path="/belohnungen" element={<Belohnungen />} />
      <Route path="/stadtteile" element={<Stadtteile />} />
      <Route path="/einstellungen" element={<Einstellungen />} />

      {/* Wired ahead of time so the phases below never edit this file. */}
      <Route path="/nachweis/:actionId" element={<Nachweis />} />
      <Route path="/erkannt/:photoId" element={<Erkannt />} />
      <Route path="/abholung" element={<Abholung />} />
      <Route path="/abholung/:pickupId" element={<AbholungDetail />} />
      <Route path="/mitteilungen" element={<Mitteilungen />} />
      <Route path="/touren" element={<Touren />} />
      <Route path="/wissen" element={<Wissen />} />
      <Route path="/markt/:id" element={<MarktDetail />} />
      <Route path="/quests/:id/nachweis" element={<QuestProof />} />
      <Route path="/review/:submissionId" element={<Review />} />
      <Route path="/route/:questId" element={<RouteScreen />} />
      <Route path="/essen" element={<Fairteiler />} />
      <Route path="/mehrweg" element={<Vytal />} />
      <Route path="/integrationen" element={<Integrationen />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
