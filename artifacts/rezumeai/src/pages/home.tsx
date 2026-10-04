import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ArrowDown, ArrowRight, CircleHelp, FileCheck2, FileText, Lightbulb, LockKeyhole, RotateCcw, Upload, WandSparkles, X } from 'lucide-react';
import { analyzeResume } from '@/lib/analyze';
import { extractResume, parseResumeText } from '@/lib/resume-parser';
import { makeDraft, tailorDraft } from '@/lib/tailor';
import type { Analysis, ParsedResume, ResumeDraft } from '@/lib/types';
import AuthActions from '@/components/auth-actions';

const exampleResume=`Maya Chen
maya.chen@email.com | (415) 555-0182 | linkedin.com/in/maya-chen

SUMMARY
Product analyst with four years of experience turning customer and product data into clear decisions.

EXPERIENCE
Product Analyst — Northstar Labs | 2022–Present
Built SQL dashboards and Tableau reporting used by product and marketing teams.
Partnered cross-functionally to define product metrics and communicate quarterly insights.
Associate Analyst — Fieldwork | 2020–2022
Analyzed customer feedback and presented research findings to senior stakeholders.

EDUCATION
B.S. Information Systems — University of Oregon, 2020

SKILLS
SQL, Tableau, Excel, data analysis, communication, stakeholder management, research

CERTIFICATIONS
Tableau Desktop Specialist`;
const exampleJob=`We’re looking for a Product Data Analyst to help our product teams make better decisions. You’ll build and maintain SQL queries and dashboards, partner with cross-functional stakeholders, and translate product usage data into clear recommendations.

What you’ll do:
• Define product metrics and track performance across customer journeys
• Communicate insights to product, design, and marketing partners
• Conduct user research and analyze experiments

What we’re looking for:
• 3+ years in product analytics or data analysis
• Strong SQL and dashboarding skills (Tableau preferred)
• Excellent written communication and stakeholder management
• Experience with experimentation and product strategy`;

type View='analysis'|'builder'|'compare';
type UploadFeedback={name:string;size:number;status:'reading'|'ready'|'error';message:string};
const pct=(n:number)=>`${Math.max(0,Math.min(100,n))}%`;
const formatBytes=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;
function cloneDraft(d:ResumeDraft):ResumeDraft{
  return {...d,skills:[...d.skills],education:[...d.education],experience:[...d.experience],certifications:[...d.certifications],projects:[...d.projects]};
}
function draftAsResume(d:ResumeDraft):ParsedResume{
  const raw=[d.name,d.email,d.phone,d.linkedin,d.summary,'Skills',...d.skills,'Experience',...d.experience,'Education',...d.education,'Certifications',...d.certifications,'Projects',...d.projects].filter(Boolean).join('\n');
  return {...d,rawText:raw,skills:d.skills,education:d.education,experience:d.experience,certifications:d.certifications,projects:d.projects,formattingIssues:[],formatInspectionAvailable:true};
}
function ScoreRing({score}:{score:number}) {
  return <div className="score-ring" style={{background:`conic-gradient(#49846d ${score*3.6}deg,#dce5dc ${score*3.6}deg)`}}><div className="score-inner"><div className="score-value" data-testid="text-match-score">{score}</div><div className="score-unit">out of 100</div></div></div>;
}
function ItemList({items,kind}:{items:string[];kind:'found'|'missing'|'weak'}) {
  const names={found:'matched',missing:'missing',weak:'weak'};
  if(!items.length)return <span className="explain">No {names[kind]} terms to show yet.</span>;
  return <div className="keyword-wrap">{items.map((item,i)=><span className={`keyword ${kind}`} key={`${item}-${i}`} data-testid={`keyword-${names[kind]}-${i}`}>{item}</span>)}</div>;
}
function ScoreBars({analysis}:{analysis:Analysis}) {
  const rows=[['TF-IDF text similarity',analysis.semanticScore],['Exact keyword overlap',analysis.keywordScore],['Resume quality',analysis.atsBreakdown.resumeQuality/15*100]];
  return <>{rows.map(([label,value])=><div className="progress-row" key={label as string} data-testid={`metric-${String(label).toLowerCase().replaceAll(' ','-')}`}><span>{label}</span><div className="progress-track"><div className="progress-fill" style={{width:pct(Number(value))}}/></div><span className="progress-val">{Math.round(Number(value))}</span></div>)}</>;
}

