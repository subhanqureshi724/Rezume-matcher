from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

import spacy

from resume_parser import tokenize

NLP = spacy.blank("en")
SENTENCE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
TERM_BANK = [
    "agile", "analytics", "api", "aws", "azure", "bash", "bigquery", "c", "c++",
    "c#", "ci/cd", "cloud", "communication", "customer success", "data analysis",
    "data engineering", "data pipelines", "data science", "database", "design",
    "docker", "excel", "figma", "finance", "forecasting", "gcp", "git", "github",
    "go", "graphql", "java", "javascript", "kafka", "kubernetes", "leadership",
    "machine learning", "market research", "marketing", "ml", "mongodb", "mysql",
    "next.js", "node.js", "nodejs", "numpy", "pandas", "performance", "postgresql",
    "power bi", "product management", "project management", "python", "pytorch",
    "react", "redis", "rest", "rest api", "risk management", "salesforce", "scikit-learn",
    "scikit learn", "snowflake", "spacy", "sql", "statistics", "streamlit", "tableau",
    "teamwork", "tensorflow", "typescript", "ui", "ux", "web development",
]


@lru_cache(maxsize=1)
def _load_sentence_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(SENTENCE_MODEL)


def _tfidf_cosine(left: str, right: str) -> int:
    left_counts = Counter(tokenize(left))
    right_counts = Counter(tokenize(right))
    vocabulary = set(left_counts) | set(right_counts)
    if not vocabulary:
        return 0

    def vector(counts: Counter[str]) -> dict[str, float]:
        result: dict[str, float] = {}
        for word, frequency in counts.items():
            document_frequency = int(word in left_counts) + int(word in right_counts)
            inverse_frequency = math.log(3 / (1 + document_frequency)) + 1
            result[word] = frequency * inverse_frequency
        return result

    a, b = vector(left_counts), vector(right_counts)
    dot = sum(a.get(word, 0.0) * b.get(word, 0.0) for word in vocabulary)
    norm_a = math.sqrt(sum(value * value for value in a.values()))
    norm_b = math.sqrt(sum(value * value for value in b.values()))
    if not norm_a or not norm_b:
        return 0
    return max(0, min(100, round(100 * dot / (norm_a * norm_b))))


def _semantic_similarity(resume: str, job_description: str) -> tuple[int, str]:
    try:
        model = _load_sentence_model()
        vectors = model.encode([resume, job_description], normalize_embeddings=True)
        cosine = float(vectors[0] @ vectors[1])
        return max(0, min(100, round(cosine * 100))), "Sentence-transformers semantic similarity"
    except ImportError:
        return _tfidf_cosine(resume, job_description), (
            "TF-IDF cosine fallback — sentence-transformers is not installed in this environment"
        )
    except Exception as error:
        return _tfidf_cosine(resume, job_description), (
            f"TF-IDF cosine fallback — the sentence model could not load ({type(error).__name__})"
        )


def _keyword_candidates(job_description: str) -> list[str]:
    lower_job = job_description.lower()
    candidates = [
        term for term in TERM_BANK
        if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", lower_job)
    ]

    counts = Counter(
        token for token in tokenize(job_description)
        if len(token) >= 4 and token.isalpha()
    )
    for word, _ in counts.most_common(24):
        if word not in candidates:
            candidates.append(word)
    return candidates[:30]


def _term_count(text: str, term: str) -> int:
    return len(re.findall(rf"(?<!\w){re.escape(term)}(?!\w)", text, flags=re.I))


def analyze_match(resume: str, job_description: str) -> dict:
    semantic_score, method = _semantic_similarity(resume, job_description)
    candidates = _keyword_candidates(job_description)
    matched: list[str] = []
    weak: list[str] = []
    missing: list[str] = []
    for term in candidates:
        count = _term_count(resume, term)
        if count == 0:
            missing.append(term)
        elif count == 1:
            weak.append(term)
            matched.append(term)
        else:
            matched.append(term)

    keyword_score = round(100 * len(matched) / len(candidates)) if candidates else 0
    match_score = round(0.6 * semantic_score + 0.4 * keyword_score)
    return {
        "match_score": match_score,
        "semantic_score": semantic_score,
        "keyword_score": keyword_score,
        "method": method,
        "matched_keywords": matched,
        "weak_keywords": weak,
        "missing_keywords": missing,
        "keywords_total": len(candidates),
    }