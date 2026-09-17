"""
model.py — CNN backbone for wafer defect pattern classification.

Architecture: a lightweight ResNet-style CNN designed for 64×64 single-channel
wafer maps. Deliberately small — this task is 9-class image classification on
binary-valued maps, not ImageNet; a large backbone is unnecessary overhead.

Design decisions:
  - Single-channel input (wafer maps are not RGB)
  - 4 residual blocks with increasing channel depth (16→32→64→128)
  - Global average pooling instead of a large FC head (fewer parameters,
    less overfitting on the smaller defect classes)
  - Dropout before the classification head (rate=0.3)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class ResBlock(nn.Module):
    """Standard pre-activation residual block."""

    def __init__(self, in_ch: int, out_ch: int, stride: int = 1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, stride=stride, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(out_ch)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, stride=1,      padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(out_ch)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_ch != out_ch:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 1, stride=stride, bias=False),
                nn.BatchNorm2d(out_ch),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.shortcut(x)
        return F.relu(out)


class WaferCNN(nn.Module):
    """
    Lightweight ResNet-style CNN for wafer defect classification.

    Input:  (B, 1, 64, 64)   — single-channel, normalised to [0, 1]
    Output: (B, num_classes) — raw logits (apply softmax externally for probs)
    """

    NUM_CLASSES = 9   # WM-811K: Center, Donut, Edge-Loc, Edge-Ring,
                      #           Local, Random, Scratch, Near-full, None

    def __init__(self, num_classes: int = NUM_CLASSES, dropout: float = 0.3):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True),
        )
        self.layer1 = ResBlock(16,  32,  stride=2)   # → 32×32
        self.layer2 = ResBlock(32,  64,  stride=2)   # → 16×16
        self.layer3 = ResBlock(64,  128, stride=2)   # →  8×8
        self.layer4 = ResBlock(128, 128, stride=2)   # →  4×4

        self.gap     = nn.AdaptiveAvgPool2d(1)       # → 128×1×1
        self.dropout = nn.Dropout(p=dropout)
        self.fc      = nn.Linear(128, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.gap(x).flatten(1)
        x = self.dropout(x)
        return self.fc(x)

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Return per-class probabilities (softmax of logits)."""
        return F.softmax(self.forward(x), dim=-1)


class WaferViT(nn.Module):
    """
    Compact Vision Transformer (ViT-Tiny) for 64×64 single-channel wafer maps.
    
    Self-attention over 8×8 patches captures non-local spatial correlations across
    the wafer diameter (essential for Scratch, Donut, and Edge-Ring pattern recognition).
    
    Input:  (B, 1, 64, 64)
    Output: (B, num_classes)
    """

    NUM_CLASSES = 9

    def __init__(
        self,
        img_size: int = 64,
        patch_size: int = 8,
        in_chans: int = 1,
        num_classes: int = NUM_CLASSES,
        embed_dim: int = 192,
        depth: int = 4,
        num_heads: int = 4,
        mlp_ratio: float = 4.0,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.num_patches = (img_size // patch_size) ** 2  # (64//8)^2 = 64
        self.patch_embed = nn.Conv2d(
            in_chans, embed_dim, kernel_size=patch_size, stride=patch_size, bias=False
        )
        self.cls_token = nn.Parameter(torch.zeros(1, 1, embed_dim))
        self.pos_embed = nn.Parameter(torch.zeros(1, self.num_patches + 1, embed_dim))
        self.pos_drop = nn.Dropout(p=dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embed_dim,
            nhead=num_heads,
            dim_feedforward=int(embed_dim * mlp_ratio),
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=depth)
        self.norm = nn.LayerNorm(embed_dim)
        self.head = nn.Linear(embed_dim, num_classes)

        # Initialize weights
        nn.init.trunc_normal_(self.pos_embed, std=0.02)
        nn.init.trunc_normal_(self.cls_token, std=0.02)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B = x.shape[0]
        # (B, 1, 64, 64) -> (B, embed_dim, 8, 8) -> (B, 64, embed_dim)
        x = self.patch_embed(x).flatten(2).transpose(1, 2)
        cls_tokens = self.cls_token.expand(B, -1, -1)
        x = torch.cat((cls_tokens, x), dim=1)
        x = self.pos_drop(x + self.pos_embed)
        x = self.encoder(x)
        x = self.norm(x)
        # Classify from CLS token
        return self.head(x[:, 0])

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Return per-class probabilities (softmax of logits)."""
        return F.softmax(self.forward(x), dim=-1)


def get_model(arch: str = "cnn", num_classes: int = WaferCNN.NUM_CLASSES, dropout: float = 0.3) -> nn.Module:
    """Model factory returning either WaferCNN or WaferViT."""
    if arch.lower() == "vit":
        return WaferViT(num_classes=num_classes, dropout=dropout)
    return WaferCNN(num_classes=num_classes, dropout=dropout)


if __name__ == "__main__":
    # quick sanity check
    cnn = get_model("cnn")
    vit = get_model("vit")
    dummy = torch.zeros(4, 1, 64, 64)
    out_cnn = cnn(dummy)
    out_vit = vit(dummy)
    print(f"CNN Output shape: {out_cnn.shape} ({sum(p.numel() for p in cnn.parameters()):,} params)")
    print(f"ViT Output shape: {out_vit.shape} ({sum(p.numel() for p in vit.parameters()):,} params)")

