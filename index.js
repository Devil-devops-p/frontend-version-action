const fs = require("fs");
const { execSync } = require("child_process");

try {
  const versionFile = process.env['INPUT_VERSION-FILE'];
  const envFiles = (process.env['INPUT_ENV-FILES'] || "")
    .split(",").map(f => f.trim()).filter(Boolean);

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
  // DETECT CHANGES
  // ---------------------------
  const branch = process.env.GITHUB_REF_NAME;

  let changedFiles = [];
  let insertions = 0;
  let deletions = 0;

  try {
    // Try to get diff from previous commit (HEAD~1...HEAD)
    let diffNames, diffStats;
    try {
      diffNames = execSync(`git diff --name-only HEAD~1...HEAD`)
        .toString().trim();
      diffStats = execSync(`git diff --numstat HEAD~1...HEAD`)
        .toString().trim();
      console.log("Using previous commit diff");
    } catch (diffError) {
      console.log("Previous commit diff failed, trying origin diff:", diffError.message);
      // Fallback to origin diff
      execSync(`git fetch origin ${branch}`);
      diffNames = execSync(`git diff --name-only origin/${branch}...HEAD`)
        .toString().trim();
      diffStats = execSync(`git diff --numstat origin/${branch}...HEAD`)
        .toString().trim();
    }

    changedFiles = diffNames ? diffNames.split("\n") : [];

    if (diffStats) {
      diffStats.split("\n").forEach(line => {
        if (!line) return;
        const [add, del] = line.split("\t");
        insertions += parseInt(add) || 0;
        deletions += parseInt(del) || 0;
      });
    }

  } catch (e) {
    console.log("Diff fallback:", e.message);
  }

  // Check if core-lib has changes
  const coreLibChanged = changedFiles.some(file =>
    file.includes("projects/core-lib/healthcare-ui-core-lib") ||
    file.includes("healthcare-ui-core-lib")
  );

  console.log("Core-lib changed:", coreLibChanged);

  const files = changedFiles.length;
  const totalLines = insertions + deletions;

  console.log("All changed files:", changedFiles);
  console.log("Files count:", files);
  console.log("Lines:", totalLines);

  // ---------------------------
  // BASE VERSION LOGIC
  // ---------------------------
  let [major, minor, patch] = jsonVersion.split(".").map(Number);

  // Check if this is a rebuild or code commit
  const isRebuild = files === 0;
  console.log("Is rebuild:", isRebuild);

  if (isRebuild) {
    console.log("Rebuild scenario detected");

    if (envVersion !== jsonVersion) {
      const versionGreater = (a, b) =>
        a.localeCompare(b, undefined, { numeric: true }) > 0;

      const higher = versionGreater(envVersion, jsonVersion)
        ? envVersion
        : jsonVersion;

      [major, minor, patch] = higher.split(".").map(Number);
    } else {
      // Rebuild with no changes - always increment patch
      console.log("Rebuild with no changes - incrementing patch");
      patch += 1;
    }

  } else {
    console.log("Changes detected");

    // STEP 1: base version
    if (envVersion === jsonVersion) {
      // Always increment for any change (including small 1-word changes)
      patch += 1;
      console.log("Changes detected and versions equal → increment patch");
    } else {
      const versionGreater = (a, b) =>
        a.localeCompare(b, undefined, { numeric: true }) > 0;

      const higher = versionGreater(envVersion, jsonVersion)
        ? envVersion
        : jsonVersion;

      [major, minor, patch] = higher.split(".").map(Number);
      console.log("Versions mismatched → pick higher");
    }

    // STEP 2: smart bump
    if (files <= 5 && totalLines <= 20) {
      console.log("PATCH");
      patch += 1;

    } else if (
      (files > 5 && files <= 10) ||
      (totalLines > 20 && totalLines <= 100)
    ) {
      console.log("MINOR");
      minor += 1;
      patch = 0;

    } else {
      console.log("MAJOR");
      major += 1;
      minor = 0;
      patch = 0;
    }
  }

  const finalVersion = `${major}.${minor}.${patch}`;
  console.log("Final version:", finalVersion);

  // ---------------------------
  // WRITE FILES
  // ---------------------------
  data.version = finalVersion;
  data.buildTimestamp = Date.now();
  data.buildDate = new Date().toISOString();

  fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));

  envFiles.forEach(file => {
    let content = fs.readFileSync(file, "utf8");
    content = content.replace(
      /version:\s*['"][\d.]+['"]/,
      `version: '${finalVersion}'`
    );
    fs.writeFileSync(file, content);
  });

  console.log(`version=${finalVersion} >> $GITHUB_OUTPUT`);

} catch (err) {
  console.error(err.message);
  process.exit(1);
}