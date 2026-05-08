const fs = require("fs");
const { execSync } = require("child_process");

try {
  const versionFile = process.env['INPUT_VERSION-FILE'];
  const envFiles = (process.env['INPUT_ENV-FILES'] || "")
    .split(",").map(f => f.trim()).filter(Boolean);
  const rebuild = process.env['INPUT_REBUILD'] || 'false';

  if (!versionFile) {
    console.error("❌ INPUT_VERSION-FILE is required");
    process.exit(1);
  }

  if (envFiles.length === 0) {
    console.error("❌ INPUT_ENV-FILES is required");
    process.exit(1);
  }

  console.log("📦 Version file:", versionFile);
  console.log("📁 Environment files:", envFiles);
  console.log("🔄 Rebuild:", rebuild);

  // ---------------------------
  // READ CURRENT VERSION
  // ---------------------------
  const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  let jsonVersion = data.version;

  if (!/^\d+\.\d+\.\d+$/.test(jsonVersion)) {
    jsonVersion = "1.0.0";
  }

  const envContent = fs.readFileSync(envFiles[0], "utf8");
  const match = envContent.match(/version:\s*['"]([\d.]+)['"]/);
  let envVersion = match ? match[1] : jsonVersion;

  // ---------------------------
  // DETECT REBUILD
  // ---------------------------
  const runAttempt = process.env['GITHUB_RUN_ATTEMPT'] || '1';

  let REBUILD = rebuild;
  if (parseInt(runAttempt) > 1) {
    console.log("Detected re-run → forcing rebuild");
    REBUILD = "true";
  }

  console.log("ENV_VERSION:", envVersion);
  console.log("JSON_VERSION:", jsonVersion);
  console.log("REBUILD:", REBUILD);

  // ---------------------------
  // VALIDATE SEMVER
  // ---------------------------
  const is_valid_version = (version) => {
    return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
  };

  if (!is_valid_version(envVersion)) {
    console.log("❌ Invalid ENV_VERSION:", envVersion);
    process.exit(1);
  }

  if (!is_valid_version(jsonVersion)) {
    console.log("❌ Invalid JSON_VERSION:", jsonVersion);
    process.exit(1);
  }

  // ---------------------------
  // COMPARE VERSIONS
  // ---------------------------
  const version_gt = (a, b) => {
    return [a, b].sort((x, y) => {
      const xParts = x.split('.').map(Number);
      const yParts = y.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (xParts[i] > yParts[i]) return 1;
        if (xParts[i] < yParts[i]) return -1;
      }
      return 0;
    })[0] === a;
  };

  // ---------------------------
  // DECIDE VERSION
  // ---------------------------
  let FINAL_VERSION;

  if (envVersion === jsonVersion) {
    if (REBUILD === "true") {
      console.log("Rebuild → increment patch");
      const [MAJOR, MINOR, PATCH] = envVersion.split('.').map(Number);
      FINAL_VERSION = `${MAJOR}.${MINOR}.${PATCH + 1}`;
    } else {
      console.log("Versions equal → increment patch");
      const [MAJOR, MINOR, PATCH] = envVersion.split('.').map(Number);
      FINAL_VERSION = `${MAJOR}.${MINOR}.${PATCH + 1}`;
    }
  } else {
    console.log("Versions different → pick higher");
    FINAL_VERSION = version_gt(envVersion, jsonVersion) ? envVersion : jsonVersion;
  }

  console.log("FINAL_VERSION:", FINAL_VERSION);

  // ---------------------------
  // WRITE FILES
  // ---------------------------
  data.version = FINAL_VERSION;
  data.buildTimestamp = Date.now();
  data.buildDate = new Date().toISOString();

  fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));

  envFiles.forEach(file => {
    let content = fs.readFileSync(file, "utf8");
    content = content.replace(
      /version:\s*['"][\d.]+['"]/,
      `version: '${FINAL_VERSION}'`
    );
    fs.writeFileSync(file, content);
  });

  console.log(`version=${FINAL_VERSION} >> $GITHUB_OUTPUT`);

  // ---------------------------
  // CALL CLEANUP SCRIPT
  // ---------------------------
  console.log("🧹 Running cleanup script...");
  try {
    execSync("node cleanup.js", {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log("✅ Cleanup completed");
  } catch (error) {
    console.error("❌ Cleanup failed");
    process.exit(1);
  }

  // ---------------------------
  // CALL COMMIT SCRIPT
  // ---------------------------
  console.log("📝 Running commit script...");
  try {
    // Pass version to commit script via environment variable
    process.env.GITHUB_OUTPUT_VERSION = FINAL_VERSION;
    execSync("node commit.js", {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log("✅ Commit completed");
  } catch (error) {
    console.error("❌ Commit failed");
    process.exit(1);
  }

  console.log("🎉 Complete workflow finished successfully!");

} catch (err) {
  console.error(err.message);
  process.exit(1);
}