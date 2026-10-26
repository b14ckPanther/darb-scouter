// Turns raw FreeHire jobs into scored prototype fixtures (src/data/fixtures/jobs.json).
// This is a stand-in for the real backend scorer (spec §5.4): deterministic, honest, and
// every skill line quotes the FreeHire requirement it came from.
import { readFileSync, writeFileSync } from 'node:fs'

const raw = JSON.parse(readFileSync('src/data/fixtures/raw.json', 'utf8'))

// Nour's profile, seeded from zangeel.dev/cv. proven = a public repo shows it.
const PROFILE = {
  years: 2,
  skills: {
    react: 'proven', nextjs: 'proven', typescript: 'proven', javascript: 'proven', nodejs: 'proven', nestjs: 'proven',
    postgresql: 'proven', sql: 'proven', supabase: 'proven', redis: 'proven', prisma: 'proven', docker: 'proven',
    playwright: 'proven', testing: 'proven', git: 'proven', rest: 'proven', 'html-css': 'proven', tailwind: 'proven',
    cicd: 'proven', linux: 'used', 'ai-tools': 'proven', webhooks: 'used', flutter: 'used', 'react-native': 'used',
    llm: 'used', firebase: 'used', python: 'learning', aws: 'learning', java: 'learning', c: 'learning',
    microservices: 'used', 'system-design': 'used',
  },
}

// canonical skill ← patterns found in requirement text
const VOCAB = [
  ['react', /\breact(\.?js)?\b(?! native)/i, 'React'],
  ['react-native', /react native/i, 'React Native'],
  ['nextjs', /next\.?js/i, 'Next.js'],
  ['typescript', /typescript|\bts\b/i, 'TypeScript'],
  ['javascript', /javascript|\bjs\b|es6/i, 'JavaScript'],
  ['nodejs', /node(\.?js)?\b/i, 'Node.js'],
  ['nestjs', /nest\.?js/i, 'NestJS'],
  ['postgresql', /postgres/i, 'PostgreSQL'],
  ['sql', /\bsql\b|mysql|relational database|rdbms|database/i, 'SQL'],
  ['mongodb', /mongo|nosql/i, 'MongoDB / NoSQL'],
  ['redis', /redis/i, 'Redis'],
  ['docker', /docker|container/i, 'Docker'],
  ['kubernetes', /kubernetes|\bk8s\b/i, 'Kubernetes'],
  ['aws', /\baws\b|amazon web services|\bsqs\b|\bsns\b|lambda/i, 'AWS'],
  ['gcp', /\bgcp\b|google cloud/i, 'GCP'],
  ['azure', /azure/i, 'Azure'],
  ['python', /python/i, 'Python'],
  ['java', /\bjava\b(?!script)/i, 'Java'],
  ['csharp', /c#|\.net|dotnet/i, 'C# / .NET'],
  ['go', /\bgolang\b|\bgo\b(?= |,|\))/i, 'Go'],
  ['php', /\bphp/i, 'PHP'],
  ['cpp', /c\+\+/i, 'C++'],
  ['angular', /angular/i, 'Angular'],
  ['vue', /\bvue/i, 'Vue'],
  ['graphql', /graphql/i, 'GraphQL'],
  ['kafka', /kafka|rabbitmq|message queue|event-driven/i, 'Message queues'],
  ['rest', /\brest(ful)?\b|\bapis?\b/i, 'REST APIs'],
  ['webhooks', /webhook|asynchronous|async/i, 'Webhooks + async flows'],
  ['cicd', /ci\/cd|continuous integration|jenkins|github actions/i, 'CI/CD'],
  ['testing', /\btest(ing|s)?\b|tdd|jest/i, 'Automated testing'],
  ['git', /\bgit\b/i, 'Git'],
  ['html-css', /html|css/i, 'HTML / CSS'],
  ['ai-tools', /ai (coding|development) tools|copilot|cursor|claude code|ai[- ]assisted|ai[- ]driven|ai coding|claude/i, 'AI coding tools'],
  ['llm', /\bllm|genai|generative ai|rag\b|langchain|openai|\bmcps?\b|agents?\b/i, 'LLMs / GenAI'],
  ['microservices', /microservice|distributed system/i, 'Microservices'],
  ['payments', /payment|billing|stripe|paypal|adyen/i, 'Payments'],
  ['linux', /linux/i, 'Linux'],
]
const LEVEL = { proven: 1, used: 0.7, learning: 0.3 }

