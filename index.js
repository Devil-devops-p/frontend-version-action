const fs = require("fs");
const { execSync } = require("child_process");

try {
  const versionFile = process.env['INPUT_VERSION-FILE'];
  const envFiles = (process.env['INPUT_ENV-FILES'] || "")
    .split(",").map(f => f.trim()).filter(Boolean);
  const rebuild = process.env['INPUT_REBUILD'] || 'false';
  const versionType = process.env['INPUT_VERSION_TYPE'] || 'patch';

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
  console.log("🔢 Version type:", versionType);

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
  // const eventInputs = process.env['GITHUB_EVENT_INPUTS'] || '{}';

  // console.log("🔍 Debug - Rebuild detection:");
  // console.log("GITHUB_RUN_ATTEMPT:", runAttempt);
  // console.log("Original rebuild parameter:", rebuild);
  // console.log("GITHUB_EVENT_INPUTS:", eventInputs);

  let REBUILD = rebuild;
  if (parseInt(runAttempt) > 1) {
    console.log("Detected re-run → forcing rebuild");
    REBUILD = "true";
  } else {
    console.log("Original REBUILD parameter:", rebuild);
  }

  console.log("ENV_VERSION:", envVersion);
  console.log("JSON_VERSION:", jsonVersion);
  // console.log("CURRENT_VERSION:", currentVersion);
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
  const compareVersions = (a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (aParts[i] > bParts[i]) return 1;
      if (aParts[i] < bParts[i]) return -1;
    }
    return 0;
  };

  const getHighestVersion = (...versions) => {
    return versions.reduce((max, v) =>
      compareVersions(v, max) > 0 ? v : max
    );
  };

  // ---------------------------
  // VERSION INCREMENT
  // ---------------------------
  const incrementVersion = (version, type) => {
    const [MAJOR, MINOR, PATCH] = version.split('.').map(Number);

    switch (type) {
      case 'major':
        return `${MAJOR + 1}.0.0`;
      case 'minor':
        return `${MAJOR}.${MINOR + 1}.0`;
      case 'patch':
      default:
        return `${MAJOR}.${MINOR}.${PATCH + 1}`;
    }
  };

  // ---------------------------
  // DECIDE VERSION
  // ---------------------------
  let FINAL_VERSION;

  const highestVersion = getHighestVersion(
    envVersion,
    incrementVersion,
    jsonVersion
  );

  console.log("🏆 Highest version:", highestVersion);


  if (REBUILD === "true") {
    if (envVersion === jsonVersion) {
      console.log(`🔁 Rebuild (no increment)`);
      FINAL_VERSION = jsonVersion;
    } else {
      console.log("Versions different → pick higher");
      FINAL_VERSION = compareVersions(envVersion, jsonVersion) > 0 ? envVersion : jsonVersion;
    }
  } else {
    if (envVersion === jsonVersion) {

      console.log(`Versions equal → increment ${versionType}`);
      FINAL_VERSION = incrementVersion(envVersion, versionType);
    } else {

      console.log(`⬆️ Versions different → pick higher ${highestVersion}`);
      FINAL_VERSION = highestVersion;
    }
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
    // Use environment variable export for cleanup script
    const cleanupCommand = `
      export INPUT_VERSION_FILE="${versionFile}"
      export INPUT_ENV_FILES="${envFiles.join(',')}"
      export INPUT_REBUILD="${REBUILD}"
      node ${__dirname}/cleanup.js
    `;

    execSync(cleanupCommand, {
      stdio: 'inherit',
      cwd: process.cwd(),
      shell: true
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
    // Debug: Log what we're passing
    // console.log("🔍 Debug - Passing to commit script:");
    // console.log("versionFile:", versionFile);
    // console.log("envFiles:", envFiles);
    // console.log("envFiles.join(','):", envFiles.join(','));
    console.log("FINAL_VERSION:", FINAL_VERSION);

    // Use environment variable export instead of env parameter
    const command = `
      export INPUT_VERSION_FILE="${versionFile}"
      export INPUT_ENV_FILES="${envFiles.join(',')}"
      export GITHUB_OUTPUT_VERSION="${FINAL_VERSION}"
      export GITHUB_REF_NAME="${process.env.GITHUB_REF_NAME || 'main'}"
      export WORKSPACE_DIR="${process.cwd()}"
      node ${__dirname}/commit.js
    `;

    execSync(command, {
      stdio: 'inherit',
      cwd: process.cwd(), // Run from workspace directory, not script directory
      shell: true
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