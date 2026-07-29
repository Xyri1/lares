# Lares Logo Style Exploration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate three equally polished preview icons for selecting Lares' logo style.

**Architecture:** Use the built-in image generator once per concept so each
direction receives a focused prompt. Keep the outputs preview-only and present
them together for selection; do not replace the packaged Electron icon.

**Tech Stack:** Built-in image generation

## Global Constraints

- Icon mark only; no wordmark.
- Soft, organic, friendly, abstract, monochrome-first, and vector-friendly.
- Use a dark mark on a warm off-white field.
- Avoid robots, brains, chat bubbles, AI sparkles, detailed faces, gradients,
  mockups, watermarks, and decorative presentation.

---

### Task 1: Generate the comparison set

**Files:**
- Create: none; previews remain in the image generator's default output location.
- Modify: none.
- Test: visual inspection at full size and thumbnail size.

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-29-lares-logo-style-exploration-design.md`
- Produces: one preview each for Soft Loop, Mood Seed, and Breathing Bloom.

- [ ] **Step 1: Generate Soft Loop**

Generate one square preview centered on a single continuous rounded stroke that
suggests both a tilted face and an embrace without depicting a literal face.

- [ ] **Step 2: Generate Mood Seed**

Generate one square preview centered on an asymmetric bean-like form whose
minimal negative space gives it a gentle emotional presence.

- [ ] **Step 3: Generate Breathing Bloom**

Generate one square preview centered on two or three soft lobes expanding around
a calm center, with no floral detail.

- [ ] **Step 4: Inspect and present**

Reject any concept that breaks the global constraints or loses its silhouette at
thumbnail size. Present the three accepted previews together with their names.
