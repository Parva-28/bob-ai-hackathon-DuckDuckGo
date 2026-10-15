"""
screen_all.py — run the trained WaferCNN over every wafer in WM-811K (labeled and
unlabeled) and build the data behind the /surprise screen.

Stages (each caches its output in data/screen/, rerun any stage on its own):

  prep     LSWMD.pkl -> 64x64 maps packed 2 bits/pixel, labels, lot info, and the
           exact train / val / never-seen split data_prep.py produced
  infer    TTA-8 softmax + 128-d GAP embedding for all 811,457 wafers (resumable)
  verify   reproduce the published holdout macro-F1 from the reconstructed split
  embed    PCA-32 (for sketch search) and a 2-D UMAP layout (the "galaxy")
  analyze  base-rate-corrected calibration, label-ready thresholds, unnamed
           pattern families; writes the web assets

    python src/models/vision/screen_all.py all --pkl ~/Downloads/LSWMD.pkl/LSWMD.pkl
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

OUT = HERE / "data" / "screen"
WEB = HERE.parents[2] / "src" / "web" / "public" / "surprise"
CKPT = HERE / "checkpoints" / "best_model.pt"

CLASSES = ["Center", "Donut", "Edge-Loc", "Edge-Ring", "Local",
           "Random", "Scratch", "Near-full", "None"]
NONE = 8
IMG = 64

# split codes
UNLABELED, UNUSED, TRAIN, VAL = -1, 0, 1, 2


# ── packing: 0/1/2 pixels, 4 per byte ─────────────────────────────────────────

def pack(m: np.ndarray) -> np.ndarray:
    f = m.reshape(-1, 4).astype(np.uint8)
    return (f[:, 0] | (f[:, 1] << 2) | (f[:, 2] << 4) | (f[:, 3] << 6)).astype(np.uint8)


def unpack(b: np.ndarray) -> np.ndarray:
    """(N, 1024) uint8 -> (N, 64, 64) uint8 in {0,1,2}."""
    out = np.empty((b.shape[0], 1024, 4), np.uint8)
    for k in range(4):
        out[:, :, k] = (b >> (2 * k)) & 3
    return out.reshape(-1, IMG, IMG)


# ── stage: prep ───────────────────────────────────────────────────────────────

def prep(pkl: Path):
    import pandas as pd
    from sklearn.model_selection import train_test_split
    from data_prep import (load_raw_dataframe, resize_wafer_map, extract_label,
                           NONE_CLASS_KEEP_FRACTION, VAL_FRACTION, RANDOM_STATE)

    OUT.mkdir(parents=True, exist_ok=True)
    df = load_raw_dataframe(pkl).reset_index(drop=True)
    n = len(df)

    t = time.time()
    labels = df["failureType"].map(lambda ft: extract_label({"failureType": ft}))
    print(f"  labels extracted in {time.time()-t:.0f}s")

    maps = np.zeros((n, 1024), np.uint8)
    valid = np.zeros(n, bool)
    rows = np.zeros(n, np.uint16)
    cols = np.zeros(n, np.uint16)
    t = time.time()
    for i, wm in enumerate(df["waferMap"].values):
        if isinstance(wm, np.ndarray) and wm.size > 0:
            maps[i] = pack(resize_wafer_map(wm))
            valid[i] = True
            rows[i], cols[i] = wm.shape
        if i % 100_000 == 0:
            print(f"  resized {i:,}/{n:,}  ({time.time()-t:.0f}s)")
    maps.tofile(OUT / "maps64.bin")

    # Reconstruct data_prep.py's split exactly: same filtering, same sampling
    # calls, same seed. The partition depends only on lengths, labels and seed,
    # so splitting an index array reproduces the one made on the image array.
    is_lab = labels.notna().values
    is_none = (labels == "None").values
    defect_ids = np.flatnonzero(is_lab & ~is_none)
    none_ids = np.flatnonzero(is_none)
    none_kept = pd.Series(none_ids).sample(
        frac=NONE_CLASS_KEEP_FRACTION, random_state=RANDOM_STATE).values
    use = np.concatenate([defect_ids, none_kept])
    use = use[valid[use]]
    y_use = np.array([CLASSES.index(labels.iat[i]) for i in use])
    tr, va = train_test_split(np.arange(len(use)), test_size=VAL_FRACTION,
                              stratify=y_use, random_state=RANDOM_STATE)

    split = np.full(n, UNLABELED, np.int8)
    split[is_lab] = UNUSED
    split[use[tr]] = TRAIN
    split[use[va]] = VAL
    gt = np.full(n, -1, np.int8)
    gt[is_lab] = [CLASSES.index(l) for l in labels[is_lab]]

    lot_codes, lot_names = pd.factorize(df["lotName"].astype(str))
    wafer_idx = pd.to_numeric(df["waferIndex"], errors="coerce").fillna(0).astype(np.int16).values
    die = pd.to_numeric(df["dieSize"], errors="coerce").fillna(0).astype(np.float32).values

    np.savez(OUT / "meta.npz", gt=gt, split=split, valid=valid, lot=lot_codes.astype(np.int32),
             wafer_idx=wafer_idx, die=die, rows=rows, cols=cols)
    (OUT / "lots.json").write_text(json.dumps(list(lot_names)))
    print(f"  {n:,} wafers | labeled {is_lab.sum():,} | train {len(tr):,} | val {len(va):,} "
          f"| never-seen labeled {(split == UNUSED).sum():,} | unlabeled {(split == UNLABELED).sum():,}")


# ── stage: infer ──────────────────────────────────────────────────────────────

def load_model():
    import torch
    from model import WaferCNN
    m = WaferCNN()
    m.load_state_dict(torch.load(CKPT, map_location="cpu", weights_only=True))
    return m.eval()


def infer(chunk: int = 2048):
    import torch
    import torch.nn.functional as F
    torch.set_num_threads(max(1, torch.get_num_threads()))
    m = load_model().to(memory_format=torch.channels_last)

    def features(x):
        x = m.layer4(m.layer3(m.layer2(m.layer1(m.stem(x)))))
        return m.gap(x).flatten(1)

    maps = np.memmap(OUT / "maps64.bin", np.uint8, "r").reshape(-1, 1024)
    n = len(maps)
    mode = "r+" if (OUT / "probs.npy").exists() else "w+"
    probs = np.lib.format.open_memmap(OUT / "probs.npy", mode, np.float16, (n, 9))
    emb = np.lib.format.open_memmap(OUT / "emb.npy", mode, np.float16, (n, 128))
    prog = OUT / "infer.progress"
    start = int(prog.read_text()) if prog.exists() and mode == "r+" else 0

    views = [(k, f) for k in range(4) for f in (False, True)]
    t = time.time()
    with torch.inference_mode():
        for s in range(start, n, chunk):
            x = torch.from_numpy(unpack(maps[s:s + chunk]).astype(np.float32) / 2.0)[:, None]
            p = torch.zeros(len(x), 9)
            e = torch.zeros(len(x), 128)
            for k, flip in views:
                v = torch.rot90(x, k, dims=[-2, -1])
                if flip:
                    v = v.flip(-1)
                f = features(v.contiguous(memory_format=torch.channels_last))
                p += F.softmax(m.fc(f), -1)
                e += f
            probs[s:s + len(x)] = (p / 8).numpy()
            emb[s:s + len(x)] = (e / 8).numpy()
            done = s + len(x)
            if (done // chunk) % 20 == 0 or done == n:
                probs.flush(); emb.flush(); prog.write_text(str(done))
                rate = (done - start) / (time.time() - t)
                print(f"  {done:,}/{n:,}  {rate:.0f} wafers/s  eta {(n-done)/rate/60:.1f} min", flush=True)
    probs.flush(); emb.flush(); prog.write_text(str(n))


# ── stage: verify ─────────────────────────────────────────────────────────────

def verify():
    from sklearn.metrics import f1_score
    meta = np.load(OUT / "meta.npz")
    probs = np.load(OUT / "probs.npy", mmap_mode="r")
    va = meta["split"] == VAL
    pred = probs[va].argmax(1)
    f1 = f1_score(meta["gt"][va], pred, average="macro", labels=range(9))
    acc = (pred == meta["gt"][va]).mean()
    print(f"  reconstructed holdout: n={va.sum():,}  macro-F1 {f1:.4f}  acc {acc:.4f}  "
          f"(published: n=9,357  macro-F1 0.9232  acc 0.9617)")
    return float(f1), float(acc), int(va.sum())


# ── stage: embed ──────────────────────────────────────────────────────────────

def embed():
    import umap
    from sklearn.decomposition import PCA
    emb = np.load(OUT / "emb.npy").astype(np.float32)
    pca = PCA(32, random_state=0).fit(emb[::8])
    z = pca.transform(emb).astype(np.float32)
    print(f"  PCA-32 keeps {pca.explained_variance_ratio_.sum():.3f} of embedding variance")
    np.save(OUT / "pca32.npy", z)
    np.savez(OUT / "pca_model.npz", mean=pca.mean_.astype(np.float32),
             components=pca.components_.astype(np.float32))

    t = time.time()
    # Spectral init needs an eigendecomposition of the whole 811k-node kNN graph,
    # which is disconnected here (many identical clean wafers) and ran out of RAM
    # on a 16 GB machine. PCA init skips it.
    xy = umap.UMAP(n_neighbors=15, min_dist=0.08, init="pca", low_memory=True,
                   verbose=True).fit_transform(z)
    print(f"  UMAP done in {(time.time()-t)/60:.1f} min")
    np.save(OUT / "xy.npy", xy.astype(np.float32))


# ── stage: analyze ────────────────────────────────────────────────────────────

THRESHOLDS = np.round(np.arange(0.50, 1.0, 0.01), 2)
TARGET_PRECISION = 0.95


def calibrate(probs, gt, split):
    """
    Precision of "predicted class c at confidence >= t" at the class mix of the real
    labeled data, not the None-subsampled holdout's.

    P(pred=c, conf>=t | true=k) is measured on the reconstructed holdout for the
    defect classes and on the ~110k None wafers the 25% subsample threw away —
    labeled, never trained on, and at their natural frequency. Then reweighted by
    the class priors of all 172,950 labeled wafers.
    """
    pred, conf = probs.argmax(1), probs.max(1)
    lab = gt >= 0
    prior = np.bincount(gt[lab], minlength=9) / lab.sum()
    va = split == VAL
    nn = split == UNUSED   # never-seen labeled wafers: almost all None

    # the wafers of each true class k that P(pred, conf | true=k) is measured on
    sub = []
    for k in range(9):
        m = (nn if k == NONE else va) & (gt == k)
        sub.append((pred[m], conf[m]))

    def rate(k, c, t):
        p, cf = sub[k]
        return ((p == c) & (cf >= t)).mean() if len(p) else 0.0

    table = {}
    for c in range(9):
        rows = []
        for t in THRESHOLDS:
            # P(pred=c, conf>=t | true=k) for every true class k
            r = np.array([rate(k, c, t) for k in range(9)])
            tp = prior[c] * r[c]
            fp = (prior * r).sum() - tp
            prec = tp / (tp + fp) if tp + fp > 0 else 0.0
            rows.append((float(t), float(prec), float(r[c])))
        table[CLASSES[c]] = rows

    thresholds = {}
    for name, rows in table.items():
        ok = [t for t, p, rec in rows if p >= TARGET_PRECISION and rec > 0]
        thresholds[name] = ok[0] if ok else None
    return table, thresholds, prior


def save_mean_png(maps_u8, path, scale=4):
    """
    Mean fail-rate map -> PNG (dark wafer, hot fails). Absolute scale, not
    stretched per family: a stretch makes near-clean families look dramatic and
    turns resize aliasing into fake grid patterns.
    """
    from PIL import Image
    on = (maps_u8 > 0).mean(0)
    fail = (maps_u8 == 2).mean(0) / np.maximum(on, 1e-6)
    fail = np.clip(fail / 0.6, 0, 1) ** 0.6
    rgb = np.zeros((IMG, IMG, 3), np.float32)
    base = np.array([28, 39, 58]); hot = np.array([255, 120, 70])
    for ch in range(3):
        rgb[..., ch] = np.where(on > 0.5, base[ch] + (hot[ch] - base[ch]) * fail, 10)
    Image.fromarray(rgb.astype(np.uint8)).resize((IMG * scale, IMG * scale), Image.NEAREST).save(path)


CIRCLE_AREA = np.pi * 30.5 ** 2 / IMG ** 2   # on-wafer fraction of a standard round map


def describe(maps_u8):
    """Name a family from measured statistics of its members, not by eye."""
    on = maps_u8 > 0
    fail = maps_u8 == 2
    area = on.mean()
    density = fail.sum() / max(on.sum(), 1)
    yy, xx = np.mgrid[:IMG, :IMG]
    edge = np.hypot(yy - 31.5, xx - 31.5) > 25
    edge_rate = fail[:, edge].sum() / max(on[:, edge].sum(), 1)
    core_rate = fail[:, ~edge].sum() / max(on[:, ~edge].sum(), 1)
    if area < CIRCLE_AREA * 0.75:
        name = "Non-standard die layout"
        note = (f"Only {area / CIRCLE_AREA:.0%} of a normal round wafer map is populated: a different product "
                "or test layout from the rest of the dataset, which the 9 classes were never defined for.")
    elif density < 0.03:
        name = "Near-clean, a few dead dies"
        note = (f"Average {density:.1%} of dies fail, scattered. Whether a handful of dead dies is a defect or "
                "noise is a labeling-policy question the taxonomy never answers, so the model splits its vote.")
    elif density < 0.15:
        name = "Sparse scattered failures"
        note = f"Average {density:.1%} of dies fail, spread out rather than forming one known shape."
    else:
        name = "Heavy mixed failures"
        note = f"Average {density:.1%} of dies fail, several mechanisms overlapping on one wafer."
    if area >= CIRCLE_AREA * 0.75 and edge_rate > 2 * core_rate and edge_rate > 0.03:
        name += ", edge-heavy"
    return name, note, float(density)


def analyze(f1_acc=None):
    from sklearn.cluster import HDBSCAN

    meta = np.load(OUT / "meta.npz")
    gt, split, valid = meta["gt"], meta["split"], meta["valid"]
    probs = np.load(OUT / "probs.npy").astype(np.float32)
    xy = np.load(OUT / "xy.npy")
    maps = np.memmap(OUT / "maps64.bin", np.uint8, "r").reshape(-1, 1024)
    n = len(gt)
    pred, conf = probs.argmax(1), probs.max(1)
    unl = (split == UNLABELED) & valid

    table, thresholds, prior = calibrate(probs, gt, split)
    thr = np.array([thresholds[c] if thresholds[c] is not None else 2.0 for c in CLASSES])
    ready = conf >= thr[pred]

    # Fraction of dies failing per wafer. Calibration on labeled data cannot see a
    # shift in the unlabeled pool, so compare each class's calls against what its
    # human-labeled examples look like: a defect call on a wafer with <1% failing
    # dies, when humans almost never label such wafers that class, is suspect.
    density = np.zeros(n, np.float32)
    for s in range(0, n, 50_000):
        m = unpack(maps[s:s + 50_000])
        density[s:s + 50_000] = (m == 2).sum((1, 2)) / np.maximum((m > 0).sum((1, 2)), 1)
    near_clean = density < 0.01

    # Never-seen None wafers: the direct test of "will pseudo-labels be polluted?"
    nn = (split == UNUSED) & (gt == NONE)
    false_alarm = {CLASSES[c]: int(((pred[nn] == c)).sum()) for c in range(8)}

    # ── unnamed pattern families ─────────────────────────────────────────────
    # Wafers the 9-class taxonomy cannot place: the model is not confident, and
    # it is not just calling them clean. Cluster them in the galaxy layout.
    uncertain = valid & (conf < 0.6) & (probs[:, NONE] < 0.5)
    ids = np.flatnonzero(uncertain)
    print(f"  {len(ids):,} wafers with no confident class -> clustering")
    lab_hdb = HDBSCAN(min_cluster_size=250, min_samples=25).fit_predict(xy[ids])
    fam = np.full(n, 255, np.uint8)
    families = []
    order = [c for c in np.unique(lab_hdb) if c >= 0]
    order.sort(key=lambda c: -(lab_hdb == c).sum())
    for fi, c in enumerate(order[:24]):
        mem = ids[lab_hdb == c]
        fam[mem] = fi
        mp = probs[mem].mean(0)
        top = np.argsort(-mp)[:3]
        labeled_mem = mem[gt[mem] >= 0]
        human = np.bincount(gt[labeled_mem], minlength=9)
        rng = np.random.default_rng(fi)
        # samples closest to the family centre in the galaxy are the most typical
        d = ((xy[mem] - xy[mem].mean(0)) ** 2).sum(1)
        typical = mem[np.argsort(d)[:48]]
        sample = unpack(maps[np.sort(rng.choice(mem, min(4000, len(mem)), replace=False))])
        save_mean_png(sample, OUT / f"family_{fi}.png")
        name, note, density = describe(sample)
        families.append({
            "id": fi,
            "size": int(len(mem)),
            "unlabeled": int((split[mem] == UNLABELED).sum()),
            "centroid": [float(v) for v in xy[mem].mean(0)],
            "mean_probs": {CLASSES[k]: round(float(mp[k]), 3) for k in top},
            "mean_conf": round(float(conf[mem].mean()), 3),
            "human_labels": {CLASSES[k]: int(human[k]) for k in np.argsort(-human) if human[k] > 0},
            "samples": [int(i) for i in typical],
            "name": name,
            "note": note,
            "fail_density": round(density, 4),
        })

    # ── web assets ───────────────────────────────────────────────────────────
    WEB.mkdir(parents=True, exist_ok=True)
    lo, hi = np.percentile(xy, 0.05, 0), np.percentile(xy, 99.95, 0)
    span = (hi - lo).max()
    q = np.clip((xy - lo) / span * 65535, 0, 65535).astype(np.uint16)
    pts = np.zeros((n, 8), np.uint8)
    pts[:, 0:2] = np.ascontiguousarray(q[:, 0]).view(np.uint8).reshape(n, 2)
    pts[:, 2:4] = np.ascontiguousarray(q[:, 1]).view(np.uint8).reshape(n, 2)
    pts[:, 4] = pred
    pts[:, 5] = np.clip(conf * 255, 0, 255).astype(np.uint8)
    pts[:, 6] = np.where(gt >= 0, gt.astype(np.int16), 255).astype(np.uint8)
    # low 7 bits: unnamed-pattern family (127 = none); top bit: near-clean wafer
    pts[:, 7] = np.where(fam == 255, 127, fam).astype(np.uint8) | (near_clean.astype(np.uint8) << 7)
    pts.tofile(WEB / "points.bin")

    def to_q(v):
        return [float(x) for x in np.clip((np.asarray(v) - lo) / span * 65535, 0, 65535)]
    for f in families:
        f["centroid_q"] = to_q(f["centroid"])
        del f["centroid"]
        f["image"] = f"/surprise/api/family?id={f['id']}"

    # server-side lookups for the API routes
    np.clip(probs * 255, 0, 255).astype(np.uint8).tofile(OUT / "probs_u8.bin")
    z = np.load(OUT / "pca32.npy")
    scale = float(np.abs(z).max() / 127)
    np.clip(np.round(z / scale), -127, 127).astype(np.int8).tofile(OUT / "pca32_i8.bin")
    info = np.zeros((n, 6), np.int32)
    info[:, 0] = meta["lot"]; info[:, 1] = meta["wafer_idx"]
    info[:, 2] = meta["rows"]; info[:, 3] = meta["cols"]
    info[:, 4] = gt; info[:, 5] = split
    info.tofile(OUT / "info.bin")
    q.tofile(OUT / "xy_u16.bin")

    pm = np.load(OUT / "pca_model.npz")
    export_model_for_browser(pm["mean"], pm["components"], scale)

    by_class = []
    for c in range(9):
        mask = unl & (pred == c)
        by_class.append({
            "name": CLASSES[c],
            "predicted": int(mask.sum()),
            "label_ready": int((mask & ready).sum()),
            "threshold": thresholds[CLASSES[c]],
            "prior": round(float(prior[c]), 5),
            "labeled_count": int((gt == c).sum()),
            "near_clean_called": int((mask & near_clean).sum()),
            "near_clean_ready": int((mask & ready & near_clean).sum()),
            "near_clean_human_share": round(float(near_clean[gt == c].mean()), 4),
        })

    summary = {
        "n_total": int(n),
        "n_labeled": int((gt >= 0).sum()),
        "n_unlabeled": int(unl.sum()),
        "n_never_seen_none": int(nn.sum()),
        "never_seen_none_false_alarms": false_alarm,
        "never_seen_none_false_alarm_total": int(sum(false_alarm.values())),
        "target_precision": TARGET_PRECISION,
        "by_class": by_class,
        "label_ready_total": int((unl & ready).sum()),
        "calibration": table,
        "holdout": None if f1_acc is None else {"macro_f1": f1_acc[0], "accuracy": f1_acc[1], "n": f1_acc[2]},
        "families": families,
        "uncertain_total": int(len(ids)),
        "classes": CLASSES,
    }
    (WEB / "summary.json").write_text(json.dumps(summary))
    print(json.dumps({k: v for k, v in summary.items() if k not in ("calibration", "families")}, indent=1))
    for f in families:
        print(f"  family {f['id']:2d}  n={f['size']:6,}  {f['mean_probs']}  humans={f['human_labels']}")


def export_model_for_browser(pca_mean, pca_comp, pca_scale):
    """
    Fold every BatchNorm into its conv and write raw float32 weights the browser's
    hand-written forward pass reads in a fixed order. No ONNX runtime needed.
    """
    import torch
    m = load_model()

    def fold(conv, bn):
        w = conv.weight.detach()
        s = bn.weight.detach() / torch.sqrt(bn.running_var + bn.eps)
        return (w * s[:, None, None, None]), (bn.bias.detach() - bn.running_mean * s)

    layers = []
    blobs = []

    def add(name, w, b, stride):
        layers.append({"name": name, "out": w.shape[0], "in": w.shape[1], "k": w.shape[2],
                       "stride": stride, "pad": w.shape[2] // 2})
        blobs.extend([w.numpy().ravel(), b.numpy().ravel()])

    add("stem", *fold(m.stem[0], m.stem[1]), 1)
    for i, blk in enumerate([m.layer1, m.layer2, m.layer3, m.layer4], 1):
        st = blk.conv1.stride[0]
        add(f"l{i}.c1", *fold(blk.conv1, blk.bn1), st)
        add(f"l{i}.c2", *fold(blk.conv2, blk.bn2), 1)
        add(f"l{i}.sc", *fold(blk.shortcut[0], blk.shortcut[1]), st)
    blobs.extend([m.fc.weight.detach().numpy().ravel(), m.fc.bias.detach().numpy().ravel()])
    blobs.extend([pca_mean.ravel(), pca_comp.ravel()])
    np.concatenate(blobs).astype(np.float32).tofile(WEB / "model.bin")
    (WEB / "model.json").write_text(json.dumps({"layers": layers, "fc": [9, 128],
                                                "pca": [32, 128], "pca_scale": pca_scale}))

    # Reference outputs so the JS forward pass can be checked against PyTorch.
    maps = np.memmap(OUT / "maps64.bin", np.uint8, "r").reshape(-1, 1024)
    ids = [0, 1, 37, 100_000, 400_000, 811_000]
    x = torch.from_numpy(unpack(maps[ids]).astype(np.float32) / 2.0)[:, None]
    with torch.no_grad():
        p = torch.softmax(m(x), -1).numpy()
    (OUT / "js_reference.json").write_text(json.dumps({"ids": ids, "probs": p.tolist()}))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["prep", "infer", "verify", "embed", "analyze", "all"])
    ap.add_argument("--pkl", type=Path, default=Path.home() / "Downloads" / "LSWMD.pkl" / "LSWMD.pkl")
    a = ap.parse_args()
    t0 = time.time()
    if a.stage in ("prep", "all"):
        prep(a.pkl)
    if a.stage in ("infer", "all"):
        infer()
    res = verify() if a.stage in ("verify", "analyze", "all") else None
    if a.stage in ("embed", "all"):
        embed()
    if a.stage in ("analyze", "all"):
        analyze(res)
    print(f"done in {(time.time()-t0)/60:.1f} min")
