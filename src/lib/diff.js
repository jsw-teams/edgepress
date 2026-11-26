// Zero-dependency line-level unified diff (zero temp files, zero subprocesses).

function computeEdits(a, b) {
  const n = a.length;
  const m = b.length;
  // Trim common prefix and suffix for speed on large articles.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix += 1;

  const left = a.slice(prefix, n - suffix);
  const right = b.slice(prefix, m - suffix);
  const ops = [];
  for (let i = 0; i < prefix; i += 1) ops.push({ type: ' ', text: a[i] });

  if (left.length === 0) {
    for (const line of right) ops.push({ type: '+', text: line });
  } else if (right.length === 0) {
    for (const line of left) ops.push({ type: '-', text: line });
  } else if (left.length * right.length > 4_000_000) {
    // Fallback for huge files to prevent quadratic memory usage.
    for (const line of left) ops.push({ type: '-', text: line });
    for (const line of right) ops.push({ type: '+', text: line });
  } else {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = new Int32Array(rows * cols);
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        if (left[i] === right[j]) dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)] + 1;
        else dp[i * cols + j] = Math.max(dp[(i + 1) * cols + j], dp[i * cols + (j + 1)]);
      }
    }
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) { ops.push({ type: ' ', text: left[i] }); i += 1; j += 1; }
      else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) { ops.push({ type: '-', text: left[i++] }); }
      else { ops.push({ type: '+', text: right[j++] }); }
    }
    while (i < left.length) ops.push({ type: '-', text: left[i++] });
    while (j < right.length) ops.push({ type: '+', text: right[j++] });
  }

  for (let i = n - suffix; i < n; i += 1) ops.push({ type: ' ', text: a[i] });
  return ops;
}

export function unifiedDiff(beforeText, afterText, context = 3) {
  const a = String(beforeText ?? '').replace(/\r\n/g, '\n').split('\n');
  const b = String(afterText ?? '').replace(/\r\n/g, '\n').split('\n');
  const ops = computeEdits(a, b);
  if (!ops.some(op => op.type !== ' ')) return '';

  // Find hunk ranges around edits
  const changeIndices = [];
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].type !== ' ') changeIndices.push(i);
  }
  const hunks = [];
  let start = Math.max(0, changeIndices[0] - context);
  let end = Math.min(ops.length - 1, changeIndices[0] + context);
  for (let k = 1; k < changeIndices.length; k += 1) {
    const nextStart = Math.max(0, changeIndices[k] - context);
    const nextEnd = Math.min(ops.length - 1, changeIndices[k] + context);
    if (nextStart <= end + 1) end = nextEnd;
    else { hunks.push([start, end]); start = nextStart; end = nextEnd; }
  }
  hunks.push([start, end]);

  const lines = [];
  for (const [hStart, hEnd] of hunks) {
    let oldStart = 1, newStart = 1;
    for (let i = 0; i < hStart; i += 1) {
      if (ops[i].type !== '+') oldStart += 1;
      if (ops[i].type !== '-') newStart += 1;
    }
    let oldCount = 0, newCount = 0;
    const body = [];
    for (let i = hStart; i <= hEnd; i += 1) {
      const op = ops[i];
      if (op.type !== '+') oldCount += 1;
      if (op.type !== '-') newCount += 1;
      body.push(op.type + op.text);
    }
    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body);
  }
  return lines.join('\n');
}
