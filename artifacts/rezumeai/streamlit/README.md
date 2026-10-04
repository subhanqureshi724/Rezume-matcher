# Rezume Streamlit companion

This companion includes local PDF, DOCX, and TXT parsing; explainable resume-to-job scoring; ATS signals; an editable draft; before/after score and content comparisons; and DOCX export.

The match uses a 60% text-similarity and 40% exact-keyword-overlap blend. It uses `sentence-transformers` when the package and model are available. If the model cannot be loaded, it clearly identifies and uses the local TF-IDF cosine method instead.

```bash
python -m streamlit run app.py --server.port 3001 --server.address 0.0.0.0
```