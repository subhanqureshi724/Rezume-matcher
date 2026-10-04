import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import type { ResumeDraft } from './types';

export async function downloadResume(d:ResumeDraft) {
  const children:any[]=[];
  children.push(new Paragraph({text:d.name||'Resume',heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER}));
  children.push(new Paragraph({children:[new TextRun([d.email,d.phone,d.linkedin].filter(Boolean).join('  |  '))],alignment:AlignmentType.CENTER,spacing:{after:260}}));
  const add=(title:string,rows:string[])=>{if(!rows.length)return;children.push(new Paragraph({text:title,heading:HeadingLevel.HEADING_2,spacing:{before:180,after:80}}));rows.forEach(row=>children.push(new Paragraph({text:row,bullet:{indent:260},spacing:{after:60}})))};
  if(d.summary){children.push(new Paragraph({text:'SUMMARY',heading:HeadingLevel.HEADING_2}));children.push(new Paragraph({text:d.summary,spacing:{after:100}}))}
  add('SKILLS',[d.skills.join('  •  ')]);add('EXPERIENCE',d.experience);add('EDUCATION',d.education);add('CERTIFICATIONS',d.certifications);add('PROJECTS',d.projects);
  const doc=new Document({sections:[{properties:{},children}]});
  const blob=await Packer.toBlob(doc), url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;link.download=`${(d.name||'resume').trim().replace(/\s+/g,'-').toLowerCase()}-ats-resume.docx`;link.click();URL.revokeObjectURL(url);
}