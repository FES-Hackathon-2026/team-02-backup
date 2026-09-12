import LanguagePicker from '../components/LanguagePicker'
import Onboarding from './Onboarding'
import { t, getLocale } from './../lib/i18n'
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
  const [showIntroduction, setShowIntroduction] = useState(false)
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
  if (showIntroduction) return <Onboarding onComplete={() => setShowIntroduction(false)} />

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
    <Screen title={t("Einstellungen")} sub={t(`Angemeldet als ${me.name}`)} back>
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
            <Label>{t('Google-Konto')}</Label>
          </div>
          <div className="xs mut" style={{ marginTop: 3 }}>
            {t(me.email ?? 'Keine E-Mail hinterlegt')}
          </div>
          <div className="xs mut" style={{ marginTop: 2 }}>
            {t("Level ")}{t(me.level)} {t(" · ")}{t(me.xp.toLocaleString(getLocale()))} {t(" XP · ")}{t(me.coins.toLocaleString(getLocale()))}{t(' ')}
            {t("Münzen")}</div>
        </div>
      </div>

      {/* --------------------------------------------------------------- */}
      <p className="lbl">{t("Profil")}</p>
      <div className="card col" style={{ gap: 13 }}>
        <label className="col" style={{ gap: 7 }}>
          <span className="lbl">{t("Anzeigename")}</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="nickname"
          />
          <span className="xs mut">{t("Steht auf deinen Quests und im Stadtteil-Ranking.")}</span>
        </label>

        {t(dirty && (
          <button
            className="btn primary sm"
            onClick={() => void save({ name })}
            disabled={name.trim().length < 2 || saving}
          >
            {t(saving ? 'Speichert …' : 'Namen speichern')}
          </button>
        ))}

        <label className="col" style={{ gap: 7 }}>
          <span className="lbl">{t("Stadtteil")}</span>
          <select
            className="field"
            value={me.district.id}
            onChange={(e) => void save({ districtId: e.target.value })}
            disabled={saving}
          >
            {t(STADTTEILE_BY_NAME.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            )))}
          </select>
          <span className="xs mut">
            {t("Hierauf zahlen deine Aktionen ein. Ortsbezirk ")}{t(me.district.bezirk)}{t(".")}</span>
        </label>

        {t(saved && (
          <span className="xs row" style={{ gap: 5, color: 'var(--blue-deep)' }}>
            <Icon name="check" size={14} stroke={2.4} />
            {t("Gespeichert")}</span>
        ))}
        {t(error !== null && (
          <p className="tag warn" role="alert" style={{ height: 'auto', padding: '8px 10px', lineHeight: 1.4 }}>
            {t(error)}
          </p>
        ))}
      </div>

      {/* --------------------------------------------------------------- */}
      <p className="lbl">{t('Sprache')}</p>
      <div className="card col" style={{ gap: 12 }}>
        <LanguagePicker />
        <p className="xs mut" style={{ margin: 0 }}>{t('Deine Auswahl wird auf diesem Gerät gespeichert.')}</p>
      </div>

      <p className="lbl">{t("Darstellung")}</p>
      <div className="card col" style={{ gap: 10 }}>
        <div className="chips">
          {t((
            [
              ['light', 'Hell', 'sun'],
              ['dark', 'Dunkel', 'moon'],
              ['system', 'Wie das Gerät', 'settings'],
            ] as [Theme, string, IconName][]
          ).map(([value, label, icon]) => (
            <button
              key={value}
              className="chip theme-option"
              data-theme-option={value}
              aria-pressed={theme === value}
              onClick={() => chooseTheme(value)}
            >
              <Icon name={icon} size={15} />
              {t(label)}
            </button>
          )))}
        </div>
        <span className="xs mut">
          {t(theme === DEFAULT_THEME
            ? 'Helle Darstellung'
            : 'Du kannst die Darstellung jederzeit ändern.')}
        </span>
      </div>

      {/* --------------------------------------------------------------- */}
      <p className="lbl">{t("App")}</p>
      <button className="btn" onClick={() => setShowIntroduction(true)}><Icon name="info" size={20} />{t('Einführung ansehen')}</button>
      <div className="card flat col" style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
        <Row icon="link" label={t("Integrationen")} hint="Was echt ist und was nachgebaut" onClick={() => navigate('/integrationen')} />
        <Row icon="shield" label={t("Wirkung & Nachweise")} hint="Woher jede Zahl kommt" onClick={() => navigate('/wirkung')} />
        <Row icon="gift" label={t("Belohnungen")} hint="Münzen einlösen" onClick={() => navigate('/belohnungen')} />
      </div>

      {/* ---------------------------------------------------------------
          The way out, and the way out for good. Last on the screen and
          visually quiet, because neither is a thing to hit by accident.
          --------------------------------------------------------------- */}
      <p className="lbl">{t("Konto")}</p>
      <div className="card col" style={{ gap: 11 }}>
        <button className="btn ghost row" onClick={() => void out()} disabled={busy !== null}>
          <Icon name="logout" size={18} />
          {t(busy === 'out' ? 'Wird abgemeldet …' : 'Abmelden')}
        </button>
        <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
          {t('Meldet dich aus ReMain ab. Dein Fortschritt bleibt am Konto und ist beim nächsten Anmelden wieder da.')}
        </p>

        <div className="sep" />

        {t(!confirmDelete ? (
          <button className="btn ghost danger row" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            <Icon name="trash" size={18} />
            {t("Konto löschen")}</button>
        ) : (
          <div className="col" style={{ gap: 9 }}>
            <b className="sm">{t("Wirklich löschen?")}</b>
            <p className="xs mut" style={{ margin: 0, lineHeight: 1.5 }}>
              {t("Profil, XP, Münzen, Belege und eingelöste Gutscheine werden gelöscht und lassen sich nicht wiederherstellen. Gemeldete Quests und Markt-Anzeigen bleiben für die Nachbarschaft stehen, aber ohne deinen Namen.")}{t(' Dein Google-Konto selbst bleibt unberührt.')}
            </p>
            <div className="row" style={{ gap: 9 }}>
              <button className="btn ghost grow" onClick={() => setConfirmDelete(false)} disabled={busy !== null}>
                {t("Abbrechen")}</button>
              <button className="btn danger grow" onClick={() => void remove()} disabled={busy !== null}>
                {t(busy === 'delete' ? 'Löscht …' : 'Endgültig löschen')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="xs mut" style={{ lineHeight: 1.55 }}>
        {t("ReMain — Frankfurt Impact Challenge 2026, Team 02. Angemeldet seit")}{t(' ')}
        {t(new Date(me.createdAt).toLocaleDateString(getLocale(), {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }))}
        {t(".")}</p>
    </Screen>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [broken, setBroken] = useState(false)

  if (photoUrl !== null && !broken) {
    return (
      <img
        src={photoUrl}
        alt={t("")}
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
      {t(name.trim().charAt(0).toUpperCase() || '?')}
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
          {t(label)}
        </span>
        <span className="xs mut" style={{ display: 'block' }}>
          {t(hint)}
        </span>
      </span>
      <Icon name="chevron" size={18} className="ico" />
    </button>
  )
}
