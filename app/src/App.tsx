import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { SessionProvider, useSession } from './lib/session'
import Abholung from './screens/Abholung'
import AbholungDetail from './screens/AbholungDetail'
import Mitteilungen from './screens/Mitteilungen'
import Touren from './screens/Touren'
import Anmelden from './screens/Anmelden'
import Belohnungen from './screens/Belohnungen'
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
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  )
}

function Gate() {
  const { me, loading } = useSession()

  // One request long. Anything more elaborate here flashes on every load.
  if (loading) {
    return (
      <div className="app">
        <div className="empty" style={{ minHeight: '100dvh', justifyContent: 'center' }}>
          <span className="spinner" />
        </div>
      </div>
    )
  }

  if (!me) return <Anmelden />

  return (
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/quests" element={<Quests />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/markt" element={<Markt />} />
      <Route path="/wirkung" element={<Wirkung />} />

      <Route path="/kalender" element={<Kalender />} />
      <Route path="/belohnungen" element={<Belohnungen />} />
      <Route path="/stadtteile" element={<Stadtteile />} />

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
