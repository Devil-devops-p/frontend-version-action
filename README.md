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

## 📦 JavaScript Modules

This action provides modular JavaScript scripts that can be used individually or together:

### 📄 index.js - Version Resolution
Computes the final version based on environment files and version.json.

**Environment Variables:**
- `INPUT_VERSION-FILE`: Path to version.json
- `INPUT_ENV-FILES`: Comma-separated list of environment files
- `INPUT_REBUILD`: Force rebuild behavior (true/false)
- `GITHUB_RUN_ATTEMPT`: Auto-detect re-runs

**Usage:**
```bash
INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
INPUT_REBUILD="false" \
node index.js
```

### 🧹 cleanup.js - Gitignore & Cleanup
Ensures .gitignore rules and removes temporary files.

**Environment Variables:**
- `INPUT_VERSION-FILE`: Version file path (for core-lib detection)
- `INPUT_ENV-FILES`: Environment files (for cleanup context)

**Usage:**
```bash
INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
node cleanup.js
```

### 📝 commit.js - Git Operations
Commits changes to both main repository and core-lib.

**Environment Variables:**
- `INPUT_VERSION-FILE`: Version file path
- `INPUT_ENV-FILES`: Environment files to commit
- `GITHUB_REF_NAME`: Branch name for push operations
- `GITHUB_OUTPUT_VERSION`: Version from previous step (optional)

**Usage:**
```bash
INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
GITHUB_REF_NAME="Dev-k8s" \
node commit.js
```

---

## ⚙️ Complete Workflow Usage

### Option 1: Single Script (Recommended)
**index.js now runs the complete workflow internally:**
- Version resolution → File updates → Cleanup → Commits

```yaml
- name: Complete version workflow
  run: |
    INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
    INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
    INPUT_REBUILD="false" \
    node /path/to/frontend-version-action/index.js
```

### Option 2: Individual Scripts
Use scripts separately for granular control:

```yaml
- name: Version resolution
  run: |
    INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
    INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
    INPUT_REBUILD="false" \
    node /path/to/frontend-version-action/index.js

- name: Cleanup
  run: |
    INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
    INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
    node /path/to/frontend-version-action/cleanup.js

- name: Commit changes
  run: |
    INPUT_VERSION-FILE="projects/core-lib/healthcare-ui-core-lib/src/version.json" \
    INPUT_ENV-FILES="projects/patient-management-app/src/environments/environment.prod.ts,projects/patient-management-app/src/environments/environment.ts" \
    node /path/to/frontend-version-action/commit.js
```

### Option 2: Original GitHub Action
```yaml
- name: Versioning
  id: version
  uses: Devil-devops-p/frontend-version-action@main
  with:
    version-file: projects/core-lib/healthcare-ui-core-lib/src/version.json
    env-files: |
      projects/patient-management-app/src/environments/environment.prod.ts,
      projects/patient-management-app/src/environments/environment.ts
```

---

## ⚙️ Usage

```yaml
- name: Versioning
  id: version
  uses: Devil-devops-p/frontend-version-action@main
  with:
    version-file: projects/core-lib/healthcare-ui-core-lib/src/version.json
    env-files: |
      projects/patient-management-app/src/environments/environment.prod.ts,
      projects/patient-management-app/src/environments/environment.ts
```

---

## 🔧 Features

- **Modular Design**: Use individual scripts or complete workflow
- **Flexible File Paths**: Works with any project structure
- **Conflict-Safe Commits**: Automatic retry and conflict resolution
- **Rebuild Detection**: Smart handling of workflow re-runs
- **Environment Variable Driven**: Easy integration with any CI/CD system
- **Error Handling**: Comprehensive validation and error reporting

---

## 📋 Dependencies

- Node.js (v14+)
- Git
- File system access to project files

---

## 🚀 Quick Start

1. **Clone the action:**
   ```bash
   git clone https://github.com/your-org/frontend-version-action.git
   cd frontend-version-action
   ```

2. **Use in your workflow (single command):**
   ```yaml
   - name: Complete version workflow
     run: |
       INPUT_VERSION-FILE="path/to/version.json" \
       INPUT_ENV-FILES="path/to/env1.ts,path/to/env2.ts" \
       INPUT_REBUILD="false" \
       node /path/to/frontend-version-action/index.js
   ```

3. **Customize paths** for your project structure


---

## 🔄 Workflow Execution Flow

When using **index.js** (single script approach):

```
📦 Version Resolution
├── Read current versions
├── Compare and compute final version
└── Output version to GitHub Actions

📝 File Updates  
├── Update version.json
├── Update all environment files
└── Set build timestamp

🧹 Cleanup (calls cleanup.js)
├── Ensure .gitignore exists
├── Add core-lib to .gitignore
├── Remove .bak files
└── Untrack core-lib from git

📝 Commits (calls commit.js)
├── Commit main repo changes
├── Handle conflicts with retry
├── Commit core-lib changes
└── Push to both repositories
```