const fs = require("fs");

const path = "app/add-task.js";

if (!fs.existsSync(path)) {
  console.error("ไม่พบไฟล์ app/add-task.js");
  process.exit(1);
}

let code = fs.readFileSync(path, "utf8");

fs.writeFileSync(
  "app/add-task.backup-before-fix-studyWindowConfig.js",
  code,
  "utf8"
);

const buildStart = code.indexOf("  const buildTaskPayload = () => {");

if (buildStart === -1) {
  console.error("หา buildTaskPayload ไม่เจอ");
  process.exit(1);
}

const buildEnd = code.indexOf("  const resetConflictState", buildStart);

if (buildEnd === -1) {
  console.error("หา resetConflictState ไม่เจอ");
  process.exit(1);
}

const buildBlock = code.slice(buildStart, buildEnd);

if (buildBlock.includes("const studyWindowConfig = getPreferredStudyWindowConfig();")) {
  console.log("มี studyWindowConfig ใน buildTaskPayload อยู่แล้ว");
} else {
  const target = "    const { safeStartTime, safeEndTime } = getSafeTaskTimeRange();";

  if (!buildBlock.includes(target)) {
    console.error("หา safeStartTime line ใน buildTaskPayload ไม่เจอ");
    process.exit(1);
  }

  const newBuildBlock = buildBlock.replace(
    target,
    `${target}
    const studyWindowConfig = getPreferredStudyWindowConfig();`
  );

  code = code.slice(0, buildStart) + newBuildBlock + code.slice(buildEnd);

  fs.writeFileSync(path, code, "utf8");
  console.log("สำเร็จ: เพิ่ม studyWindowConfig ใน buildTaskPayload แล้ว");
}
