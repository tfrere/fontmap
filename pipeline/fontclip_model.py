"""
Load the pretrained FontCLIP image encoder (Tatsukawa et al., Eurographics 2024).

The released checkpoint (model_checkpoints/model.pt from FontCLIP's setup_data.py) is a
training dict {epoch, model_state_dict, optimizer_state_dict, loss, signature}. Its
model_state_dict is an OpenAI-CLIP ViT-B/32 state dict where only visual.proj and
visual.transformer.resblocks.{9,10,11} differ from the OpenAI weights, plus LoRA
(r=256, alpha=1024, q/k/v/out) tensors on the text transformer. Images therefore only
need the OpenAI ViT-B/32 with the fine-tuned visual weights swapped in.

Backends:
  "openclip" - open_clip OpenAI ViT-B/32 + checkpoint visual.* tensors (no FontCLIP code needed)
  "official" - FontCLIP's own ExCLIP via models.init_model.load_model (needs the clone)
"""

import sys
from pathlib import Path

import torch

PIPELINE_DIR = Path(__file__).resolve().parent
FONTCLIP_REPO = PIPELINE_DIR / "fontclip_workspace" / "FontCLIP"
DEFAULT_CHECKPOINT = FONTCLIP_REPO / "model_checkpoints" / "model.pt"
DEFAULT_OPENAI_WEIGHTS = Path.home() / ".cache/clip/ViT-B-32.pt"


def load_checkpoint_state(checkpoint=DEFAULT_CHECKPOINT):
    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
    return ckpt["model_state_dict"]


def load_fontclip_openclip(checkpoint=DEFAULT_CHECKPOINT, openai_weights=DEFAULT_OPENAI_WEIGHTS):
    import open_clip
    from open_clip.constants import OPENAI_DATASET_MEAN, OPENAI_DATASET_STD

    model = open_clip.openai.load_openai_model(str(openai_weights), device="cpu")
    visual_state = {k[len("visual."):]: v.float() for k, v in load_checkpoint_state(checkpoint).items()
                    if k.startswith("visual.")}
    model.visual.load_state_dict(visual_state, strict=True)
    model.float().eval()
    preprocess = open_clip.image_transform(224, is_train=False, mean=OPENAI_DATASET_MEAN, std=OPENAI_DATASET_STD)
    return model, preprocess


def load_fontclip_official(checkpoint=DEFAULT_CHECKPOINT):
    sys.path.insert(0, str(FONTCLIP_REPO))
    from models.init_model import load_model, preprocess
    from models.lora import LoRAConfig

    lora_config_text = LoRAConfig(r=256, alpha=1024.0, bias=False, learnable_alpha=False,
                                  apply_q=True, apply_k=True, apply_v=True, apply_out=True)
    model = load_model(str(checkpoint), model_name="ViT-B/32", device="cpu",
                       use_lora_text=True, lora_config_text=lora_config_text,
                       precontext_length_vision=10, precontext_length_text=77,
                       precontext_dropout_rate=0, pt_applied_layers=None)
    model.float().eval()
    return model, preprocess


def load_fontclip(backend="openclip", checkpoint=DEFAULT_CHECKPOINT):
    if backend == "official":
        return load_fontclip_official(checkpoint)
    return load_fontclip_openclip(checkpoint)
