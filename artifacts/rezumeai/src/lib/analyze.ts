import type { Analysis, ParsedResume } from './types';
import { SKILL_BANK } from './resume-parser';

const stop=new Set(`the and for with from that this your you are will have our their into about who what when where how work team role job ability experience years preferred required including across using strong excellent responsible support build develop manage over under this these those them they their while where when than then such also more most some any each both each very can may must should would could able use used using per on in at to by or as is it be has had was were an a of we i he she its do does did not no if but which`.split(' '));
const phraseSkills=SKILL_BANK.filter(skill=>skill.includes(' ')).sort((a,b)=>b.length-a.length);
function tokens(s:string){return s.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g)?.filter(x=>!stop.has(x))??[]}
function escaped(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function countTerm(text:string,term:string){
  const expression=new RegExp(`(?:^|[^a-z0-9])${escaped(term).replace(/\s+/g,'\\s+')}(?=$|[^a-z0-9])`,'gi');
  return [...text.matchAll(expression)].length;
}
function hasHeader(text:string,labels:string[]){
  return labels.some(label=>new RegExp(`(?:^|\\n)\\s*${escaped(label)}\\s*:?\\s*(?:\\n|$)`,'i').test(text));
}

// Transparent TF-IDF cosine is the local semantic-similarity proxy: uncommon
// terms matter more than generic words. Exact recognized-keyword coverage is
// calculated separately and combined at the required 60/40 weights.
function tfidfCosine(a:string,b:string) {
  const left=tokens(a),right=tokens(b),vocabulary=[...new Set([...left,...right])];
  if(!vocabulary.length)return 0;
  const termFrequency=(doc:string[],term:string)=>doc.filter(item=>item===term).length;
  const vector=(doc:string[])=>vocabulary.map(term=>{
    const count=termFrequency(doc,term);
    if(!count)return 0;
    const documentFrequency=Number(left.includes(term))+Number(right.includes(term));
    const inverseDocumentFrequency=Math.log(3/(documentFrequency+1))+1;
    return (1+Math.log(count))*inverseDocumentFrequency;
  });
  const x=vector(left),y=vector(right),dot=x.reduce((sum,n,index)=>sum+n*y[index],0);
  const norm=(v:number[])=>Math.sqrt(v.reduce((sum,n)=>sum+n*n,0));
  return norm(x)&&norm(y)?dot/(norm(x)*norm(y)):0;
}

export function analyzeResume(r:ParsedResume,jd:string):Analysis {
  const source=r.rawText.toLowerCase(),job=jd.toLowerCase();
  const foundSkills=SKILL_BANK.filter(skill=>countTerm(job,skill)>0);
  const rolePhrases=phraseSkills.filter(skill=>countTerm(job,skill)>0);
  const meaningfulTerms=[...new Set(tokens(jd).filter(token=>token.length>3))];
  const jobTerms=[...new Set([...foundSkills,...rolePhrases,...meaningfulTerms])].slice(0,80);
  const matched=jobTerms.filter(term=>countTerm(source,term)>0);
  const missing=jobTerms.filter(term=>countTerm(source,term)===0);
  const weak=matched.filter(term=>countTerm(source,term)===1).slice(0,8);

  const keywordScore=jobTerms.length?Math.round(matched.length/jobTerms.length*100):0;
  const semanticScore=Math.round(tfidfCosine(source,jd)*100);
  const matchScore=Math.round(semanticScore*.6+keywordScore*.4);
  const headerScore=
    (hasHeader(source,['experience','work experience','professional experience','employment','employment history','work history'])?5:0)+
    (hasHeader(source,['education','academic background'])?4:0)+
    (hasHeader(source,['skills','core competencies','technical skills','expertise'])?4:0)+
    (hasHeader(source,['summary','professional summary','profile','professional profile'])?3:0)+
    (hasHeader(source,['certifications','licenses','certificates'])?2:0)+
    (hasHeader(source,['projects','selected projects','portfolio'])?2:0);
  const contactScore=(r.name?3:0)+(r.email?3:0)+(r.phone?2:0)+(r.linkedin?2:0);
  const formattingScore=r.formatInspectionAvailable?Math.max(0,15-Math.min(15,r.formattingIssues.length*5)):8;
  const lines=r.rawText.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const wordCount=r.rawText.trim().split(/\s+/).filter(Boolean).length;
  const lengthPoints=wordCount>=300&&wordCount<=1100?5:wordCount>=180&&wordCount<=1400?3:1;
  const bulletLines=lines.filter(line=>/^(?:[•●▪‣*-]|\d+[.)])\s+/.test(line)).length;
  const bulletPoints=bulletLines>=4?4:bulletLines>=2?2:0;
  const actionVerb=/^(?:led|built|created|developed|launched|managed|designed|analyzed|analysed|improved|increased|reduced|delivered|implemented|automated|streamlined|coordinated|collaborated|partnered|owned|drove|achieved|generated|negotiated|supported|conducted|presented|established|optimized|optimised|transformed|executed|produced|resolved|spearheaded|trained|mentored|facilitated|influenced|advised|authored|configured|deployed|maintained|researched|tested|monitored|forecasted|secured|strengthened|accelerated|expanded|saved|raised|reported|oversaw|supervised|formulated|evaluated|validated|introduced|published|delivered|championed)\b/i;
  const actionLines=lines.filter(line=>actionVerb.test(line.replace(/^(?:[•●▪‣*-]|\d+[.)])\s+/,''))).length;
  const actionPoints=actionLines>=3?3:actionLines>=1?2:0;
  const quantifiedLines=lines.filter(line=>/(?:\b\d+(?:[,.]\d+)?\s?%|\$\s?\d[\d,.]*|\b\d[\d,.]*\+?\s+(?:users|customers|clients|projects|people|employees|revenue|budget|teams|hours|days|weeks|months|years|accounts|leads|transactions|orders|sites|locations|reports|products|markets)\b)/i.test(line)).length;
  const impactPoints=quantifiedLines>=2?3:quantifiedLines===1?2:0;
  const qualityScore=lengthPoints+bulletPoints+actionPoints+impactPoints;
  const breakdown={
    keywordCoverage:Math.round(keywordScore*.4),
    sectionHeaders:headerScore,
    formatting:formattingScore,
    contactInfo:contactScore,
    resumeQuality:qualityScore
  };
  const atsScore=Object.values(breakdown).reduce((sum,value)=>sum+value,0);
  const issues:string[]=[];
  if(!r.email||!r.phone)issues.push('Add complete contact details, including both email and phone.');
  if(!r.linkedin)issues.push('Add a LinkedIn profile URL so recruiters can verify your professional presence.');
  if(!hasHeader(source,['skills','core competencies','technical skills','expertise']))issues.push('Add a clearly labelled Skills section so ATS readers can identify your capabilities.');
  if(!hasHeader(source,['experience','work experience','professional experience','employment','employment history','work history']))issues.push('Use a conventional Experience heading with concise, scannable entries.');
  if(!hasHeader(source,['education','academic background']))issues.push('Add an Education heading; standard labels improve parsing.');
  if(r.formattingIssues.length)issues.push(...r.formattingIssues);
  if(!r.formatInspectionAvailable)issues.push('Formatting could not be fully checked from pasted or plain text; use the original PDF/DOCX to review columns, tables, images, and fonts.');
  const suggestions=[
    missing.length?`Add evidence for ${missing.slice(0,3).join(', ')} only where it accurately reflects your experience.`:'Your resume covers the key terms identified in this job description. Keep the wording specific.',
    !hasHeader(source,['summary','professional summary','profile','professional profile'])?'Add a short, evidence-based summary connecting your experience to this role.':'Make the opening summary emphasize your most relevant, verifiable results.',
    'Use concise bullet points, start them with clear action verbs, and include measurable outcomes only when you can verify them.',
    'Keep section headings conventional and use a single-column, text-first layout. PDF font details may need a manual check.'
  ];
  return {matchScore,semanticScore,keywordScore,matchedKeywords:matched.slice(0,15),missingKeywords:missing.slice(0,15),weakKeywords:weak,atsScore,atsBreakdown:breakdown,issues,suggestions};
}