const EXCLUDE_COMPANY = /elbit|rafael|iai|israel aerospace|xtend|sentrycs|mobileye/i // defense + roles Nour flagged out
const REGION = /tel aviv|herzli|ramat gan|petah|petach|ra'?anana|kfar saba|netanya|holon|bnei brak|rishon|rehovot|ness ziona|yavne|haifa|yokne|caesarea|hod hasharon|kfar monash|givatayim|center|israel$/i

const YEARS = /(\d+)\s*(?:\+|-|–|to)?\s*(?:\d+\s*)?\+?\s*years?/i
const SOFT = /motivat|team player|communicat|english|hebrew|learn|passion|curious|proactive|responsib|initiative|mindset|attitude|self[- ]|independent|detail|problem[- ]solving|collaborat|ownership|eager|drive|interpersonal|quick/i
const DEGREE = /degree|b\.?sc|bachelor|gpa|student|graduate|academic|transcript|grades/i
const MUST_BUDGET = 8500
const NICE_BUDGET = 1500

// Honest by construction (spec §4): only quoted requirements earn points, every hard
// requirement gets a line (unrecognised ones score 0), and neutral facts score 0.
function score(job) {
  const lines = []
  const reqs = job.requirements.filter((r) => r.text.length > 6)
  const required = reqs.filter((r) => r.priority === 'required')

  // experience: read it from the post's own words; the structured field is only a fallback
  const yearLines = required.filter((r) => YEARS.test(r.text))
  const yearsOf = (r) => Number(r.text.match(YEARS)[1])
  const expReq = yearLines.sort((x, y) => yearsOf(y) - yearsOf(x))[0]
  const years = expReq ? yearsOf(expReq) : job.years == null ? null : Number(job.years)
  const expEvidence = expReq ? { evidence: { quote: expReq.text, display: expReq.text, source: 'freehire' } } : {}

  const skillsIn = (r) => [...new Set(VOCAB.filter(([, re]) => re.test(r.text)).map(([k]) => k))]
  // a years line still names skills ("1 year with Python and React"), so it scores them too
  const hard = (r) => !DEGREE.test(r.text) && (skillsIn(r).length > 0 || (!SOFT.test(r.text) && !YEARS.test(r.text)))
  const must = reqs.filter((r) => r.priority === 'required' && hard(r))
  const nice = reqs.filter((r) => r.priority !== 'required' && hard(r))
  // the skill budget is always 10,000: split 85/15 when both kinds exist, all to one kind otherwise
  const mustBudget = must.length ? (nice.length ? MUST_BUDGET : MUST_BUDGET + NICE_BUDGET) : 0
  const niceBudget = nice.length ? (must.length ? NICE_BUDGET : MUST_BUDGET + NICE_BUDGET) : 0
  const perMust = must.length ? mustBudget / must.length : 0
  const perNice = nice.length ? niceBudget / nice.length : 0

  for (const [list, per, kind] of [[must, perMust, 'must'], [nice, perNice, 'nice']]) {
    for (const r of list) {
      const evidence = { quote: r.text, display: r.text, source: 'freehire' }
      const skills = skillsIn(r)
      if (!skills.length) {
        lines.push({ kind, label: `Unrecognised: ${r.text.length > 48 ? r.text.slice(0, 46) + '…' : r.text}`, points: 0, evidence })
        continue
      }
      // "X or Y" counts the best-matched skill; "X, Y and Z" needs all of them, so it averages
      // and the weakest one is what you'd train
      const lv = (k) => LEVEL[PROFILE.skills[k]] ?? 0
      const either = /\bor\b|\//i.test(r.text)
      const best = skills.reduce((a, k) => (lv(k) > lv(a) ? k : a), skills[0])
      const weakest = skills.reduce((a, k) => (lv(k) < lv(a) ? k : a), skills[0])
      const lvl = either ? lv(best) : skills.reduce((a, k) => a + lv(k), 0) / skills.length
      const points = Math.round(per * lvl)
      const name = (k) => VOCAB.find(([q]) => q === k)[2]
      lines.push({
        kind,
        label: either || skills.length === 1 ? name(best) : skills.map(name).join(' + '),
        skill: either ? best : weakest,
        trainLabel: name(either ? best : weakest),
        points,
        ...(lvl < 1 ? { trainGain: Math.round(per) - points } : {}),
        evidence,
      })
    }
  }

  const sen = job.seniority ?? 'unlabeled'
  const senPts = ['junior', 'intern', 'unlabeled'].includes(sen) ? 0 : sen === 'middle' ? -800 : -3000
  lines.push({ kind: 'seniority', label: `Seniority: ${sen}`, points: senPts })

  if (years != null && years > PROFILE.years) {
    lines.push({ kind: 'experience', label: `${years}+ years required, you have ${PROFILE.years}`, points: -(years - PROFILE.years) * 1600, ...expEvidence })
  } else {
    lines.push({ kind: 'experience', label: years == null ? 'No experience minimum stated' : `${years}+ years: you meet it`, points: 0, ...expEvidence })
  }

  const deg = required.find((r) => DEGREE.test(r.text))
  if (deg) {
    const gpa = /gpa|grade|transcript|85/i.test(deg.text) || required.some((r) => /gpa|transcript|grades/i.test(r.text))
    lines.push({
      kind: 'education',
      label: gpa ? 'Degree + grades required: degree partly met, GPA unchecked' : 'Degree required: partly met (final semester)',
      points: gpa ? -600 : -300,
      evidence: { quote: deg.text, display: deg.text, source: 'freehire' },
    })
  }
  const north = /haifa|yokne|caesarea|nazareth|akko|karmiel/i.test(job.location ?? '')
  lines.push({ kind: 'location', label: north ? 'North: in your region' : 'Center: in your region', points: 0 })

  return { total: Math.max(0, lines.reduce((a, l) => a + l.points, 0)), lines }
}

