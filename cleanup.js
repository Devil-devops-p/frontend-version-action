const fs = require("fs");
const { execSync } = require("child_process");

try {
  console.log("🧹 Starting gitignore and cleanup...");

  // ---------------------------
  // ENSURE .GITIGNORE EXISTS
  // ---------------------------
  const gitignorePath = ".gitignore";
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "");
    console.log("✅ Created .gitignore");
  }

  // ---------------------------
  // ADD RULES ONLY IF NOT PRESENT
  // ---------------------------
  const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
  const lines = gitignoreContent.split('\n').filter(line => line.trim());

  // Add *.bak if not present
  if (!lines.includes("*.bak")) {
    fs.appendFileSync(gitignorePath, "\n*.bak");
    console.log("✅ Added *.bak to .gitignore");
  }

  // Add core-lib path if not present
  const coreLibPath = "projects/core-lib/healthcare-ui-core-lib/";
  if (!lines.includes(coreLibPath)) {
    fs.appendFileSync(gitignorePath, `\n${coreLibPath}`);
    console.log(`✅ Added ${coreLibPath} to .gitignore`);
  }

  // ---------------------------
  // REMOVE TEMP FILES
  // ---------------------------
  try {
    execSync("find projects -name \"*.bak\" -delete", { stdio: 'inherit' });
    console.log("✅ Removed .bak files");
  } catch (error) {
    console.log("ℹ️ No .bak files found or error removing them");
  }

  // ---------------------------
  // ENSURE CORE-LIB IS NOT TRACKED
  // ---------------------------
  try {
    execSync("git rm --cached -r " + coreLibPath + " 2>/dev/null || true", {
      stdio: 'inherit',
      shell: true
    });
    console.log("✅ Ensured core-lib is not tracked");
  } catch (error) {
    console.log("ℹ️ Core-lib already untracked or not in git");
  }

  // ---------------------------
  // DETECT REBUILD
  // ---------------------------
  const runAttempt = process.env['GITHUB_RUN_ATTEMPT'] || '1';

  let REBUILD = process.env['INPUT_REBUILD'] || 'false';
  if (parseInt(runAttempt) > 1) {
    console.log("Detected re-run → forcing rebuild");
    REBUILD = "true";
  }

  console.log("🎉 Cleanup completed successfully!");

} catch (err) {
  console.error("❌ Cleanup failed:", err.message);
  process.exit(1);
}
