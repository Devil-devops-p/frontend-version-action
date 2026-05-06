# Smart Versioning Action

A custom GitHub Action to automatically manage application versions based on:

- Changes in core-lib
- Differences between environment files and version.json
- Rebuild-safe logic (no unnecessary version bumps)

---

## 🚀 Features

- Single source of truth: `version.json`
- Smart version bump (patch / minor / major)
- Rebuild-safe (no bump if no changes)
- Syncs version across:
  - environment.prod.ts
  - environment.ts
- Prevents version drift across repos

---

## 🧠 Versioning Rules

### 🆕 When core-lib has changes

#### Step 1: Resolve base version

| ENV Version | JSON Version | Result |
|------------|-------------|--------|
| same | same | patch +1 |
| lower | higher | pick higher |
| higher | lower | pick higher |

#### Step 2: Apply smart bump

| Condition | Version |
|----------|--------|
| ≤ 5 files AND ≤ 20 lines | patch |
| 6–10 files OR 21–100 lines | minor (patch → 0) |
| ≥ 11 files OR > 100 lines | major (minor & patch → 0) |

---

### 🔁 When NO core-lib changes (rebuild)

| ENV Version | JSON Version | Result |
|------------|-------------|--------|
| same | same | same (no change) |
| lower | higher | pick higher |
| higher | lower | pick higher |

---

## 📥 Inputs

| Name | Required | Description |
|------|----------|-------------|
| version-file | yes | Path to version.json |
| env-files | yes | Comma-separated list of environment files |

---

## 📤 Outputs

| Name | Description |
|------|------------|
| version | Final computed version |

---

## ⚙️ Usage

```yaml
- name: Versioning
  id: version
  uses: your-org/devops-version-action@main
  with:
    version-file: projects/core-lib/healthcare-ui-core-lib/src/version.json
    env-files: |
      projects/patient-management-app/src/environments/environment.prod.ts,
      projects/patient-management-app/src/environments/environment.ts