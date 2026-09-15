# Colab training

Local CPU training runs ~3.2 min/epoch, so 40 epochs is over two hours. On a free Colab T4
the same run finishes in minutes.

## Why retrain at all

Local training stopped at epoch 5 with **macro-F1 0.6550**, but it was undertrained rather
than converged — `val_loss` was still falling steadily (1.03 → 0.85 → 0.69 → 0.62 → 0.53).
The per-class breakdown shows why that matters:

| class | support | prec | recall | F1 |
|---|---|---|---|---|
| Edge-Ring | 1452 | 0.984 | 0.949 | 0.966 |
| Center | 644 | 0.870 | 0.938 | 0.903 |
| None | 5529 | 0.995 | **0.192** | 0.322 |
| **Scratch** | 179 | **0.039** | 0.961 | **0.075** |

Scratch precision of 0.039 means that when it says "Scratch" it is wrong 96% of the time: the
inverse-frequency class weights and `WeightedRandomSampler` over-correct early, so the model
calls almost everything a rare class. `None` recall of 0.192 is the same effect seen from the
other side. Accuracy lands at 0.4614 — *below* the 0.591 you would get by predicting "None"
every time.

Scratch is Case Study 3, one of the demo beats, so this is worth fixing rather than
explaining away.

## Steps

1. Open `train_wafer_cnn.ipynb` in Colab
2. **Runtime → Change runtime type → T4 GPU**
3. Run cell 1 and upload `wm811k_64.npz` (14.5 MB)
4. Run the rest. Cell 6 prints the per-class table; cell 7 downloads `best_model.pt`
5. Drop it in:

```bash
mv ~/Downloads/best_model.pt src/models/vision/checkpoints/best_model.pt
.venv/bin/python src/mcp_server/test_server.py
.venv/bin/python src/eval/run_eval.py
```

## About the data file

`wm811k_64.npz` is the same preprocessed split `data_prep.py` writes, stored as uint8 `{0,1,2}`
instead of float32 `{0.0,0.5,1.0}` — lossless, and 975 MB becomes 14.5 MB. The notebook divides
by 2 on load to restore the exact float input the model expects.

Regenerate it after any change to `data_prep.py`:

```bash
.venv/bin/python -c "
import numpy as np, pathlib
V=pathlib.Path('src/models/vision/data'); q=lambda a:(a*2).round().astype(np.uint8)
np.savez_compressed('colab/wm811k_64.npz',
  X_train=q(np.load(V/'X_train.npy')), y_train=np.load(V/'y_train.npy').astype(np.int16),
  X_val=q(np.load(V/'X_val.npy')),     y_val=np.load(V/'y_val.npy').astype(np.int16))"
```

It contains only derived WM-811K data — a public dataset — so there is nothing sensitive in
uploading it to Colab. The 2.1 GB raw `LSWMD.pkl` is not needed and should not be uploaded.

## Reporting the result

Quote **macro-F1** and paste the per-class table. Never quote accuracy: "None" is 59% of the
validation split, so accuracy flatters a model that has learned nothing. Use the number you
measure, not one from a paper.
