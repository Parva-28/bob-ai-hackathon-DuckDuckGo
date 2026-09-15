# AGENT INSTRUCTIONS — Track 1: Wafer Defect Vision Classifier

Paste this whole file into your Bob (or coding agent) session as the task brief.

## Your role
You own `src/models/vision/` and `requirements-vision.txt` exclusively. Do not
create, edit, or read files outside these paths except `src/contracts/CONTRACTS.md`
and `src/eval/fixtures/*.json` (read-only reference).

## Objective
Build and train a classifier that takes a WM-811K-format wafer bin map and returns
a predicted defect class with a confidence score, matching this exact contract:

```python
def classify_wafer_map(image_path: str) -> dict:
    """
    Returns:
    {
      "predicted_class": str,   # one of: Center, Donut, Edge-Loc, Edge-Ring,
                                 # Local, Random, Scratch, Near-full, None
      "confidence": float       # 0.0–1.0
    }
    """
```

## Steps
1. Download WM-811K / LSWMD. Note only ~14.8% of the 811,457 maps are labeled with
   a real defect pattern — filter to labeled examples for training/eval, and hold
   out a validation split before touching test data.
2. Normalize wafer maps to a consistent input size (native resolutions range 15×15
   to 200×200 px — resize/pad consistently, document your choice).
3. Train a CNN (a standard backbone like a small ResNet is fine — this is not a
   novel-architecture exercise, the differentiation is elsewhere in the system).
   Handle class imbalance explicitly (some classes are far rarer than others).
4. Report **macro-F1 on your held-out validation split** — this is the number that
   goes in the PRD and the demo, not a number copied from a paper.
5. Wrap the trained model in the exact `classify_wafer_map` function above and
   place it in `src/models/vision/classifier.py`.
6. Write a self-test script `src/models/vision/test_classifier.py` that runs
   `classify_wafer_map` against real WM-811K images matching each of the 6 case
   study patterns (Center, Edge-Ring, Scratch, Donut, Random, Near-full) and
   prints predicted class + confidence for each. This is your proof of done —
   it must run standalone, with no dependency on the MCP server or any other track.
7. Add any new Python dependencies to `requirements-vision.txt` only.

## Definition of done
- `test_classifier.py` runs standalone and produces a correct-looking prediction
  for at least 5 of the 6 case study pattern types.
- Reported macro-F1 is real, measured, and written into a short `NOTES.md` in your
  directory (one paragraph: dataset split used, F1 achieved, known weak classes).
- You have not touched any file outside `src/models/vision/` and
  `requirements-vision.txt`.

## What not to do
- Don't wait on anyone else. You need the dataset and the fixtures, nothing else.
- Don't build a Flask/FastAPI wrapper — you're handing off a plain Python function,
  the lead wires it into the MCP server at integration.
- Don't hand-pick only easy examples for your self-test — include at least one
  ambiguous case (mixed pattern or low-confidence prediction) and report it as-is.
