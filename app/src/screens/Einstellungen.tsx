import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Icon, { type IconName } from '../components/Icon'
import Screen from '../components/Screen'
import { Label } from '../components/ui'
import { ApiError } from '../lib/client'
import { STADTTEILE_BY_NAME } from '../lib/frankfurt'
import { useSession } from '../lib/session'
import { DEFAULT_THEME, getTheme, setTheme, type Theme } from '../lib/theme'

/**
 * Einstellungen.
 *
 * Everything about the person and the device, on one screen, in the order
 * someone actually looks for it: who am I, where do I count, how does it
 * look, what is real behind the scenes, and — last, and only last — the two
 * ways out.
 *
 * Sign-out used to be an unlabelled bell on the Start screen. That is the
 * kind of thing that is funny until a judge presses it mid-demo.
 */
export default function Einstellungen() {
  const navigate = useNavigate()
  const { me, signOut, updateProfile, deleteAccount } = useSession()

  const [name, setName] = useState(me?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<'out' | 'delete' | null>(null)

  if (!me) return null

  const dirty = name.trim() !== me.name

  async function save(changes: { name?: string; districtId?: string }) {
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      await updateProfile(changes)
      setSaved(true)
      // Long enough to notice, short enough not to linger over the next edit.
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  function chooseTheme(next: Theme) {
    setThemeState(next)
    setTheme(next)
  }

  async function out() {
    setBusy('out')
    await signOut()
    // The gate in App.tsx shows the login screen the moment `me` clears.
  }

  async function remove() {
    setError(null)
    setBusy('delete')
    try {
      await deleteAccount()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das Konto konnte nicht gelöscht werden.')
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  return (
    <Screen title="Einstellungen" sub={`Angemeldet als ${me.name}`} back>
      {/* ---------------------------------------------------------------
          Who this is. The avatar is Google's when there is one, and an
          initial when there is not — never a stock silhouette, which just
          makes every account look the same.
          --------------------------------------------------------------- */}
      <div className="card row" style={{ gap: 13 }}>
        <Avatar name={me.name} photoUrl={me.photoUrl} />
        <div className="grow">
          <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
            <b className="h3">{me.name}</b>
            {me.provider === 'google' ? (
              <Label>Google-Konto</Label>
            ) : (
              <Label tone="warn">ohne Konto</Label>
            )}
          </div>
          <div className="xs mut" style={{ marginTop: 3 }}>
            {me.email ?? 'Keine E-Mail hinterlegt'}
          </div>
          <div className="xs mut" style={{ marginTop: 2 }}>
            Level {me.level} · {me.xp.toLocaleString('de-DE')} XP · {me.coins.toLocaleString('de-DE')}{' '}
            Münzen
          </div>
        </div>
      </div>

      {me.provider === 'guest' && (
        <div className="card sky col" style={{ gap: 9 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="info" size={18} style={{ color: 'var(--blue-deep)', flex: 'none' }} />
            <b className="sm">Dein Fortschritt hängt an diesem Browser</b>
          </div>
          <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
            Ohne Konto sind {me.xp.toLocaleString('de-DE')} XP weg, sobald du die Website-Daten
            löschst oder das Gerät wechselst. Meldest du dich mit Google an, wird dieses Profil
            übernommen — nichts geht verloren.
          </p>
          <button className="btn sm" onClick={() => void out()} disabled={busy !== null}>
            Abmelden und mit Google anmelden
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      <p className="lbl">Profil</p>
      <div className="card col" style={{ gap: 13 }}>
        <label className="col" style={{ gap: 7 }}>
          <span className="lbl">Anzeigename</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="nickname"
          />
          <span className="xs mut">Steht auf deinen Quests und im Stadtteil-Ranking.</span>
        </label>

        {dirty && (
          <button
            className="btn primary sm"
            onClick={() => void save({ name })}
            disabled={name.trim().length < 2 || saving}
          >
            {saving ? 'Speichert …' : 'Namen speichern'}
          </button>
        )}

        <label className="col" style={{ gap: 7 }}>
          <span className="lbl">Stadtteil</span>
          <select
            className="field"
            value={me.district.id}
            onChange={(e) => void save({ districtId: e.target.value })}
            disabled={saving}
          >
            {STADTTEILE_BY_NAME.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="xs mut">
            Hierauf zahlen deine Aktionen ein. Ortsbezirk {me.district.bezirk}.
          </span>
        </label>

        {saved && (
          <span className="xs row" style={{ gap: 5, color: 'var(--blue-deep)' }}>
            <Icon name="check" size={14} stroke={2.4} />
            Gespeichert
          </span>
        )}
        {error !== null && (
          <p className="tag warn" role="alert" style={{ height: 'auto', padding: '8px 10px', lineHeight: 1.4 }}>
            {error}
          </p>
        )}
      </div>

      {/* --------------------------------------------------------------- */}
      <p className="lbl">Darstellung</p>
      <div className="card col" style={{ gap: 10 }}>
        <div className="chips">
          {(
            [
              ['light', 'Hell', 'sun'],
              ['dark', 'Dunkel', 'moon'],
              ['system', 'Wie das Gerät', 'settings'],
            ] as [Theme, string, IconName][]
          ).map(([value, label, icon]) => (
            <button
              key={value}
              className="chip"
              aria-pressed={theme === value}
              onClick={() => chooseTheme(value)}
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
        </div>
        <span className="xs mut">
          {theme === DEFAULT_THEME
            ? 'Die Ansicht, die entworfen und geprüft wurde.'
            : 'Abweichend vom entworfenen Zustand — für die Vorführung ggf. auf „Hell“ zurückstellen.'}
        </span>
      </div>

      {/* --------------------------------------------------------------- */}
      <p className="lbl">App</p>
      <div className="card flat col" style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
        <Row icon="link" label="Integrationen" hint="Was echt ist und was nachgebaut" onClick={() => navigate('/integrationen')} />
        <Row icon="shield" label="Wirkung & Nachweise" hint="Woher jede Zahl kommt" onClick={() => navigate('/wirkung')} />
        <Row icon="gift" label="Belohnungen" hint="Münzen einlösen" onClick={() => navigate('/belohnungen')} />
      </div>

      {/* ---------------------------------------------------------------
          The way out, and the way out for good. Last on the screen and
          visually quiet, because neither is a thing to hit by accident.
          --------------------------------------------------------------- */}
      <p className="lbl">Konto</p>
      <div className="card col" style={{ gap: 11 }}>
        <button className="btn ghost row" onClick={() => void out()} disabled={busy !== null}>
          <Icon name="logout" size={18} />
          {busy === 'out' ? 'Wird abgemeldet …' : 'Abmelden'}
        </button>
        <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
          {me.provider === 'google'
            ? 'Meldet dich hier und bei Google auf diesem Gerät ab. Dein Fortschritt bleibt am Konto und ist beim nächsten Anmelden wieder da.'
            : 'Ohne Konto lässt sich diese Sitzung nicht wiederherstellen — der Fortschritt hängt an diesem Browser.'}
        </p>

        <div className="sep" />

        {!confirmDelete ? (
          <button className="btn ghost danger row" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            <Icon name="trash" size={18} />
            Konto löschen
          </button>
        ) : (
          <div className="col" style={{ gap: 9 }}>
            <b className="sm">Wirklich löschen?</b>
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
              Profil, XP, Münzen, Belege und eingelöste Gutscheine werden gelöscht und lassen sich
              nicht wiederherstellen. Gemeldete Quests und Markt-Anzeigen bleiben für die
              Nachbarschaft stehen, aber ohne deinen Namen.
              {me.provider === 'google' && ' Dein Google-Konto selbst bleibt unberührt.'}
            </p>
            <div className="row" style={{ gap: 9 }}>
              <button className="btn ghost grow" onClick={() => setConfirmDelete(false)} disabled={busy !== null}>
                Abbrechen
              </button>
              <button className="btn danger grow" onClick={() => void remove()} disabled={busy !== null}>
                {busy === 'delete' ? 'Löscht …' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="xs mut" style={{ lineHeight: 1.55 }}>
        ReMain — Frankfurt Impact Challenge 2026, Team 02. Angemeldet seit{' '}
        {new Date(me.createdAt).toLocaleDateString('de-DE', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}
        .
      </p>
    </Screen>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [broken, setBroken] = useState(false)

  if (photoUrl !== null && !broken) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={54}
        height={54}
        className="avatar"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }

  return (
    <span className="avatar fallback" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function Row({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button className="listrow" onClick={onClick}>
      <Icon name={icon} size={19} className="ico" />
      <span className="grow">
        <span className="sm" style={{ display: 'block', fontWeight: 650 }}>
          {label}
        </span>
        <span className="xs mut" style={{ display: 'block' }}>
          {hint}
        </span>
      </span>
      <Icon name="chevron" size={18} className="ico" />
    </button>
  )
}
