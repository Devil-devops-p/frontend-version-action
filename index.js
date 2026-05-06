const fs = require("fs");
const { execSync } = require("child_process");

try {
  // Debug: Log all environment variables that start with INPUT_
  console.log("Available INPUT variables:", Object.keys(process.env).filter(k => k.startsWith('INPUT_')));

  const versionFile = process.env['INPUT_VERSION-FILE'];
  const envFiles = (process.env['INPUT_ENV-FILES'] || "")
    .split(",")
    .map(f => f.trim())
    .filter(f => f.length > 0);

  console.log("versionFile:", versionFile);
  console.log("envFiles:", envFiles);

  if (!versionFile) {
    throw new Error("version-file input is required");
  }

  if (envFiles.length === 0 || envFiles[0] === "") {
    throw new Error("env-files input is required");
  }

  // 🔹 Read JSON version
  const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  let jsonVersion = data.version;

  console.log("Raw JSON version:", jsonVersion);

  // If it's a git hash or not a semantic version, use a default version
  if (!/^\d+\.\d+\.\d+$/.test(jsonVersion)) {
    console.log("Invalid version format, using default 1.0.0");
    jsonVersion = "1.0.0";
    data.version = jsonVersion; // Update the data object
  }

  // 🔹 Read ENV version
  const envFile = envFiles[0].trim();
  const envContent = fs.readFileSync(envFile, "utf8");
  const match = envContent.match(/version:\s*'([\d.]+)'/);

  if (!match) throw new Error("ENV version not found");

  let envVersion = match[1];

  console.log("ENV:", envVersion);
  console.log("JSON:", jsonVersion);

  // 🔹 compare helper
  const versionGreater = (a, b) =>
    a.localeCompare(b, undefined, { numeric: true }) > 0;

  // 🔹 detect core-lib change
  let coreLibChanged = false;
  let files = 0;
  let insertions = 0;
  let deletions = 0;

  try {
    // Check if we have enough history to compare
    const gitLog = execSync("git log --oneline | wc -l").toString().trim();
    const commitCount = parseInt(gitLog);

    if (commitCount > 1) {
      const diffNames = execSync("git diff --name-only HEAD~1 HEAD").toString().trim();
      files = diffNames ? diffNames.split("\n").length : 0;

      const diffStats = execSync("git diff --numstat HEAD~1 HEAD").toString().trim();
      diffStats.split("\n").forEach(line => {
        const [add, del] = line.split("\t");
        insertions += parseInt(add) || 0;
        deletions += parseInt(del) || 0;
      });

      const diff = execSync("git diff --name-only HEAD~1 HEAD").toString();
      coreLibChanged = diff.includes("projects/core-lib/healthcare-ui-core-lib");
    } else {
      console.log("Not enough git history for comparison (only 1 commit)");
      coreLibChanged = false;
    }

  } catch (err) {
    console.log("Git diff failed, assuming no core-lib changes:", err.message);
    coreLibChanged = false;
  }

  console.log("Core-lib changed:", coreLibChanged);

  let baseVersion;

  // =====================================================
  // ✅ STEP 1: Resolve base version
  // =====================================================
  if (envVersion === jsonVersion) {
    console.log("Equal versions");

    if (coreLibChanged) {
      // increment only when changes exist
      let [M, m, p] = jsonVersion.split(".").map(Number);
      p += 1;
      baseVersion = `${M}.${m}.${p}`;
    } else {
      baseVersion = jsonVersion;
    }

  } else if (versionGreater(envVersion, jsonVersion)) {
    console.log("ENV higher");
    baseVersion = envVersion;

  } else {
    console.log("JSON higher");
    baseVersion = jsonVersion;
  }

  console.log("Base version:", baseVersion);

  let [major, minor, patch] = baseVersion.split(".").map(Number);
  let finalVersion = baseVersion;

  // =====================================================
  // ✅ STEP 2: Apply smart bump ONLY if core-lib changed
  // =====================================================
  if (coreLibChanged) {
    const totalLines = insertions + deletions;

    console.log(`Files: ${files}, Lines: ${totalLines}`);

    if (files <= 5 && totalLines <= 20) {
      console.log("Patch bump");
      patch += 1;

    } else if ((files > 5 && files <= 10) || (totalLines > 20 && totalLines <= 100)) {
      console.log("Minor bump");
      minor += 1;
      patch = 0;

    } else {
      console.log("Major bump");
      major += 1;
      minor = 0;
      patch = 0;
    }

    finalVersion = `${major}.${minor}.${patch}`;
  }

  console.log("Final version:", finalVersion);

  // 🔹 update version.json
  data.version = finalVersion;
  data.buildTimestamp = Date.now();
  data.buildDate = new Date().toISOString();

  fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));

  // 🔹 update env files
  envFiles.forEach(file => {
    file = file.trim();
    let content = fs.readFileSync(file, "utf8");

    content = content.replace(
      /version:\s*'[\d.]+'/,
      `version: '${finalVersion}'`
    );

    fs.writeFileSync(file, content);
  });

  // 🔹 Output version for GitHub Actions (using new format)
  console.log(`version=${finalVersion} >> $GITHUB_OUTPUT`);

} catch (err) {
  console.error(`::error::${err.message}`);
  process.exit(1);
}