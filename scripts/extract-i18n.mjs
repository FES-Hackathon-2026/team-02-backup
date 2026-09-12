import ts from '../app/node_modules/typescript/lib/typescript.js'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)])
const strings = new Map()
const clean = s => s.replace(/\s+/g,' ').trim()
const display = new Set(['title','sub','label','placeholder','alt','aria-label','aria-description','aria-valuetext','hint','message','reason','note','description','name','text','unit','claim','apiLong','inputLong','estimateLong','simulatedLong'])
function add(s,file) { s=clean(s); if(s && /[A-Za-zÄÖÜäöüß]/.test(s)) { const v=strings.get(s)??new Set();v.add(path.relative(root,file));strings.set(s,v) } }
const prose = s => /[äöüÄÖÜß]/.test(s) || (/\s/.test(s) && /[A-Za-z]{3}/.test(s) && !/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|PRAGMA|WITH|DROP)\b/i.test(s) && !/[<>]|\b(?:FROM|WHERE|VALUES|JOIN)\b/.test(s)) || /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{1,35}$/.test(s)
for(const file of [...walk(root+'/app/src'),...walk(root+'/server/src')].filter(f=>/\.(tsx?|js)$/.test(f)&&!/(frankfurt|prompt|contract|db|schema)\./.test(f))) {
 const src=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 function visit(n) {
  if(ts.isJsxText(n)) add(n.text,file)
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) {
   const key=n.parent?.name?.getText(src)?.replace(/["']/g,'')
   if(display.has(key)||prose(n.text)) add(n.text,file)
  }
  if(ts.isTemplateExpression(n)) {
   const s=n.head.text+n.templateSpans.map((span,i)=>`{${i}}`+span.literal.text).join('')
   if(prose(s)) add(s,file)
  }
  ts.forEachChild(n,visit)
 }
 visit(src)
}
fs.mkdirSync(root+'/app/src/locales',{recursive:true})
const result=Object.fromEntries([...strings].sort(([a],[b])=>a.localeCompare(b)).map(([s])=>[s,s]))
fs.writeFileSync(root+'/app/src/locales/de.json',JSON.stringify(result,null,2)+'\n')

console.log('messages',strings.size,'characters',JSON.stringify(result).length)
