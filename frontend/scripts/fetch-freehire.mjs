// One-off: pull real FreeHire Israel listings into src/data/fixtures/raw.json.
// FreeHire embeds each job as a JS object literal in the page; we pull the fields we need.
import { writeFileSync, mkdirSync } from 'node:fs'

const ROLES = ['fullstack', 'backend', 'frontend']
const PAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const out = new Map()

function field(src, name) {
  const m = src.match(new RegExp(`${name}:"((?:[^"\\\\]|\\\\.)*)"`))
  return m ? JSON.parse(`"${m[1]}"`) : null
}

for (const role of ROLES) {
  for (const page of PAGES) {
    const url = `https://freehire.me/roles/${role}/israel?page=${page}`
    const res = await fetch(url, { headers: { 'user-agent': 'darb-scouter/0.1 (personal job scout; github.com/b14ckPanther)' } })
    if (!res.ok) break
    const html = await res.text()
    const chunks = html.split(/(?=\{public_slug:")/)
    for (const c of chunks) {
      const slug = field(c, 'public_slug')
      if (!slug || out.has(slug)) continue
      const reqs = [...c.matchAll(/\{text:"((?:[^"\\]|\\.)*)",priority:"(\w+)"/g)].map((m) => ({ text: JSON.parse(`"${m[1]}"`), priority: m[2] }))
      const skillsM = c.match(/skills:\[([^\]]*)\]/)
      out.set(slug, {
        slug,
        role,
        title: field(c, 'title'),
        company: field(c, 'company'),
        cities: (c.match(/cities:\[([^\]]*)\]/) || [, ''])[1],
        location: field(c, 'location'),
        url: field(c, 'url'),
        source: field(c, 'source'),
        posted: field(c, 'posted_at'),
        summary: field(c, 'summary'),
        seniority: field(c, 'seniority'),
        years: (c.match(/experience_years_min:(\d+)/) || [])[1] ?? null,
        workMode: (c.match(/work_mode:"(\w+)"/) || [])[1] ?? null,
        requirements: reqs,
        skills: skillsM ? [...skillsM[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [],
      })
    }
    await new Promise((r) => setTimeout(r, 800))
  }
}
mkdirSync('src/data/fixtures', { recursive: true })
writeFileSync('src/data/fixtures/raw.json', JSON.stringify([...out.values()], null, 1))
console.log('jobs', out.size)
