const fs = require("fs");
const { execSync } = require("child_process");

try {
  console.log("🚀 Starting commit process...");

  // Debug: Log all environment variables
  console.log("🔍 Debug - Environment variables:");
  console.log("INPUT_VERSION_FILE:", process.env['INPUT_VERSION_FILE']);
  console.log("INPUT_ENV_FILES:", process.env['INPUT_ENV_FILES']);
  console.log("GITHUB_OUTPUT_VERSION:", process.env['GITHUB_OUTPUT_VERSION']);
  console.log("GITHUB_REF_NAME:", process.env['GITHUB_REF_NAME']);

  // ---------------------------
  // GET FILE PATHS FROM ENV
  // ---------------------------
  const versionFile = process.env['INPUT_VERSION_FILE'];
  const envFiles = (process.env['INPUT_ENV_FILES'] || "")
    .split(",").map(f => f.trim()).filter(Boolean);

  if (!versionFile) {
    console.error("❌ INPUT_VERSION_FILE is required");
    process.exit(1);
  }

  if (envFiles.length === 0) {
    console.error("❌ INPUT_ENV_FILES is required");
    process.exit(1);
  }

  console.log("📦 Version file:", versionFile);
  console.log("📁 Environment files:", envFiles);

  // ---------------------------
  // COMMIT MAIN REPO CHANGES
  // ---------------------------
  console.log("📝 Committing main repo changes...");

  // Configure git
  execSync("git config user.name \"github-actions\"", { stdio: 'inherit' });
  execSync("git config user.email \"actions@github.com\"", { stdio: 'inherit' });

  // Read version from version.json
  const versionData = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  const FINAL_VERSION = versionData.version;
  console.log("Initial FINAL_VERSION:", FINAL_VERSION);

  // Stage all environment files
  envFiles.forEach(file => {
    execSync(`git add "${file}"`, { stdio: 'inherit' });
  });

  // Check if there are changes
  try {
    execSync("git diff --cached --quiet", { stdio: 'pipe' });
    console.log("No changes in main repo");
  } catch (error) {
    // There are changes, proceed with commit
    execSync(`git commit -m "Auto sync version to ${FINAL_VERSION} [skip ci]"`, { stdio: 'inherit' });

    // Retry loop (max 5 attempts)
    for (let i = 1; i <= 5; i++) {
      console.log(`Attempt ${i}...`);

      try {
        const branchName = process.env.GITHUB_REF_NAME || 'main';
        execSync(`git pull --ff-only origin "${branchName}"`, { stdio: 'inherit' });
        execSync(`git push origin "${branchName}"`, { stdio: 'inherit' });
        console.log("✅ Main repo changes pushed successfully");
        break;
      } catch (pushError) {
        console.log("Conflict detected → resetting and re-syncing");

        try {
          execSync("git rebase --abort", { stdio: 'pipe' });
        } catch (e) {
          // Ignore if no rebase in progress
        }

        const branchName = process.env.GITHUB_REF_NAME || 'main';
        execSync(`git reset --hard origin/${branchName}`, { stdio: 'inherit' });

        // Re-read version from version.json (source of truth)
        const reReadData = JSON.parse(fs.readFileSync(versionFile, "utf8"));
        const reReadVersion = reReadData.version;
        console.log("Re-read FINAL_VERSION:", reReadVersion);

        // Update all environment files
        envFiles.forEach(file => {
          execSync(`sed -i "s/version: '[0-9]\\+\\.[0-9]\\+\\.[0-9]\\+'/version: '${reReadVersion}'/" "${file}"`, { stdio: 'inherit' });
        });

        envFiles.forEach(file => {
          execSync(`git add "${file}"`, { stdio: 'inherit' });
        });

        try {
          execSync("git diff --cached --quiet", { stdio: 'pipe' });
          console.log("No changes after sync, skipping commit");
          break;
        } catch (e) {
          execSync(`git commit -m "Auto sync version to ${reReadVersion} [skip ci]"`, { stdio: 'inherit' });
        }
      }

      if (i < 5) {
        execSync("sleep 2", { stdio: 'inherit' });
      }
    }

    console.log("Final version pushed:", FINAL_VERSION);
    console.log(`final_version=${FINAL_VERSION} >> $GITHUB_OUTPUT`);
  }

  // ---------------------------
  // COMMIT CORE-LIB CHANGES
  // ---------------------------
  console.log("📚 Committing core-lib changes...");

  // Change to core-lib directory
  process.chdir("projects/core-lib/healthcare-ui-core-lib");

  // Configure git for core-lib
  execSync("git config user.name \"github-actions\"", { stdio: 'inherit' });
  execSync("git config user.email \"actions@github.com\"", { stdio: 'inherit' });

  // Add version.json
  execSync("git add src/version.json", { stdio: 'inherit' });

  // Check if there are changes
  try {
    execSync("git diff --cached --quiet", { stdio: 'pipe' });
    console.log("No changes in core-lib");
  } catch (error) {
    // There are changes, proceed with commit
    const stepsVersion = process.env.GITHUB_OUTPUT_VERSION || FINAL_VERSION;
    execSync(`git commit -m "Auto bump version to ${stepsVersion} [skip ci]"`, { stdio: 'inherit' });

    // Retry loop (max 3 attempts)
    for (let i = 1; i <= 3; i++) {
      try {
        const branchName = process.env.GITHUB_REF_NAME || 'main';
        execSync(`git pull --rebase origin "${branchName}"`, { stdio: 'inherit' });
        execSync(`git push origin "${branchName}"`, { stdio: 'inherit' });
        console.log("✅ Core-lib changes pushed successfully");
        break;
      } catch (pushError) {
        console.log(`Retry ${i}...`);
        if (i < 3) {
          execSync("sleep 2", { stdio: 'inherit' });
        }
      }
    }
  }

  console.log("🎉 Commit process completed successfully!");

} catch (err) {
  console.error("❌ Commit process failed:", err.message);
  process.exit(1);
}
