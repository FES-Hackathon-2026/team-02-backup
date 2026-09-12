import { requireUser } from '../session.js'
import { all, one } from '../db.js'
import { inviteCode, weeklyProgress, bonus } from '../engine/progression.js'

const QUESTIONS = [
  { id: 'reuse', title: 'Ein Stuhl hat ein lockeres Bein. Was prüfst du zuerst?', options: ['Weitergeben oder reparieren', 'Sofort entsorgen', 'Ohne Anmeldung rausstellen'], answer: 0, why: 'Noch nutzbare Dinge können über den Reparatur-Markt weitergegeben werden.' },
  { id: 'booking', title: 'Wann ist eine ReMain-Sammeltour bei FES verbindlich gebucht?', options: ['Sobald das Foto erkannt ist', 'Gar nicht: Die FES-Anbindung ist simuliert', 'Nach dem ersten Hinweis'], answer: 1, why: 'Die Anmeldung wird in ReMain gespeichert. Eine echte FES-Beauftragung entsteht dadurch nicht.' },
  { id: 'source', title: 'Was bedeutet „Schätzung“ an einer CO₂-Zahl?', options: ['Die Zahl wurde vor Ort gemessen', 'Die Zahl ist von dir eingegeben', 'Die Zahl wurde aus offengelegten Annahmen berechnet'], answer: 2, why: 'Schätzungen beruhen auf angegebenen Faktoren. Den Rechenweg findest du im Nachweis.' },
]
export default async function progressionRoutes(app) {
  app.get('/api/progression', async (request, reply) => {
    const user = requireUser(request, reply); if (!user) return
    return { bonuses: all("SELECT a.id AS actionId, e.title, l.xp, e.created_at AS createdAt FROM reward_events e JOIN actions a ON a.ref_id=e.id AND a.ref_table='reward_events' JOIN ledger_entries l ON l.action_id=a.id WHERE e.user_id=? ORDER BY e.created_at DESC, e.rowid DESC LIMIT 10", user.id), weekly: weeklyProgress(user.id), invitation: { code: inviteCode(user.id), xp: 50 }, quiz: { xp: 10, completed: !!one('SELECT id FROM reward_events WHERE id=?', `quiz:${user.id}:basics-v1`) }, latestLevelBonus: one("SELECT e.base_xp AS xp, a.id AS actionId FROM reward_events e JOIN actions a ON a.ref_id=e.id AND a.ref_table='reward_events' WHERE e.user_id=? AND e.id LIKE 'level:%' ORDER BY e.created_at DESC, e.rowid DESC LIMIT 1", user.id) ?? null }
  })
  app.get('/api/knowledge/quiz', async (request, reply) => {
    if (!requireUser(request, reply)) return
    return { questions: QUESTIONS.map(({ answer, why, ...question }) => question) }
  })
  app.post('/api/knowledge/quiz', async (request, reply) => {
    const user = requireUser(request, reply); if (!user) return
    const answers = request.body?.answers
    if (!Array.isArray(answers) || answers.length !== QUESTIONS.length || answers.some(a => !Number.isInteger(a) || a < 0 || a > 2)) return reply.code(422).send({ error: 'invalid_answers', message: 'Bitte alle drei Fragen beantworten.' })
    const correct = QUESTIONS.map((q, i) => answers[i] === q.answer)
    if (!correct.every(Boolean)) return { passed: false, correct, explanations: QUESTIONS.map(q => q.why) }
    const credit = bonus(user.id, `quiz:${user.id}:basics-v1`, 'Abfallwissen: drei Fragen richtig', 10, QUESTIONS.map((q, i) => `${q.title} — ${q.options[answers[i]]}`).join('\n'))
    return { passed: true, correct, credit, explanations: QUESTIONS.map(q => q.why) }
  })
}
