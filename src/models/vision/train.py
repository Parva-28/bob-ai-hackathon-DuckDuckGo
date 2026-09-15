"""
train.py — Train the WaferCNN on WM-811K preprocessed data.

Usage (after running data_prep.py):
    python src/models/vision/train.py

Outputs:
    src/models/vision/checkpoints/best_model.pt   — best checkpoint by val macro-F1
    src/models/vision/checkpoints/last_model.pt   — final epoch checkpoint
    src/models/vision/training_log.json           — per-epoch metrics

Class imbalance strategy:
    Inverse-frequency class weights passed to CrossEntropyLoss.
    Some rare classes (Donut, Near-full) have as few as ~150 samples —
    weighted loss + aggressive augmentation are both needed.

Augmentation (training only):
    Horizontal flip + vertical flip (wafer maps are rotation-symmetric for most
    defect types — flipping is label-preserving). No colour jitter (single channel,
    binary values). Small random rotation (±90°) for Center/Donut patterns only
    would be more precise, but a global flip is safe and simple.
"""

import json
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from sklearn.metrics import f1_score
from tqdm import tqdm

from model import get_model, WaferCNN
from data_prep import DEFECT_CLASSES, IDX_TO_CLASS

# ── config ───────────────────────────────────────────────────────────────────
DATA_DIR   = Path(__file__).parent / "data"
CKPT_DIR   = Path(__file__).parent / "checkpoints"
LOG_PATH   = Path(__file__).parent / "training_log.json"

EPOCHS     = 40
BATCH_SIZE = 128
LR         = 1e-3
LR_DECAY   = 0.5          # factor when val F1 plateaus
PATIENCE   = 5            # epochs before LR decay
DEVICE     = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Training on: {DEVICE}")


# ── dataset ──────────────────────────────────────────────────────────────────

class WaferDataset(Dataset):
    def __init__(self, X: np.ndarray, y: np.ndarray, augment: bool = False):
        self.X = torch.from_numpy(X).float()
        self.y = torch.from_numpy(y).long()
        self.augment = augment

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int):
        x, label = self.X[idx], self.y[idx]
        if self.augment:
            # horizontal flip
            if torch.rand(1).item() > 0.5:
                x = x.flip(-1)
            # vertical flip
            if torch.rand(1).item() > 0.5:
                x = x.flip(-2)
            # 90° rotation (k ∈ {0,1,2,3})
            k = torch.randint(0, 4, (1,)).item()
            if k:
                x = torch.rot90(x, k=int(k), dims=[-2, -1])
        return x, label


# ── class weights ─────────────────────────────────────────────────────────────

def compute_class_weights(y: np.ndarray, num_classes: int) -> torch.Tensor:
    counts = np.bincount(y, minlength=num_classes).astype(float)
    counts = np.clip(counts, 1, None)
    weights = 1.0 / counts
    weights = weights / weights.sum() * num_classes  # normalise
    return torch.tensor(weights, dtype=torch.float)


def compute_sample_weights(y: np.ndarray, class_weights: torch.Tensor) -> np.ndarray:
    return class_weights[y].numpy()


# ── training loop ─────────────────────────────────────────────────────────────

def train():
    CKPT_DIR.mkdir(parents=True, exist_ok=True)

    # load preprocessed data
    X_train = np.load(DATA_DIR / "X_train.npy")
    y_train = np.load(DATA_DIR / "y_train.npy")
    X_val   = np.load(DATA_DIR / "X_val.npy")
    y_val   = np.load(DATA_DIR / "y_val.npy")

    num_classes   = len(DEFECT_CLASSES)
    class_weights = compute_class_weights(y_train, num_classes).to(DEVICE)

    train_ds = WaferDataset(X_train, y_train, augment=True)
    val_ds   = WaferDataset(X_val,   y_val,   augment=False)

    # weighted sampler to oversample rare classes during training
    sample_w = compute_sample_weights(y_train, class_weights.cpu())
    sampler  = WeightedRandomSampler(
        weights=sample_w, num_samples=len(sample_w), replacement=True
    )

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, sampler=sampler,
                              num_workers=0, pin_memory=(DEVICE == "cuda"))
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False,
                              num_workers=0, pin_memory=(DEVICE == "cuda"))

    model     = get_model(num_classes=num_classes).to(DEVICE)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", factor=LR_DECAY, patience=PATIENCE
    )  # NOTE: `verbose` was deprecated in torch 2.2 and removed in later 2.x.
       # Passing it raises TypeError on torch>=2.14 before the first epoch runs.

    best_f1  = 0.0
    log      = []

    for epoch in range(1, EPOCHS + 1):
        # ── train ──
        model.train()
        train_loss, correct, total = 0.0, 0, 0
        for X_b, y_b in tqdm(train_loader, desc=f"Epoch {epoch:2d}/{EPOCHS} [train]",
                              leave=False):
            X_b, y_b = X_b.to(DEVICE), y_b.to(DEVICE)
            optimizer.zero_grad()
            logits = model(X_b)
            loss   = criterion(logits, y_b)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(y_b)
            correct    += (logits.argmax(1) == y_b).sum().item()
            total      += len(y_b)

        train_loss /= total
        train_acc   = correct / total

        # ── validate ──
        model.eval()
        all_preds, all_labels = [], []
        val_loss, total = 0.0, 0
        with torch.no_grad():
            for X_b, y_b in val_loader:
                X_b, y_b = X_b.to(DEVICE), y_b.to(DEVICE)
                logits    = model(X_b)
                loss      = criterion(logits, y_b)
                val_loss  += loss.item() * len(y_b)
                total     += len(y_b)
                all_preds.extend(logits.argmax(1).cpu().tolist())
                all_labels.extend(y_b.cpu().tolist())

        val_loss  /= total
        macro_f1   = f1_score(all_labels, all_preds, average="macro",
                               zero_division=0)
        scheduler.step(macro_f1)

        entry = {
            "epoch":      epoch,
            "train_loss": round(train_loss, 4),
            "train_acc":  round(train_acc,  4),
            "val_loss":   round(val_loss,   4),
            "macro_f1":   round(macro_f1,   4),
        }
        log.append(entry)
        print(f"Epoch {epoch:2d}/{EPOCHS}  "
              f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  "
              f"macro_F1={macro_f1:.4f}")

        # per-class F1 on final epoch
        if epoch == EPOCHS:
            per_class = f1_score(all_labels, all_preds, average=None, zero_division=0)
            print("\nPer-class F1 on validation split:")
            for i, f1 in enumerate(per_class):
                print(f"  {IDX_TO_CLASS[i]:12s}: {f1:.4f}")
            entry["per_class_f1"] = {IDX_TO_CLASS[i]: round(f, 4)
                                     for i, f in enumerate(per_class)}

        if macro_f1 > best_f1:
            best_f1 = macro_f1
            torch.save(model.state_dict(), CKPT_DIR / "best_model.pt")
            print(f"  ✓ New best macro-F1: {best_f1:.4f} — checkpoint saved")

    torch.save(model.state_dict(), CKPT_DIR / "last_model.pt")

    with open(LOG_PATH, "w") as f:
        json.dump(log, f, indent=2)

    print(f"\nTraining complete. Best val macro-F1: {best_f1:.4f}")
    print(f"Checkpoint saved to: {CKPT_DIR / 'best_model.pt'}")
    print(f"Training log: {LOG_PATH}")
    return best_f1


if __name__ == "__main__":
    train()