export default function Home() {
  const fileRef=useRef<HTMLInputElement>(null);
  const [resumeText,setResumeText]=useState('');
  const [jd,setJd]=useState('');
  const [fileName,setFileName]=useState('');
  const [uploadFeedback,setUploadFeedback]=useState<UploadFeedback|null>(null);
  const [parsed,setParsed]=useState<ParsedResume|null>(null);
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [beforeAnalysis,setBeforeAnalysis]=useState<Analysis|null>(null);
  const [draft,setDraft]=useState<ResumeDraft|null>(null);
  const [beforeDraft,setBeforeDraft]=useState<ResumeDraft|null>(null);
  const [verifiedKeywords,setVerifiedKeywords]=useState<string[]>([]);
  const [activeView,setActiveView]=useState<View>('analysis');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [exporting,setExporting]=useState(false);
  const chooseFile=async(file?:File)=>{
    if(!file)return;
    setError('');
    setFileName(file.name);setUploadFeedback({name:file.name,size:file.size,status:'reading',message:'Reading this file locally…'});
    setAnalysis(null);setBeforeAnalysis(null);setDraft(null);setVerifiedKeywords([]);
    setBeforeDraft(null);setResumeText('');setParsed(null);
    if(fileRef.current)fileRef.current.value='';
    try {
      if(file.size>10*1024*1024)throw new Error('This file is over 10 MB. Choose a smaller resume file.');
      const result=await extractResume(file);
      setParsed(result);setResumeText(result.rawText);
      setUploadFeedback({name:file.name,size:file.size,status:'ready',message:`Resume text loaded · ${result.rawText.length.toLocaleString()} characters`});
    } catch(e) {
      const message=e instanceof Error?e.message:'This file could not be read. Try a PDF, DOCX, or TXT file.';
      setError(message);setParsed(null);setUploadFeedback({name:file.name,size:file.size,status:'error',message});
    }
  };
  const onFileChange=(e:ChangeEvent<HTMLInputElement>)=>void chooseFile(e.target.files?.[0]);
  const onDrop=(e:DragEvent<HTMLDivElement>)=>{e.preventDefault();void chooseFile(e.dataTransfer.files?.[0])};
  const runAnalysis=()=>{
    setError('');
    if(!resumeText.trim()){setError('Add your resume text or upload a resume to get started.');return}
    if(!jd.trim()){setError('Paste the target job description before analyzing.');return}
    if(resumeText.trim().length<40){setError('Add a little more resume detail — at least a few sentences or sections.');return}
    setBusy(true);
    window.setTimeout(()=>{
      try {
        const resume=parsed?.rawText===resumeText?parsed:parseResumeText(resumeText);
        if(!resume.name&&!resume.skills.length&&!resume.experience.length)throw new Error('We could not identify readable resume sections. Check the text and try again.');
        const result=analyzeResume(resume,jd);
        const originalDraft=makeDraft(resume);
        setParsed(resume);setAnalysis(result);setBeforeAnalysis({...result});setDraft(originalDraft);setBeforeDraft(cloneDraft(originalDraft));setVerifiedKeywords([]);setActiveView('analysis');
        window.setTimeout(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
      } catch(e){setError(e instanceof Error?e.message:'Analysis could not be completed. Please review your inputs.')}
      finally{setBusy(false)}
    },350);
  };
  const loadExample=()=>{
    setParsed(parseResumeText(exampleResume));setResumeText(exampleResume);setFileName('Maya-Chen-Example-Resume.txt');setUploadFeedback({name:'Maya-Chen-Example-Resume.txt',size:new Blob([exampleResume]).size,status:'ready',message:'Example resume text loaded'});setJd(exampleJob);setAnalysis(null);setBeforeAnalysis(null);setDraft(null);setBeforeDraft(null);setVerifiedKeywords([]);setError('');
  };
  const updateDraft=(key:keyof ResumeDraft,value:string)=>{
    if(!draft)return;
    const next={...draft,[key]:key==='skills'||key==='education'||key==='experience'||key==='certifications'||key==='projects'?value.split('\n').map(x=>x.trim()).filter(Boolean):value} as ResumeDraft;
    setDraft(next);setAnalysis(analyzeResume(draftAsResume(next),jd));
  };
  const applyTailoring=()=>{
    if(!draft||!analysis)return;
    const next=tailorDraft(draft,analysis,verifiedKeywords);
    setDraft(next);
    setAnalysis(analyzeResume(draftAsResume(next),jd));
  };
  const exportFile=async()=>{
    if(!draft)return;
    setExporting(true);
    try{const {downloadResume}=await import('@/lib/export-docx');await downloadResume(draft)}catch{setError('The DOCX could not be created. Please try again.')}
    finally{setExporting(false)}
  };
  const clearResume=()=>{setParsed(null);setResumeText('');setFileName('');setUploadFeedback(null);setAnalysis(null);setBeforeAnalysis(null);setDraft(null);setBeforeDraft(null);setVerifiedKeywords([]);setError('');if(fileRef.current)fileRef.current.value=''};
  const setView=(view:View)=>{setActiveView(view);window.setTimeout(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
  const comparisonFields:[string,keyof ResumeDraft][]=[['Name','name'],['Email','email'],['Phone','phone'],['LinkedIn','linkedin'],['Summary','summary'],['Skills','skills'],['Experience','experience'],['Education','education'],['Certifications','certifications'],['Projects','projects']];
  const draftChanges=beforeDraft&&draft?comparisonFields.flatMap(([label,key])=>{
    const before=beforeDraft[key],after=draft[key];
    const toText=(value:string|string[])=>Array.isArray(value)?value.join('\n'):value;
    const oldText=toText(before),newText=toText(after);
    return oldText===newText?[]:[{label,before:oldText||'Not included',after:newText||'Removed'}];
  }):[];
  const matchDelta=analysis?(analysis.matchScore-(beforeAnalysis?.matchScore??analysis.matchScore)):0;
  const atsDelta=analysis?(analysis.atsScore-(beforeAnalysis?.atsScore??analysis.atsScore)):0;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><FileCheck2 size={17}/></span><span>Rezume</span></div>
      <div className="header-actions"><AuthActions/><a className="companion-link" href={`${import.meta.env.BASE_URL}streamlit/`}>Python companion</a><div className="nav-note"><span className="privacy-dot"/><span>Your resume stays on this device</span><LockKeyhole size={13}/></div></div>
    </header>
    <main className="page">
      <div className="intro">
        <div><div className="eyebrow">A clearer path to your next role</div><h1>Make your resume<br/>fit the opportunity.</h1><p>Understand what already matches. See what could be stronger.</p></div>
        <div className="stepper" aria-label="Analysis steps"><button type="button" className={`step step-action ${!analysis?'active':''}`} onClick={()=>document.getElementById('resume-input')?.focus()}><span className="step-num">1</span><span>Add materials</span></button><span className="step-line"/><button type="button" className={`step step-action ${analysis&&activeView==='analysis'?'active':''}`} onClick={()=>analysis&&setView('analysis')} disabled={!analysis}><span className="step-num">2</span><span>Review fit</span></button><span className="step-line"/><button type="button" className={`step step-action ${analysis&&activeView!=='analysis'?'active':''}`} onClick={()=>analysis&&setView('builder')} disabled={!analysis}><span className="step-num">3</span><span>Refine</span></button></div>
      </div>
      <section className="workspace-grid" aria-label="Resume and job description">
        <div className="panel input-panel">
          <div className="panel-heading"><div><div className="panel-title">Start with your materials</div><div className="panel-kicker">Nothing leaves your browser.</div></div><span className="badge">PRIVATE BY DESIGN</span></div>
          <div className="upload-zone" onDragOver={e=>e.preventDefault()} onDrop={onDrop} data-testid="dropzone-resume">
            <div className="upload-icon"><Upload size={18}/></div><div className="upload-copy"><strong>{fileName||'Drop your resume here'}</strong><span>{uploadFeedback?.status==='reading'?'Reading locally…':uploadFeedback?.status==='error'?'Could not read · see details below':fileName?'Resume loaded · local file':'PDF, DOCX or TXT · up to 10 MB'}</span></div>
            {fileName?<button className="subtle-btn" onClick={clearResume} data-testid="button-remove-resume" aria-label="Remove resume"><X size={13}/></button>:<button className="subtle-btn" onClick={()=>fileRef.current?.click()} data-testid="button-upload-resume">Choose file</button>}
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={onFileChange} data-testid="input-resume-file"/>
          </div>
          {uploadFeedback&&<div className={`upload-summary upload-${uploadFeedback.status}`} role="status" aria-live="polite" data-testid="status-upload"><FileText size={16}/><div className="upload-summary-copy"><strong title={uploadFeedback.name}>{uploadFeedback.name}</strong><span>{formatBytes(uploadFeedback.size)} · {uploadFeedback.message}</span></div>{uploadFeedback.status==='reading'&&<RotateCcw size={14} className="spin"/>}</div>}
          <div className="or-label">or paste resume text</div>
          <label className="field-label" htmlFor="resume-input">Resume text <span>{resumeText.length?`${resumeText.length.toLocaleString()} chars`:''}</span></label>
           <textarea id="resume-input" className="text-area resume-area" placeholder="Paste your resume here. We’ll identify the key sections for you." value={resumeText} onChange={e=>{setResumeText(e.target.value);setParsed(null);setFileName('');setUploadFeedback(null);setAnalysis(null);setBeforeAnalysis(null);setDraft(null);setBeforeDraft(null);setVerifiedKeywords([])}} data-testid="input-resume-text"/>
          <div className="label-row"><label className="field-label" htmlFor="job-input" style={{margin:0}}>Target job description</label><span className="eyebrow" style={{fontSize:9}}>REQUIRED</span></div>
            <textarea id="job-input" className="text-area jd-area" placeholder="Paste the full job description for a more useful comparison…" value={jd} onChange={e=>{setJd(e.target.value);setAnalysis(null);setBeforeAnalysis(null);setDraft(null);setBeforeDraft(null);setVerifiedKeywords([])}} data-testid="input-job-description"/>
          <div className="samples"><span style={{fontSize:10,color:'#8c958e',alignSelf:'center'}}>Need a starting point?</span><button className="sample-chip" onClick={loadExample} data-testid="button-load-example">Load example materials</button></div>
          <button className="analyze-btn" onClick={runAnalysis} disabled={busy} data-testid="button-analyze">{busy?<><RotateCcw size={15} className="spin"/>Comparing your materials…</>:<>Analyze my fit <ArrowRight size={15}/></>}</button>
          {error&&<div className="error-message" role="alert" data-testid="status-error">{error}</div>}
        </div>
        <div className="panel preview-panel">
           <div className="preview-top"><div><div className="panel-title">Your fit at a glance</div><div className="panel-kicker">{analysis?'A transparent, local comparison':'A useful starting point, not a verdict.'}</div></div><span className="badge">{analysis?'ANALYZED':'READY WHEN YOU ARE'}</span></div>
           {analysis?<><ScoreRing score={analysis.matchScore}/><div style={{textAlign:'center',fontSize:12,color:'#52675d',fontWeight:600}} data-testid="text-fit-summary">{analysis.matchScore>=70?'Strong alignment':analysis.matchScore>=45?'Some promising overlap':'Room to sharpen the match'}</div><p style={{textAlign:'center',maxWidth:280,margin:'7px auto 16px',fontSize:11,color:'#849087',lineHeight:1.55}}>Match = 60% TF-IDF cosine similarity + 40% exact keyword overlap. It is a guide, not a hiring prediction.</p><div className="progress-row" style={{gridTemplateColumns:'84px 1fr 30px',maxWidth:340,margin:'0 auto 12px'}}><span>ATS readiness</span><div className="progress-track"><div className="progress-fill" style={{width:pct(analysis.atsScore)}}/></div><span className="progress-val">{analysis.atsScore}</span></div></>:busy?<div className="empty-center" aria-live="polite"><div className="skeleton-circle"/><div className="skeleton" style={{width:156,margin:'0 auto 10px'}}/><div className="skeleton" style={{width:228,margin:'0 auto 7px'}}/><div className="skeleton" style={{width:182,margin:'0 auto'}}/></div>:<div className="empty-center"><div className="empty-art"><FileText size={30} strokeWidth={1.35}/></div><h3>Your next step, made clearer.</h3><p>Add a resume and a job description. We’ll show you where your experience lines up — and where the wording may be getting in the way.</p></div>}
          <div className="preview-foot"><span><LockKeyhole size={12} style={{verticalAlign:'-2px',marginRight:5}}/>Processed locally in this browser</span><span>{analysis?'EXPLAINABLE SCORING':'NO ACCOUNT NEEDED'}</span></div>
        </div>
      </section>
      {analysis&&draft&&<section className="below-section" id="results" data-testid="section-results">
        <div className="section-head"><div><div className="eyebrow">The useful detail</div><h2>From insight to a stronger draft.</h2></div>
          <div className="tabs" role="tablist" aria-label="Analysis views">
             {([['analysis','Match & ATS Analysis'],['builder','Resume Builder'],['compare','Before vs After']] as [View,string][]).map(([id,label])=><button role="tab" aria-selected={activeView===id} className={`tab-btn ${activeView===id?'selected':''}`} onClick={()=>setView(id)} key={id} data-testid={`tab-${id}`}>{label}</button>)}
          </div>
        </div>
        {activeView==='analysis'&&<div className="results-grid">
           <div className="panel result-card"><div className="card-header"><h3>Match & ATS analysis</h3><span className="mini-score">ATS {analysis.atsScore} / 100</span></div><p className="explain">Match = 60% TF-IDF cosine similarity + 40% exact keyword overlap. ATS categories follow the transparent 40/20/15/10/15 point rubric below.</p><ScoreBars analysis={analysis}/><div style={{marginTop:18}}><div className="field-label">ATS score breakdown <span>POINTS / MAX</span></div>{([['Keyword coverage',analysis.atsBreakdown.keywordCoverage,40],['Section headers',analysis.atsBreakdown.sectionHeaders,20],['Formatting',analysis.atsBreakdown.formatting,15],['Contact information',analysis.atsBreakdown.contactInfo,10],['Length, bullets & impact',analysis.atsBreakdown.resumeQuality,15]] as [string,number,number][]).map(([label,value,max])=><div className="progress-row" key={label} data-testid={`ats-category-${label.toLowerCase().replaceAll(' ','-')}`}><span>{label}</span><div className="progress-track"><div className="progress-fill" style={{width:pct(value/max*100)}}/></div><span className="progress-val">{value}/{max}</span></div>)}</div></div>
          <div className="panel result-card"><div className="card-header"><h3>Words the role is looking for</h3><CircleHelp size={15} color="#9aa39c"/></div><p className="explain">Green means found in your resume. Red means absent. Gold flags terms that appear only once and may need clearer context.</p><div className="keyword-wrap" style={{marginBottom:14}}><ItemList items={analysis.matchedKeywords} kind="found"/><ItemList items={analysis.weakKeywords} kind="weak"/><ItemList items={analysis.missingKeywords} kind="missing"/></div><div style={{display:'flex',gap:13,fontSize:9,color:'#818b84',marginBottom:17}}><span><i className="privacy-dot" style={{display:'inline-block',background:'#6eaa83',marginRight:5}}/>Found</span><span style={{color:'#b25548'}}>■ Missing</span><span style={{color:'#a88a45'}}>■ Needs context</span></div><div className="card-header" style={{marginBottom:8}}><h3>Practical next steps</h3><span className="badge">{analysis.suggestions.length} IDEAS</span></div>{analysis.suggestions.map((s,i)=><div className="suggestion" key={i}><span className="suggestion-mark">{String(i+1).padStart(2,'0')}</span><span>{s}</span></div>)}</div>
          {analysis.issues.length>0&&<div className="panel result-card" style={{gridColumn:'1/-1'}}><div className="card-header"><h3>Parsing notes</h3><span className="badge">WORTH A LOOK</span></div><div className="keyword-wrap">{analysis.issues.map((issue,i)=><div key={i} className="suggestion" style={{border:0,padding:'5px 0',minWidth:'45%'}}><span style={{color:'#b17843'}}><CircleHelp size={15}/></span>{issue}</div>)}</div></div>}
        </div>}
        {activeView==='builder'&&<><div className="builder-layout">
          <div className="panel editor"><h3>Edit your resume draft</h3><div className="editor-intro">Prefilled from your resume. Every field stays editable.</div>
            <div className="form-grid">{([['name','Name'],['email','Email'],['phone','Phone'],['linkedin','LinkedIn']] as [keyof ResumeDraft,string][]).map(([key,label])=><div className="form-field" key={key}><label htmlFor={`draft-${key}`}>{label}</label><input className="text-input" id={`draft-${key}`} value={draft[key] as string} onChange={e=>updateDraft(key,e.target.value)} data-testid={`input-draft-${key}`}/></div>)}</div>
            <div className="editor-section"><label htmlFor="draft-summary">Summary</label><textarea className="text-area" id="draft-summary" style={{height:76}} value={draft.summary} onChange={e=>updateDraft('summary',e.target.value)} placeholder="Add a concise, evidence-based opening summary." data-testid="input-draft-summary"/></div>
             {analysis.missingKeywords.length>0&&<div className="editor-section verified-section"><div className="verified-heading">Job-description keywords <span>(optional)</span></div><p>Choose only terms that accurately describe skills you already have. Selected terms will be added to your Skills section.</p><div className="verified-grid">{analysis.missingKeywords.slice(0,12).map((keyword,i)=><label className="verified-chip" key={`${keyword}-${i}`}><input type="checkbox" checked={verifiedKeywords.includes(keyword)} onChange={e=>setVerifiedKeywords(current=>e.target.checked?[...current,keyword]:current.filter(item=>item!==keyword))} data-testid={`checkbox-verified-keyword-${i}`}/>{keyword}</label>)}</div></div>}
            {([['skills','Skills'],['experience','Experience'],['education','Education'],['certifications','Certifications'],['projects','Projects']] as [keyof ResumeDraft,string][]).map(([key,label])=><div className="editor-section" key={key}><label htmlFor={`draft-${key}`}>{label} <span style={{color:'#a1a8a2'}}>(one item per line)</span></label><textarea className="text-area" id={`draft-${key}`} style={{height:key==='experience'?104:65}} value={(draft[key] as string[]).join('\n')} onChange={e=>updateDraft(key,e.target.value)} data-testid={`input-draft-${key}`}/></div>)}
          </div>
          <div className="panel draft-preview" data-testid="preview-resume-draft"><h3 className="draft-name">{draft.name||'Your name'}</h3><div className="draft-contact">{[draft.email,draft.phone,draft.linkedin].filter(Boolean).map((x,i)=><span key={i}>{x}</span>)}</div>
            {draft.summary&&<div className="draft-block"><h4>Summary</h4><p>{draft.summary}</p></div>}
            {([['Skills',draft.skills],['Experience',draft.experience],['Education',draft.education],['Certifications',draft.certifications],['Projects',draft.projects]] as [string,string[]][]).filter(([,items])=>items.length).map(([heading,items])=><div className="draft-block" key={heading}><h4>{heading}</h4><p>{items.join('\n')}</p></div>)}
            <div className="disclaimer">Single-column, text-first layout designed for straightforward ATS parsing. Review every detail before sending.</div>
          </div>
        </div><div className="action-row"><button className="outline-btn" onClick={applyTailoring} data-testid="button-tailor"><WandSparkles size={14}/>Apply selected terms & strengthen wording</button><button className="solid-btn" onClick={()=>void exportFile()} disabled={exporting} data-testid="button-download-docx">{exporting?<RotateCcw size={14}/>:<ArrowDown size={14}/>} {exporting?'Preparing…':'Download ATS-friendly DOCX'}</button></div><div className="disclaimer"><strong>Honest tailoring:</strong> only terms you explicitly confirm are added as skills. Existing experience wording can be tightened without inventing credentials, employers, dates, or metrics. Review every change before using.</div></>}
        {activeView==='compare'&&<>
          <div className="compare-delta-strip" aria-label="Score changes from original resume to current draft">
            <div className="compare-delta"><span>Match score change</span><strong className={matchDelta>0?'delta-positive':matchDelta<0?'delta-negative':'delta-flat'}>{matchDelta>0?'+':''}{matchDelta} pts</strong></div>
            <div className="compare-delta"><span>ATS readiness change</span><strong className={atsDelta>0?'delta-positive':atsDelta<0?'delta-negative':'delta-flat'}>{atsDelta>0?'+':''}{atsDelta} pts</strong></div>
          </div>
          <div className="compare-grid">
            {([['Original resume',beforeAnalysis??analysis],['Current draft',analysis]] as [string,Analysis][]).map(([title,result],i)=><div className="panel compare-card" key={title} data-testid={`compare-card-${i}`}><h3>{title}</h3><div className="compare-score"><b>{result.matchScore}</b><span>match score / 100</span></div><div className="progress-row"><span>Semantic fit</span><div className="progress-track"><div className="progress-fill" style={{width:pct(result.semanticScore)}}/></div><span className="progress-val">{result.semanticScore}</span></div><div className="progress-row"><span>Keyword overlap</span><div className="progress-track"><div className="progress-fill" style={{width:pct(result.keywordScore)}}/></div><span className="progress-val">{result.keywordScore}</span></div><div className="compare-score" style={{border:0,margin:0,paddingTop:11}}><span>ATS readiness</span><strong>{result.atsScore} / 100</strong></div><p className="explain">{i===0?'The score and resume text from your first analysis.':'Recalculated from the current editable draft against the same job description.'}</p></div>)}
          </div>
          <div className="panel content-diff" data-testid="content-differences">
            <div className="card-header"><h3>Resume content changes</h3><span className="mini-score">{draftChanges.length} {draftChanges.length===1?'section':'sections'} changed</span></div>
            {draftChanges.length?draftChanges.map(change=><div className="diff-row" key={change.label}><h4 className="diff-row-title">{change.label}</h4><div className="diff-values"><div className="diff-before"><small>Before</small><p>{change.before}</p></div><div className="diff-after"><small>After</small><p>{change.after}</p></div></div></div>):<p className="diff-empty">No resume text has changed yet. Use Refine to edit your draft or apply confirmed terms; this view will list the exact differences.</p>}
          </div>
          <div className="disclaimer"><Lightbulb size={13} style={{verticalAlign:'-2px',marginRight:5}}/>The original analysis stays fixed as the baseline. Scores are heuristic signals, not hiring predictions; review every text change before using your draft.</div>
        </>}
      </section>}
      <footer className="footer"><strong>Rezume</strong><span>Local analysis · Your data stays in your browser</span><span>Built for honest, explainable job-fit feedback</span></footer>
    </main>
  </div>;
}