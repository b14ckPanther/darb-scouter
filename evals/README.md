# Evals

Does the power level tell the truth? Nour scores about 30 real posts by hand, and these scripts measure how
closely the scouter agrees.

| Step | Command | Cost |
|---|---|---|
| 1. Pick jobs | `uv run --project backend python evals/pick.py --n 30` | free (reads the local database) |
| 2. Label them | `uv run --project backend python evals/label.py` | about 45 minutes of Nour's time |
| 3. Measure | `uv run --project backend python evals/run.py` | free (cached extractions, current scorer) |
| 3b. Measure extraction too | `uv run --project backend python evals/run.py --live` | about $0.30 for 30 jobs |

**Metrics**
- **Spearman rho** between the power level and Nour's 0–10 fit: does the scouter rank jobs the way Nour does?
- **Must-have precision and recall:** does extraction find the requirements Nour sees, without inventing others?

The run fails below rho 0.5 or recall 0.7. CI runs the cheap mode on every push once `labels.yaml` exists.

## Results

Not measured yet. Picking needs a first real scan, and labelling needs Nour.
