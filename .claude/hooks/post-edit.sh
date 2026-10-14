#!/bin/bash
f=$(jq -r '.tool_input.file_path // .tool_response.filePath')

lint_output=$(npx eslint --fix "$f" 2>&1)
lint_exit=$?

if [ $lint_exit -ne 0 ]; then
  jq -n --arg msg "ESLint found errors in $f that --fix could not resolve:
$lint_output" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$msg}}'
else
  jq -n --arg f "$f" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"IMPORTANT: You just edited a typescript file: \($f) — you MUST now run /check-conventions \($f) before doing anything else."}}'
fi
