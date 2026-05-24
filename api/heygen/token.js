// Vercel serverless function — mirror of the Vite dev middleware.
// Mints a LiveAvatar session token using HEYGEN_API_KEY from server env vars,
// and lazily bootstraps an "Laker AI Advisor" context with the LSSU prompt.

const CONTEXT_NAME = 'Laker AI Advisor'

const CONTEXT_PROMPT = [
  'You are Laker AI, a recruitment advisor for Lake Superior State University (LSSU) — a small public university in Sault Ste. Marie, Michigan with ~2,000 students, 13:1 ratio, signature programs in fisheries & wildlife, robotics, cannabis chemistry (first in the U.S.), and environmental health.',
  '',
  'STYLE: Answer precisely and concisely. 2-4 sentences maximum. No preamble, no hedging, no "great question." Get straight to the point.',
  '',
  'CANONICAL ANSWERS — match these when asked:',
  '',
  'Q: Why agentic student recruitment?',
  'A: Agentic AI scales a small admissions office without scaling headcount. A 3-person team operates like a 30-person one — 24/7 outreach, instant follow-up, personalized nurture at every stage.',
  '',
  'Q: What is an SDR, BDR, and CSM agent?',
  'A: SDR (Sales Development Rep) handles initial outreach, qualifies leads, schedules campus tours, and answers FAQs 24/7. BDR (Business Development Rep) identifies new student markets and builds partnerships with high schools and community colleges. CSM (Customer Success Manager) supports enrolled students through onboarding, advising reminders, and retention.',
  '',
  'Q: How will this help small schools like LSSU?',
  'A: Small schools have great programs but thin staff. Agents handle the repetitive volume — emails, FAQs, tour booking — so the human team can spend their time on relationships, the thing LSSU is actually known for.',
  '',
  'Q: Will LSSU lose its small-school charm?',
  'A: No — it amplifies it. Agents take the busywork off staff so admissions counselors can have more real conversations, not fewer. The personal touch survives because the team finally has time for it.',
  '',
  'Q: Will AI cause job loss at small schools?',
  'A: Job transformation, not job loss. Staff shift from data entry and mass email to relationship building and strategic outreach. The work gets more human, not less.',
  '',
  'Q: What is the future of agentic onboarding and student support?',
  'A: One agent follows each student through their whole journey — pre-enrollment nudges, course advising reminders during the degree, career prep, and alumni engagement after graduation. Continuous, personalized, lifelong.',
  '',
  'For any question NOT in this list, stay in character and answer in the same precise 2-4 sentence style.',
].join('\n')

// Cached across warm invocations on the same Vercel container.
let cachedContextId = process.env.HEYGEN_CONTEXT_ID || null

async function findContextByName(apiKey, name) {
  const r = await fetch('https://api.liveavatar.com/v1/contexts?page_size=100', {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!r.ok) return null
  const j = await r.json()
  return j?.data?.results?.find(c => c.name === name) || null
}

async function ensureContextId(apiKey) {
  if (cachedContextId) return cachedContextId

  const body = {
    name: CONTEXT_NAME,
    prompt: CONTEXT_PROMPT,
    opening_text: 'Hi! I am the Laker AI Advisor. Ask me anything about LSSU.',
  }

  const existing = await findContextByName(apiKey, CONTEXT_NAME)
  if (existing) {
    const r = await fetch(`https://api.liveavatar.com/v1/contexts/${existing.id}`, {
      method: 'PATCH',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(`Failed to update context: ${j?.message || r.status}`)
    }
    cachedContextId = existing.id
    return cachedContextId
  }

  const r = await fetch('https://api.liveavatar.com/v1/contexts', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok || !j?.data?.id) throw new Error(`Failed to create context: ${j?.message || r.status}`)
  cachedContextId = j.data.id
  return cachedContextId
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) {
    res.status(500).json({
      error: 'missing_HEYGEN_API_KEY',
      hint: 'Add HEYGEN_API_KEY in Vercel project settings → Environment Variables, then redeploy.',
    })
    return
  }

  const clientPayload = (typeof req.body === 'object' && req.body !== null) ? req.body : {}
  const avatarId = clientPayload.avatar_id || process.env.HEYGEN_DEFAULT_AVATAR_ID
  if (!avatarId) {
    res.status(400).json({
      error: 'missing_avatar_id',
      hint: 'Pass avatar_id or set HEYGEN_DEFAULT_AVATAR_ID in Vercel env vars.',
    })
    return
  }

  const mode = clientPayload.mode || 'FULL'

  let avatarPersona = clientPayload.avatar_persona
  if (mode === 'FULL' && !avatarPersona?.context_id) {
    try {
      const contextId = await ensureContextId(apiKey)
      avatarPersona = { ...(avatarPersona || {}), context_id: contextId }
    } catch (err) {
      res.status(502).json({ error: 'context_bootstrap_failed', detail: String(err) })
      return
    }
  }

  const upstreamBody = {
    avatar_id: avatarId,
    mode,
    is_sandbox: clientPayload.is_sandbox ?? false,
    ...(mode === 'FULL' ? { avatar_persona: avatarPersona || {} } : {}),
    ...(clientPayload.video_settings ? { video_settings: clientPayload.video_settings } : {}),
    ...(clientPayload.max_session_duration ? { max_session_duration: clientPayload.max_session_duration } : {}),
  }

  try {
    const upstream = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody),
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(text)
  } catch (err) {
    res.status(502).json({ error: 'upstream_failed', detail: String(err) })
  }
}
