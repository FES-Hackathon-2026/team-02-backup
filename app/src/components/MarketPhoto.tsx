import { t } from './../lib/i18n'
import { useState } from 'react'
import type { MarketItem } from '../lib/client'
import { Thumb } from './ui'

const examples = {
  elektro: { file: 'washer', alt: 'Entsorgte Waschmaschine am Gehweg', author: 'JIP', title: 'Broken washing machine left as trash in Tapiola.jpg', license: '4.0' },
  moebel: { file: 'furniture', alt: 'Abgestellte gebrauchte Polstermöbel', author: 'JordanLyons', title: 'Abandoned furniture.jpg', license: '4.0' },
  fahrrad: { file: 'bike', alt: 'Beschädigtes Fahrrad in Hamburg', author: 'Oxfordian Kissuth', title: 'Broken Bike.jpg', license: '3.0' },
}

export default function MarketPhoto({ item, size = 92, credits = false }: { item: Pick<MarketItem, 'photoId' | 'category' | 'title'>; size?: number; credits?: boolean }) {
  const [failed, setFailed] = useState<string[]>([])
  const example = examples[item.category as keyof typeof examples]
  const upload = item.photoId ? `/api/photos/${encodeURIComponent(item.photoId)}` : null
  const original = upload && !failed.includes(upload)
  const src = original ? upload : example ? `/images/market/${example.file}.jpg` : null
  return <span className="market-photo" style={{ width: size, flex: 'none' }}>
    {t(src && !failed.includes(src) ? <img src={src} alt={t(original ? item.title : `${example.alt} — Kategoriebeispiel, nicht dieser Gegenstand`)} loading="lazy" width={size} height={size} onError={() => setFailed(previous => [...previous, src])} /> : <Thumb icon="camera" size={size} />)}
    {t(!original && <span className="xs mut">{t(src && !failed.includes(src) ? 'Beispielfoto' : 'Kein Foto verfügbar')}</span>)}
    {t(credits && !original && example && <span className="photo-credit xs mut"><a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(example.title)}`} target="_blank" rel="noreferrer">{t("Foto: ")}{t(example.author)}</a> {t(" · ")}<a href={`https://creativecommons.org/licenses/by-sa/${example.license}/`} target="_blank" rel="noreferrer">{t("CC BY-SA ")}{t(example.license)}</a><br />{t("Kategoriebeispiel; Ausschnitt für die Anzeige.")}</span>)}
  </span>
}
