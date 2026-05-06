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
    execSync(`git fetch origin ${branch}`);

    const diffNames = execSync(`git diff --name-only origin/${branch}...HEAD`)
      .toString().trim();

    changedFiles = diffNames ? diffNames.split("\n") : [];

    const diffStats = execSync(`git diff --numstat origin/${branch}...HEAD`)
      .toString().trim();

    diffStats.split("\n").forEach(line => {
      if (!line) return;
      const [add, del] = line.split("\t");
      insertions += parseInt(add) || 0;
      deletions += parseInt(del) || 0;
    });

  } catch (e) {
    console.log("Diff fallback:", e.message);
  }

  const files = changedFiles.length;
  const totalLines = insertions + deletions;

  console.log("Files:", files);
  console.log("Lines:", totalLines);

  // ---------------------------
  // BASE VERSION LOGIC
  // ---------------------------
  let [major, minor, patch] = jsonVersion.split(".").map(Number);

  if (files === 0) {
    console.log("Rebuild");

    if (envVersion !== jsonVersion) {
      const versionGreater = (a, b) =>
        a.localeCompare(b, undefined, { numeric: true }) > 0;

      const higher = versionGreater(envVersion, jsonVersion)
        ? envVersion
        : jsonVersion;

      [major, minor, patch] = higher.split(".").map(Number);
    }

  } else {
    console.log("Changes detected");

    // STEP 1: base version
    if (envVersion === jsonVersion) {
      patch += 1;
    } else {
      const versionGreater = (a, b) =>
        a.localeCompare(b, undefined, { numeric: true }) > 0;

      const higher = versionGreater(envVersion, jsonVersion)
        ? envVersion
        : jsonVersion;

      [major, minor, patch] = higher.split(".").map(Number);
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