from __future__ import annotations

import re

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)")
SECTION_NAMES = {
    "summary": ("summary", "professional summary", "profile", "objective"),
    "experience": ("experience", "work history", "employment history"),
    "education": ("education",),
    "skills": ("skills", "technical skills", "core skills"),
}


def score_ats(resume_text: str, match: dict, formatting_issues: list[str]) -> dict:
    lowered = resume_text.lower()
    section_count = sum(
        any(re.search(rf"(?im)^\s*{re.escape(name)}\s*:?\s*$", resume_text) for name in names)
        for names in SECTION_NAMES.values()
    )
    keyword_total = max(1, match["keywords_total"])
    keyword_coverage = round(40 * len(match["matched_keywords"]) / keyword_total)
    section_headers = round(20 * section_count / len(SECTION_NAMES))
    formatting = max(0, 15 - 5 * len(formatting_issues))
    contact_info = (5 if EMAIL_RE.search(resume_text) else 0) + (5 if PHONE_RE.search(resume_text) else 0)

    word_count = len(resume_text.split())
    bullet_count = len(re.findall(r"(?m)^\s*(?:[-•*]|\d+[.)])\s+", resume_text))
    quantified_lines = len(re.findall(r"(?im)^.*\b\d+(?:\.\d+)?%?\b.*$", resume_text))
    quality = 5
    if word_count >= 180:
        quality += 4
    if word_count >= 300:
        quality += 2
    if bullet_count >= 3:
        quality += 2
    if quantified_lines >= 2:
        quality += 2
    quality = min(15, quality)

    breakdown = {
        "Keyword coverage": keyword_coverage,
        "Section headers": section_headers,
        "Formatting": formatting,
        "Contact information": contact_info,
        "Length, bullets & impact": quality,
    }
    total = sum(breakdown.values())
    suggestions: list[str] = []
    if match["missing_keywords"]:
        suggestions.append("Review the missing role terms and add only those that accurately describe your experience.")
    if section_count < 3:
        suggestions.append("Use clear, standard section headings so applicant tracking systems can locate your experience.")
    if not EMAIL_RE.search(resume_text) or not PHONE_RE.search(resume_text):
        suggestions.append("Include a working email address and phone number in the contact section.")
    if formatting_issues:
        suggestions.extend(formatting_issues)
    if word_count < 180:
        suggestions.append("Add relevant detail to the experience and project sections; this resume is quite short.")
    return {
        "ats_score": total,
        "ats_breakdown": breakdown,
        "suggestions": suggestions,
        "word_count": word_count,
        "lowered_resume": lowered,
    }