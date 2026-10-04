import type { Analysis, ParsedResume, ResumeDraft } from './types';

export function makeDraft(r:ParsedResume):ResumeDraft {
  const summary=r.rawText.match(/(?:^|\n)summary\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:experience|education|skills|certifications|projects)\s*:?\s*(?:\n|$)|$)/i)?.[1]?.trim()??'';
  return {name:r.name,email:r.email,phone:r.phone,linkedin:r.linkedin,summary,skills:[...r.skills],education:[...r.education],experience:[...r.experience],certifications:[...r.certifications],projects:[...r.projects]};
}
export function tailorDraft(d:ResumeDraft,a:Analysis,confirmedSkills:string[]=[]):ResumeDraft {
  const matchedSet=new Set(a.matchedKeywords.map(x=>x.toLowerCase()));
  const confirmed=Array.from(new Set(a.missingKeywords.filter(value=>confirmedSkills.includes(value))));
  const skills=[...new Set([...d.skills,...confirmed])].sort((left,right)=>Number(matchedSet.has(right.toLowerCase()))-Number(matchedSet.has(left.toLowerCase())));
  const evidenceTerms=[...new Set([...a.matchedKeywords,...confirmed])].filter(term=>
    d.skills.some(skill=>skill.toLowerCase()===term.toLowerCase())||
    d.experience.some(item=>item.toLowerCase().includes(term.toLowerCase()))
  ).slice(0,5);
  const summary=d.summary.trim()||d.experience[0]?.slice(0,260)||'';
  const evidenceSentence=evidenceTerms.length?`Relevant strengths include ${evidenceTerms.join(', ')}.`:'';
  const tailoredSummary=summary.toLowerCase().includes(evidenceSentence.toLowerCase())||!evidenceSentence
    ?summary
    :`${summary.trim()} ${evidenceSentence}`;
  const experience=d.experience.map(item=>{
    const match=item.match(/^(\s*(?:[•●▪‣*-]\s*)?)(.*)$/);
    if(!match)return item;
    const strengthened=match[2]
      .replace(/^(?:was\s+)?responsible for\s+/i,'Managed ')
      .replace(/^worked on\s+/i,'Contributed to ')
      .replace(/^helped (?:to )?/i,'Supported ');
    return match[1]+strengthened;
  });
  return {...d,summary:tailoredSummary,skills,experience};
}