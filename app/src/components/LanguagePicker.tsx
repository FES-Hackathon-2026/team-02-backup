import { setLanguage, t, useLanguage, type Language } from '../lib/i18n'

export default function LanguagePicker() {
  const language = useLanguage()
  return <label className="col" style={{ gap: 8 }}>
    <span className="sm">{t('Sprache der App')}</span>
    <select className="field" value={language} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="de" lang="de">Deutsch</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>
}