const keep = raw.filter(
  (j) =>
    j.title &&
    j.company &&
    !EXCLUDE_COMPANY.test(j.company) &&
    !/united states|milan|chicago|, ca$|rio rancho|lake zurich|bourbonnais|dyer/i.test(j.location ?? '') &&
    REGION.test(j.location ?? '') &&
    !/jerusalem/i.test(j.location ?? '') &&
    !['senior', 'lead', 'principal', 'staff'].includes(j.seniority) &&
    !/director|manager|team lead|leader|expert|experienced|vlsi|physical design|marketer/i.test(j.title) &&
    j.requirements.length >= 3 &&
    // Nour has 2–3 months of the degree left: student roles needing years of study left are hidden (spec §11b)
    !j.requirements.some((r) => /remaining until graduation|years? (left|remaining)|until graduation/i.test(r.text)),
)

const city = (loc) => (loc ?? '').split(',')[0].replace(/-Yafo|-Jaffa/i, '').replace('Herzelia', 'Herzliya').trim()
// a post that names no skills can't be measured honestly, so it isn't scored at all
const scored = keep.map((j) => ({ j, s: score(j) })).filter((x) => x.s.lines.some((l) => l.skill))
// prefer real junior roles, then low-experience unlabeled ones; mix in a few honest hard ones
scored.sort((a, b) => b.s.total - a.s.total)
const pick = [
  ...scored.filter((x) => ['junior', 'intern'].includes(x.j.seniority)),
  ...scored.filter((x) => !['junior', 'intern'].includes(x.j.seniority)),
].slice(0, 20)

const now = Date.parse('2026-10-25T07:00:00Z')
const jobs = pick.map(({ j, s }, i) => ({
  id: j.slug,
  title: j.title.trim(),
  company: j.company.replace(/-internal$|\/.*$|-[0-9a-f]{12,}$/i, '').replace(/^varonis$/i, 'Varonis').trim(),
  city: city(j.location) === 'Israel' ? 'Israel (hybrid)' : city(j.location),
  workMode: j.workMode ?? 'onsite',
  url: j.url,
  postedAt: j.posted,
  // the three newest count as last night's scan
  foundAt: new Date(now - (i < 3 ? 2 : 24 + i * 9) * 3600e3).toISOString(),
  seniority: j.seniority ?? 'unlabeled',
  score: s,
}))
writeFileSync('src/data/fixtures/jobs.json', JSON.stringify(jobs, null, 2))
// the 07:00 run that found the three newest jobs
writeFileSync('src/data/fixtures/scan.json', JSON.stringify({ startedAt: new Date(now - 2 * 3600e3).toISOString() }, null, 2))
for (const x of jobs) console.log(String(x.score.total).padStart(5), x.seniority.padEnd(9), x.title, '·', x.company, '·', x.city)
