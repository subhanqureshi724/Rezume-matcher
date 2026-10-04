from __future__ import annotations

import copy
import hashlib
from pathlib import Path

import streamlit as st

from ats import score_ats
from exporter import draft_to_docx, draft_to_text
from match_engine import analyze_match
from resume_parser import draft_from_text, extract_resume

APP_DIR = Path(__file__).parent
SAMPLE_RESUME = (APP_DIR / "samples" / "sample_resume.txt").read_text(encoding="utf-8")
SAMPLE_JOB = (APP_DIR / "samples" / "sample_job_description.txt").read_text(encoding="utf-8")


def _initialize_state() -> None:
    defaults = {
        "resume_text": "",
        "job_text": "",
        "formatting_issues": [],
        "upload_signature": None,
        "upload_name": None,
        "upload_status": None,
        "analysis": None,
        "before_analysis": None,
        "draft": None,
        "before_draft": None,
        "input_signature": None,
        "analysis_stale": False,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def _run_analysis(resume_text: str, job_text: str, formatting_issues: list[str]) -> dict:
    result = analyze_match(resume_text, job_text)
    result.update(score_ats(resume_text, result, formatting_issues))
    return result


def _content_changes(before: dict[str, str], after: dict[str, str]) -> list[tuple[str, str, str]]:
    labels = [
        ("name", "Name"), ("email", "Email"), ("phone", "Phone"),
        ("linkedin", "LinkedIn"), ("summary", "Summary"), ("skills", "Skills"),
        ("experience", "Experience"), ("education", "Education"),
        ("certifications", "Certifications"), ("projects", "Projects"),
    ]
    return [
        (label, before.get(key, "") or "Not included", after.get(key, "") or "Removed")
        for key, label in labels
        if before.get(key, "") != after.get(key, "")
    ]


def _render_analysis(result: dict) -> None:
    first, second, third = st.columns(3)
    first.metric("Resume-to-role match", f'{result["match_score"]} / 100')
    second.metric("ATS readiness", f'{result["ats_score"]} / 100')
    third.metric("Role keywords found", f'{len(result["matched_keywords"])} / {result["keywords_total"]}')

    st.caption(
        f'Match = 60% similarity + 40% exact keyword overlap. '
        f'Similarity method: {result["method"]}. This is a guide, not a hiring prediction.'
    )
    st.subheader("Score details")
    st.progress(result["semantic_score"] / 100, text=f'Similarity: {result["semantic_score"]}/100')
    st.progress(result["keyword_score"] / 100, text=f'Exact keyword overlap: {result["keyword_score"]}/100')
    st.markdown("**ATS readiness rubric (40 / 20 / 15 / 10 / 15)**")
    for label, value in result["ats_breakdown"].items():
        st.progress(value / 40 if label == "Keyword coverage" else value / 20 if label == "Section headers" else value / 15 if label in ("Formatting", "Length, bullets & impact") else value / 10, text=f"{label}: {value}")

    found, weak, missing = st.columns(3)
    with found:
        st.markdown("**Found**")
        st.write(", ".join(result["matched_keywords"]) or "No exact matches yet.")
    with weak:
        st.markdown("**Appears once**")
        st.write(", ".join(result["weak_keywords"]) or "No low-frequency matches.")
    with missing:
        st.markdown("**Not found**")
        st.write(", ".join(result["missing_keywords"]) or "No identified gaps.")
    if result["suggestions"]:
        st.subheader("Suggestions")
        for suggestion in result["suggestions"]:
            st.write(f"• {suggestion}")


def _render_builder(analysis: dict, original_text: str) -> None:
    draft = st.session_state.draft or draft_from_text(original_text)
    with st.form("resume-draft-form"):
        st.caption("Edit your draft directly. Only terms you explicitly confirm below are added.")
        name = st.text_input("Name", value=draft.get("name", ""), key="draft_name")
        col_a, col_b = st.columns(2)
        with col_a:
            email = st.text_input("Email", value=draft.get("email", ""), key="draft_email")
            linkedin = st.text_input("LinkedIn", value=draft.get("linkedin", ""), key="draft_linkedin")
        with col_b:
            phone = st.text_input("Phone", value=draft.get("phone", ""), key="draft_phone")
        summary = st.text_area("Summary", value=draft.get("summary", ""), height=120, key="draft_summary")
        skills = st.text_area("Skills", value=draft.get("skills", ""), height=100, key="draft_skills")
        experience = st.text_area("Experience", value=draft.get("experience", ""), height=190, key="draft_experience")
        education = st.text_area("Education", value=draft.get("education", ""), height=100, key="draft_education")
        certifications = st.text_area("Certifications", value=draft.get("certifications", ""), height=90, key="draft_certifications")
        projects = st.text_area("Projects", value=draft.get("projects", ""), height=120, key="draft_projects")
        save_draft = st.form_submit_button("Save draft and recalculate")

    if save_draft:
        current = {
            "name": name, "email": email, "phone": phone, "linkedin": linkedin,
            "summary": summary, "skills": skills, "experience": experience,
            "education": education, "certifications": certifications, "projects": projects,
        }
        st.session_state.draft = current
        updated = _run_analysis(
            draft_to_text(current),
            st.session_state.job_text,
            st.session_state.formatting_issues,
        )
        st.session_state.analysis = updated
        st.rerun()

    if analysis["missing_keywords"]:
        with st.form("verified-keywords-form"):
            st.markdown("**Add relevant job terms you can verify**")
            st.caption("Select only terms that accurately describe your experience. They are added to Skills, not invented as work history.")
            selected = st.multiselect(
                "Confirm relevant terms",
                options=analysis["missing_keywords"][:20],
                key="verified_keywords",
            )
            apply_terms = st.form_submit_button("Add selected terms to Skills")
        if apply_terms and selected:
            current = copy.deepcopy(st.session_state.draft or draft)
            existing = [line.strip() for line in current.get("skills", "").splitlines() if line.strip()]
            existing_lower = {line.lower() for line in existing}
            additions = [term for term in selected if term.lower() not in existing_lower]
            current["skills"] = "\n".join(existing + additions)
            st.session_state.draft = current
            updated = _run_analysis(
                draft_to_text(current),
                st.session_state.job_text,
                st.session_state.formatting_issues,
            )
            st.session_state.analysis = updated
            st.rerun()

    current_draft = st.session_state.draft or draft
    with st.expander("Live draft preview", expanded=True):
        st.markdown(f"### {current_draft.get('name') or 'Resume'}")
        contacts = " · ".join(
            current_draft.get(key, "").strip()
            for key in ("email", "phone", "linkedin")
            if current_draft.get(key, "").strip()
        )
        if contacts:
            st.caption(contacts)
        for key, label in [
            ("summary", "Summary"), ("skills", "Skills"), ("experience", "Experience"),
            ("education", "Education"), ("certifications", "Certifications"), ("projects", "Projects"),
        ]:
            value = current_draft.get(key, "").strip()
            if value:
                st.markdown(f"**{label}**")
                st.text(value)
    st.download_button(
        "Download ATS-friendly DOCX",
        data=draft_to_docx(current_draft),
        file_name="rezume-tailored-draft.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _render_comparison(before_analysis: dict, after_analysis: dict, before_draft: dict, after_draft: dict) -> None:
    match_delta = after_analysis["match_score"] - before_analysis["match_score"]
    ats_delta = after_analysis["ats_score"] - before_analysis["ats_score"]
    before_col, after_col = st.columns(2)
    with before_col:
        st.subheader("Original resume")
        st.metric("Match score", f'{before_analysis["match_score"]} / 100')
        st.metric("ATS readiness", f'{before_analysis["ats_score"]} / 100')
        st.progress(before_analysis["semantic_score"] / 100, text=f'Similarity: {before_analysis["semantic_score"]}/100')
        st.progress(before_analysis["keyword_score"] / 100, text=f'Keyword overlap: {before_analysis["keyword_score"]}/100')
    with after_col:
        st.subheader("Current draft")
        st.metric("Match score", f'{after_analysis["match_score"]} / 100', delta=f"{match_delta:+d} pts")
        st.metric("ATS readiness", f'{after_analysis["ats_score"]} / 100', delta=f"{ats_delta:+d} pts")
        st.progress(after_analysis["semantic_score"] / 100, text=f'Similarity: {after_analysis["semantic_score"]}/100')
        st.progress(after_analysis["keyword_score"] / 100, text=f'Keyword overlap: {after_analysis["keyword_score"]}/100')

    changes = _content_changes(before_draft, after_draft)
    st.subheader(f"Resume content changes · {len(changes)} sections")
    if not changes:
        st.info("No resume text has changed yet. Edit or refine the draft to see exact before-and-after content here.")
        return
    for label, before, after in changes:
        with st.expander(label, expanded=True):
            old_col, new_col = st.columns(2)
            with old_col:
                st.caption("Before")
                st.text(before)
            with new_col:
                st.caption("After")
                st.text(after)


def main() -> None:
    st.set_page_config(page_title="Rezume", page_icon="📄", layout="wide")
    _initialize_state()
    st.title("Rezume")
    st.caption("Python and Streamlit companion · session-based analysis")
    st.info(
        "Unlike the browser-only React workspace, this companion sends resume files "
        "and text to the app server for analysis. The current implementation does "
        "not save resume content to a database."
    )

    uploaded = st.file_uploader("Upload a resume", type=["pdf", "docx", "txt"], help="PDF, DOCX, or TXT · up to 10 MB")
    if uploaded is not None:
        data = uploaded.getvalue()
        signature = hashlib.sha256(uploaded.name.encode() + data).hexdigest()
        if signature != st.session_state.upload_signature:
            st.session_state.upload_signature = signature
            st.session_state.upload_name = uploaded.name
            try:
                parsed = extract_resume(uploaded.name, data)
                st.session_state.resume_text = parsed["raw_text"]
                st.session_state.formatting_issues = parsed["formatting_issues"]
                st.session_state.upload_status = (
                    "ready",
                    len(parsed["raw_text"]),
                    parsed["draft"],
                )
                st.session_state.analysis = None
                st.session_state.before_analysis = None
                st.session_state.draft = None
                st.session_state.before_draft = None
            except Exception as error:
                st.session_state.upload_status = ("error", str(error), None)
                st.session_state.resume_text = ""
                st.session_state.analysis = None
                st.session_state.before_analysis = None

    if st.session_state.upload_status:
        status = st.session_state.upload_status
        if status[0] == "ready":
            st.success(f'Loaded **{st.session_state.upload_name}** · {len(st.session_state.resume_text):,} readable characters')
        elif status[0] == "error":
            st.error(f'Could not read **{st.session_state.upload_name}**: {status[1]}')

    if st.button("Load example materials"):
        st.session_state.resume_text = SAMPLE_RESUME
        st.session_state.job_text = SAMPLE_JOB
        st.session_state.upload_name = "Sample resume"
        st.session_state.upload_status = ("ready", len(SAMPLE_RESUME), draft_from_text(SAMPLE_RESUME))
        st.session_state.formatting_issues = []
        st.session_state.analysis = None
        st.session_state.before_analysis = None
        st.session_state.draft = None
        st.session_state.before_draft = None
        st.session_state.upload_signature = None
        st.rerun()

    resume_text = st.text_area(
        "Resume text",
        key="resume_text",
        height=240,
        placeholder="Paste your resume here, or upload a PDF, DOCX, or TXT file.",
    )
    job_text = st.text_area(
        "Target job description",
        key="job_text",
        height=220,
        placeholder="Paste the target role's full job description.",
    )
    input_signature = hashlib.sha256(f"{resume_text}\0{job_text}".encode()).hexdigest()
    if st.session_state.input_signature and input_signature != st.session_state.input_signature:
        st.session_state.analysis_stale = True
    else:
        st.session_state.analysis_stale = False

    if st.button("Analyze my fit", type="primary", use_container_width=True):
        if len(resume_text.strip()) < 40:
            st.error("Add a little more resume detail — at least a few sentences or sections.")
        elif not job_text.strip():
            st.error("Paste the target job description before analyzing.")
        else:
            with st.spinner("Comparing your materials…"):
                initial_draft = draft_from_text(resume_text)
                result = _run_analysis(resume_text, job_text, st.session_state.formatting_issues)
            st.session_state.before_analysis = copy.deepcopy(result)
            st.session_state.analysis = result
            st.session_state.draft = initial_draft
            st.session_state.before_draft = copy.deepcopy(initial_draft)
            st.session_state.input_signature = input_signature
            st.session_state.analysis_stale = False

    analysis = st.session_state.analysis
    before_analysis = st.session_state.before_analysis
    before_draft = st.session_state.before_draft
    draft = st.session_state.draft
    if analysis and before_analysis and before_draft and draft and not st.session_state.analysis_stale:
        match_tab, builder_tab, compare_tab = st.tabs([
            "Match & ATS Analysis", "Resume Builder", "Before vs After",
        ])
        with match_tab:
            _render_analysis(analysis)
        with builder_tab:
            _render_builder(analysis, resume_text)
        with compare_tab:
            _render_comparison(before_analysis, analysis, before_draft, draft)
    elif st.session_state.analysis_stale:
        st.warning("Your resume or job description changed. Run the analysis again to create a fresh baseline.")


if __name__ == "__main__":
    main()